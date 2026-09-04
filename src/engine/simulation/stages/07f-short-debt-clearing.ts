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
 * cash plus operating inflow. Size is the gap: CP is not opportunistic funding, it is the bridge
 * a treasurer actually runs. §9.13-CREDIT row 4 made the book clear a PRICE PER PIECE OF PAPER:
 * every live programme and every deal brought this week is its own instrument, each buyer states
 * its reservation as a yield over the region's cleared front end at that paper's own tenor and
 * bids the price that yield implies, and what the book prints is deposited per tranche. CP ROLLS
 * weekly, and a roll the market will not fund at a level the treasurer will wear draws the bank
 * revolver instead, at a real penalty margin. That failure path is the actual mechanism of a
 * funding squeeze (the G2 hook), and it exists here from day one rather than being added after
 * the first crisis needs it.
 *
 * Runs after 07c (bond yields cleared; the NS refit here needs both) and before stage 08 (whose
 * interest arithmetic picks CP up off the ladder like any other tranche).
 */

import { riskAversionOf } from '../../../domain/preferences';
import { buildEntityIndex } from '../../ledger/entity-index';
import { bankCreditPartyOfTicker, bankSecuritiesParty, bankSecuritiesPartyOfTicker, companyParty, companyPartyOfTicker } from '../../../domain/party';
import { asInstrumentId, InstrumentId, asTicker } from '../../../domain/ids';

import { ensureV2 } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_CP, facilityBookOf, issuerIdOf, trancheRowOf, trancheScheduleOf, trancheIdOf } from '../../../engine2/tranches';
import { setClearedPrice, clearedPriceOf } from '../../../engine2/prices';
import { issuerSpreadAtOnCurve, IS_CP_ROW, RegionRates } from '../../credit-price';
import { reconcileHolderPrincipal } from './holder-paydown';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { GameState, RegionId, ItemizedHolding, DebtTranche, NewsItem, Company } from '../../../types';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { computeAnnualDefaultProbability, creditRecoveryRate, payHoldersAccruedInterest, moveCorporateAccrued, WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { isActiveCompany, isPubliclyListed, corporateTreasuryTargetLocal, accruedPerFace, banksOf } from '../../../domain/company';
import type { CreditRating } from '../../../domain/company';
import { priceFromYield, zeroRateAt } from '../../../domain/pricing';
import type { PaperTerms } from '../../../domain/pricing';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, positionsByInstrument, setTradableFloat } from './financial-clearing-engine';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityLocal } from './repo-clearing';
import { encumberedFaceByBond } from '../../../domain/repo';
import { MIN_CASH_BUFFER_RATIO, leverageHeadroomLocal, sovereignBookCapacityLocal, liquidityDrivenSovereignFloorLocal } from '../../macro/banking';
import { centralBankParticipant, applyCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { pay, pendingSettlementLocal, institutionSpendableLocal, PartyRef } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, primaryAssetOf, accruedOnFills, PrimaryTake, participantPartyOf, parHoldingRow, writeBackClearedFills } from './book-settlement';
import { clearedBookDelta, transferHolding } from '../../ledger/holdings-ledger';
import { wireCentralBankFills } from './central-bank-demand';
import { issueTranche, retireTranche, commitLadder } from '../../ledger/tranche-ledger';
import { buildDealerDeskParticipants, applyDealerDeskFills, deskTickersOf } from './dealer-desks';
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
import { commercialPaperTrancheId } from '../../../domain/instrument-keys';
import { governmentIssuer } from '../../../domain/entity-keys';
import { forEachSovereignPosition } from '../../sovereign-register';
import { bankParticipantId, treasuryParticipantId } from '../../../domain/participant-keys';
import type { EntityId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';

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
  // §3.13-BOOK (c-then-3b): `homeBankId` names the house bank in the ENTITY space.
  const entities07f = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const homeBankOf = (c: { homeBankId?: EntityId }) => (c.homeBankId ? entities07f.companyById.get(c.homeBankId) : undefined);
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

      const regionBanks = banksOf(ctx.updatedCompanies, regionId);
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
        const holdings = new Map<InstrumentId, number>();
        const demand = new Map<InstrumentId, ParticipantDemand>();
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
          + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
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
        participants.push({ id: bankParticipantId(bank.ticker), currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      // Institutions: the cash sleeve. Half the sleeve wants to be in paper, wanting a small
      // term premium over policy for giving up the overnight option.
      regionEntities.forEach((entity) => {
        const holdings = new Map<InstrumentId, number>();
        const demand = new Map<InstrumentId, ParticipantDemand>();
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
            const treasuryBidders = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms].filter(
        (c) => c.region === regionId && isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity
      );
      const treasuryByTicker = new Map<Ticker, typeof treasuryBidders[number]>();
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
          + pendingSettlementLocal(ctx, companyParty(comp)));
        const holdings = new Map<InstrumentId, number>();
        const demand = new Map<InstrumentId, ParticipantDemand>();
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
      const heldByBiddersLocal = positionsByInstrument(participants.map((p) => p.currentHoldingsByInstrumentId));
      setTradableFloat(instruments, heldByBiddersLocal);

      // G3a: the banks' bill desks — the same market makers, a different book.
      const deskParticipants = buildDealerDeskParticipants({
        ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
      });
      const deskTickers = deskTickersOf(deskParticipants);

      // OWN7, second half: the desks' own books join the float now that they exist. Every bidder
      // is a real holder, so what they hold between them is what is genuinely in play; everything
      // else on the register keeps its position.
      const deskHeldLocal = positionsByInstrument(deskParticipants.map((p) => p.currentHoldingsByInstrumentId));
      setTradableFloat(instruments, heldByBiddersLocal, deskHeldLocal);

      // PUB — and what NO book holds is the treasury's OFFERING, not a reservation. Stage 11
      // issues bills into the ladder every week; nothing ever bought them, and the treasury then
      // repaid a holder that was not there. A bill auction is exactly this: paper that exists,
      // offered at whatever the week's demand pays, and offered again next week if it does not
      // clear. The central bank's book on a no-order week is a real holding and is NOT on offer.
      // §1.19 — WHAT NOBODY HOLDS, ASKED OF THE ONE WALK. This subtracted `tradableFloatLocal`,
      // which answers a different question with a different quantity, and was wrong twice: the
      // float is what BIDDERS hold at the MARK, while `outstandingByBond` is the ladder's FACE —
      // and a bill is discount paper, so its mark is below par every week of its life and the
      // offering was overstated by the whole discount, systematically. Second, a holder that is
      // not a bidder counted as nobody: `regionEntities` is filtered by mandate weight, and the
      // household books are not in this book at all. The central-bank carve-out is kept exactly —
      // on a no-order week its book is a real holding and is not on offer.
      const heldFaceByBill = new Map<string, number>();
      forEachSovereignPosition(ctx.v2, state, regionId, (pos) => {
        if (!billIds.has(asInstrumentId(pos.bondId))) return;
        if (cbOrder && pos.holderClass === 'CENTRAL_BANK') return;
        heldFaceByBill.set(pos.bondId, (heldFaceByBill.get(pos.bondId) ?? 0) + pos.faceLocal);
      });
      activeBills.forEach((b) => {
        const inst = instruments.find((i) => i.id === b.key);
        if (!inst) return;
        inst.primaryOfferingLocal = Math.max(0,
          (outstandingByBond.get(b.key) ?? 0) - (heldFaceByBill.get(b.key) ?? 0));
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
      const rebateByParticipant = new Map<string, Map<InstrumentId, number>>();
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
            const m = rebateByParticipant.get(pid) ?? new Map<InstrumentId, number>();
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
      const rebateOf = (pid: string, instrumentId: InstrumentId): number =>
        rebateByParticipant.get(pid)?.get(instrumentId) ?? 0;

      if (cbOrder && reg.centralBankSheet) {
        // Asset side only — the reserves that paid for it were created. See central-bank-demand.
        // Item 13: the CB's primary slice books at cost like every other holder's (its fills are
        // adjusted by its rebate; it has no cash leg to adjust).
        const cbRawFills = result.newParticipantHoldings.get(CENTRAL_BANK_PARTICIPANT_ID) ?? new Map<InstrumentId, number>();
        const cbFills = new Map<InstrumentId, number>();
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
      // §9.13-EQUITY: and the print is DEPOSITED, as 07c's now is — a bill that cleared is worth
      // what it cleared at, and `register-marking` reads this store. Without it a holder's bills
      // sat at par for ever while its corporate paper marked, which is the same defect in the one
      // class that had already priced its way out of it.
      const billInstrumentById = new Map(instruments.map((i) => [i.id, i]));
      const billPoints = activeBills.map((b) => {
        const px = result.newStatById.get(b.key);
        const inst = billInstrumentById.get(b.key);
        // §3.21 — PLACED, not OFFERED; the same change as 07c. An undersubscribed bill auction
        // that placed nothing has no clearing level, and the bill keeps the price it had.
        const placedLocal = Math.max(0, result.primaryOutcomeById.get(b.key)?.marketTakeLocal ?? 0);
        const traded = (inst?.tradableFloatLocal ?? 0) > 0 || placedLocal > 0;
        if (px !== undefined && traded && px > 0 && isFinite(px)) setClearedPrice(ctx.v2, b.key, px);
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
        const fills = result.newParticipantHoldings.get(bankParticipantId(bank.ticker));
        if (!fills) return;
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        // Only the bills this auction actually priced are rewritten; one maturing this week is
        // left standing for stage 11 to redeem for cash.
        const byTenor: Record<string, number> = { ...(existingSheet.sovereignBondHoldingsByBond || {}) };
        let faceDeltaLocal = 0;
        // Step 13 (W2): the bank's bill book moves by wire against the house, bill by bill.
        const billsBefore = new Map<InstrumentId, { valueLocal: number }>(), billsAfter = new Map<InstrumentId, { valueLocal: number }>();
        activeBills.forEach((b) => {
          // Item 13: the primary slice books at cost — the rebate is the same instruction's
          // booking half (the cash half was adjusted on the participant's net above).
          const newLocal = (fills.get(b.key) ?? 0)
            - rebateOf(bankParticipantId(bank.ticker), b.key);
          faceDeltaLocal += newLocal - (byTenor[b.key] ?? 0);
          billsBefore.set(b.key, { valueLocal: byTenor[b.key] ?? 0 });
          billsAfter.set(b.key, { valueLocal: newLocal > 1 ? newLocal : 0 });
          if (newLocal > 1) byTenor[b.key] = newLocal; else delete byTenor[b.key];
        });
        clearedBookDelta(bankSecuritiesParty(bank), regionId, 'GOV_BOND', billsBefore, billsAfter, () => undefined, 'bill clearing fill');
        // The engine's cash leg (face plus the dealer fee); the fee part is P&L — an expense the
        // identity invariant would otherwise report as a missing leg. SETL6: the reserves leg
        // settles through the clearing house below, so the buyer and the seller move against
        // each other rather than each moving alone.
        const cashDeltaLocal = result.netCashDeltaByParticipantId.get(bankParticipantId(bank.ticker)) ?? -faceDeltaLocal;
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
        const tBefore = new Map<InstrumentId, { valueLocal: number }>(), tAfter = new Map<InstrumentId, { valueLocal: number }>();
        (comp.treasuryHoldings || []).forEach((h) => {
          if (!billIds.has(h.instrumentId)) return;
          tBefore.set(h.instrumentId, { valueLocal: (tBefore.get(h.instrumentId)?.valueLocal ?? 0) + (h.quantityOrNotionalLocal ?? 0) });
        });
        billRows.forEach((h) => tAfter.set(h.instrumentId, { valueLocal: (tAfter.get(h.instrumentId)?.valueLocal ?? 0) + (h.quantityOrNotionalLocal ?? 0) }));
        clearedBookDelta(companyPartyOfTicker(ticker), regionId, 'GOV_BOND', tBefore, tAfter, () => undefined, 'bill clearing fill');
        if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
        ctx.companyUpdates[ticker].treasuryHoldings = [...kept, ...billRows];
      });

      // SETL6: the book's whole cash side, through the clearing house — participants, the
      // desks' fees, and the dealer's own inventory leg.
      const billEntityIds = new Set(regionEntities.map((e) => e.id));
      settleClearedBook(
        ctx, regionId, currencyOf(regionId), BOOK,
        result.netCashDeltaByParticipantId,
        participantPartyOf({ regionId, entityIds: billEntityIds, deskTickers }),
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
          const govIssuer = governmentIssuer(regionId);
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

    // ---- Commercial paper: a real book (CP), ONE INSTRUMENT PER PIECE OF PAPER ----
    //
    // Why this used to be a formula and what it cost is written up once, in
    // domain/commercial-paper.ts. In short: CP arrived with the bills and its buyers did not
    // exist yet, so it was priced at `bill + expected loss + 15bp`, sized entirely by the issuer,
    // rationed only by a binary rating gate, and paid for by nobody. It cleared after that — but
    // as ONE YIELD PER ISSUER, which is the last of the three defects §3.13's credit rows remove:
    //
    //   - a YIELD IS NOT A PRICE. `financial-clearing-engine` values a fill at `unitValueLocal = 1`
    //     for anything that is not PRICE_LIKE, so every piece of commercial paper in the model
    //     changed hands at FACE whatever the auction said it was worth;
    //   - an ISSUER IS NOT A PIECE OF PAPER. A programme rolled last week with nine weeks to run
    //     and one struck today are two instruments; pricing the borrower forced a SPLIT to invent
    //     the mapping back onto the register's tranche rows, which is what `O7` and `O8` count —
    //     and this was the last book holding it up, so the split is deleted with this change;
    //   - and ONE YIELD PER BORROWER IS NO TERM STRUCTURE, even across thirteen weeks: a roll with
    //     four weeks left and a fresh thirteen-week issue had to clear at the same level.
    //
    // Nothing about anyone's REASON changes. A cash buyer's reservation genuinely is a YIELD — its
    // alternative is the bill its money would otherwise sit in — so it still computes one, and then
    // states it as the PRICE that yield implies on THIS paper's own remaining life. That is the
    // sovereign's own move (§9.13-SOV row 4, `pricing/bond.ts`), applied to the corporate front end.
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
      const cpEntities = ctx.updatedInstitutionalEntities.filter((e) => !e.isDefaulted);
      const cpBanks = banksOf(ctx.updatedCompanies, regionId);

      // ---- 1. MATURITIES, PER PIECE OF PAPER. The issuer repays the holders of the tranche that
      // came due, at its own face — not every holder of that borrower scaled by a surviving ratio,
      // which is what pricing the ISSUER forced and what migrated a claim on retired paper onto
      // whatever else the borrower had outstanding (§3.13's `O7`).
      const TSd = v2Mirror.tranches;
      const maturedFaceById = new Map<InstrumentId, number>();
      cpIssuers.forEach((iss) => {
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if (!(TSd.flags[r] & TR_CP) || TSd.maturityWeek[r] > ctx.nextWeek) continue;
          maturedFaceById.set(trancheIdOf(v2Mirror, r), TSd.principalLocal[r]);
        }
      });

      // What each institution holds, by the paper it names. A row written before this book cleared
      // per tranche may still name its ISSUER; it resolves through `issuerIdOf` like any other and
      // is repaid below as a claim on paper this session does not price.
      const heldByTrancheByEntity = new Map<EntityId, Map<InstrumentId, number>>();
      cpEntities.forEach((entity) => {
        const byTranche = new Map<InstrumentId, number>();
        store.scan(entity.id, 'COMMERCIAL_PAPER', (h) => {
          if (!cpIssuerIds.has(issuerIdOf(v2Mirror, h.instrumentId))) return false;
          // A book trades FACE, and `units` IS the face (`domain/banking.ts`).
          const faceLocal = h.units;
          byTranche.set(h.instrumentId, (byTranche.get(h.instrumentId) ?? 0) + faceLocal);
          return true;
        });
        heldByTrancheByEntity.set(entity.id, byTranche);
      });

      // A DESK IS A HOLDER, and its paper matures like anyone else's. Scaling only the
      // institutions left the desks carrying a claim on CP that had already been repaid, and the
      // ledger check caught it immediately: holders at 117% of the EUR stock by week ten.
      const deskCpRows = new Map<Ticker, { instrumentId: InstrumentId; inventoryLocal: number; units?: number }[]>();
      cpBanks.forEach((bank) => {
        const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (sheet?.dealerDeskInventory?.[CP_BOOK]) deskCpRows.set(bank.ticker, sheet.dealerDeskInventory[CP_BOOK]);
      });

      const issuerPartyOfInstrument = (instrumentId: InstrumentId): PartyRef | undefined => {
        const iss = issuerById.get(issuerIdOf(v2Mirror, instrumentId));
        return iss ? companyParty(iss.comp) : undefined;
      };

      maturedFaceById.forEach((_face, instrumentId) => {
        const payer = issuerPartyOfInstrument(instrumentId);
        if (!payer) return;
        deskCpRows.forEach((rows, ticker) => {
          // A MATURITY PAYS FACE, not the mark. The desk's row carries both — `units` is the face
          // it holds and `inventoryLocal` is that face at the last price the book printed — and now
          // that CP prints a price other than par the two are different numbers. Paying the mark
          // would pocket the pull-to-par on the issuer's behalf.
          let repaidLocal = 0;
          rows.forEach((r) => {
            if (r.instrumentId !== instrumentId) return;
            repaidLocal += r.units ?? r.inventoryLocal;
            r.inventoryLocal = 0;
            if (r.units !== undefined) r.units = 0;
          });
          if (repaidLocal > 0) {
            pay(ctx, {
              payer,
              payee: bankSecuritiesPartyOfTicker(ticker),
              amount: repaidLocal,
              currency: currencyOf(regionId),
              reason: 'commercial paper redeemed',
            });
            // Step 13 (W2): the matured paper leaves the desk by wire, to the house (the ladder's
            // retirement wire meets it there).
            transferHolding(ctx.v2, bankSecuritiesPartyOfTicker(ticker), { kind: 'CLEARING_HOUSE', region: regionId },
              { instrumentType: 'COMMERCIAL_PAPER', instrumentId, issuerRegion: regionId, valueLocal: repaidLocal }, 'commercial paper redeemed: desk paper matured');
          }
        });
        heldByTrancheByEntity.forEach((byTranche, entityId) => {
          const repaidLocal = byTranche.get(instrumentId) ?? 0;
          if (!(repaidLocal > 0)) return;
          byTranche.set(instrumentId, 0);
          pay(ctx, {
            payer,
            payee: { kind: 'INSTITUTION', id: entityId },
            amount: repaidLocal,
            currency: currencyOf(regionId),
            reason: 'commercial paper redeemed',
          });
        });
      });

      // §5-WIRES W3: matured paper hands its face back to the issuer by wire, then leaves the chain.
      cpIssuers.forEach((iss) => {
        const TSr = v2Mirror.tranches;
        const cpIssuer = { id: iss.comp.id, ticker: iss.comp.ticker, region: regionId };
        const kept: number[] = [];
        let retiredAny = false;
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if ((TSr.flags[r] & TR_CP) && TSr.maturityWeek[r] <= ctx.nextWeek) {
            // STEP 1: THE PAPER'S INTEREST FALLS DUE WHERE THE PAPER IS REDEEMED. Commercial
            // paper is retired HERE, before stage 08 runs, so the register's accrual loop never
            // saw a CP tranche in its own maturity week — and `trancheWeekAccrual` makes CP due
            // ONLY then. The result was that CP interest accrued to holders every week from
            // issue and was never once paid. Marking the payout here settles it in the same
            // week: `applyHolderInterestAccruals` (stage 08) pays every holder of record
            // exactly what it accrued, from the issuer, and clears the balance.
            payHoldersAccruedInterest(ctx, trancheIdOf(v2Mirror, r), 'COMMERCIAL_PAPER');
            if (TSr.principalLocal[r] > 0.01) retireTranche(v2Mirror, cpIssuer, r, TSr.principalLocal[r], 'commercial paper matured');
            retiredAny = true;
          } else kept.push(r);
        }
        if (retiredAny) commitLadder(v2Mirror, cpIssuer, kept);
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

      const cpHoldingRow = parHoldingRow('COMMERCIAL_PAPER', regionId);

      // ---- 2. THE BOOK. Every live piece of this region's commercial paper, plus the deals
      // brought this week — each with its own remaining life and its own price.
      type CpPaper = {
        id: InstrumentId;
        issuerId: EntityId;
        /** Face outstanding — 0 for a deal that has not priced yet. */
        faceLocal: number;
        /** This week's offering ON THIS PAPER — non-zero only for the primary. */
        offeringLocal: number;
        terms: PaperTerms;
        tenorYears: number;
        annualPd: number;
        creditRating: CreditRating;
        isPrimary: boolean;
      };
      const papers: CpPaper[] = [];
      const accruedPerFaceById = new Map<InstrumentId, number>();
      const TSb = v2Mirror.tranches;
      cpIssuers.forEach((iss) => {
        for (const r of ladderRowsOf(v2Mirror, iss.comp.id)) {
          if (!(TSb.flags[r] & TR_CP) || !(TSb.principalLocal[r] > 0.01)) continue;
          const weeksToMaturity = TSb.maturityWeek[r] - ctx.nextWeek;
          // Paper that is due redeems at its face; it does not trade for a price.
          if (!(weeksToMaturity > 0)) continue;
          const id = trancheIdOf(v2Mirror, r);
          const couponRate = Number.isNaN(TSb.couponRate[r]) ? 0 : TSb.couponRate[r];
          // §3.13b / `bond.md` N9.b — WHAT ONE UNIT OF FACE HAS ACCRUED. This auction clears a
          // CLEAN price, so the interest that has run since the programme was struck is paid by
          // the buyer to the seller on top of it, and re-keys on the accrual ledger with the
          // paper. Read at the CURRENT week: `applyHolderInterestAccruals` runs in stage 08,
          // after this book, so the ledger these balances move on stands at last week's accrual.
          accruedPerFaceById.set(id, accruedPerFace({
            originationWeek: TSb.originationWeek[r],
            paymentAnchorWeek: Number.isNaN(TSb.paymentAnchorWeek[r]) ? undefined : TSb.paymentAnchorWeek[r],
            paymentsPerYear: Number.isNaN(TSb.paymentsPerYear[r]) ? undefined : TSb.paymentsPerYear[r],
            isCommercialPaper: true,
            rateType: 'FIXED',
          }, couponRate, state.currentWeek));
          papers.push({
            id, issuerId: iss.comp.id, faceLocal: TSb.principalLocal[r], offeringLocal: 0,
            terms: { annualCouponRate: couponRate, periodWeeks: trancheScheduleOf(TSb, r).periodWeeks, weeksToMaturity },
            tenorYears: weeksToMaturity / 52,
            annualPd: iss.annualPd, creditRating: iss.comp.creditRating, isPrimary: false,
          });
        }
      });
      // A DEAL IS ITS OWN PIECE OF PAPER, and the book prices it beside the outstanding stock. It
      // is STRUCK AT PAR — its rate fixed at launch off the region's own cleared front end plus
      // what this borrower's printed paper says it pays there — and the market decides what it
      // will pay for it. The concession then shows up where it belongs, as a price below par, and
      // the issuer receives price × face instead of par whatever it cleared.
      const cpRates: RegionRates = { zeroRates: reg.zeroRates, policyRate: reg.policyRate };
      const cpTenorYears = CP_TENOR_WEEKS / 52;
      const primaryIdByIssuerId = new Map<string, InstrumentId>();
      const primaryTermsById = new Map<string, { couponRate: number }>();
      cpIssuers.forEach((iss) => {
        if (!(iss.wantedLocal > 0)) return;
        const id = commercialPaperTrancheId(iss.comp.ticker, ctx.nextWeek);
        // A borrower with printed paper launches on its own curve; one with none launches on the
        // loss its buyers price, which is exactly what their reservation is made of.
        const talkBps = issuerSpreadAtOnCurve(v2Mirror, cpRates, iss.comp.id, ctx.nextWeek, cpTenorYears, IS_CP_ROW)?.spreadBps
          ?? issuerSpreadAtOnCurve(v2Mirror, cpRates, iss.comp.id, ctx.nextWeek, cpTenorYears)?.spreadBps
          ?? iss.annualPd * (1 - cpRecoveryRate) * 10000;
        const couponRate = zeroRateAt(reg.zeroRates, cpTenorYears) + talkBps / 10000;
        primaryIdByIssuerId.set(iss.comp.id, id);
        primaryTermsById.set(id, { couponRate });
        papers.push({
          id, issuerId: iss.comp.id, faceLocal: 0, offeringLocal: iss.wantedLocal,
          terms: { annualCouponRate: couponRate, periodWeeks: CP_TENOR_WEEKS, weeksToMaturity: CP_TENOR_WEEKS },
          tenorYears: cpTenorYears,
          annualPd: iss.annualPd, creditRating: iss.comp.creditRating, isPrimary: true,
        });
      });

      // A reservation stated as a YIELD — which is what a cash buyer's reservation IS, because its
      // alternative is the bill its money would otherwise sit in — restated as the price it implies
      // on THIS paper's own remaining life.
      const priceAtYieldBps = (p: CpPaper, yieldBps: number): number => priceFromYield(p.terms, yieldBps / 10000);
      /** What this money earns instead, at the paper's own tenor: the curve standing at WEEK START,
       *  which is what every other session in this model prices against (`07b`, `07c`) and what a
       *  real session prices against. `sovereign-curve.ts` republishes it after this stage from the
       *  bill points the auction above deposited — a session cannot price off its own print. */
      const alternativeYieldBpsOf = (p: CpPaper): number => zeroRateAt(reg.zeroRates, p.tenorYears) * 10000;
      const reservationYieldBpsOf = (p: CpPaper): number => cpReservationYieldBps({
        alternativeYieldBps: alternativeYieldBpsOf(p),
        annualDefaultProbability: p.annualPd,
        recoveryRate: cpRecoveryRate,
      });
      /**
       * Where the paper stands before this session: what it last cleared at, else the price its own
       * buyers' reservation implies — which for a programme nobody has printed is the honest
       * opening, and for the primary is the par it is struck at.
       */
      const openingPrice = papers.map((p) => {
        const stored = p.isPrimary ? undefined : clearedPriceOf(v2Mirror, p.id);
        if (stored !== undefined && stored > 0) return stored;
        const px = priceAtYieldBps(p, reservationYieldBpsOf(p));
        return px > 0 && isFinite(px) ? px : 1;
      });

      const cpInstruments: ClearingInstrument[] = papers.map((p, pi) => ({
        id: p.id,
        outstandingLocal: p.faceLocal,
        // OWN7: what the HOLDERS hold, filled in below — the institutions first, then the desks,
        // because a desk is sized against a LIVE float and a float of zero makes
        // `buildDealerDeskParticipants` hand back no desk at all.
        tradableFloatLocal: 0,
        currentStat: openingPrice[pi],      // price per unit of face
        statKind: 'PRICE_LIKE',
        durationYears: p.tenorYears,
        primaryOfferingLocal: p.offeringLocal > 0 ? p.offeringLocal : undefined,
        // THE TREASURER'S WALK-AWAY IS ITS COMMITTED LINE, as the PRICE that line's cost implies.
        // Nobody sells paper for less than the revolver beside it would raise, so below this the
        // deal is pulled and the line is drawn — which is the funding squeeze the old rating gate
        // asserted, now priced.
        primaryWithdrawStat: p.isPrimary ? priceAtYieldBps(p, revolverWalkAwayBps) : undefined,
      }));

      // §7.259 — settle the borrowers' retired principal ON THE HOLDERS before this book clears
      // (see holder-paydown.ts). Keyed by the PAPER, so a claim on a programme that has run off
      // is repaid by its own borrower rather than re-keyed onto that borrower's live paper.
      const cpFaceById = new Map(papers.map((p) => [p.id, p.faceLocal]));
      const outstandingByInstrumentId = new Map(papers.filter((p) => !p.isPrimary).map((p) => [p.id, p.faceLocal]));
      const issuerOfInstrument = new Map<string, Company>();
      papers.forEach((p) => issuerOfInstrument.set(p.id, issuerById.get(p.issuerId)!.comp));
      heldByTrancheByEntity.forEach((byTranche) => byTranche.forEach((_face, instrumentId) => {
        if (outstandingByInstrumentId.has(instrumentId)) return;
        outstandingByInstrumentId.set(instrumentId, 0);
        const iss = issuerById.get(issuerIdOf(v2Mirror, instrumentId));
        if (iss) issuerOfInstrument.set(instrumentId, iss.comp);
      }));
      reconcileHolderPrincipal({
        ctx, regionId,
        outstandingByInstrumentId,
        issuerOfInstrument,
        holdingsByEntity: heldByTrancheByEntity,
        banks: cpBanks,
        deskBook: CP_BOOK, instrumentType: 'COMMERCIAL_PAPER',
        reason: 'commercial paper principal paydown to holders',
      });

      // Every programme in this region has run off and nobody is bringing a deal: the maturities
      // and the paydown above are the whole of its CP week. What a holder still claims on paper no
      // ladder carries stays claimed and is written back — a stage may only rewrite what it
      // CLEARED, and dropping a claimed row here would delete a position with no cash leg (§7.34).
      if (papers.length === 0) {
        heldByTrancheByEntity.forEach((byTranche, entityId) => {
          const rows: ItemizedHolding[] = [];
          byTranche.forEach((faceLocal, instrumentId) => {
            if (faceLocal > 1) rows.push(cpHoldingRow(instrumentId, faceLocal));
          });
          store.append(entityId, rows);
        });
        return;
      }

      const heldByInstitutionsLocal = positionsByInstrument(heldByTrancheByEntity.values(), (id) => cpFaceById.has(id));
      setTradableFloat(cpInstruments, heldByInstitutionsLocal);

      // ---- 3. THE BUYERS. The money funds and the cash sleeves that already run through the
      // bill and repo books, plus the banks' own desks. Credit policy is a SIZE, never a veto
      // (domain/commercial-paper.ts) — and the single-issuer limit is a limit on the ISSUER, so
      // it is divided across that issuer's own papers rather than posted whole against each.
      const papersByIssuerId = new Map<string, number[]>();
      papers.forEach((p, pi) => {
        const list = papersByIssuerId.get(p.issuerId);
        if (list) list.push(pi); else papersByIssuerId.set(p.issuerId, [pi]);
      });
      const issuerShareOfPaper = new Float64Array(papers.length);
      papersByIssuerId.forEach((list) => {
        let sizeLocal = 0;
        list.forEach((pi) => { sizeLocal += papers[pi].faceLocal + papers[pi].offeringLocal; });
        list.forEach((pi) => {
          issuerShareOfPaper[pi] = sizeLocal > 0
            ? (papers[pi].faceLocal + papers[pi].offeringLocal) / sizeLocal
            : 1 / list.length;
        });
      });
      const cpParticipants: ClearingParticipant[] = [];
      cpEntities.forEach((entity) => {
        const sleeveLocal = institutionTotalAssetsLocal(ctx, entity) * entity.assetAllocationTarget.cashPct * CP_SHARE_OF_TERM_SLEEVE;
        const holdings = heldByTrancheByEntity.get(entity.id) ?? new Map<InstrumentId, number>();
        if (!(sleeveLocal > 0) && holdings.size === 0) return;
        const cashLocal = institutionSpendableLocal(ctx, entity) * CP_SHARE_OF_TERM_SLEEVE;
        const demand = new Map<InstrumentId, ParticipantDemand>();
        // §7.340 — ONE sleeve, many bids: the per-issuer limit is a CONCENTRATION rule, not a
        // budget, and with fifty names in the book fifty bids at 5% each offered the same
        // dollar two and a half times over. The engine has no cross-instrument budget (each
        // bid is affordable on its own), so the cash is divided across the bids it is put
        // behind: no bid can take more than its share, and the sum can never exceed the sleeve.
        // Measured: a private-equity fund closed a week overdrawn by 2.9M on a 960M balance
        // — bills at their cap, then CP at 2× what was left.
        const bidShare = Math.min(CP_SINGLE_ISSUER_LIMIT, 1 / Math.max(1, papers.length));
        papers.forEach((p, pi) => {
          const px = Math.max(1e-9, openingPrice[pi]);
          const reservationBps = reservationYieldBpsOf(p);
          const reservationPrice = priceAtYieldBps(p, reservationBps);
          // A willingness-to-move stated in yield, restated as the price move it implies on THIS
          // paper at its own level. The remaining life does the conversion, which is what
          // duration IS — so a four-week roll moves a fraction of what a fresh issue moves.
          const rangePrice = Math.max(1e-9, Math.abs(reservationPrice - priceAtYieldBps(p, reservationBps + CP_FULL_SIZE_YIELD_RANGE_BPS)));
          const lineLocal = sleeveLocal * CP_SINGLE_ISSUER_LIMIT * cpCreditPolicyShare(p.creditRating) * issuerShareOfPaper[pi];
          demand.set(p.id, {
            // The bounds are posted in FACE, which is what this book allocates; the money they
            // stand for buys that face at the price the book opened at.
            reservationStat: reservationPrice,
            maxHoldingLocal: lineLocal / px,
            fullSizeStatRange: rangePrice,
            maxNetPurchaseLocal: (cashLocal * bidShare) / px,
          });
        });
        cpParticipants.push({ id: entity.id, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      const cpDeskParticipants = buildDealerDeskParticipants({
        ctx, banks: cpBanks, book: CP_BOOK, instruments: cpInstruments,
        spreadBps: DESK_SPREAD_BPS_BY_BOOK[CP_BOOK],
        unitPriceOf: (i) => openingPrice[i],
      });
      const cpDeskTickers = deskTickersOf(cpDeskParticipants);

      // OWN7: and now the desks' own books join the float, which is complete once they exist.
      const cpDeskHeldLocal = positionsByInstrument(cpDeskParticipants.map((p) => p.currentHoldingsByInstrumentId));
      setTradableFloat(cpInstruments, heldByInstitutionsLocal, cpDeskHeldLocal);

      const cpAllParticipants = [...cpParticipants, ...cpDeskParticipants];
      const cpResult = clearFinancialAsset(cpInstruments, cpAllParticipants, new Map(), {
        dealerSpreadBps: DESK_SPREAD_BPS_BY_BOOK[CP_BOOK],
        // OWN7: the float here is a stock these participants already hold, so an unsold
        // position stays with its holder rather than falling to a dealer nobody names.
        unsoldStaysWithHolder: true,
      });
      ctx.damperBoundInstrumentIds.push(...cpResult.damperBoundInstrumentIds.map((id) => `commercial paper:${id}`));
      if (!cpResult.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} commercial paper`);

      /**
       * THE PRINT, DEPOSITED — but only where there was something to trade. A book with no float
       * and no offering has no clearing level: the solve's target is zero, nothing crosses it, and
       * what comes back is the numerical bracket (§3.21). Such a piece of paper KEEPS the price it
       * had, which is the honest answer and the one §3.21 asks every adapter to give.
       */
      const cpClearedPriceById = new Map<string, number>();
      papers.forEach((p, pi) => {
        const outcome = cpResult.primaryOutcomeById.get(p.id);
        const placedLocal = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeLocal) : 0;
        const tradedSomething = cpInstruments[pi].tradableFloatLocal > 0 || placedLocal > 0;
        const px = cpResult.newStatByIndex[pi];
        const printed = tradedSomething && px > 0 && isFinite(px);
        cpClearedPriceById.set(p.id, printed ? px : openingPrice[pi]);
        if (printed) setClearedPrice(v2Mirror, p.id, px);
      });

      // ---- 4. APPLY. The rows name the TRANCHE the auction priced — there is nothing left to
      // split: the issuer-level split file is deleted with this book, its last caller.
      const cpPiById = new Map(cpAllParticipants.map((pp, pi) => [pp.id, pi]));
      writeBackClearedFills({
        store, entities: cpEntities, piById: cpPiById, claimedByEntity: heldByTrancheByEntity,
        result: cpResult, instrumentIdOfColumn: (bi) => papers[bi].id,
        priced: cpFaceById, row: cpHoldingRow,
      });

      cpIssuers.forEach((iss) => {
        const primaryId = primaryIdByIssuerId.get(iss.comp.id);
        const outcome = primaryId ? cpResult.primaryOutcomeById.get(primaryId) : undefined;
        const placedLocal = outcome && !outcome.withdrawn ? Math.max(0, outcome.marketTakeLocal) : 0;
        // No floor on the level (rule 6): the paper exists at whatever the auction printed.
        if (primaryId && placedLocal > 1) {
          issueTranche(v2Mirror, { id: iss.comp.id, ticker: iss.comp.ticker, region: regionId }, {
            id: primaryId,
            principalLocal: placedLocal,
            rateType: 'FIXED',
            // The paper the market priced is the paper that gets issued: the rate it was STRUCK
            // at, not the price it cleared at. A deal that conceded raises less cash for the same
            // face, which is what a concession is — it does not silently re-cut its own coupon.
            couponRate: Number(primaryTermsById.get(primaryId)!.couponRate.toFixed(4)),
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
            facilityBankTicker: homeBankOf(iss.comp)?.ticker, // still the TICKER space — its own commit
          } as DebtTranche, 'revolver draw: commercial paper roll failed');
          pay(ctx, {
            payer: bankCreditPartyOfTicker(homeBankOf(iss.comp)?.ticker ?? asTicker('')),
            payee: companyParty(iss.comp),
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
      applyDealerDeskFills({
        piById: cpPiById, ctx, banks: cpBanks, book: CP_BOOK, instruments: cpInstruments, result: cpResult,
        unitPriceOf: (id) => cpClearedPriceById.get(id) ?? 1,
      });

      // SETL6: the whole cash side — buyers to the clearing house, the desks' fee, and the
      // clearing house to each ISSUER for the paper its own programme actually placed.
      const cpEntityIds = new Set(cpEntities.map((e) => e.id));
      const cpPartyOfParticipant = participantPartyOf({ regionId, entityIds: cpEntityIds, deskTickers: cpDeskTickers });
      // §3.13b: the accrued travels with the face — the ledger half here, the cash half below,
      // through the same clearing house as the paper. CP could not do this while the auction named
      // a COMPANY and the ledger names a tranche; row 4 made every fill name its paper.
      const cpAccruedLeg = accruedOnFills(
        cpAllParticipants, cpResult.newParticipantHoldings,
        (id) => accruedPerFaceById.get(id) ?? 0,
        (instrumentId, participantId, usd) => moveCorporateAccrued(
          ctx.holderAccruedInterestLocal, 'COMMERCIAL_PAPER', instrumentId, participantId, usd)
      );
      settleClearedBook(
        ctx, regionId, currencyOf(regionId), CP_BOOK,
        cpResult.netCashDeltaByParticipantId,
        cpPartyOfParticipant,
        { netCashLocal: cpResult.dealerNetCashLocal, feeLocal: cpResult.totalDealerRevenueLocal },
        feeDesksForRegion(ctx, regionId),
        // The CCP pays each issuer for the paper its deal actually placed, AT THE PRICE it placed
        // at — a deal that conceded raises less, which is what a concession is.
        // The paper's leg is the tranche's own wire (issuer → house at issue, W3) — no asset here.
        primaryTakes(cpResult, issuerPartyOfInstrument, (takeLocal, clearedPrice) => takeLocal * clearedPrice),
        { ...cpAccruedLeg, issuerOf: issuerPartyOfInstrument }
      );
    }
  });
}
