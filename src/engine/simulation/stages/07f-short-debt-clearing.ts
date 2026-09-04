/**
 * Stage 7f: Short-dated debt — Treasury bills and commercial paper (WS5)
 *
 * The front end of the curve below 2Y was an extrapolation: `tenor3M` fell out of the
 * Nelson-Siegel fit through four bond points, so the one part of the curve the policy rate acts
 * on most directly was the one part no market ever set. Bills fix that: the 13/26/52-week
 * the region's own real bills (issued by stage 11, ~18% of the ladder) clear in
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

import { ensureV2 } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_CP, facilityBookOf, issuerIdOf, trancheRowOf } from '../../../engine2/tranches';
import { splitAcrossTranches, primarySliceOf } from './register-split';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { GameState, RegionId, ItemizedHolding, DebtTranche, NewsItem, Company } from '../../../types';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { computeAnnualDefaultProbability, creditRecoveryRate, payHoldersAccruedInterest, WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { isActiveCompany, isPubliclyListed, corporateTreasuryTargetLocal } from '../../../domain/company';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityLocal } from './repo-clearing';
import { encumberedFaceByBond } from '../../../domain/repo';
import { MIN_CASH_BUFFER_RATIO, leverageHeadroomLocal, sovereignBookCapacityLocal, liquidityDrivenSovereignFloorLocal } from '../../macro/banking';
import { centralBankParticipant, applyCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { pay, pendingSettlementLocal, institutionSpendableLocal } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, primaryAssetOf, PrimaryTake } from './book-settlement';
import { clearedBookDelta, transferHolding } from '../../ledger/holdings-ledger';
import { wireCentralBankFills } from './central-bank-demand';
import { issueTranche, retireTranche, commitLadder } from '../../ledger/tranche-ledger';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf } from './dealer-desks';
import { dealerDeskTicker } from '../../../domain/dealer-desk';
import { discountBillProceedsLocal, billYieldFromPrice, isDiscountBill } from '../../../domain/government';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { mandateWeightForIssuer } from '../../../domain/cross-border';
import { materializeGovLadder } from '../../../engine2/tranches';
import {
  CP_SINGLE_ISSUER_LIMIT, CP_SHARE_OF_TERM_SLEEVE, CP_FULL_SIZE_YIELD_RANGE_BPS,
  cpCreditPolicyShare, cpReservationYieldBps,
} from '../../../domain/commercial-paper';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { cashOf, bankReservesOf, bankDepositLines, householdDepositsAt } from '../../ledger/accounts';

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

// §3.13-SOV row 3: a bill's instrument id IS the bill's id. It used to be minted as
// `${regionId}-GOV-${bucketKey}` — a second id space for paper the ladder already named — and the
// translator that produced it is gone with the id shape.

export function runShortDebtClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2Mirror = ensureV2(state);
  const regionIds = REGION_IDS;

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];

    // ---- Bills ----
    // §3.13-SOV row 2: the ladder comes from the ONE store.
    const liveBillTranches = materializeGovLadder(ctx.v2, regionId).filter(
      (t) => t.maturityWeek > ctx.nextWeek && isDiscountBill(t.tenorAtIssuanceYears)
    );
    // §3.13-SOV row 3 — THE BILL AUCTION PRICES BILLS. THERE IS NO BUCKET.
    // The same removal as the bond book: each bill is its own instrument, with its own remaining
    // life. A thirteen-week bill issued nine weeks ago is a four-week bill and is priced as one,
    // where the group priced it as whatever its issue label said.
    const activeBills = liveBillTranches
      .filter((t) => t.principalLocal > 0)
      .map((t) => ({
        key: t.id,
        years: Math.max(1 / 52, (t.maturityWeek - state.currentWeek) / 52),
      }))
      .filter((b) => b.years > 1 / 52);
    if (activeBills.length > 0) {
      const outstandingByBond = new Map<string, number>(
        liveBillTranches.map((t) => [t.id, t.principalLocal])
      );
      const billIdList = activeBills.map((b) => b.key);
      /** The bills THIS region has live — a row is a bill if its id is one of them. */
      const billIds = new Set(billIdList);
      const cbOrder = reg.centralBankSheet
        ? centralBankParticipant(reg.centralBankSheet, billIdList, 'PRICE_LIKE')
        : null;
      // OWN7 — the shrink, stated the way 07c's third carve-out finally stated it: the float is
      // what the participants in THIS book hold BETWEEN THEM, computed off the participant list
      // itself rather than by naming the non-bidders one at a time. Naming them one at a time is
      // what left the residual no named book holds in the float, and the desks then bought
      // 4.5B of bills over ten weeks from an UNMODELED seller. The three real carve-outs fall
      // out of the participant sum for free: the central bank on a no-order week is not a
      // participant, the corporate treasuries that park cash in short paper never bid, and the
      // share no book holds at all has nobody to decrement. Set below, once the desks exist.
      // §3.13-SOV row 4 — A BILL CLEARS A PRICE TOO. A bill is a bond that pays no coupon and
      // returns its discount (`../instruments/bond.md` N5.c), so "it clears a yield and settles at
      // par" is the same defect here as on the bond book — and this stage already knew it, which
      // is why it computed a discount price from the cleared yield and REBATED the difference
      // below. That rebate exists only because the price was not the thing being cleared.
      //
      // The bill keeps its own convention: simple interest, `1/(1+y·t)`, which is how a bill is
      // quoted. `pricing/priceFromYield` compounds — right for a coupon bond, and about 2bp of
      // price away on a 13-week bill, so using it here would re-price every bill by changing its
      // day-count rather than by clearing it (rule 8).
      const billPriceAtYieldBps = (b: { years: number }, yieldBps: number): number =>
        discountBillProceedsLocal(1, Math.max(0, yieldBps / 10000), b.years);
      const billPriceRange = (b: { years: number }, yBps: number, rangeBps: number): number =>
        Math.max(1e-9, Math.abs(billPriceAtYieldBps(b, yBps) - billPriceAtYieldBps(b, yBps + rangeBps)));
      const billCurrentYieldBps = (b: { years: number }): number =>
        Math.max(1, calculateNelsonSiegelZeroRate(b.years, reg.yieldCurveParams) * 10000);
      const instruments: ClearingInstrument[] = activeBills.map((b) => ({
        id: b.key,
        outstandingLocal: outstandingByBond.get(b.key) ?? 0,
        tradableFloatLocal: outstandingByBond.get(b.key) ?? 0,
        currentStat: billPriceAtYieldBps(b, billCurrentYieldBps(b)),
        statKind: 'PRICE_LIKE',
        durationYears: b.years,
      }));

      const regionBanks = ctx.updatedCompanies.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
      // XB1: bills are the one book a money fund belongs in, and foreign cash sleeves reach for
      // them too — a mandate bound, not an assigned share.
      const billStockByRegion: Record<string, number> = {};
      (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
        billStockByRegion[r] = materializeGovLadder(ctx.v2, r)
          .filter((t) => isDiscountBill(t.tenorAtIssuanceYears))
          .reduce((a, t) => a + t.principalLocal, 0);
      });
      const regionEntities = ctx.updatedInstitutionalEntities.filter(
        (e) => mandateWeightForIssuer(e.entityType, e.region, regionId, billStockByRegion) > 0
      );
      const totalBillStockLocal = activeBills.reduce((s, b) => s + (outstandingByBond.get(b.key) ?? 0), 0) || 1;
      // OWN3: bills and bonds are one HQLA pool, so both books apportion a bank's single
      // appetite over the whole sovereign stock rather than each over its own half.
      const wholeSovStockLocal = materializeGovLadder(ctx.v2, regionId)
        .filter((t) => t.maturityWeek > ctx.nextWeek)
        .reduce((s, t) => s + Math.max(0, t.principalLocal), 0) || 1;

      const participants: ClearingParticipant[] = [];

      // Banks: the arbitrage anchor. Unbounded size at policy + a few bp — their real constraint
      // is the reserve position S2 built, not a cash budget, exactly as in 07c.
      // §3.13-SOV row 3: per bond, off the bills this auction is pricing.
      const repoHaircuts = computeSovereignRepoHaircuts(reg, (id) => activeBills.find((b) => b.key === id)?.years);
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
        const reservesLocal = bankReservesOf(ctx.v2, bank.ticker);
        const facilityBookLocal = facilityBookOf(ctx.v2, bank.ticker);
        const settledCashLocal = reservesLocal
          + pendingSettlementLocal(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
        // REPO2: the floor is the face of THIS BILL actually pledged, not a blended share.
        const encumberedFace = encumberedFaceByBond(reg.repoBook ?? [], bank.ticker);
        const fundableLocal = Math.min(
          Math.max(0, settledCashLocal - householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)) * MIN_CASH_BUFFER_RATIO)
            + unencumberedBorrowingCapacityLocal(sheet, repoHaircuts, encumberedFace),
          leverageHeadroomLocal(sheet, reservesLocal, facilityBookLocal)
        );
        const appetiteLocal = sovereignBookCapacityLocal(sheet, reservesLocal, facilityBookLocal);
        const liquidityFloorLocal = liquidityDrivenSovereignFloorLocal(sheet, reservesLocal, bankDepositLines(ctx, bank.ticker));
        activeBills.forEach((b) => {
          const heldLocal = sheet.sovereignBondHoldingsByBond?.[b.key] ?? 0;
          holdings.set(b.key, heldLocal);
          const bondShare = (outstandingByBond.get(b.key) ?? 0) / totalBillStockLocal;
          const bondShareOfSovStock = (outstandingByBond.get(b.key) ?? 0) / wholeSovStockLocal;
          demand.set(b.key, {
            reservationStat: billPriceAtYieldBps(b, reg.policyRate * 10000 + BANK_BILL_PICKUP_BPS),
            maxHoldingLocal: appetiteLocal * bondShareOfSovStock,
            fullSizeStatRange: billPriceRange(b, billCurrentYieldBps(b), BILL_FULL_SIZE_YIELD_RANGE_BPS),
            maxNetPurchaseLocal: fundableLocal * bondShare,
            minHoldingLocal: Math.max(encumberedFace.get(b.key) ?? 0, liquidityFloorLocal * bondShareOfSovStock),
          });
        });
        participants.push({ id: `BANK-${bank.ticker}`, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      // Institutions: the cash sleeve. Half the sleeve wants to be in paper, wanting a small
      // term premium over policy for giving up the overnight option.
      regionEntities.forEach((entity) => {
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        const sleeveLocal = institutionTotalAssetsLocal(ctx, entity) * entity.assetAllocationTarget.cashPct * CASH_SLEEVE_BILL_SHARE;
        // SCALE C1: read-only scan of the store's GOV_BOND rows — nothing is claimed here.
        // Which rows this auction actually rewrites is decided at apply time, where the
        // auctioned-bill predicate lives (a bill that matured is NOT
        // auctioned this week and its rows must survive).
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => {
          if (h.issuerRegion === regionId) {
            // §3.13-SOV row 3: it is a bill because the ladder says so, not because its id parses.
            if (billIds.has(h.instrumentId)) holdings.set(h.instrumentId, (holdings.get(h.instrumentId) ?? 0) + h.quantityOrNotionalLocal);
          }
          return false;
        });
        activeBills.forEach((b) => {
          const bondShare = (outstandingByBond.get(b.key) ?? 0) / totalBillStockLocal;
          demand.set(b.key, {
            reservationStat: billPriceAtYieldBps(b, reg.policyRate * 10000 + INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR * b.years),
            maxHoldingLocal: sleeveLocal * bondShare,
            fullSizeStatRange: billPriceRange(b, billCurrentYieldBps(b), BILL_FULL_SIZE_YIELD_RANGE_BPS),
            maxNetPurchaseLocal: institutionSpendableLocal(ctx, entity) * CASH_SLEEVE_BILL_SHARE * bondShare,
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
        const heldByBond = new Map<string, number>();
        (comp.treasuryHoldings || []).forEach((h) => {
          // §7.241: the old prefix-slice also matched TRANCHE ids, yielding keys like 'B13-41'
          // that failed the lowercase test — so bill tranches held here silently dropped out of
          // the treasurer's sizing and the tranche fallback below was dead code.
          // §3.13-SOV row 3: a row is a bill if its id names one of THIS region's live bills.
          if (!billIds.has(h.instrumentId)) return;
          heldByBond.set(h.instrumentId, (heldByBond.get(h.instrumentId) ?? 0) + (h.quantityOrNotionalLocal ?? 0));
        });
        const cashLocal = cashOf(ctx.v2, comp);
        const targetLocal = corporateTreasuryTargetLocal(cashLocal, comp.annualRevenue ?? 0, riskAversionOf(comp.management));
        const heldLocal = Array.from(heldByBond.values()).reduce((a, v) => a + v, 0);
        if (!(targetLocal > 1) && !(heldLocal > 1)) return;
        const budgetLocal = Math.max(0, cashLocal
          + pendingSettlementLocal(ctx, { kind: 'COMPANY', ticker: comp.ticker }));
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        activeBills.forEach((b) => {
          const bondShare = (outstandingByBond.get(b.key) ?? 0) / totalBillStockLocal;
          holdings.set(b.key, heldByBond.get(b.key) ?? 0);
          demand.set(b.key, {
            reservationStat: billPriceAtYieldBps(b, reg.policyRate * 10000),
            maxHoldingLocal: targetLocal * bondShare,
            fullSizeStatRange: billPriceRange(b, billCurrentYieldBps(b), BILL_FULL_SIZE_YIELD_RANGE_BPS),
            maxNetPurchaseLocal: budgetLocal * bondShare,
          });
        });
        treasuryByTicker.set(comp.ticker, comp);
        participants.push({ id: treasuryParticipantId(comp.ticker), currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      const priorDealerInventory = new Map<string, number>();
      (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => {
        if (billIds.has(p.bondId)) priorDealerInventory.set(p.bondId, p.inventoryLocal);
      });

      // PUB2b: a maturing bill rolls back into bills, so the CB's book keeps its shape rather
      // than drifting up the curve. Same size-with-no-reservation order as in 07c; read above,
      // because whether it bids also decides whether its book is part of the float.
      if (cbOrder) participants.push(cbOrder.participant);
      if (reg.centralBankSheet) {
        reg.centralBankSheet.lastOrderPlacedLocal =
          (reg.centralBankSheet.lastOrderPlacedLocal ?? 0) + (cbOrder?.orderedLocal ?? 0);
      }

      // OWN7, first half: the float that every bidder EXCEPT the desks makes up, set before the
      // desks are built — a desk is sized against the live float, so leaving it at the whole
      // outstanding until after gave every desk capacity against paper that is not for sale.
      const heldByBiddersLocal = new Map<string, number>();
      participants.forEach((p) => p.currentHoldingsByInstrumentId.forEach((usd, id) => {
        if (usd > 0) heldByBiddersLocal.set(id, (heldByBiddersLocal.get(id) ?? 0) + usd);
      }));
      instruments.forEach((inst) => { inst.tradableFloatLocal = heldByBiddersLocal.get(inst.id) ?? 0; });

      // G3a: the banks' bill desks — the same market makers, a different book.
      const deskParticipants = buildDealerDeskParticipants({
        ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      });
      const deskTickers = deskTickersOf(deskParticipants);

      // OWN7, second half: the desks' own books join the float now that they exist. Every bidder
      // is a real holder, so what they hold between them is what is genuinely in play; everything
      // else on the register keeps its position.
      const deskHeldLocal = new Map<string, number>();
      deskParticipants.forEach((p) => p.currentHoldingsByInstrumentId.forEach((usd, id) => {
        if (usd > 0) deskHeldLocal.set(id, (deskHeldLocal.get(id) ?? 0) + usd);
      }));
      instruments.forEach((inst) => {
        inst.tradableFloatLocal = (heldByBiddersLocal.get(inst.id) ?? 0) + (deskHeldLocal.get(inst.id) ?? 0);
      });

      // PUB — and what NO book holds is the treasury's OFFERING, not a reservation. Stage 11
      // issues bills into the ladder every week; nothing ever bought them, and the treasury then
      // repaid a holder that was not there. A bill auction is exactly this: paper that exists,
      // offered at whatever the week's demand pays, and offered again next week if it does not
      // clear. The central bank's book on a no-order week is a real holding and is NOT on offer.
      const passiveCbByBond = new Map<string, number>();
      if (!cbOrder && reg.centralBankSheet) {
        Object.entries(reg.centralBankSheet.sovereignHoldingsByBond || {})
          .forEach(([key, usd]) => passiveCbByBond.set(key, Number(usd) || 0));
      }
      activeBills.forEach((b) => {
        const inst = instruments.find((i) => i.id === b.key);
        if (!inst) return;
        inst.primaryOfferingLocal = Math.max(0,
          (outstandingByBond.get(b.key) ?? 0)
          - inst.tradableFloatLocal
          - (passiveCbByBond.get(b.key) ?? 0));
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
      activeBills.forEach((b) => {
        const id = b.key;
        // §3.13-SOV row 4: the auction cleared the PRICE. It is no longer derived from a yield —
        // the yield is derived from it, below, for the curve.
        const clearedPrice = result.newStatById.get(id) ?? instruments.find((i) => i.id === id)?.currentStat ?? 1;
        priceFractionById.set(id, clearedPrice);
      });
      const rebateByParticipant = new Map<string, Map<string, number>>();
      // Step 13 (W2): what the register buyers' rows carry below face, per instrument — the
      // treasury's paper leg is valued at what its holders booked, so the house nets to zero.
      const rebateByInstrument = new Map<string, number>();
      const deskPrimaryFaceByInstrument = new Map<string, number>();
      let totalCashRebatesLocal = 0;
      {
        const boughtByInstrument = new Map<string, number>();
        const buyersByInstrument = new Map<string, { pid: string; boughtLocal: number }[]>();
        [...participants, ...deskParticipants].forEach((p) => {
          const fills = result.newParticipantHoldings.get(p.id);
          if (!fills) return;
          fills.forEach((newLocal, id) => {
            const boughtLocal = newLocal - (p.currentHoldingsByInstrumentId.get(id) ?? 0);
            if (boughtLocal > 1) {
              boughtByInstrument.set(id, (boughtByInstrument.get(id) ?? 0) + boughtLocal);
              const list = buyersByInstrument.get(id) ?? [];
              list.push({ pid: p.id, boughtLocal });
              buyersByInstrument.set(id, list);
            }
          });
        });
        result.primaryOutcomeById.forEach((o, instrumentId) => {
          if (o.withdrawn) return;
          const pf = priceFractionById.get(instrumentId);
          if (pf === undefined || pf >= 1) return;
          const takeLocal = Math.max(0, o.marketTakeLocal);
          const totalBoughtLocal = boughtByInstrument.get(instrumentId) ?? 0;
          if (!(takeLocal > 1) || !(totalBoughtLocal > 0)) return;
          (buyersByInstrument.get(instrumentId) ?? []).forEach(({ pid, boughtLocal }) => {
            const primarySliceLocal = boughtLocal * Math.min(1, takeLocal / totalBoughtLocal);
            const discountLocal = primarySliceLocal * (1 - pf);
            if (!(discountLocal > 0)) return;
            if (dealerDeskTicker(pid) !== undefined) {
              deskPrimaryFaceByInstrument.set(instrumentId,
                (deskPrimaryFaceByInstrument.get(instrumentId) ?? 0) + discountLocal);
              return;
            }
            const m = rebateByParticipant.get(pid) ?? new Map<string, number>();
            m.set(instrumentId, (m.get(instrumentId) ?? 0) + discountLocal);
            rebateByParticipant.set(pid, m);
            rebateByInstrument.set(instrumentId, (rebateByInstrument.get(instrumentId) ?? 0) + discountLocal);
            // The cash half of the same instruction: the buyer pays cost, not face — the
            // central bank included (its "payment" is the reserves it creates, and it creates
            // only what the paper cost; its book and its issuance must tell the same story).
            result.netCashDeltaByParticipantId.set(pid,
              (result.netCashDeltaByParticipantId.get(pid) ?? 0) + discountLocal);
            totalCashRebatesLocal += discountLocal;
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
        // Step 13 (W2): the central bank's fills are wires from the house — the paper it bought
        // with the reserves it created.
        wireCentralBankFills(regionId, reg.centralBankSheet, billIdList, cbFills, 'bill clearing fill');
        const filled = applyCentralBankFills(
          reg.centralBankSheet, billIdList, cbFills
        );
        reg.centralBankSheet.lastOpenMarketPurchasesLocal =
          Math.round(((reg.centralBankSheet.lastOpenMarketPurchasesLocal ?? 0) + filled));
      }

      // Refit the curve through BOTH the cleared bills and 07c's cleared bonds, so the sub-2Y
      // segment every short-rate consumer reads comes from a market, not an extrapolation.
      // §3.13-SOV row 4: the bills cleared a PRICE, so the curve is fitted through the yields
      // those prices imply — on the bill's own simple-interest convention.
      const billPoints = activeBills.map((b) => {
        const px = result.newStatById.get(b.key);
        return {
          tenorYears: b.years,
          yield: px === undefined ? reg.zeroRates.tenor3M : billYieldFromPrice(px, b.years),
        };
      });
      // §3.13-SOV row 5 / §3.25 — the bill session deposits what it cleared and fits nothing. It
      // used to refit `yieldCurveParams` through these points plus four SYNTHETIC ones read off
      // `zeroRates` — a fit through the previous fit's own output — and then write only `tenor3M`,
      // leaving 2Y–30Y at 07c's values. `sovereign-curve.ts` owns the fit now.
      ctx.sovereignCurvePoints.set(regionId, [
        ...(ctx.sovereignCurvePoints.get(regionId) ?? []),
        ...billPoints,
      ]);
      if (process.env.BILL_TRACE === '1') {
        console.log(`  [bill-trace] ${regionId} w${ctx.nextWeek}: ` + activeBills.map((b) => {
          const px = result.newStatById.get(b.key);
          return `${b.key} px=${px === undefined ? 'none' : px.toFixed(8)} y=${(billPoints.find((p) => p.tenorYears === b.years)!.yield * 100).toFixed(4)}%`;
        }).join(' | '));
      }

      // Apply bank books (their bills live beside their bonds in the one book).
      // The write goes to `companyUpdates`, which is the ONLY bank-sheet write that survives:
      // stage 08 rebuilds `updatedCompanies` from the week-start array and takes each bank's
      // sheet from `companyUpdates`. This stage used to write `updatedCompanies` instead, so
      // every bill fill it cleared for a bank was silently discarded — the fills were priced,
      // the positions never moved, and 07c's careful pass-through of the bills was
      // preserving a position nothing was updating.
      regionBanks.forEach((bank) => {
        const fills = result.newParticipantHoldings.get(`BANK-${bank.ticker}`);
        if (!fills) return;
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        // Only the bills this auction actually priced are rewritten; one maturing this week is
        // left standing for stage 11 to redeem for cash.
        const byTenor: Record<string, number> = { ...(existingSheet.sovereignBondHoldingsByBond || {}) };
        let faceDeltaLocal = 0;
        // Step 13 (W2): the bank's bill book moves by wire against the house, bill by bill.
        const billsBefore = new Map<string, { valueLocal: number }>(), billsAfter = new Map<string, { valueLocal: number }>();
        activeBills.forEach((b) => {
          // Item 13: the primary slice books at cost — the rebate is the same instruction's
          // booking half (the cash half was adjusted on the participant's net above).
          const newLocal = (fills.get(b.key) ?? 0)
            - rebateOf(`BANK-${bank.ticker}`, b.key);
          faceDeltaLocal += newLocal - (byTenor[b.key] ?? 0);
          billsBefore.set(b.key, { valueLocal: byTenor[b.key] ?? 0 });
          billsAfter.set(b.key, { valueLocal: newLocal > 1 ? newLocal : 0 });
          if (newLocal > 1) byTenor[b.key] = newLocal; else delete byTenor[b.key];
        });
        clearedBookDelta({ kind: 'BANK_SECURITIES', ticker: bank.ticker }, regionId, 'GOV_BOND', billsBefore, billsAfter, () => undefined, 'bill clearing fill');
        // The engine's cash leg (face plus the dealer fee); the fee part is P&L — an expense the
        // identity invariant would otherwise report as a missing leg. SETL6: the reserves leg
        // settles through the clearing house below, so the buyer and the seller move against
        // each other rather than each moving alone.
        const cashDeltaLocal = result.netCashDeltaByParticipantId.get(`BANK-${bank.ticker}`) ?? -faceDeltaLocal;
        const feeLocal = Math.max(0, -(cashDeltaLocal + faceDeltaLocal));
        updateBankSheet(ctx, bank.ticker, {
          ...bookPnL(existingSheet, -feeLocal, 'bill book fee', bank.ticker),
          sovereignBondHoldingsByBond: byTenor,
          sovereignBondHoldingsLocal: Math.round(Object.values(byTenor).reduce((s, v) => s + v, 0)),
        });
      });

      // Apply institutional books with the engine's cash leg.
      // SCALE C1: claim only what this auction priced — other regions, bonds, and (the subtle
      // one) bills not in THIS week's auction all stay unclaimed. A bill leaves the auction the
      // week it matures (`maturityWeek > nextWeek` excludes it), and
      // rebuilding the book from the auction alone therefore deleted the holder's position in it
      // with no cash leg, leaving stage 11's redemption nothing to pay out on. Measured as the
      // institutional book dropping 5-11% on exactly the weeks the seeded 13/26/52-week
      // programs matured. An entity with no fills is not touched at all.
      const auctionedIds = new Set(activeBills.map((b) => b.key));
      regionEntities.forEach((entity) => {
        const fills = result.newParticipantHoldings.get(entity.id);
        if (!fills) return;
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => auctionedIds.has(h.instrumentId));
        const billHoldings: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          const bookedLocal = usd - rebateOf(entity.id, instrumentId);
          if (bookedLocal > 1) billHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalLocal: bookedLocal, units: bookedLocal });
        });
        ctx.holdingsStore!.append(entity.id, billHoldings);
      });

      // CASH: the treasuries' own books, rewritten from their fills. The rows are keyed by the
      // BUCKET id every other holder in this book uses — the tranche ids stage 08 used to write
      // were a second id space for one instrument (rule 4), and 07c had to read both.
      treasuryByTicker.forEach((comp, ticker) => {
        const fills = result.newParticipantHoldings.get(treasuryParticipantId(ticker));
        if (!fills) return;
        const kept = (comp.treasuryHoldings || []).filter((h) => !billIds.has(h.instrumentId));
        const billRows: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          const bookedLocal = usd - rebateOf(treasuryParticipantId(ticker), instrumentId);
          if (bookedLocal > 1) billRows.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalLocal: bookedLocal, units: bookedLocal });
        });
        // Step 13 (W2): the treasury's bill rows move by wire against the house (its rows are
        // keyed by bill id, as every other holder's are).
        const tBefore = new Map<string, { valueLocal: number }>(), tAfter = new Map<string, { valueLocal: number }>();
        (comp.treasuryHoldings || []).forEach((h) => {
          if (!billIds.has(h.instrumentId)) return;
          tBefore.set(h.instrumentId, { valueLocal: (tBefore.get(h.instrumentId)?.valueLocal ?? 0) + (h.quantityOrNotionalLocal ?? 0) });
        });
        billRows.forEach((h) => tAfter.set(h.instrumentId, { valueLocal: (tAfter.get(h.instrumentId)?.valueLocal ?? 0) + (h.quantityOrNotionalLocal ?? 0) }));
        clearedBookDelta({ kind: 'COMPANY', ticker }, regionId, 'GOV_BOND', tBefore, tAfter, () => undefined, 'bill clearing fill');
        if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
        ctx.companyUpdates[ticker].treasuryHoldings = [...kept, ...billRows];
      });

      // SETL6: the book's whole cash side, through the clearing house — participants, the
      // desks' fees, and the dealer's own inventory leg.
      const billEntityIds = new Set(regionEntities.map((e) => e.id));
      settleClearedBook(
        ctx, regionId, currencyOf(regionId), BOOK,
        result.netCashDeltaByParticipantId,
        (id) => (billEntityIds.has(id) ? { kind: 'INSTITUTION', id }
          : id.startsWith('BANK-') ? { kind: 'BANK_SECURITIES', ticker: id.slice(5) }
            : id.startsWith('TREASURY-') ? { kind: 'COMPANY', ticker: id.slice('TREASURY-'.length) }
              : id === CENTRAL_BANK_PARTICIPANT_ID ? { kind: 'CENTRAL_BANK', region: regionId }
                : dealerDeskPartyOf(id, deskTickers)),
        // Item 13: the CCP receives less by exactly the rebates its buyers kept, and pays the
        // treasury less by the same total — flat by construction, as a clearing house is.
        { netCashLocal: result.dealerNetCashLocal - totalCashRebatesLocal, feeLocal: result.totalDealerRevenueLocal },
        feeDesksForRegion(ctx, regionId),
        // PUB/item 13: the treasury receives the DISCOUNTED proceeds the auction's yield
        // implies — that shortfall against face is exactly the government's borrowing cost,
        // paid back at redemption (PUB3d's conservation, both legs at last). The desks' primary
        // slice still pays face, so the treasury is made whole for it here.
        (() => {
          const takes: PrimaryTake[] = [];
          const billAsset = primaryAssetOf('GOV_BOND', regionId);
          result.primaryOutcomeById.forEach((o, instrumentId) => {
            if (o.withdrawn) return;
            const pf = priceFractionById.get(instrumentId) ?? 1;
            const amountLocal = Math.max(0, o.marketTakeLocal) * pf
              + (deskPrimaryFaceByInstrument.get(instrumentId) ?? 0);
            // §5-WIRES W2: the bill delivered at what its holders BOOK (face less the register
            // buyers' rebates — the desks book face); the money at the discount. P (step 13's
            // register per tranche) makes this face × price by construction.
            if (amountLocal > 0) takes.push({ party: { kind: 'GOVERNMENT', region: regionId }, amountLocal, asset: billAsset(instrumentId, Math.max(0, o.marketTakeLocal - (rebateByInstrument.get(instrumentId) ?? 0)), o.clearedStat) });
          });
          return takes;
        })()
      );

      // §5-CLOSE O1: bills the auction did not place are withdrawn from the ladder (paper
      // nobody holds is not debt); the treasury's need rolls forward.
      {
        instruments.forEach((inst) => {
          const o = result.primaryOutcomeById.get(inst.id);
          const placedLocal = o && !o.withdrawn ? Math.max(0, o.marketTakeLocal) : 0;
          const unplacedLocal = Math.max(0, (inst.primaryOfferingLocal ?? 0) - placedLocal);
          if (unplacedLocal <= 1) return;
          // §3.13-SOV row 2: withdrawn paper is face that ceased to exist, and it comes off THIS
          // BOND's own row by wire — the array-and-diff this replaces rebuilt a list to derive the
          // same retirement.
          const row = trancheRowOf(ctx.v2, inst.id);
          if (row === undefined) return;
          const takeLocal = Math.min(unplacedLocal, ctx.v2.tranches.principalLocal[row]);
          if (!(takeLocal > 0)) return;
          const govIssuer = { id: `GOV_${regionId}`, ticker: `GOV_${regionId}`, region: regionId, kind: 'GOVERNMENT' as const };
          retireTranche(ctx.v2, govIssuer, row, takeLocal, 'bill issuance withdrawn');
          commitLadder(ctx.v2, govIssuer,
            ladderRowsOf(ctx.v2, govIssuer.id).filter((r) => ctx.v2.tranches.principalLocal[r] > 0.01));
        });
      }
      // G3a: the desks' own bill inventory, owned by the banks that took it; bills live in the
      // same regional array as bonds under their own keys, and the bond rows pass through.
      const deskViewById = applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });
      const bondDealerRows = (reg.bankingSector.sovBondDealerInventory || []).filter((p) => !billIds.has(p.bondId));
      const billDealerRows = activeBills.map((b) => ({
        bondId: b.key,
        inventoryLocal: deskViewById.get(b.key) ?? 0,
      })).filter((r) => Math.abs(r.inventoryLocal) > 1);
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
      survivingLocal: number;
      maturedLocal: number;
      wantedLocal: number;
    }
    const cpIssuers: CpIssuer[] = [];

    ctx.prevActiveFirms.forEach((comp) => {
      if (comp.region !== regionId || !isActiveCompany(comp) || !isPubliclyListed(comp)) return;
      if (comp.isBankEntity || comp.isInstitutionalEntity) return;

      // §7.311 writer flip — the ladder lives on the rows; fold order = chain order.
      const TSf = v2Mirror.tranches;
      let cpOutstandingLocal = 0;
      let maturedLocal = 0;
      for (const r of ladderRowsOf(v2Mirror, comp.id)) {
        if (!(TSf.flags[r] & TR_CP)) continue;
        cpOutstandingLocal += TSf.principalLocal[r];
        if (TSf.maturityWeek[r] <= ctx.nextWeek) maturedLocal += TSf.principalLocal[r];
      }
      const survivingLocal = Math.max(0, cpOutstandingLocal - maturedLocal);

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
        if (!(TSf.flags[r] & TR_FLOATING)) annualInterest += TSf.principalLocal[r] * (Number.isNaN(TSf.couponRate[r]) ? 0.05 : TSf.couponRate[r]);
        else annualInterest += TSf.principalLocal[r] * (reg.policyRate + (Number.isNaN(TSf.floatingMarginBps[r]) ? 200 : TSf.floatingMarginBps[r]) / 10000);
      }
      const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
      const dividendsQuarterLocal = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0);
      const quarterOutflowsLocal = annualInterest / 4 + (comp.maintenanceCapex ?? 0) / 4 + dividendsQuarterLocal;
      const quarterInflowLocal = Math.max(0, comp.ebitda) / 4;
      const projectedCashLocal = cashOf(ctx.v2, comp) - cpOutstandingLocal + quarterInflowLocal - quarterOutflowsLocal;
      const workingCapitalStockLocal = comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
      const rawGapLocal = Math.max(0, workingCapitalStockLocal - Math.max(0, projectedCashLocal));
      const targetCPLocal = rawGapLocal > comp.annualRevenue * CP_MIN_GAP_SHARE_OF_REVENUE
        ? Math.min(rawGapLocal, comp.annualRevenue * CP_MAX_SHARE_OF_REVENUE)
        : 0;

      if (survivingLocal <= 0 && targetCPLocal <= 0 && maturedLocal <= 0) return;
      cpIssuers.push({
        comp,
        annualPd: computeAnnualDefaultProbability(v2Mirror, comp),
        survivingLocal,
        maturedLocal,
        wantedLocal: Math.max(0, targetCPLocal - survivingLocal),
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
      // 13b: a holder's rows name TRANCHES — kept per tranche too, so a matured programme's rows
      // are repaid exactly (a row that still names its issuer shares the issuer's surviving ratio).
      const heldByTrancheByEntity = new Map<string, Map<string, number>>();
      cpEntities.forEach((entity) => {
        const byIssuer = new Map<string, number>();
        const byTranche = new Map<string, number>();
        store.scan(entity.id, 'COMMERCIAL_PAPER', (h) => {
          const issuerId = issuerIdOf(v2Mirror, h.instrumentId); // 13b: a row names a tranche or its issuer
          if (!cpIssuerIds.has(issuerId)) return false;
          byIssuer.set(issuerId, (byIssuer.get(issuerId) ?? 0) + h.quantityOrNotionalLocal);
          byTranche.set(h.instrumentId, (byTranche.get(h.instrumentId) ?? 0) + h.quantityOrNotionalLocal);
          return true;
        });
        heldByIssuerByEntity.set(entity.id, byIssuer);
        heldByTrancheByEntity.set(entity.id, byTranche);
      });

      // A DESK IS A HOLDER, and its paper matures like anyone else's. Scaling only the
      // institutions left the desks carrying a claim on CP that had already been repaid, and the
      // ledger check caught it immediately: holders at 117% of the EUR stock by week ten.
      const cpBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
      const deskCpRows = new Map<string, { instrumentId: string; inventoryLocal: number; units?: number }[]>();
      cpBanks.forEach((bank) => {
        const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (sheet?.dealerDeskInventory?.[CP_BOOK]) deskCpRows.set(bank.ticker, sheet.dealerDeskInventory[CP_BOOK]);
      });

      cpIssuers.forEach((iss) => {
        const preLocal = iss.survivingLocal + iss.maturedLocal;
        if (!(iss.maturedLocal > 0) || !(preLocal > 0)) return;
        const survivingShare = iss.survivingLocal / preLocal;
        deskCpRows.forEach((rows, ticker) => {
          let repaidLocal = 0;
          rows.forEach((r) => {
            if (r.instrumentId !== iss.comp.id) return;
            repaidLocal += r.inventoryLocal * (1 - survivingShare);
            r.inventoryLocal *= survivingShare;
            if (r.units !== undefined) r.units *= survivingShare;
          });
          if (repaidLocal > 0) {
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: iss.comp.ticker },
              payee: { kind: 'BANK_SECURITIES', ticker },
              amount: repaidLocal,
              currency: currencyOf(iss.comp.region),
              reason: 'commercial paper redeemed',
            });
            // Step 13 (W2): the matured paper leaves the desk by wire, to the house (the ladder's
            // retirement wire meets it there).
            transferHolding(ctx.v2, { kind: 'BANK_SECURITIES', ticker }, { kind: 'CLEARING_HOUSE', region: regionId },
              { instrumentType: 'COMMERCIAL_PAPER', instrumentId: iss.comp.id, issuerRegion: regionId, valueLocal: repaidLocal }, 'commercial paper redeemed: desk paper matured');
          }
        });
        heldByIssuerByEntity.forEach((byIssuer, entityId) => {
          const heldLocal = byIssuer.get(iss.comp.id) ?? 0;
          if (!(heldLocal > 0)) return;
          // 13b: the matured tranches' rows are what is repaid; a row keyed by the issuer itself
          // (no tranche behind it) shares the issuer's surviving ratio as before.
          let repaidLocal = 0;
          const TSm = v2Mirror.tranches;
          (heldByTrancheByEntity.get(entityId) ?? new Map<string, number>()).forEach((usd, instrumentId) => {
            if (issuerIdOf(v2Mirror, instrumentId) !== iss.comp.id) return;
            const tr = trancheRowOf(v2Mirror, instrumentId);
            if (tr === undefined) repaidLocal += usd * (1 - survivingShare);
            else if ((TSm.flags[tr] & TR_CP) && TSm.maturityWeek[tr] <= ctx.nextWeek) repaidLocal += usd;
          });
          repaidLocal = Math.min(heldLocal, repaidLocal);
          byIssuer.set(iss.comp.id, heldLocal - repaidLocal);
          if (repaidLocal > 0) {
            pay(ctx, {
              payer: { kind: 'COMPANY', ticker: iss.comp.ticker },
              payee: { kind: 'INSTITUTION', id: entityId },
              amount: repaidLocal,
              currency: currencyOf(iss.comp.region),
              reason: 'commercial paper redeemed',
            });
          }
        });
        {
          // §5-WIRES W3: matured paper hands its face back to the issuer by wire, then leaves the chain.
          const TSr = v2Mirror.tranches;
          const cpIssuer = { id: iss.comp.id, ticker: iss.comp.ticker, region: regionId };
          const kept: number[] = [];
          for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
            if ((TSr.flags[r] & TR_CP) && TSr.maturityWeek[r] <= ctx.nextWeek) {
              // STEP 1: THE PAPER'S INTEREST FALLS DUE WHERE THE PAPER IS REDEEMED. Commercial
              // paper is retired HERE, before stage 08 runs, so the register's accrual loop never
              // saw a CP tranche in its own maturity week — and `trancheWeekAccrual` makes CP due
              // ONLY then. The result was that CP interest accrued to holders every week from
              // issue and was never once paid. Marking the payout here settles it in the same
              // week: `applyHolderInterestAccruals` (stage 08) pays every holder of record
              // exactly what it accrued, from the issuer, and clears the balance.
              payHoldersAccruedInterest(ctx, v2Mirror.internedStrings[TSr.idRef[r]], 'COMMERCIAL_PAPER');
              if (TSr.principalLocal[r] > 0.01) retireTranche(v2Mirror, cpIssuer, r, TSr.principalLocal[r], 'commercial paper matured');
            } else kept.push(r);
          }
          commitLadder(v2Mirror, cpIssuer, kept);
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
            [CP_BOOK]: rows.filter((r) => Math.abs(r.inventoryLocal) > 1),
          },
        });
      });

      // ---- 2. THE BOOK. One instrument per issuer, the surviving stock plus what it brings.
      const heldByInstitutionsLocal = new Map<string, number>();
      heldByIssuerByEntity.forEach((byIssuer) => byIssuer.forEach((usd, issuerId) => {
        if (usd > 0) heldByInstitutionsLocal.set(issuerId, (heldByInstitutionsLocal.get(issuerId) ?? 0) + usd);
      }));
      const cpInstruments: ClearingInstrument[] = cpIssuers.map((iss) => {
        const TSb = v2Mirror.tranches;
        let survCouponSum = 0;
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if (TSb.flags[r] & TR_CP) survCouponSum += TSb.principalLocal[r] * (Number.isNaN(TSb.couponRate[r]) ? 0 : TSb.couponRate[r]);
        }
        const weightedCouponBps = iss.survivingLocal > 0 ? survCouponSum / iss.survivingLocal * 10000 : 0;
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
          outstandingLocal: iss.survivingLocal,
          tradableFloatLocal: heldByInstitutionsLocal.get(iss.comp.id) ?? 0,
          currentStat: weightedCouponBps > 0 ? weightedCouponBps : Math.max(1, fairOpeningBps),
          statKind: 'YIELD_LIKE',
          durationYears: CP_TENOR_WEEKS / 52,
          primaryOfferingLocal: iss.wantedLocal,
          // THE TREASURER'S WALK-AWAY IS ITS COMMITTED LINE. Nobody pays more for paper than the
          // revolver beside it costs, so above this the deal is pulled and the line is drawn —
          // which is the funding squeeze the old rating gate asserted, now priced.
          primaryWithdrawStat: iss.wantedLocal > 0 ? revolverWalkAwayBps : undefined,
        };
      });

      // ---- 3. THE BUYERS. The money funds and the cash sleeves that already run through the
      // bill and repo books, plus the banks' own desks. A buyer's reservation is its own
      // alternative — the cleared 13-week bill, which is exactly what this money earns instead —
      // plus the loss it expects on THIS issuer over the paper's actual life. Credit policy is a
      // SIZE, never a veto (domain/commercial-paper.ts).
      const cpParticipants: ClearingParticipant[] = [];
      cpEntities.forEach((entity) => {
        const sleeveLocal = institutionTotalAssetsLocal(ctx, entity) * entity.assetAllocationTarget.cashPct * CP_SHARE_OF_TERM_SLEEVE;
        const holdings = heldByIssuerByEntity.get(entity.id) ?? new Map<string, number>();
        if (!(sleeveLocal > 0) && holdings.size === 0) return;
        const cashLocal = institutionSpendableLocal(ctx, entity) * CP_SHARE_OF_TERM_SLEEVE;
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
          const lineLocal = sleeveLocal * CP_SINGLE_ISSUER_LIMIT * cpCreditPolicyShare(iss.comp.creditRating);
          demand.set(iss.comp.id, {
            reservationStat: cpReservationYieldBps({
              clearedBillYieldBps: billYield13wBps,
              annualDefaultProbability: iss.annualPd,
              recoveryRate: cpRecoveryRate,
              tenorWeeks: CP_TENOR_WEEKS,
            }),
            maxHoldingLocal: lineLocal,
            fullSizeStatRange: CP_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseLocal: cashLocal * bidShare,
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
      const cpDeskHeldLocal = new Map<string, number>();
      cpDeskParticipants.forEach((p) =>
        p.currentHoldingsByInstrumentId.forEach((usd, id) => {
          if (usd > 0) cpDeskHeldLocal.set(id, (cpDeskHeldLocal.get(id) ?? 0) + usd);
        }));
      cpInstruments.forEach((inst) => {
        inst.tradableFloatLocal = (heldByInstitutionsLocal.get(inst.id) ?? 0) + (cpDeskHeldLocal.get(inst.id) ?? 0);
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
      // 13b: the rows name TRANCHES — the week's placed paper first (its tranche is issued just
      // below, `${ticker}-CP-${week}`), the rest across the surviving programmes (register-split.ts).
      const cpBoughtByIssuer = new Map<string, number>();
      [...cpParticipants, ...cpDeskParticipants].forEach((p) => {
        const fills = cpResult.newParticipantHoldings.get(p.id); if (!fills) return;
        fills.forEach((usd, issuerId) => { const b = usd - (p.currentHoldingsByInstrumentId.get(issuerId) ?? 0); if (b > 0) cpBoughtByIssuer.set(issuerId, (cpBoughtByIssuer.get(issuerId) ?? 0) + b); });
      });
      cpEntities.forEach((entity) => {
        const fills = cpResult.newParticipantHoldings.get(entity.id);
        if (!fills) return;
        const rows: ItemizedHolding[] = [];
        const prior = heldByIssuerByEntity.get(entity.id);
        fills.forEach((usd, issuerId) => {
          if (!(usd > 1)) return;
          const iss = issuerById.get(issuerId);
          const outcome = cpResult.primaryOutcomeById.get(issuerId);
          const primary = iss && outcome && !outcome.withdrawn && outcome.marketTakeLocal > 1
            ? { trancheId: `${iss.comp.ticker}-CP-${ctx.nextWeek}`, sliceLocal: primarySliceOf(usd - (prior?.get(issuerId) ?? 0), cpBoughtByIssuer.get(issuerId) ?? 0, outcome.marketTakeLocal) }
            : undefined;
          splitAcrossTranches(v2Mirror, issuerId, 'COMMERCIAL_PAPER', usd, primary).forEach((t) => {
            if (t.usd > 1) rows.push({ instrumentId: t.instrumentId, instrumentType: 'COMMERCIAL_PAPER', issuerRegion: regionId, quantityOrNotionalLocal: t.usd, units: t.usd, faceLocal: t.usd });
          });
        });
        store.append(entity.id, rows);
      });

      cpIssuers.forEach((iss) => {
        const outcome = cpResult.primaryOutcomeById.get(iss.comp.id);
        const clearedBps = cpResult.newStatById.get(iss.comp.id) ?? 0;
        const placedLocal = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeLocal) : 0;
        // No floor on the level (rule 6): the paper exists at whatever the auction printed.
        if (placedLocal > 1) {
          issueTranche(v2Mirror, { id: iss.comp.id, ticker: iss.comp.ticker, region: regionId }, {
            id: `${iss.comp.ticker}-CP-${ctx.nextWeek}`,
            principalLocal: placedLocal,
            rateType: 'FIXED',
            couponRate: Number((clearedBps / 10000).toFixed(4)),
            originationWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + CP_TENOR_WEEKS,
            seniority: 'SENIOR',
            isCommercialPaper: true,
          } as DebtTranche, 'commercial paper placed');
        }
        // A roll it could not place is the real funding squeeze: the market said no (or said yes
        // at a level past the revolver, which is the same answer), and the committed bank line
        // catches the maturity at its own price. What the issuer merely WANTED to add and could
        // not place is simply funding it does not get — a revolver is not drawn for growth.
        const rollNeedLocal = Math.min(iss.maturedLocal, iss.wantedLocal);
        const revolverLocal = Math.max(0, rollNeedLocal - placedLocal);
        if (revolverLocal > 1) {
          issueTranche(v2Mirror, { id: iss.comp.id, ticker: iss.comp.ticker, region: regionId }, {
            id: `${iss.comp.ticker}-REVOLVER-${ctx.nextWeek}`,
            principalLocal: revolverLocal,
            rateType: 'FLOATING',
            floatingMarginBps: REVOLVER_MARGIN_BPS,
            originationWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + 52,
            seniority: 'SENIOR',
            // G2: a committed bank line is BANK debt, exactly like the revolver stage 08 draws
            // for a withdrawn refinancing. Unmarked, the identical instrument sat in the
            // syndicated loan market's float on one path and on the house bank's itemized book
            // on the other — one real thing represented two ways (rule 4).
            isBankFacility: true,
            facilityBankTicker: iss.comp.homeBankTicker,
          } as DebtTranche, 'revolver draw: commercial paper roll failed');
          pay(ctx, {
            payer: { kind: 'BANK_CREDIT', ticker: iss.comp.homeBankTicker ?? '' },
            payee: { kind: 'COMPANY', ticker: iss.comp.ticker },
            amount: revolverLocal,
            currency: currencyOf(iss.comp.region),
            reason: 'revolver drawn: commercial paper roll failed',
          });
          // SETL2b / step 10: a BANK_CREDIT payment writes the borrower's deposit at settlement,
          // and the matching asset is the facility row itself on the borrower's ladder — the
          // lender's book is a read of that row (`facilityBookOf`), so nothing else is recorded.
          ctx.newsItems.push({
            id: `cp-fail-${iss.comp.ticker}-${ctx.nextWeek}`,
            week: ctx.nextWeek,
            title: `${iss.comp.ticker} CP Roll Fails — Revolver Drawn`,
            description: `${iss.comp.name} could not place ${(revolverLocal / 1e6).toFixed(0)}M of commercial paper (rating ${iss.comp.creditRating}) and drew its bank revolver at policy+${REVOLVER_MARGIN_BPS}bps.`,
            category: 'CREDIT',
            impactBadge: '[FUNDING SQUEEZE]',
            impactRegion: iss.comp.region,
            impactSector: iss.comp.sector,
            affectedTicker: iss.comp.ticker,
            urgent: true,
          } as NewsItem);
        }
        // §5-WIRES D: total debt is a read of the ladder — the roll above already moved the rows.
      });

      // The desks' own CP inventory, on the banks that took it.
      applyDealerDeskFills({ ctx, banks: cpBanks, book: CP_BOOK, instruments: cpInstruments, result: cpResult });

      // SETL6: the whole cash side — buyers to the clearing house, the desks' fee, and the
      // clearing house to each ISSUER for the paper its own program actually placed.
      const cpEntityIds = new Set(cpEntities.map((e) => e.id));
      settleClearedBook(
        ctx, regionId, currencyOf(regionId), CP_BOOK,
        cpResult.netCashDeltaByParticipantId,
        (id) => (cpEntityIds.has(id) ? { kind: 'INSTITUTION', id } : dealerDeskPartyOf(id, cpDeskTickers)),
        { netCashLocal: cpResult.dealerNetCashLocal, feeLocal: cpResult.totalDealerRevenueLocal },
        feeDesksForRegion(ctx, regionId),
        // The paper's leg is the tranche's own wire (issuer → house at issue, W3) — no asset here.
        primaryTakes(cpResult, (issuerId) => {
          const iss = issuerById.get(issuerId);
          return iss ? { kind: 'COMPANY', ticker: iss.comp.ticker } : undefined;
        })
      );
    }
  });
}
