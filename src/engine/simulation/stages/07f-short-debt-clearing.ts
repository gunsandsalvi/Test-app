/**
 * Stage 7f: Short-dated debt — Treasury bills and commercial paper (WS5)
 *
 * The front end of the curve below 2Y was an extrapolation: `tenor3M` fell out of the
 * Nelson-Siegel fit through four bond points, so the one part of the curve the policy rate acts
 * on most directly was the one part no market ever set. Bills fix that: the 13/26/52-week
 * buckets of the region's own real bill stock (issued by stage 11, ~18% of the ladder) clear in
 * the same double auction as everything else, and the sub-2Y curve is then refit THROUGH the
 * cleared bill yields.
 *
 * Who anchors bills. Banks, by the same reserve arbitrage that anchors the 2Y in 07c: a bill is
 * the closest substitute for a reserve balance, so a bank's reservation yield is the policy rate
 * plus a few basis points — it will absorb any float at that level and none below it. That is
 * the real mechanism behind "bills trade on the policy corridor", expressed as a price rather
 * than asserted. Institutions bid their cash sleeves above that floor, wanting a small term
 * premium for locking cash away. MMFs take over the marginal role when WS7 lands.
 *
 * Commercial paper. An issuer is a company whose OWN ledger projects a genuine working-capital
 * gap over the next quarter — fixed outflows (interest, maintenance capex, dividends) against
 * cash plus operating inflow — and whose rating still has market access. Size is the gap: CP
 * is not opportunistic funding, it is the bridge a treasurer actually runs. It prices off the
 * cleared 13-week bill plus the issuer's short-horizon expected loss (the annual structural PD
 * scaled to a quarter), and it ROLLS weekly: a roll that finds no bid — rating fallen below
 * access, or distress-level default risk — draws the bank revolver instead, at a real penalty
 * margin. That failure path is the actual mechanism of a funding squeeze (the G2 hook), and it
 * exists here from day one rather than being added after the first crisis needs it.
 *
 * Runs after 07c (bond yields cleared; the NS refit here needs both) and before stage 08 (whose
 * interest arithmetic picks CP up off the ladder like any other tranche).
 */

import { riskAversionOf } from '../../../domain/preferences';
import { govBucketKeyOf, isBillBucketKey } from '../../../domain/sovereign-id';
import { ensureV2 } from '../../../engine2/world';
import { ladderRowsOf, pushLadderRow, relinkLadder, TR_FLOATING, TR_CP } from '../../../engine2/tranches';
import { REGION_IDS } from '../../../domain/geography';
import { GameState, RegionId, ItemizedHolding, InstitutionalEntity, DebtTranche, NewsItem, Company } from '../../../types';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { computeAnnualDefaultProbability, creditRecoveryRate, SOV_BILL_BUCKETS, sovBucketKey, WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { isActiveCompany, isPubliclyListed, corporateTreasuryTargetUSD } from '../../../domain/company';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityUSD } from './repo-clearing';
import { encumberedFaceByBucket } from '../../../domain/repo';
import { MIN_CASH_BUFFER_RATIO, leverageHeadroomUSD, sovereignBookCapacityUSD, liquidityDrivenSovereignFloorUSD } from '../../macro/banking';
import { centralBankParticipant, applyCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { pay, pendingSettlementUSD, PartyRef, institutionSpendableUSD } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf } from './dealer-desks';
import { dealerDeskTicker } from '../../../domain/dealer-desk';
import { discountBillProceedsUSD, withdrawUnplacedIssuance } from '../../../domain/government';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import {
  CP_SINGLE_ISSUER_LIMIT, CP_SHARE_OF_TERM_SLEEVE, CP_FULL_SIZE_YIELD_RANGE_BPS,
  cpCreditPolicyShare, cpReservationYieldBps,
} from '../../../domain/commercial-paper';

/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['bill'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'bill';
const CP_BOOK = 'commercial paper';
/** And the other book this stage owns (CP). */
/** A bank's pickup over reserves for holding a bill instead — the arbitrage band's width. */
const BANK_BILL_PICKUP_BPS = 5;
/** What an institution's cash sleeve wants over policy to lock cash into paper, per year of tenor. */
const INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR = 20;
const BILL_FULL_SIZE_YIELD_RANGE_BPS = 15;
/** Share of an institution's cash sleeve it will hold as bills rather than overnight cash. */
const CASH_SLEEVE_BILL_SHARE = 0.5;

// CP — three constants are gone with the formula (domain/commercial-paper.ts):
//   `CP_ACCESS_RATINGS` and `CP_MAX_ANNUAL_PD` were a binary gate that made a roll all-or-nothing,
//   which is not how funding stress arrives. Credit policy is a SIZE now (`cpCreditPolicyShare`),
//   the same doctrine as the sub-investment-grade sleeve in the bond book: a weak name gets a
//   small line and has to pay, and whether it can is what the auction decides.
//   `CP_LIQUIDITY_PREMIUM_BPS` was 15bp of "CP is not a bill even for a AAA name" added to a
//   price nobody quoted. The premium over bills is now whatever the book clears at, which is what
//   a liquidity premium IS.
const CP_TENOR_WEEKS = 13;
/** The revolver a failed roll draws: policy + this margin. Committed lines price ~300bp drawn. */
export const REVOLVER_MARGIN_BPS = 350;
/** CP outstanding is capped at this share of revenue — a treasurer bridges with CP, never term-funds with it. */
const CP_MAX_SHARE_OF_REVENUE = 0.10;
/** Gaps smaller than this share of revenue are cash-managed, not papered. */
const CP_MIN_GAP_SHARE_OF_REVENUE = 0.01;

const billInstrumentId = (regionId: RegionId, key: string) => `${regionId}-GOV-${key}`;

export function runShortDebtClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2Mirror = ensureV2(state);
  const regionIds = REGION_IDS;

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];

    // ---- Bills ----
    const liveBillTranches = (reg.govDebtTranches || []).filter(
      (t) => t.maturityWeek > ctx.nextWeek && isBillBucketKey(sovBucketKey(t.tenorAtIssuanceYears))
    );
    const outstandingByBucket = new Map<string, number>();
    const bucketKeyByTrancheId = new Map<string, string>();
    liveBillTranches.forEach((t) => {
      const key = sovBucketKey(t.tenorAtIssuanceYears);
      outstandingByBucket.set(key, (outstandingByBucket.get(key) ?? 0) + t.principalUSD);
      bucketKeyByTrancheId.set(t.id, key);
    });

    const activeBuckets = SOV_BILL_BUCKETS.filter((b) => (outstandingByBucket.get(b.key) ?? 0) > 0);
    if (activeBuckets.length > 0) {
      const billBucketKeys = activeBuckets.map((b) => b.key);
      const cbOrder = reg.centralBankSheet
        ? centralBankParticipant(reg.centralBankSheet, billBucketKeys, (k) => billInstrumentId(regionId, k))
        : null;
      // OWN7 — the shrink, stated the way 07c's third carve-out finally stated it: the float is
      // what the participants in THIS book hold BETWEEN THEM, computed off the participant list
      // itself rather than by naming the non-bidders one at a time. Naming them one at a time is
      // what left the residual no named book holds in the float, and the desks then bought
      // 4.5B of bills over ten weeks from an UNMODELED seller. The three real carve-outs fall
      // out of the participant sum for free: the central bank on a no-order week is not a
      // participant, the corporate treasuries that park cash in short paper never bid, and the
      // share no book holds at all has nobody to decrement. Set below, once the desks exist.
      const instruments: ClearingInstrument[] = activeBuckets.map((b) => ({
        id: billInstrumentId(regionId, b.key),
        outstandingUSD: outstandingByBucket.get(b.key) ?? 0,
        tradableFloatUSD: outstandingByBucket.get(b.key) ?? 0,
        currentStat: Math.max(1, calculateNelsonSiegelZeroRate(b.years, reg.yieldCurveParams) * 10000),
        statKind: 'YIELD_LIKE',
        durationYears: b.years,
      }));

      const regionBanks = ctx.updatedCompanies.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
      // XB1: bills are the one book a money fund belongs in, and foreign cash sleeves reach for
      // them too — a mandate bound, not an assigned share.
      const billStockByRegion: Record<string, number> = {};
      (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
        billStockByRegion[r] = (ctx.updatedRegions[r]?.govDebtTranches || [])
          .filter((t) => isBillBucketKey(sovBucketKey(t.tenorAtIssuanceYears)))
          .reduce((a, t) => a + t.principalUSD, 0);
      });
      const regionEntities = ctx.updatedInstitutionalEntities.filter(
        (e) => mandateWeightForIssuer(e.entityType, e.region, regionId, billStockByRegion) > 0
      );
      const totalBillStockUSD = activeBuckets.reduce((s, b) => s + (outstandingByBucket.get(b.key) ?? 0), 0) || 1;
      // OWN3: bills and bonds are one HQLA pool, so both books apportion a bank's single
      // appetite over the whole sovereign stock rather than each over its own half.
      const wholeSovStockUSD = (reg.govDebtTranches || [])
        .filter((t) => t.maturityWeek > ctx.nextWeek)
        .reduce((s, t) => s + Math.max(0, t.principalUSD), 0) || 1;

      const participants: ClearingParticipant[] = [];

      // Banks: the arbitrage anchor. Unbounded size at policy + a few bp — their real constraint
      // is the reserve position S2 built, not a cash budget, exactly as in 07c.
      const repoHaircuts = computeSovereignRepoHaircuts(reg);
      regionBanks.forEach((bank) => {
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        // The working sheet, not the week-start one: 02b's repo session and 07c's purchases have
        // already happened and both wrote here. A bank's bill bid must be sized against the book
        // it actually has at this point in the week.
        const sheet: NonNullable<typeof bank.bankBalanceSheet> =
          ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
        // WS6: same funding budget and encumbrance floor as 07c — a bill bid is a claim on
        // real money, and pledged collateral cannot simultaneously be sold. (Bills cleared
        // here share the collateral pool with the bonds.)
        // Bounded by BOTH real constraints a treasury faces: what its money and collateral can
        // fund, AND what its equity supports under the leverage floor — the only capital
        // constraint that sees a zero-risk-weight sovereign book (see BASEL_MIN_LEVERAGE_RATIO's
        // doc for the 260-week runaway that made this necessary).
        // SETL6: reserves plus this week's already-agreed securities settlement — 07c's bids
        // are commitments that have not settled yet, and the same reserves cannot fund both.
        const settledCashUSD = sheet.cashReservesUSD
          + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
        // REPO2: the floor is the face of THIS bill bucket actually pledged, not a blended share.
        const encumberedFace = encumberedFaceByBucket(reg.repoBook ?? [], bank.ticker);
        const fundableUSD = Math.min(
          Math.max(0, settledCashUSD - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO)
            + unencumberedBorrowingCapacityUSD(sheet, repoHaircuts, encumberedFace),
          leverageHeadroomUSD(sheet)
        );
        const appetiteUSD = sovereignBookCapacityUSD(sheet);
        const liquidityFloorUSD = liquidityDrivenSovereignFloorUSD(sheet);
        activeBuckets.forEach((b) => {
          const heldUSD = sheet.sovereignBondHoldingsByTenor?.[b.key] ?? 0;
          holdings.set(billInstrumentId(regionId, b.key), heldUSD);
          const bucketShare = (outstandingByBucket.get(b.key) ?? 0) / totalBillStockUSD;
          const bucketShareOfSovStock = (outstandingByBucket.get(b.key) ?? 0) / wholeSovStockUSD;
          demand.set(billInstrumentId(regionId, b.key), {
            reservationStat: reg.policyRate * 10000 + BANK_BILL_PICKUP_BPS,
            maxHoldingUSD: appetiteUSD * bucketShareOfSovStock,
            fullSizeStatRange: BILL_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: fundableUSD * bucketShare,
            minHoldingUSD: Math.max(encumberedFace.get(b.key) ?? 0, liquidityFloorUSD * bucketShareOfSovStock),
          });
        });
        participants.push({ id: `BANK-${bank.ticker}`, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      // Institutions: the cash sleeve. Half the sleeve wants to be in paper, wanting a small
      // term premium over policy for giving up the overnight option.
      regionEntities.forEach((entity) => {
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        const sleeveUSD = entity.totalAssetsUSD * entity.assetAllocationTarget.cashPct * CASH_SLEEVE_BILL_SHARE;
        // SCALE C1: read-only scan of the store's GOV_BOND rows — nothing is claimed here.
        // Which rows this auction actually rewrites is decided at apply time, where the
        // auctioned-bucket predicate lives (a bucket whose last tranche matured is NOT
        // auctioned this week and its rows must survive).
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => {
          if (h.issuerRegion === regionId) {
            const key = govBucketKeyOf(h.instrumentId, regionId);
            if (key && isBillBucketKey(key)) holdings.set(h.instrumentId, (holdings.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
          }
          return false;
        });
        activeBuckets.forEach((b) => {
          const bucketShare = (outstandingByBucket.get(b.key) ?? 0) / totalBillStockUSD;
          demand.set(billInstrumentId(regionId, b.key), {
            reservationStat: reg.policyRate * 10000 + INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR * b.years,
            maxHoldingUSD: sleeveUSD * bucketShare,
            fullSizeStatRange: BILL_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: institutionSpendableUSD(ctx, entity) * CASH_SLEEVE_BILL_SHARE * bucketShare,
          });
        });
        participants.push({ id: entity.id, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      // CASH — CORPORATE TREASURIES, bidding for the paper they used to mint.
      //
      // A treasurer parks surplus cash in short government paper. Stage 08 used to do that by
      // pushing a holding onto the company and paying an UNMODELED counterparty, and selling it
      // back the same way — 6.1B gross over ten weeks of sovereign paper with no seller and no
      // buyer, and the reason 07f's float rule had to carve these holdings out as a holder that
      // never bids. It bids here now, on the same sleeve arithmetic (domain/company.ts), against
      // the same banks and institutions, and its fills settle through the clearing house.
      //
      // It is the most price-INSENSITIVE holder in this book, and honestly so: a treasurer parks
      // cash because it has cash, not because the yield tempted it. So its reservation is the
      // policy rate itself — below the bank arbitrage floor there is no reason to lock the money
      // up at all — and its size is its own sleeve, bounded by the cash it actually holds.
      const treasuryParticipantId = (ticker: string) => `TREASURY-${ticker}`;
      const treasuryBidders = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
        (c) => c.region === regionId && isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity
      );
      const treasuryByTicker = new Map<string, typeof treasuryBidders[number]>();
      treasuryBidders.forEach((comp) => {
        const heldByBucket = new Map<string, number>();
        (comp.treasuryHoldings || []).forEach((h) => {
          // §7.241: the old prefix-slice also matched TRANCHE ids, yielding keys like 'B13-41'
          // that failed the lowercase test — so bill tranches held here silently dropped out of
          // the treasurer's sizing and the tranche fallback below was dead code.
          const key = govBucketKeyOf(h.instrumentId, regionId) ?? bucketKeyByTrancheId.get(h.instrumentId);
          if (!key || !isBillBucketKey(key)) return;
          heldByBucket.set(key, (heldByBucket.get(key) ?? 0) + (h.quantityOrNotionalUSD ?? 0));
        });
        const targetUSD = corporateTreasuryTargetUSD(comp.cash ?? 0, comp.annualRevenue ?? 0, riskAversionOf(comp.management));
        const heldUSD = Array.from(heldByBucket.values()).reduce((a, v) => a + v, 0);
        if (!(targetUSD > 1) && !(heldUSD > 1)) return;
        const budgetUSD = Math.max(0, (comp.cash ?? 0)
          + pendingSettlementUSD(ctx, { kind: 'COMPANY', ticker: comp.ticker }));
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        activeBuckets.forEach((b) => {
          const bucketShare = (outstandingByBucket.get(b.key) ?? 0) / totalBillStockUSD;
          holdings.set(billInstrumentId(regionId, b.key), heldByBucket.get(b.key) ?? 0);
          demand.set(billInstrumentId(regionId, b.key), {
            reservationStat: reg.policyRate * 10000,
            maxHoldingUSD: targetUSD * bucketShare,
            fullSizeStatRange: BILL_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: budgetUSD * bucketShare,
          });
        });
        treasuryByTicker.set(comp.ticker, comp);
        participants.push({ id: treasuryParticipantId(comp.ticker), currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      const priorDealerInventory = new Map<string, number>();
      (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => {
        if (isBillBucketKey(p.tenorKey)) priorDealerInventory.set(billInstrumentId(regionId, p.tenorKey), p.inventoryUSD);
      });

      // PUB2b: a maturing bill rolls back into bills, so the CB's book keeps its shape rather
      // than drifting up the curve. Same size-with-no-reservation order as in 07c; read above,
      // because whether it bids also decides whether its book is part of the float.
      if (cbOrder) participants.push(cbOrder.participant);
      if (reg.centralBankSheet) {
        reg.centralBankSheet.lastOrderPlacedUSD =
          (reg.centralBankSheet.lastOrderPlacedUSD ?? 0) + (cbOrder?.orderedUSD ?? 0);
      }

      // OWN7, first half: the float that every bidder EXCEPT the desks makes up, set before the
      // desks are built — a desk is sized against the live float, so leaving it at the whole
      // outstanding until after gave every desk capacity against paper that is not for sale.
      const heldByBiddersUSD = new Map<string, number>();
      participants.forEach((p) => p.currentHoldingsByInstrumentId.forEach((usd, id) => {
        if (usd > 0) heldByBiddersUSD.set(id, (heldByBiddersUSD.get(id) ?? 0) + usd);
      }));
      instruments.forEach((inst) => { inst.tradableFloatUSD = heldByBiddersUSD.get(inst.id) ?? 0; });

      // G3a: the banks' bill desks — the same market makers, a different book.
      const deskParticipants = buildDealerDeskParticipants({
        ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      });
      const deskTickers = deskTickersOf(deskParticipants);

      // OWN7, second half: the desks' own books join the float now that they exist. Every bidder
      // is a real holder, so what they hold between them is what is genuinely in play; everything
      // else on the register keeps its position.
      const deskHeldUSD = new Map<string, number>();
      deskParticipants.forEach((p) => p.currentHoldingsByInstrumentId.forEach((usd, id) => {
        if (usd > 0) deskHeldUSD.set(id, (deskHeldUSD.get(id) ?? 0) + usd);
      }));
      instruments.forEach((inst) => {
        inst.tradableFloatUSD = (heldByBiddersUSD.get(inst.id) ?? 0) + (deskHeldUSD.get(inst.id) ?? 0);
      });

      // PUB — and what NO book holds is the treasury's OFFERING, not a reservation. Stage 11
      // issues bills into the ladder every week; nothing ever bought them, and the treasury then
      // repaid a holder that was not there. A bill auction is exactly this: paper that exists,
      // offered at whatever the week's demand pays, and offered again next week if it does not
      // clear. The central bank's book on a no-order week is a real holding and is NOT on offer.
      const passiveCbByBucket = new Map<string, number>();
      if (!cbOrder && reg.centralBankSheet) {
        Object.entries(reg.centralBankSheet.sovereignHoldingsByTenor || {})
          .forEach(([key, usd]) => passiveCbByBucket.set(key, Number(usd) || 0));
      }
      activeBuckets.forEach((b) => {
        const inst = instruments.find((i) => i.id === billInstrumentId(regionId, b.key));
        if (!inst) return;
        inst.primaryOfferingUSD = Math.max(0,
          (outstandingByBucket.get(b.key) ?? 0)
          - inst.tradableFloatUSD
          - (passiveCbByBucket.get(b.key) ?? 0));
      });

      const result = clearFinancialAsset(instruments, [...participants, ...deskParticipants], priorDealerInventory, {
        dealerSpreadBps: DEALER_SPREAD_BPS,
        // OWN7: the float here is a stock these participants already hold, so an unsold
        // position stays with its holder rather than falling to a dealer nobody names.
        unsoldStaysWithHolder: true,
      });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `bill:${id}`));
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} bill`);

      // §4.0 Tier 1 item 13 — THE DISCOUNT EXISTS AT ISSUE. A bill auction clears a YIELD, and
      // the buyer of NEW paper pays the discounted price, not face — this book charged face,
      // booked face, and then §7.250's accretion grew the position past face: every primary
      // placement minted its own discount into the holders' books while the treasury was
      // overpaid by the same amount (the EUR/JPN 'ledger is minting claims' family, and a
      // feeder of every bill holder's phantom income). The SECONDARY float already trades in
      // stored-value units and stays untouched. Each non-desk buyer's pro-rata slice of the
      // primary now books at cost and pays cost — the rebate below adjusts both legs of the
      // same instruction — and the treasury receives proceeds at the cleared discount. Desk
      // slices keep the face convention (their inventory books from raw fills; re-pricing one
      // leg alone would break the per-bank identity), so the treasury is made whole for the
      // desks' slice and the desks' book carries the old convention until G3a re-prices it.
      const priceFractionById = new Map<string, number>();
      activeBuckets.forEach((b) => {
        const id = billInstrumentId(regionId, b.key);
        const yieldAnnual = (result.newStatById.get(id) ?? instruments.find((i) => i.id === id)?.currentStat ?? 0) / 10000;
        priceFractionById.set(id, discountBillProceedsUSD(1, Math.max(0, yieldAnnual), b.years));
      });
      const rebateByParticipant = new Map<string, Map<string, number>>();
      const deskPrimaryFaceByInstrument = new Map<string, number>();
      let totalCashRebatesUSD = 0;
      {
        const boughtByInstrument = new Map<string, number>();
        const buyersByInstrument = new Map<string, { pid: string; boughtUSD: number }[]>();
        [...participants, ...deskParticipants].forEach((p) => {
          const fills = result.newParticipantHoldings.get(p.id);
          if (!fills) return;
          fills.forEach((newUSD, id) => {
            const boughtUSD = newUSD - (p.currentHoldingsByInstrumentId.get(id) ?? 0);
            if (boughtUSD > 1) {
              boughtByInstrument.set(id, (boughtByInstrument.get(id) ?? 0) + boughtUSD);
              const list = buyersByInstrument.get(id) ?? [];
              list.push({ pid: p.id, boughtUSD });
              buyersByInstrument.set(id, list);
            }
          });
        });
        result.primaryOutcomeById.forEach((o, instrumentId) => {
          if (o.withdrawn) return;
          const pf = priceFractionById.get(instrumentId);
          if (pf === undefined || pf >= 1) return;
          const takeUSD = Math.max(0, o.marketTakeUSD);
          const totalBoughtUSD = boughtByInstrument.get(instrumentId) ?? 0;
          if (!(takeUSD > 1) || !(totalBoughtUSD > 0)) return;
          (buyersByInstrument.get(instrumentId) ?? []).forEach(({ pid, boughtUSD }) => {
            const primarySliceUSD = boughtUSD * Math.min(1, takeUSD / totalBoughtUSD);
            const discountUSD = primarySliceUSD * (1 - pf);
            if (!(discountUSD > 0)) return;
            if (dealerDeskTicker(pid) !== undefined) {
              deskPrimaryFaceByInstrument.set(instrumentId,
                (deskPrimaryFaceByInstrument.get(instrumentId) ?? 0) + discountUSD);
              return;
            }
            const m = rebateByParticipant.get(pid) ?? new Map<string, number>();
            m.set(instrumentId, (m.get(instrumentId) ?? 0) + discountUSD);
            rebateByParticipant.set(pid, m);
            // The cash half of the same instruction: the buyer pays cost, not face — the
            // central bank included (its "payment" is the reserves it creates, and it creates
            // only what the paper cost; its book and its issuance must tell the same story).
            result.netCashDeltaByParticipantId.set(pid,
              (result.netCashDeltaByParticipantId.get(pid) ?? 0) + discountUSD);
            totalCashRebatesUSD += discountUSD;
          });
        });
      }
      const rebateOf = (pid: string, instrumentId: string): number =>
        rebateByParticipant.get(pid)?.get(instrumentId) ?? 0;

      if (cbOrder && reg.centralBankSheet) {
        // Asset side only — the reserves that paid for it were created. See central-bank-demand.
        // Item 13: the CB's primary slice books at cost like every other holder's (its fills are
        // adjusted by its rebate; it has no cash leg to adjust).
        const cbRawFills = result.newParticipantHoldings.get(CENTRAL_BANK_PARTICIPANT_ID) ?? new Map<string, number>();
        const cbFills = new Map<string, number>();
        cbRawFills.forEach((usd, id) => cbFills.set(id, usd - rebateOf(CENTRAL_BANK_PARTICIPANT_ID, id)));
        const filled = applyCentralBankFills(
          reg.centralBankSheet, billBucketKeys, (k) => billInstrumentId(regionId, k), cbFills
        );
        reg.centralBankSheet.lastOpenMarketPurchasesUSD =
          Math.round(((reg.centralBankSheet.lastOpenMarketPurchasesUSD ?? 0) + filled));
      }

      // Refit the curve through BOTH the cleared bills and 07c's cleared bonds, so the sub-2Y
      // segment every short-rate consumer reads comes from a market, not an extrapolation.
      const billPoints = activeBuckets.map((b) => ({
        tenorYears: b.years,
        yield: (result.newStatById.get(billInstrumentId(regionId, b.key)) ?? reg.zeroRates.tenor3M * 10000) / 10000,
      }));
      const bondPoints = [
        { tenorYears: 2, yield: reg.zeroRates.tenor2Y },
        { tenorYears: 5, yield: reg.zeroRates.tenor5Y },
        { tenorYears: 10, yield: reg.zeroRates.tenor10Y },
        { tenorYears: 30, yield: reg.zeroRates.tenor30Y },
      ];
      reg.yieldCurveParams = fitNelsonSiegelParams([...billPoints, ...bondPoints], reg.yieldCurveParams.lambda);
      const cleared13w = billPoints.find((p) => p.tenorYears === 0.25);
      reg.zeroRates = { ...reg.zeroRates, tenor3M: cleared13w ? cleared13w.yield : calculateNelsonSiegelZeroRate(0.25, reg.yieldCurveParams) };

      // Apply bank books (their bill buckets live beside the bond buckets in byTenor).
      // The write goes to `companyUpdates`, which is the ONLY bank-sheet write that survives:
      // stage 08 rebuilds `updatedCompanies` from the week-start array and takes each bank's
      // sheet from `companyUpdates`. This stage used to write `updatedCompanies` instead, so
      // every bill fill it cleared for a bank was silently discarded — the fills were priced,
      // the buckets never moved, and 07c's careful pass-through of the bill buckets was
      // preserving a position nothing was updating.
      regionBanks.forEach((bank) => {
        const fills = result.newParticipantHoldings.get(`BANK-${bank.ticker}`);
        if (!fills) return;
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        // Only the buckets this auction actually priced are rewritten; a bucket whose last
        // tranche matures this week is left standing for stage 11 to redeem for cash.
        const byTenor: Record<string, number> = { ...(existingSheet.sovereignBondHoldingsByTenor || {}) };
        let faceDeltaUSD = 0;
        activeBuckets.forEach((b) => {
          // Item 13: the primary slice books at cost — the rebate is the same instruction's
          // booking half (the cash half was adjusted on the participant's net above).
          const newUSD = (fills.get(billInstrumentId(regionId, b.key)) ?? 0)
            - rebateOf(`BANK-${bank.ticker}`, billInstrumentId(regionId, b.key));
          faceDeltaUSD += newUSD - (byTenor[b.key] ?? 0);
          if (newUSD > 1) byTenor[b.key] = newUSD; else delete byTenor[b.key];
        });
        // The engine's cash leg (face plus the dealer fee); the fee part is P&L — an expense the
        // identity invariant would otherwise report as a missing leg. SETL6: the reserves leg
        // settles through the clearing house below, so the buyer and the seller move against
        // each other rather than each moving alone.
        const cashDeltaUSD = result.netCashDeltaByParticipantId.get(`BANK-${bank.ticker}`) ?? -faceDeltaUSD;
        const feeUSD = Math.max(0, -(cashDeltaUSD + faceDeltaUSD));
        updateBankSheet(ctx, bank.ticker, {
          ...bookPnL(existingSheet, -feeUSD, 'bill book fee', bank.ticker),
          sovereignBondHoldingsByTenor: byTenor,
          sovereignBondHoldingsUSD: Math.round(Object.values(byTenor).reduce((s, v) => s + v, 0)),
        });
      });

      // Apply institutional books with the engine's cash leg.
      // SCALE C1: claim only what this auction priced — other regions, bonds, and (the subtle
      // one) bill buckets not in THIS week's auction all stay unclaimed. A bucket leaves the
      // auction the week its last tranche matures (`maturityWeek > nextWeek` excludes it), and
      // rebuilding the book from the auction alone therefore deleted the holder's position in it
      // with no cash leg, leaving stage 11's redemption nothing to pay out on. Measured as the
      // institutional book dropping 5-11% on exactly the weeks the seeded 13/26/52-week
      // programs matured. An entity with no fills is not touched at all.
      const auctionedIds = new Set(activeBuckets.map((b) => billInstrumentId(regionId, b.key)));
      regionEntities.forEach((entity) => {
        const fills = result.newParticipantHoldings.get(entity.id);
        if (!fills) return;
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => auctionedIds.has(h.instrumentId));
        const billHoldings: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          const bookedUSD = usd - rebateOf(entity.id, instrumentId);
          if (bookedUSD > 1) billHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalUSD: bookedUSD });
        });
        ctx.holdingsStore!.append(entity.id, billHoldings);
      });

      // CASH: the treasuries' own books, rewritten from their fills. The rows are keyed by the
      // BUCKET id every other holder in this book uses — the tranche ids stage 08 used to write
      // were a second id space for one instrument (rule 3), and 07c had to read both.
      treasuryByTicker.forEach((comp, ticker) => {
        const fills = result.newParticipantHoldings.get(treasuryParticipantId(ticker));
        if (!fills) return;
        const kept = (comp.treasuryHoldings || []).filter((h) => {
          const key = h.instrumentId.startsWith(`${regionId}-GOV-`)
            ? h.instrumentId.slice(`${regionId}-GOV-`.length)
            : bucketKeyByTrancheId.get(h.instrumentId);
          return !(key && isBillBucketKey(key));
        });
        const billRows: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          const bookedUSD = usd - rebateOf(treasuryParticipantId(ticker), instrumentId);
          if (bookedUSD > 1) billRows.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalUSD: bookedUSD });
        });
        if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
        ctx.companyUpdates[ticker].treasuryHoldings = [...kept, ...billRows];
      });

      // SETL6: the book's whole cash side, through the clearing house — participants, the
      // desks' fees, and the dealer's own inventory leg.
      const billEntityIds = new Set(regionEntities.map((e) => e.id));
      settleClearedBook(
        ctx, regionId, BOOK,
        result.netCashDeltaByParticipantId,
        (id) => (billEntityIds.has(id) ? { kind: 'INSTITUTION', id }
          : id.startsWith('BANK-') ? { kind: 'BANK_SECURITIES', ticker: id.slice(5) }
            : id.startsWith('TREASURY-') ? { kind: 'COMPANY', ticker: id.slice('TREASURY-'.length) }
              : id === CENTRAL_BANK_PARTICIPANT_ID ? { kind: 'CENTRAL_BANK', region: regionId }
                : dealerDeskPartyOf(id, deskTickers)),
        // Item 13: the CCP receives less by exactly the rebates its buyers kept, and pays the
        // treasury less by the same total — flat by construction, as a clearing house is.
        { netCashUSD: result.dealerNetCashUSD - totalCashRebatesUSD, feeUSD: result.totalDealerRevenueUSD },
        feeDesksForRegion(ctx, regionId),
        // PUB/item 13: the treasury receives the DISCOUNTED proceeds the auction's yield
        // implies — that shortfall against face is exactly the government's borrowing cost,
        // paid back at redemption (PUB3d's conservation, both legs at last). The desks' primary
        // slice still pays face, so the treasury is made whole for it here.
        (() => {
          const takes: { party: PartyRef; amountUSD: number }[] = [];
          result.primaryOutcomeById.forEach((o, instrumentId) => {
            if (o.withdrawn) return;
            const pf = priceFractionById.get(instrumentId) ?? 1;
            const amountUSD = Math.max(0, o.marketTakeUSD) * pf
              + (deskPrimaryFaceByInstrument.get(instrumentId) ?? 0);
            if (amountUSD > 0) takes.push({ party: { kind: 'GOVERNMENT', region: regionId }, amountUSD });
          });
          return takes;
        })()
      );

      // §5-CLOSE O1: bills the auction did not place are withdrawn from the ladder (paper
      // nobody holds is not debt); the treasury's need rolls forward.
      {
        let withdrawnUSD = 0;
        instruments.forEach((inst) => {
          const o = result.primaryOutcomeById.get(inst.id);
          const placedUSD = o && !o.withdrawn ? Math.max(0, o.marketTakeUSD) : 0;
          const unplacedUSD = Math.max(0, (inst.primaryOfferingUSD ?? 0) - placedUSD);
          const key = activeBuckets.find((b) => billInstrumentId(regionId, b.key) === inst.id)?.key;
          if (!key || unplacedUSD <= 1) return;
          const r = withdrawUnplacedIssuance(reg.govDebtTranches, sovBucketKey, key, unplacedUSD);
          reg.govDebtTranches = r.tranches;
          withdrawnUSD += r.withdrawnUSD;
        });
        if (withdrawnUSD > 0) reg.pendingUnfundedDeficitUSD = (reg.pendingUnfundedDeficitUSD ?? 0) + withdrawnUSD;
      }
      // G3a: the desks' own bill inventory, owned by the banks that took it; bills live in the
      // same regional array as bonds under their own keys, and the bond rows pass through.
      const deskViewById = applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });
      const bondDealerRows = (reg.bankingSector.sovBondDealerInventory || []).filter((p) => !isBillBucketKey(p.tenorKey));
      const billDealerRows = activeBuckets.map((b) => ({
        tenorKey: b.key,
        inventoryUSD: deskViewById.get(billInstrumentId(regionId, b.key)) ?? 0,
      })).filter((r) => Math.abs(r.inventoryUSD) > 1);
      reg.bankingSector = { ...reg.bankingSector, sovBondDealerInventory: [...bondDealerRows, ...billDealerRows] };
    }

    // ---- Commercial paper: a real book (CP) ----
    //
    // Why this used to be a formula and what it cost is written up once, in
    // domain/commercial-paper.ts. In short: CP arrived with the bills and its buyers did not
    // exist yet, so it was priced at `bill + expected loss + 15bp`, sized entirely by the issuer,
    // rationed only by a binary rating gate, and paid for by nobody. It clears now.
    const billYield13wBps = reg.zeroRates.tenor3M * 10000;
    const cpRecoveryRate = creditRecoveryRate(reg);
    const revolverWalkAwayBps = (reg.policyRate * 10000) + REVOLVER_MARGIN_BPS;

    interface CpIssuer {
      comp: Company;
      annualPd: number;
      survivingUSD: number;
      maturedUSD: number;
      wantedUSD: number;
    }
    const cpIssuers: CpIssuer[] = [];

    ctx.prevActiveFirms.forEach((comp) => {
      if (comp.region !== regionId || !isActiveCompany(comp) || !isPubliclyListed(comp)) return;
      if (comp.isBankEntity || comp.isInstitutionalEntity) return;

      // §7.311 writer flip — the ladder lives on the rows; fold order = chain order.
      const TSf = v2Mirror.tranches;
      let cpOutstandingUSD = 0;
      let maturedUSD = 0;
      for (const r of ladderRowsOf(v2Mirror, comp.id)) {
        if (!(TSf.flags[r] & TR_CP)) continue;
        cpOutstandingUSD += TSf.principalUSD[r];
        if (TSf.maturityWeek[r] <= ctx.nextWeek) maturedUSD += TSf.principalUSD[r];
      }
      const survivingUSD = Math.max(0, cpOutstandingUSD - maturedUSD);

      // What CP actually funds: the WORKING-CAPITAL STOCK — the receivables and inventory the
      // balance sheet permanently carries (the same 8%-of-revenue the statements themselves
      // book) — to the extent the company's own projected quarter-end cash does not cover it. A
      // company holding ample cash runs no program; one running lean runs a standing program,
      // permanently rolled, that grows when cash drains and shrinks when it rebuilds. The first
      // version of this looked only for a projected cash DEFICIT and found no issuer in sixty
      // weeks: almost nobody projects negative cash, but plenty of real issuers paper their
      // working capital, which is who the CP market is. THE SIZE IS STILL THE ISSUER'S; the
      // price is not, and what the book will not fund at that price does not place.
      let annualInterest = 0;
      for (const r of ladderRowsOf(v2Mirror, comp.id)) {
        if (!(TSf.flags[r] & TR_FLOATING)) annualInterest += TSf.principalUSD[r] * (Number.isNaN(TSf.couponRate[r]) ? 0.05 : TSf.couponRate[r]);
        else annualInterest += TSf.principalUSD[r] * (reg.policyRate + (Number.isNaN(TSf.floatingMarginBps[r]) ? 200 : TSf.floatingMarginBps[r]) / 10000);
      }
      const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
      const dividendsQuarterUSD = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0);
      const quarterOutflowsUSD = annualInterest / 4 + (comp.maintenanceCapex ?? 0) / 4 + dividendsQuarterUSD;
      const quarterInflowUSD = Math.max(0, comp.ebitda) / 4;
      const projectedCashUSD = comp.cash - cpOutstandingUSD + quarterInflowUSD - quarterOutflowsUSD;
      const workingCapitalStockUSD = comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
      const rawGapUSD = Math.max(0, workingCapitalStockUSD - Math.max(0, projectedCashUSD));
      const targetCPUSD = rawGapUSD > comp.annualRevenue * CP_MIN_GAP_SHARE_OF_REVENUE
        ? Math.min(rawGapUSD, comp.annualRevenue * CP_MAX_SHARE_OF_REVENUE)
        : 0;

      if (survivingUSD <= 0 && targetCPUSD <= 0 && maturedUSD <= 0) return;
      cpIssuers.push({
        comp,
        annualPd: computeAnnualDefaultProbability(v2Mirror, comp),
        survivingUSD,
        maturedUSD,
        wantedUSD: Math.max(0, targetCPUSD - survivingUSD),
      });
    });

    if (cpIssuers.length > 0) {
      ctx.holdingsStore!.nextEpoch();
      const store = ctx.holdingsStore!;
      const cpIssuerIds = new Set(cpIssuers.map((i) => i.comp.id));
      const issuerById = new Map(cpIssuers.map((i) => [i.comp.id, i]));

      // ---- 1. MATURITIES. The issuer repays its holders of record and their claim shrinks by
      // exactly what they were paid. This used to be one payment to the boundary, because there
      // was no register of who held the paper.
      const cpEntities = ctx.updatedInstitutionalEntities.filter((e) => !e.isDefaulted);
      const heldByIssuerByEntity = new Map<string, Map<string, number>>();
      cpEntities.forEach((entity) => {
        const byIssuer = new Map<string, number>();
        store.scan(entity.id, 'COMMERCIAL_PAPER', (h) => {
          if (!cpIssuerIds.has(h.instrumentId)) return false;
          byIssuer.set(h.instrumentId, (byIssuer.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
          return true;
        });
        heldByIssuerByEntity.set(entity.id, byIssuer);
      });

      // A DESK IS A HOLDER, and its paper matures like anyone else's. Scaling only the
      // institutions left the desks carrying a claim on CP that had already been repaid, and the
      // ledger check caught it immediately: holders at 117% of the EUR stock by week ten.
      const cpBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
      const deskCpRows = new Map<string, { instrumentId: string; inventoryUSD: number; units?: number }[]>();
      cpBanks.forEach((bank) => {
        const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (sheet?.dealerDeskInventory?.[CP_BOOK]) deskCpRows.set(bank.ticker, sheet.dealerDeskInventory[CP_BOOK]);
      });

      cpIssuers.forEach((iss) => {
        const preUSD = iss.survivingUSD + iss.maturedUSD;
        if (!(iss.maturedUSD > 0) || !(preUSD > 0)) return;
        const survivingShare = iss.survivingUSD / preUSD;
        deskCpRows.forEach((rows, ticker) => {
          let repaidUSD = 0;
          rows.forEach((r) => {
            if (r.instrumentId !== iss.comp.id) return;
            repaidUSD += r.inventoryUSD * (1 - survivingShare);
            r.inventoryUSD *= survivingShare;
            if (r.units !== undefined) r.units *= survivingShare;
          });
          if (repaidUSD > 0) {
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: iss.comp.ticker },
              payee: { kind: 'BANK_SECURITIES', ticker },
              amountUSD: repaidUSD,
              reason: 'commercial paper redeemed',
            });
          }
        });
        heldByIssuerByEntity.forEach((byIssuer, entityId) => {
          const heldUSD = byIssuer.get(iss.comp.id) ?? 0;
          if (!(heldUSD > 0)) return;
          const repaidUSD = heldUSD * (1 - survivingShare);
          byIssuer.set(iss.comp.id, heldUSD - repaidUSD);
          if (repaidUSD > 0) {
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: iss.comp.ticker },
              payee: { kind: 'INSTITUTION', id: entityId },
              amountUSD: repaidUSD,
              reason: 'commercial paper redeemed',
            });
          }
        });
        {
          const TSr = v2Mirror.tranches;
          const kept = ladderRowsOf(v2Mirror, iss.comp.id)
            .filter((r) => !((TSr.flags[r] & TR_CP) && TSr.maturityWeek[r] <= ctx.nextWeek));
          relinkLadder(v2Mirror, iss.comp.id, kept);
        }
      });

      deskCpRows.forEach((rows, ticker) => {
        const bank = cpBanks.find((b) => b.ticker === ticker);
        if (!bank) return;
        const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
        updateBankSheet(ctx, ticker, {
          ...sheet,
          dealerDeskInventory: {
            ...(sheet.dealerDeskInventory ?? {}),
            [CP_BOOK]: rows.filter((r) => Math.abs(r.inventoryUSD) > 1),
          },
        });
      });

      // ---- 2. THE BOOK. One instrument per issuer, the surviving stock plus what it brings.
      const heldByInstitutionsUSD = new Map<string, number>();
      heldByIssuerByEntity.forEach((byIssuer) => byIssuer.forEach((usd, issuerId) => {
        if (usd > 0) heldByInstitutionsUSD.set(issuerId, (heldByInstitutionsUSD.get(issuerId) ?? 0) + usd);
      }));
      const cpInstruments: ClearingInstrument[] = cpIssuers.map((iss) => {
        const TSb = v2Mirror.tranches;
        let survCouponSum = 0;
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if (TSb.flags[r] & TR_CP) survCouponSum += TSb.principalUSD[r] * (Number.isNaN(TSb.couponRate[r]) ? 0 : TSb.couponRate[r]);
        }
        const weightedCouponBps = iss.survivingUSD > 0 ? survCouponSum / iss.survivingUSD * 10000 : 0;
        const fairOpeningBps = cpReservationYieldBps({
          clearedBillYieldBps: billYield13wBps,
          annualDefaultProbability: iss.annualPd,
          recoveryRate: cpRecoveryRate,
          tenorWeeks: CP_TENOR_WEEKS,
        });
        return {
          id: iss.comp.id,
          // OWN7: what the INSTITUTIONS hold, before the desks are built. Their own positions are
          // added below — the desks have to be sized against a live float, and a float of zero
          // makes `buildDealerDeskParticipants` return no desk at all.
          outstandingUSD: iss.survivingUSD,
          tradableFloatUSD: heldByInstitutionsUSD.get(iss.comp.id) ?? 0,
          currentStat: weightedCouponBps > 0 ? weightedCouponBps : Math.max(1, fairOpeningBps),
          statKind: 'YIELD_LIKE',
          durationYears: CP_TENOR_WEEKS / 52,
          primaryOfferingUSD: iss.wantedUSD,
          // THE TREASURER'S WALK-AWAY IS ITS COMMITTED LINE. Nobody pays more for paper than the
          // revolver beside it costs, so above this the deal is pulled and the line is drawn —
          // which is the funding squeeze the old rating gate asserted, now priced.
          primaryWithdrawStat: iss.wantedUSD > 0 ? revolverWalkAwayBps : undefined,
        };
      });

      // ---- 3. THE BUYERS. The money funds and the cash sleeves that already run through the
      // bill and repo books, plus the banks' own desks. A buyer's reservation is its own
      // alternative — the cleared 13-week bill, which is exactly what this money earns instead —
      // plus the loss it expects on THIS issuer over the paper's actual life. Credit policy is a
      // SIZE, never a veto (domain/commercial-paper.ts).
      const cpParticipants: ClearingParticipant[] = [];
      cpEntities.forEach((entity) => {
        const sleeveUSD = entity.totalAssetsUSD * entity.assetAllocationTarget.cashPct * CP_SHARE_OF_TERM_SLEEVE;
        const holdings = heldByIssuerByEntity.get(entity.id) ?? new Map<string, number>();
        if (!(sleeveUSD > 0) && holdings.size === 0) return;
        const cashUSD = institutionSpendableUSD(ctx, entity) * CP_SHARE_OF_TERM_SLEEVE;
        const demand = new Map<string, ParticipantDemand>();
        // §7.340 — ONE sleeve, many bids: the per-issuer limit is a CONCENTRATION rule, not a
        // budget, and with fifty issuers in the book fifty bids at 5% each offered the same
        // dollar two and a half times over. The engine has no cross-instrument budget (each
        // bid is affordable on its own), so the cash is divided across the bids it is put
        // behind: no bid can take more than its share, and the sum can never exceed the sleeve.
        // Measured: a private-equity fund closed a week overdrawn by 2.9M on a 960M balance
        // — bills at their cap, then CP at 2× what was left.
        const bidShare = Math.min(CP_SINGLE_ISSUER_LIMIT, 1 / Math.max(1, cpIssuers.length));
        cpIssuers.forEach((iss) => {
          const lineUSD = sleeveUSD * CP_SINGLE_ISSUER_LIMIT * cpCreditPolicyShare(iss.comp.creditRating);
          demand.set(iss.comp.id, {
            reservationStat: cpReservationYieldBps({
              clearedBillYieldBps: billYield13wBps,
              annualDefaultProbability: iss.annualPd,
              recoveryRate: cpRecoveryRate,
              tenorWeeks: CP_TENOR_WEEKS,
            }),
            maxHoldingUSD: lineUSD,
            fullSizeStatRange: CP_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: cashUSD * bidShare,
          });
        });
        cpParticipants.push({ id: entity.id, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      const cpDeskParticipants = buildDealerDeskParticipants({
        ctx, banks: cpBanks, book: CP_BOOK, instruments: cpInstruments,
        spreadBps: DESK_SPREAD_BPS_BY_BOOK[CP_BOOK],
      });
      const cpDeskTickers = deskTickersOf(cpDeskParticipants);

      // OWN7: and now the desks' own books join the float, which is complete once they exist.
      const cpDeskHeldUSD = new Map<string, number>();
      cpDeskParticipants.forEach((p) =>
        p.currentHoldingsByInstrumentId.forEach((usd, id) => {
          if (usd > 0) cpDeskHeldUSD.set(id, (cpDeskHeldUSD.get(id) ?? 0) + usd);
        }));
      cpInstruments.forEach((inst) => {
        inst.tradableFloatUSD = (heldByInstitutionsUSD.get(inst.id) ?? 0) + (cpDeskHeldUSD.get(inst.id) ?? 0);
      });

      const cpResult = clearFinancialAsset(cpInstruments, [...cpParticipants, ...cpDeskParticipants], new Map(), {
        dealerSpreadBps: DESK_SPREAD_BPS_BY_BOOK[CP_BOOK],
        // OWN7: the float here is a stock these participants already hold, so an unsold
        // position stays with its holder rather than falling to a dealer nobody names.
        unsoldStaysWithHolder: true,
      });
      ctx.damperBoundInstrumentIds.push(...cpResult.damperBoundInstrumentIds.map((id) => `commercial paper:${id}`));
      if (!cpResult.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} commercial paper`);

      // ---- 4. APPLY. Holders' books from the fills; the issuer's new paper at the CLEARED rate
      // for exactly what placed; the committed line for the roll it could not place.
      cpEntities.forEach((entity) => {
        const fills = cpResult.newParticipantHoldings.get(entity.id);
        if (!fills) return;
        const rows: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          if (usd > 1) rows.push({ instrumentId, instrumentType: 'COMMERCIAL_PAPER', issuerRegion: regionId, quantityOrNotionalUSD: usd });
        });
        store.append(entity.id, rows);
      });

      cpIssuers.forEach((iss) => {
        const outcome = cpResult.primaryOutcomeById.get(iss.comp.id);
        const clearedBps = cpResult.newStatById.get(iss.comp.id) ?? 0;
        const placedUSD = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeUSD) : 0;
        // No floor on the level (rule 15): the paper exists at whatever the auction printed.
        if (placedUSD > 1) {
          pushLadderRow(v2Mirror, iss.comp.id, {
            id: `${iss.comp.ticker}-CP-${ctx.nextWeek}`,
            principalUSD: placedUSD,
            rateType: 'FIXED',
            couponRate: Number((clearedBps / 10000).toFixed(4)),
            originationWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + CP_TENOR_WEEKS,
            seniority: 'SENIOR',
            isCommercialPaper: true,
          } as DebtTranche);
        }
        // A roll it could not place is the real funding squeeze: the market said no (or said yes
        // at a level past the revolver, which is the same answer), and the committed bank line
        // catches the maturity at its own price. What the issuer merely WANTED to add and could
        // not place is simply funding it does not get — a revolver is not drawn for growth.
        const rollNeedUSD = Math.min(iss.maturedUSD, iss.wantedUSD);
        const revolverUSD = Math.max(0, rollNeedUSD - placedUSD);
        if (revolverUSD > 1) {
          pushLadderRow(v2Mirror, iss.comp.id, {
            id: `${iss.comp.ticker}-REVOLVER-${ctx.nextWeek}`,
            principalUSD: revolverUSD,
            rateType: 'FLOATING',
            floatingMarginBps: REVOLVER_MARGIN_BPS,
            originationWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + 52,
            seniority: 'SENIOR',
            // G2: a committed bank line is BANK debt, exactly like the revolver stage 08 draws
            // for a withdrawn refinancing. Unmarked, the identical instrument sat in the
            // syndicated loan market's float on one path and on the house bank's itemized book
            // on the other — one real thing represented two ways (rule 3).
            isBankFacility: true,
            facilityBankTicker: iss.comp.homeBankTicker,
          } as DebtTranche);
          pay(ctx, {
            payer: { kind: 'BANK_CREDIT', ticker: iss.comp.homeBankTicker ?? '' },
            payee: { kind: 'COMPANY', ticker: iss.comp.ticker },
            amountUSD: revolverUSD,
            reason: 'revolver drawn: commercial paper roll failed',
          });
          // SETL2b, the leg this draw was missing: a BANK_CREDIT payment writes the borrower's
          // deposit at settlement, and the matching LOAN lands on the lender only through a
          // credit event — stage 08's draws record one (recordCredit), this one did not, so the
          // house bank gained a deposit with no asset behind it and its identity broke by
          // exactly this draw (measured: CLFP w14 +6.81M against a 6.815M roll-fail draw).
          if (iss.comp.homeBankTicker) {
            ctx.creditEventsThisWeek.push({
              bankTicker: iss.comp.homeBankTicker, companyId: iss.comp.id,
              trancheId: `${iss.comp.ticker}-REVOLVER-${ctx.nextWeek}`,
              principalUSD: revolverUSD, marginBps: REVOLVER_MARGIN_BPS,
              originationWeek: ctx.nextWeek, termWeeks: 52, retire: false,
            });
          }
          ctx.newsItems.push({
            id: `cp-fail-${iss.comp.ticker}-${ctx.nextWeek}`,
            week: ctx.nextWeek,
            title: `${iss.comp.ticker} CP Roll Fails — Revolver Drawn`,
            description: `${iss.comp.name} could not place ${(revolverUSD / 1e6).toFixed(0)}M of commercial paper (rating ${iss.comp.creditRating}) and drew its bank revolver at policy+${REVOLVER_MARGIN_BPS}bps.`,
            category: 'CREDIT',
            impactBadge: '[FUNDING SQUEEZE]',
            impactRegion: iss.comp.region,
            impactSector: iss.comp.sector,
            affectedTicker: iss.comp.ticker,
            urgent: true,
          } as NewsItem);
        }
        const TSn = v2Mirror.tranches;
        let cpNowUSD = 0;
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if (TSn.flags[r] & TR_CP) cpNowUSD += TSn.principalUSD[r];
        }
        iss.comp.totalDebt = Math.max(0,
          iss.comp.totalDebt - (iss.survivingUSD + iss.maturedUSD) + cpNowUSD + revolverUSD);
      });

      // The desks' own CP inventory, on the banks that took it.
      applyDealerDeskFills({ ctx, banks: cpBanks, book: CP_BOOK, instruments: cpInstruments, result: cpResult });

      // SETL6: the whole cash side — buyers to the clearing house, the desks' fee, and the
      // clearing house to each ISSUER for the paper its own program actually placed.
      const cpEntityIds = new Set(cpEntities.map((e) => e.id));
      settleClearedBook(
        ctx, regionId, CP_BOOK,
        cpResult.netCashDeltaByParticipantId,
        (id) => (cpEntityIds.has(id) ? { kind: 'INSTITUTION', id } : dealerDeskPartyOf(id, cpDeskTickers)),
        { netCashUSD: cpResult.dealerNetCashUSD, feeUSD: cpResult.totalDealerRevenueUSD },
        feeDesksForRegion(ctx, regionId),
        primaryTakes(cpResult, (issuerId) => {
          const iss = issuerById.get(issuerId);
          return iss ? { kind: 'COMPANY', ticker: iss.comp.ticker } : undefined;
        })
      );
    }
  });
}
