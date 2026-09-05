/**
 * Stage 7c: Sovereign Bond Real Clearing
 *
 * Foundational correction (Wall Street): a government bond's yield must be the actual result of
 * real supply and demand, exactly like corporate bonds — never a macro formula. This is the
 * sovereign-bond adapter over the generalized clearing engine (financial-clearing-engine.ts).
 *
 * Instruments are the region's own real, outstanding bonds, one clearing instrument each, at the
 * points it's actually issued at (2Y/5Y/10Y/30Y — see 11-fiscal-and-sovereign-debt.ts's issuance
 * calendar). Real participants:
 *   - Each named bank, with its own real sovereignBondHoldingsByBond and a real bottom-up target
 *     (sovBondOwnership.bankShare * the real outstanding stock, distributed across named banks
 *     by relative deposit size — never each bank independently computing depositsLocal * a ratio,
 *     which has no structural relationship to how much sovereign debt actually exists), tilted
 *     toward shorter, more liquid tenors than a typical bond investor (banks hold government
 *     bonds substantially as high-quality liquid assets).
 *   - Named institutional entities, with a real bottom-up target
 *     (sovBondOwnership.institutionalShare * the real outstanding stock, distributed by
 *     govBondPct — a relative weight, never an independent number — exactly the same pattern as
 *     corporate bonds), tilted by value (yield versus a real, curve-shaped fair-value estimate),
 *     momentum, and duration/maturity fit against each entity's own real liability profile.
 * Foreign and central-bank (QE) holdings stay passive/residual this slice, same scoping as
 * corporate bonds' slice 1.
 *
 * Banks also play the dealer role (their desks' register rows) exactly as they do for
 * corporate bonds — real primary-dealer market-making, distinct from their own real portfolio
 * holdings above.
 *
 * §3.13-SOV row 5 — THIS STAGE DOES NOT OWN THE CURVE. It clears bonds against the curve standing
 * at week start, which is what a real session prices against, and deposits each bond's observed
 * (tenor, yield) on `ctx.sovereignCurvePoints`. `sovereign-curve.ts` fits ONCE through those and
 * the bill session's, and publishes every field from that one fit. It used to fit here and write
 * all five `zeroRates`, which 07f then partly overwrote from a second, differently-sourced fit.
 *
 * Macro conditions reach the curve exclusively through the participants' own views below —
 * `macro/evolution.ts` used to recompute beta0/beta1/beta2 from formulas every week and overwrite
 * whatever cleared, and that write is gone: the administered policy rate reaches it via banks'
 * real front-end arbitrage against central-bank reserves, and inflation expectations via every
 * holder's real yield and how much duration it is being paid for.
 *
 * Must run after stage 2b (so banks' own balance sheets already reflect this week) and before
 * stage 8, 11, and 12 (all of which read yieldCurveParams/zeroRates as already-real values).
 */

import { bankReservesOf, bankDepositLines, householdDepositsAt } from '../../ledger/accounts';
import { bankSecuritiesParty, bankPartyOf } from '../../../domain/party';

import { GameState, RegionId, ItemizedHolding } from '../../../types';
import { SOV_BILL_MAX_TENOR_YEARS } from './shared-helpers';
import { priceFromYield, yieldFromPrice, zeroRateAt, PaperTerms, COUPON_PERIOD_WEEKS } from '../../../domain/pricing';
import { setClearedPrice, clearedPriceOf } from '../../../engine2/prices';
import { retireTranche, commitLadder } from '../../ledger/tranche-ledger';
import { materializeGovLadder, ladderRowsOf, trancheRowOf } from '../../../engine2/tranches';
import { mandateWeightForIssuer, mandateAllowsDuration } from '../../../domain/cross-border';
import { institutionProfile } from '../../../domain/institution-profiles';
import { hedgedReservationAdjustmentBps } from '../../../domain/derivatives/classes/fx-forward';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { stagePurchaseBudgetLocal } from './institutional-balance-sheet';
import { pendingSettlementLocal, institutionUnsettledLessCollateralLocal } from './settlement';
import { settleClearedBook, feeDesksForRegion, primaryTakes, primaryAssetOf, accruedOnFills, participantPartyOf, bankIdOfTickerFor } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, deskTickersOf } from './dealer-desks';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand, takePrint } from './financial-clearing-engine';
import { positionKey } from './securities-lending';
import { maxOverweightMultipleOf } from './asset-allocation';

import { centralBankParticipant, bookCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { transferHolding } from '../../ledger/holdings-ledger';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityLocal } from './repo-clearing';
import { accruedPerFace, banksOf } from '../../../domain/company';
import { sovereignCouponByBond, recordPrimaryOffering } from '../../../domain/government';
import { moveSovereignAccrued } from './sovereign-calendar';
import { defect } from '../../../domain/defect';

import { MIN_CASH_BUFFER_RATIO, leverageHeadroomLocal, sovereignBookCapacityLocal, liquidityDrivenSovereignFloorLocal } from '../../macro/banking';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { institutionTotalAssetsLocal } from './institutional-balance-sheet';
import { facilityBookOf } from '../../../engine2/tranches';
import { asInstrumentId, type InstrumentId } from '../../../domain/ids';
import { governmentIssuer } from '../../../domain/entity-keys';
import { lienFaceByBond, sovereignHeldByBond, centralBankPositions, bankSovereignFaceByBond, bankSovereignBookLocal, sovereignRowsOf } from '../../sovereign-register';
import { deskGrossLocal } from '../../desk-register';

const SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS = 120;
const DURATION_PREMIUM_BPS_PER_YEAR = 4;
const INSTITUTIONAL_REAL_RETURN_BPS = 150;
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'sovereign bond';
const BANK_PREFERRED_TENOR_YEARS = 3; // a bank's HQLA book skews shorter/more liquid than a typical bond investor
// The liability-driven core share is the kind registry's `sovereignCoreShare` row
// (domain/institution-profiles.ts) — one owner per fact about a kind (rule 15).

const INSTITUTIONAL_PREFERRED_TENOR_YEARS = 12; // insurers/pension funds match long-dated liabilities

/** Extra yield a holder wants for committing duration away from its preferred maturity. */
function durationPremiumBps(tenorYears: number, preferredTenorYears: number): number {
  return Math.abs(tenorYears - preferredTenorYears) * DURATION_PREMIUM_BPS_PER_YEAR;
}

/**
 * What an institution needs a government bond to yield: the inflation it expects to lose to,
 * plus a real return, plus compensation for duration. No credit term — that is the point of a
 * government bond.
 */
/**
 * The inflation a holder of THIS tenor actually prices against: the average expected over the
 * bond's life, not this week's year-over-year print.
 *
 * This is the term structure of inflation expectations, and it is the single most important
 * feature of a credible inflation-targeting regime: a spike in current inflation moves a 30-year
 * yield far less than one-for-one, because holders expect the central bank to bring it back.
 * Modelled the standard way — the deviation from target decays with a mean-reversion time
 * constant, and the bond prices the AVERAGE of that decay path over its own tenor:
 *
 *     avg(T) = target + (current - target) * (1 - e^(-T/tau)) / (T/tau)
 *
 * Short tenors get nearly the current expectation; long tenors converge on the target.
 *
 * Why this had to exist: the reservation yield used the raw current expectation at every tenor,
 * so an inflation print of 16% (itself a separate open defect — see the plan's G1b) demanded a
 * 17.5% yield on a 10-year bond paying 3.2%. Demand went to exactly zero and institutions
 * liquidated their entire sovereign book — measured, 284B to 1B in twenty weeks (§7.26). No real
 * long-bond holder reprices like that, because no real holder believes a spike is permanent.
 */
const INFLATION_MEAN_REVERSION_YEARS = 3;

function expectedInflationOverTenor(
  reg: { expectedInflation: number; targetInflation: number },
  tenorYears: number
): number {
  const target = reg.targetInflation ?? 0.02;
  const gap = reg.expectedInflation - target;
  const x = Math.max(0.01, tenorYears) / INFLATION_MEAN_REVERSION_YEARS;
  const averagingFactor = (1 - Math.exp(-x)) / x;
  return target + gap * averagingFactor;
}

function computeSovereignReservationYieldBps(
  reg: { expectedInflation: number; targetInflation: number; policyRate: number },
  tenorYears: number,
  preferredTenorYears: number
): number {
  return expectedInflationOverTenor(reg, tenorYears) * 10000
    + INSTITUTIONAL_REAL_RETURN_BPS
    + durationPremiumBps(tenorYears, preferredTenorYears);
}

/**
 * Every holder's view of what a bond is really paying: its nominal yield less the inflation the
 * region actually expects, weighted by how much of that holder's money the tenor commits. Shared
 * by banks and institutions because it is not a mandate preference — it is arithmetic that
 * applies to anyone holding the paper.
 */

export function runSovereignBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  // §3.13-BOOK (c-then-3b): the participant→party crossing, once per stage.
  const bankIdOfTicker = bankIdOfTickerFor(ctx);
  const regionIds = REGION_IDS;

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    // §3.13-SOV row 2: the ladder comes from the ONE store.
    const liveTranches = materializeGovLadder(ctx.v2, regionId);
    if (liveTranches.length === 0) return;

    // §3.13-SOV row 3 — THE AUCTION PRICES BONDS. THERE IS NO BUCKET.
    //
    // This book used to clear four TENOR BUCKETS per region — t2/t5/t10/t30 — and every rung was
    // snapped to the nearest one. A group has no issue date, no coupon of its own and no
    // maturity: its coupon was a face-weighted average and its "tenor" was the label on the
    // group, not any bond's remaining life. So the model could not be asked who held a given
    // government bond, `o3` had to carve out GOV_BOND from "every row names a live instrument",
    // and this file's own comment recorded the consequence — "two id spaces for one instrument".
    //
    // The instruments are the live rungs. Each carries its own coupon and its own REMAINING life,
    // which is what a buyer actually prices; a ten-year bond issued six years ago is a four-year
    // bond and is now priced as one.
    const bonds = liveTranches
      // Bills (below 2Y at issue) clear in 07f; folding them in here would count the same paper
      // in two markets.
      .filter((t) => t.tenorAtIssuanceYears >= SOV_BILL_MAX_TENOR_YEARS && t.principalLocal > 0)
      .map((t) => ({
        id: t.id,
        outstandingLocal: t.principalLocal,
        couponRate: t.couponRate,
        /** Years of life LEFT, not years at issue. */
        years: Math.max(1 / 52, (t.maturityWeek - state.currentWeek) / 52),
        weeksToMaturity: Math.max(1, t.maturityWeek - state.currentWeek),
      }))
      .filter((b) => b.weeksToMaturity > 1);
    if (process.env.SOV_TRACE === '1') console.log(`  [sov-entry] ${regionId} live=${liveTranches.length} bonds=${bonds.length} cw=${state.currentWeek}`);
    if (bonds.length === 0) return;
    const bondIds = bonds.map((b) => b.id);
    // §3.13b / `../instruments/bond.md` N9.b — WHAT ONE UNIT OF FACE HAS ACCRUED. This auction
    // clears a CLEAN price, so the interest that has run since each bond's own last coupon date is
    // paid by the buyer to the seller on top of it, and re-keys on the accrual ledger with the
    // paper. A bill pays no coupon and accrues nothing (`sovereignCouponByBond` omits it).
    const couponByBond = sovereignCouponByBond(liveTranches);
    const accruedPerFaceById = new Map<string, number>(liveTranches.map(
      (t) => [t.id, accruedPerFace(t, couponByBond[t.id] ?? 0, state.currentWeek)]));
    const totalBondOutstandingLocal = bonds.reduce((s, b) => s + b.outstandingLocal, 0) || 1;

    // PUB2b: the central bank's open-market order, placed by stage 11 last week. It is a size
    // with no reservation level — policy is a quantity this auction prices, not a premium.
    // Read BEFORE the float below, because whether it bids decides whether its book is for sale.
    const cbOrder = reg.centralBankSheet
      ? centralBankParticipant(ctx.v2, regionId, reg.centralBankSheet, bondIds, 'PRICE_LIKE')
      : null;

    // OWN7 — the missing shrink. The float is what the participants in THIS book can hold
    // between them, not the whole issue. A holder that is not in the book keeps its position, so
    // its paper was never for sale, and handing it to the bidders is how the sovereign ledger
    // came to show every holder together owning ~114% of what exists. Two such holders:
    //   - the CENTRAL BANK on a week it places no order. `centralBankParticipant` returns null
    //     then, so it leaves the book holding ~15% of the stock while the float still counts it.
    //     On an order week it IS a participant (with `minHoldingLocal` = its book), so it is
    //     inside the float and nothing is subtracted.
    //   - CORPORATE TREASURIES, if one ever holds a BOND. Their cash sleeve is short paper and
    //     they bid for it in 07f now (CASH), so in practice this carve-out finds nothing here —
    //     it stays because "a holder that does not bid in THIS book keeps its position" is the
    //     rule, and a treasury is not a participant in this one.
    // An institution holds this book's paper under the BUCKET instrument id, a corporate treasury
    // under a TRANCHE id — two id spaces for one instrument. Reading the wrong one silently counts
    // a whole book as passive: measured when it happened, the float collapsed and every real
    // holder was forced out into the dealer (institutions 201B -> 0, dealer 0 -> 99B).
    // One id space: the tranche's. The comment this replaces recorded the old defect — "an
    // institution holds this book's paper under the BUCKET instrument id, a corporate treasury
    // under a TRANCHE id — two id spaces for one instrument" — and reading the wrong one silently
    // counted a whole book as passive. There is only one to read now.
    const heldById = new Set(bondIds);
    const nonParticipantById = new Map<InstrumentId, number>();
    const reserveBond = (id: InstrumentId | undefined, usd: number) => {
      if (!id || !heldById.has(id) || !(usd > 0)) return;
      nonParticipantById.set(id, (nonParticipantById.get(id) ?? 0) + usd);
    };
    if (!cbOrder && reg.centralBankSheet) {
      // §3.13-BOOK d3a: the central bank's book is register rows; a passive book is reserved
      // at its face.
      centralBankPositions(ctx.v2, regionId).forEach((p) => reserveBond(p.bondId, p.faceLocal));
    }
    // §3.13-BOOK d3c: a treasury's book is its register rows, reserved at face.
    ctx.prevActiveFirms.forEach((c) => {
      if (c.region !== regionId) return;
      sovereignRowsOf(ctx.v2, c.id).forEach((p) => reserveBond(p.bondId, p.faceLocal));
    });

    //   - AND THE THIRD, which OWN7 missed, IS NOT A HOLDER AT ALL — it is UNSOLD PAPER, and it
    //     is offered here rather than reserved. Measured at
    //     seed, the model's real books hold ~80% of every region's sovereign stock; the other
    //     ~20% sits with households, foreign official and retail — holders this model does not
    //     name yet. They are the purest case of "a holder that does not bid keeps its position",
    //     and the float counted every dollar of it as for sale. So the bidders bought paper from
    //     nobody, and because there is no passive book to decrement, the total held climbed past
    //     what exists: measured 80% at seed -> 101% by week 3, institutions +87B and banks +64B
    //     against +28B of actual new issuance (§7.124).
    //
    //     The residual is computed from the books themselves rather than stated: whatever the
    //     outstanding is, less what every real holder actually has. That keeps the float exactly
    //     "what the participants in this book hold between them", which is what OWN7's rule says
    //     and what the other two carve-outs already implement.
    //
    //     PUB — AND THEN IT IS SOLD. Reserving it made the float honest and left the paper in
    //     limbo: stage 11 issues into the ladder every quarter, no book ever bought it, and when
    //     it matured the treasury paid 51B to a holder that was never there ("sovereign
    //     redemption (unmodeled holders)"). Unheld sovereign paper is a PRIMARY OFFERING — which
    //     is what a treasury auction is — priced in the same solve as the outstanding stock, paid
    //     for by whoever takes it, and offered again next week if nobody does. An undersubscribed
    //     auction is then a real event with a real consequence for the treasury's account,
    //     instead of a silent placement.
    // §3.13-BOOK — WHO ALREADY HOLDS THIS PAPER, asked of the one walk rather than re-enumerated.
    //
    // This was a sixth open-coded copy of the five-store sovereign walk `sovereign-register.ts`
    // was written to end, and it had rotted in two independent ways.
    //
    //  · It summed `quantityOrNotionalLocal` — the MARK — against `outstandingLocal`, which is the
    //    ladder's FACE. Since `register-marking` began marking sovereign rows at their cleared
    //    price, mark < face for any bond below par, so `unheld` was overstated by the whole
    //    discount. `unheld` IS `primaryOfferingLocal` (below), so the treasury re-offered paper
    //    that somebody already held. `sovereignHeldByBond` returns `units` — the face — so the two
    //    sides of the subtraction are the same quantity now.
    //  · It read `e.itemizedHoldings` at a point where those arrays are stale week-start snapshots
    //    (`context.ts`: the store is live between the build before 07b and the write-back after
    //    07e, and 07c runs inside that window). The walk reads the store.
    const heldFaceById = sovereignHeldByBond(ctx.v2, state, regionId);
    const realHoldingsById = new Map<InstrumentId, number>();
    heldFaceById.forEach((faceLocal, id) => {
      const instrumentId = asInstrumentId(id);
      if (heldById.has(instrumentId) && faceLocal > 0) realHoldingsById.set(instrumentId, faceLocal);
    });
    const unheldById = new Map<InstrumentId, number>();
    bonds.forEach((b) => unheldById.set(b.id, Math.max(0, b.outstandingLocal - (realHoldingsById.get(b.id) ?? 0))));

    const totalOutstandingLocal = totalBondOutstandingLocal;

    // §3.13-SOV row 4 — THE SOVEREIGN CLEARS A PRICE.
    //
    // It cleared a YIELD, and `financial-clearing-engine` values a YIELD_LIKE fill at
    // `unitValueLocal = 1` — so a government bond changed hands at FACE whatever its coupon and
    // whatever the curve said, and every holder carried it at face for its whole life. `P8`
    // sized that at 57.34B on 1.88T. Rule 1 says the price is the primitive and the yield is
    // derived from it; `../instruments/bond.md` N7.b says the same in the instrument's terms.
    //
    // Nothing about anyone's REASON changes. A sovereign buyer's reservation genuinely is a
    // yield — its alternative is the policy rate — so it still computes one, and then states it
    // as the price that yield implies on the bond's own cash flows. What changes is what the
    // auction solves for, and therefore what a fill is worth.
    //
    // Each bond carries its own coupon and its own remaining life. No average, no label.
    type SovBond = { id: string; outstandingLocal: number; couponRate: number; years: number; weeksToMaturity: number };
    const termsOf = (b: SovBond): PaperTerms => ({
      annualCouponRate: b.couponRate,
      periodWeeks: COUPON_PERIOD_WEEKS,
      weeksToMaturity: b.weeksToMaturity,
    });
    /** A reservation stated in yield, restated as the price that yield implies on THIS bond. */
    const priceAtYieldBps = (b: SovBond, yieldBps: number): number => priceFromYield(termsOf(b), yieldBps / 10000);
    /** A willingness-to-move stated in yield, restated as the price move it implies on this
     *  bond at its own level. Duration does the conversion, which is what duration IS — and a
     *  bond's duration is its own, so the four-year rung and the thirty-year rung no longer
     *  share one number. */
    const priceRangeOfYieldRange = (b: SovBond, yBps: number, rangeBps: number): number =>
      Math.max(1e-9, Math.abs(priceAtYieldBps(b, yBps) - priceAtYieldBps(b, yBps + rangeBps)));
    /** The curve's yield at this bond's own remaining tenor — the level it is priced against. */
    const curveYieldBpsOf = (b: SovBond): number => zeroRateAt(reg.zeroRates, b.years) * 10000;

    const instruments: ClearingInstrument[] = bonds.map((b) => ({
      id: b.id,
      outstandingLocal: b.outstandingLocal,
      // XB1 removed the `foreignShare` carve-out, which subtracted an owner that did not exist.
      // OWN7 puts back the carve-out that IS real: what holders outside this book already own.
      // Every bidder here is a real holder, so what is left is genuinely in play.
      tradableFloatLocal: Math.max(0,
        b.outstandingLocal - (nonParticipantById.get(b.id) ?? 0) - (unheldById.get(b.id) ?? 0)),
      // PUB: the treasury's own offering — every dollar of THIS BOND no book holds yet.
      primaryOfferingLocal: unheldById.get(b.id) ?? 0,
      // §3.25: the bond's own last print where it has one; the standing curve's point only for
      // paper that has never traded. Price per unit of face.
      currentStat: clearedPriceOf(ctx.v2, b.id) ?? priceAtYieldBps(b, curveYieldBpsOf(b)),
      statKind: 'PRICE_LIKE',
      durationYears: b.years,
      // No floor or ceiling — nominal sovereign yields have gone genuinely negative in real
      // markets; the actual bound is whatever real demand versus supply clears to.
    }));

    // Real participants: named banks (own HQLA-liquidity-driven book) + institutional entities
    // (own real target, distributed by relative weight — never an independent number).
    const regionBanks = banksOf(ctx.prevActiveFirms, regionId);

    // XB1: every region's institutions bid here, not just this one's, and each one's target is
    // ITS OWN book — assets x its government-bond allocation x what its mandate allows in this
    // issuer's market. The imposed `institutionalShare x outstanding`, renormalized across a
    // fixed holder set, is gone: it decided the answer the auction is supposed to produce.
    const sovStockByRegion: Record<string, number> = {};
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
      sovStockByRegion[r] = materializeGovLadder(ctx.v2, r)
        .filter((t) => t.tenorAtIssuanceYears >= SOV_BILL_MAX_TENOR_YEARS)
        .reduce((a, t) => a + t.principalLocal, 0);
    });
    const biddingEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => mandateAllowsDuration(e.entityType)
        && mandateWeightForIssuer(e.entityType, e.region, regionId, sovStockByRegion) > 0
    );
    const rawEntityTargets = new Map<string, number>(
      biddingEntities.map((e) => [
        e.id,
        institutionTotalAssetsLocal(ctx, e) * e.assetAllocationTarget.govBondPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, sovStockByRegion),
      ])
    );
    // Banks stay DOMESTIC, and that is a mandate rather than an assigned share: a bank holds its
    // own sovereign as the liquidity buffer its regulator recognises, which is why it does not
    // reach for foreign paper to meet it. OWN3: how MUCH it holds is now its own number too —
    // see `sovereignBookCapacityLocal` / `liquidityDrivenSovereignFloorLocal`. The bills in 07f share
    // that one appetite with the bonds here, so both books apportion it over the whole
    // sovereign stock rather than each over its own half.
    const wholeSovStockLocal = liveTranches.reduce((s2, t) => s2 + Math.max(0, t.principalLocal), 0) || 1;

    /** The instruments THIS auction prices — every other holding passes through untouched. */
    const ownInstrumentIds = new Set(bondIds);

    // SCALE C1: positions come off the shared store's GOV_BOND rows. Only the BONDS
    // this auction actually prices are claimed. Bills are instrumentType GOV_BOND too, and clear
    // in 07f — sweeping them in here put them in the rebuilt-from-fills set, so this stage
    // deleted every bill position with no cash leg. Measured as the UK institutional book losing
    // 4.6B of bills in week 7 while its cash did not move. A stage may only rewrite the
    // instruments it cleared — unclaimed rows pass through the write-back untouched.
    const store = ctx.holdingsStore!;
    const entityParticipants: ClearingParticipant[] = biddingEntities.map((entity) => {
      const currentByBond = new Map<InstrumentId, number>();
      store.scan(entity.id, 'GOV_BOND', (h) => {
        if (!ownInstrumentIds.has(h.instrumentId)) return false;
        currentByBond.set(h.instrumentId, (currentByBond.get(h.instrumentId) ?? 0) + h.quantityOrNotionalLocal);
        return true;
      });

      // A government bond carries no credit loss, so what a holder needs from it is the real
      // return its liabilities cost plus compensation for the duration it is committing. That is
      // the reservation yield; below it the money is better left at the central bank, which is
      // the same choice the banks below face and the reason the front end tracks policy.
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      const entityTarget = rawEntityTargets.get(entity.id) ?? 0;
      // The entity's real money for this auction (S11), apportioned across the bonds by
      // their share of the market. Banks below carry no such cap: their real constraint is the
      // reserve position S2 already built, not a cash budget.
      const classBudgetLocal = stagePurchaseBudgetLocal(ctx, entity, institutionTotalAssetsLocal(ctx, entity), 'GOV_BOND', institutionUnsettledLessCollateralLocal(ctx, entity.id));
      bonds.forEach((b) => {
        // Its share of the market is its own face over the whole stock — the bond's, not a
        // share is the bond's own.
        const shareOfMarket = b.outstandingLocal / totalOutstandingLocal;
        demandByInstrumentId.set(b.id, {
          // XB2: a foreign holder hedges this bond, so what it needs from it is its home
          // requirement plus the hedge's cost. Under CIP that is exactly the policy-rate
          // difference — which makes cross-border demand chase the spread over the LOCAL short
          // rate rather than the headline yield.
          reservationStat: priceAtYieldBps(b,
            computeSovereignReservationYieldBps(reg, b.years, INSTITUTIONAL_PREFERRED_TENOR_YEARS)
            + (entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
                ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate))),
          maxHoldingLocal: entityTarget * shareOfMarket * maxOverweightMultipleOf(entity),
          fullSizeStatRange: priceRangeOfYieldRange(b, curveYieldBpsOf(b), SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS),
          maxNetPurchaseLocal: classBudgetLocal * shareOfMarket,
          // Liability-driven core: an insurer's claim reserves and a pension fund's benefit
          // promises still exist when yields look poor, and something has to match them.
          minHoldingLocal: entityTarget * shareOfMarket * institutionProfile(entity.entityType).sovereignCoreShare,
        });
      });

      // §3.17e-iii-b: what it has LENT is exposure it holds through a receivable, not a deliverable
      // rung — its ceiling comes down by it rather than sending it out to re-buy what it lent —
      // and a recalled borrow it still owes is a purchase at any price.
      bonds.forEach((b) => {
        const lent = ctx.lentSharesByLender.get(positionKey(entity.id, b.id)) ?? 0;
        const buyIn = ctx.buyInSharesByBorrower.get(positionKey(entity.id, b.id)) ?? 0;
        const d = demandByInstrumentId.get(b.id);
        if (!d || (lent <= 0 && buyIn <= 0)) return;
        const current = currentByBond.get(b.id) ?? 0;
        demandByInstrumentId.set(b.id, {
          ...d,
          maxHoldingLocal: Math.max(0, d.maxHoldingLocal - lent, current + buyIn),
          minHoldingLocal: Math.max(0, (d.minHoldingLocal ?? 0) - lent, buyIn > 0 ? current + buyIn : 0),
          maxNetPurchaseLocal: buyIn > 0 ? undefined : d.maxNetPurchaseLocal,
        });
      });
      return { id: entity.id, currentHoldingsByInstrumentId: currentByBond, demandByInstrumentId };
    });

    // §3.17e-ii-a: a relative-value book's CASH leg — the deliverable it is long against its
    // short in the futures line — is its own demand for that one bond: up to the price at which
    // the future still pays the carry, in the size the pair calls for, on the money its cash and
    // its broker's line carry. Its other bids in this book stand as its sovereign sleeve.
    // §3.17e-ii-b: a REDUCTION is a target, sold at what this book clears — the decision was made
    // on the edge, and a pair the line no longer carries or that has lost its margin is cut whole.
    ctx.relativeValueLegs.filter((l) => l.market === 'SOVEREIGN_CASH' && l.regionId === regionId).forEach((leg) => {
      const p = entityParticipants.find((x) => x.id === leg.entityId);
      if (!p || !ownInstrumentIds.has(leg.instrumentId)) return;
      const current = p.currentHoldingsByInstrumentId.get(leg.instrumentId) ?? 0;
      // This book holds FACE (its fills are appended as face, its float is principal), so a leg's
      // face adds to the holding as it is and its money budget is restated in face at its price.
      if (leg.faceLocal < 0) {
        const keepLocal = Math.max(0, current + leg.faceLocal);
        p.demandByInstrumentId.set(leg.instrumentId, { reservationStat: leg.reservationPrice, maxHoldingLocal: keepLocal, fullSizeStatRange: leg.fullSizePriceRange, minHoldingLocal: keepLocal });
        return;
      }
      p.demandByInstrumentId.set(leg.instrumentId, {
        reservationStat: leg.reservationPrice,
        maxHoldingLocal: current + leg.faceLocal,
        fullSizeStatRange: leg.fullSizePriceRange,
        maxNetPurchaseLocal: leg.budgetLocal / Math.max(1e-9, leg.reservationPrice),
        minHoldingLocal: current,
      });
    });

    // §3.13-SOV row 3: haircuts are per bond, off the ladder this auction is pricing.
    const repoHaircuts = computeSovereignRepoHaircuts(reg, (id) => bonds.find((b) => b.id === id)?.years);
    const bankParticipants: ClearingParticipant[] = regionBanks.map((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      // §3.13-BOOK d5a: what is pledged is the register's liens.
      const encumberedFace = lienFaceByBond(ctx.v2, bank.id);
      // §3.13-BOOK d3b: what it holds is its register rows' FACE — the auction clears face.
      const currentByBond = new Map<InstrumentId, number>();
      bankSovereignFaceByBond(ctx.v2, bank.id).forEach((faceLocal, id) => {
        if (ownInstrumentIds.has(id)) currentByBond.set(id, faceLocal);
      });

      // WS6 closes the loop the old comment left open ("their real constraint is the reserve
      // position") — the constraint now EXISTS. A bank can add this week what its own money
      // and its own collateral can fund: cash above its operating buffer, plus the secured
      // borrowing its UNENCUMBERED government book supports at the derived haircuts. Before
      // this budget, the honest ledger showed banks buying 241B of bonds against 232B of
      // deposits with the SRF financing 88B at penalty — a real bid must be a claim on real
      // funding (§7.6: a cash-constrained bidder rations quantity, never price).
      // Bounded by BOTH real constraints a treasury faces: what its money and collateral can
      // fund, AND what its equity supports under the leverage floor — the only capital
      // constraint that sees a zero-risk-weight sovereign book (see BASEL_MIN_LEVERAGE_RATIO's
      // doc for the 260-week runaway that made this necessary).
      // SETL6: reserves plus what this week's already-agreed securities trades will settle —
      // the books clear before the settlement pass, so a commitment lives in the unsettled
      // position until then and a bank cannot fund two books with the same reserves.
      const reservesLocal = bankReservesOf(ctx.v2, bank.id);
      const facilityBookLocal = facilityBookOf(ctx.v2, bank.id);
      const sovLocal = bankSovereignBookLocal(ctx.v2, bank.id);
      // §3.13-BOOK d3d: the leverage ratio charges every register book, the desks' gross included.
      const deskLocal = deskGrossLocal(ctx.v2, bank.id);
      const settledCashLocal = reservesLocal
        + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
      const fundableLocal = Math.min(
        Math.max(0, settledCashLocal - householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)) * MIN_CASH_BUFFER_RATIO)
          + unencumberedBorrowingCapacityLocal(bankSovereignFaceByBond(ctx.v2, bank.id), repoHaircuts, encumberedFace),
        leverageHeadroomLocal(sheet, reservesLocal, facilityBookLocal, sovLocal + deskLocal)
      );
      // REPO2: collateral already pledged cannot simultaneously be sold, and the pledge names
      // the paper. The floor is now the face of THIS BOND that is actually encumbered — a
      // blended share withheld thirty-year paper from the two-year book and vice versa.

      // A bank's reservation yield is the administered rate it can earn on reserves instead, plus
      // what it needs for the duration risk a bond carries and cash does not. This is the same
      // bonds-versus-reserves choice that anchors the front end, now expressed as a price rather
      // than as a scaling factor on a quantity target.
      const demandByInstrumentId = new Map<InstrumentId, ParticipantDemand>();
      const appetiteLocal = sovereignBookCapacityLocal(sheet, reservesLocal, facilityBookLocal, sovLocal, deskLocal);
      const liquidityFloorLocal = liquidityDrivenSovereignFloorLocal(sheet, reservesLocal, bankDepositLines(ctx, bank));
      bonds.forEach((b) => {
        const shareOfMarket = b.outstandingLocal / totalOutstandingLocal;
        const shareOfSovStock = b.outstandingLocal / wholeSovStockLocal;
        demandByInstrumentId.set(b.id, {
          // The duration premium is on THIS bond's remaining life, so a rung six years into a
          // ten-year life is priced as the four-year bond it now is.
          reservationStat: priceAtYieldBps(b, reg.policyRate * 10000 + durationPremiumBps(b.years, BANK_PREFERRED_TENOR_YEARS)),
          maxHoldingLocal: appetiteLocal * shareOfSovStock,
          fullSizeStatRange: priceRangeOfYieldRange(b, curveYieldBpsOf(b), SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS),
          maxNetPurchaseLocal: fundableLocal * shareOfMarket,
          // Two floors, whichever binds: collateral already pledged overnight cannot be sold,
          // and a bank cannot sell below the liquidity its reserves do not already cover. The
          // pledge names the paper, so the floor is the face of THIS BOND that is encumbered.
          minHoldingLocal: Math.max(
            encumberedFace.get(b.id) ?? 0,
            liquidityFloorLocal * shareOfSovStock
          ),
        });
      });

      return { id: bank.ticker, currentHoldingsByInstrumentId: currentByBond, demandByInstrumentId };
    });

    // G3a: each bank's govvie desk, distinct from the investment book it also runs above.
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments,
    });
    const deskTickers = deskTickersOf(deskParticipants);

    const participants = [...entityParticipants, ...bankParticipants, ...(cbOrder ? [cbOrder.participant] : []), ...deskParticipants];

    const result = clearFinancialAsset(
      instruments,
      participants,
      {
        // OWN7: the float here is a stock these participants already hold, so an unsold
        // position stays with its holder rather than falling to a dealer nobody names.
        unsoldStaysWithHolder: true,
      }
    );
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} sovereign bond`);

    // Apply: real cleared yields -> refit the Nelson-Siegel curve so every other consumer rides
    // on these real points.
    // Every bond that traded is a point on the curve, at ITS OWN remaining tenor and the yield
    // ITS OWN cleared price implies. The curve is a read of what the market paid for real bonds
    // (rule 3, and §3.25's one curve owner), not a refit of four synthetic points.
    // §9.13-EQUITY — AND THE PRINT IS DEPOSITED, not only turned into a curve point. This book
    // struck a price per BOND and kept nothing but the yield it implied, so the register carried
    // every sovereign holding at PAR for ever while the two corporate books marked at what they
    // printed: step 13's item 3 ("the auction already computes the price it needs and discards
    // it"), one asset class over. `register-marking` reads the store this writes.
    const instrumentByIdSov = new Map(instruments.map((i) => [i.id, i]));
    const observedPoints = bonds
      .map((b) => {
        const px = takePrint(ctx, result, b.id, `${regionId} sovereign bond`);
        if (px === undefined) return undefined;
        const inst = instrumentByIdSov.get(b.id);
        // §3.21, and the credit books' reading of it: what was PLACED, not what was OFFERED.
        // The two differ in exactly one state — nobody holds the bond, it is on offer, and nobody
        // bought — and that state is the rule's own definition of nothing to trade, so an
        // offering that found no buyer used to deposit the solver's bracket as a price.
        const placedLocal = Math.max(0, result.primaryOutcomeById.get(b.id)?.marketTakeLocal ?? 0);
        const traded = (inst?.tradableFloatLocal ?? 0) > 0 || placedLocal > 0;
        // §3.21: a book with nothing to trade has no clearing level, and what comes back is the
        // numerical bracket. Such a bond KEEPS the price it had rather than taking that print.
        if (traded && px > 0 && isFinite(px)) setClearedPrice(ctx.v2, b.id, px);
        // §3.25: and only a trade is a point on the curve — the bracket of a book with nothing
        // to trade used to be deposited as an observation while the price store refused it.
        if (!traded || !(px > 0) || !isFinite(px)) return undefined;
        return { tenorYears: b.years, yield: yieldFromPrice(termsOf(b), px) };
      })
      .filter((p): p is { tenorYears: number; yield: number } => p !== undefined);
    if (process.env.SOV_TRACE === '1') {
      console.log(`  [sov-trace] ${regionId} w${ctx.nextWeek}: bonds=${bonds.length} points=${observedPoints.length} ` +
        bonds.slice(0, 4).map((b) => `${b.id}@${b.years.toFixed(2)}y out=${(b.outstandingLocal / 1e9).toFixed(1)}B float=${((instruments.find((i) => i.id === b.id)?.tradableFloatLocal ?? 0) / 1e9).toFixed(1)}B px=${result.printById.get(b.id)?.stat?.toFixed(5) ?? 'none'}`).join(' | '));
    }
    // §3.13-SOV row 5 / §3.25 — THIS STAGE DOES NOT OWN THE CURVE. It cleared bonds against the
    // curve standing at week start, which is what a real session prices against, and deposits what
    // it observed. `sovereign-curve.ts` fits ONCE through these points and the bill session's, and
    // publishes every field from that one fit.
    //
    // It used to fit here and write all five `zeroRates`, and then 07f refitted
    // `yieldCurveParams` through the BILLS plus four synthetic points read back off this fit while
    // leaving 2Y–30Y at this stage's values. Two representations of one curve, each partly derived
    // from the other, and `P6` measured all twenty points disagreeing, worst 36bp.
    ctx.sovereignCurvePoints.set(regionId, [
      ...(ctx.sovereignCurvePoints.get(regionId) ?? []),
      ...observedPoints,
    ]);

    // Apply: each entity's real new holdings — foreign holders included, which is what makes
    // the foreign share a measured outcome rather than a parameter.
    // SCALE C1: fills are appended to the store for the single write-back after 07e. SETL6: the
    // cash leg is settled below as payment instructions.
    biddingEntities.forEach((entity) => {
      const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<InstrumentId, number>();
      const newGovHoldings: ItemizedHolding[] = [];
      newHoldings.forEach((usd, instrumentId) => {
        if (usd > 1) newGovHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalLocal: usd, units: usd });
      });
      store.append(entity.id, newGovHoldings);
    });

    // Apply: each bank's real new holdings, keyed back to plain tenor keys, plus the derived
    // scalar total (sovereignBondHoldingsLocal stays the sum of the book).
    regionBanks.forEach((bank) => {
      const newHoldings = result.newParticipantHoldings.get(bank.ticker) ?? new Map<InstrumentId, number>();
      // §7.235: a bank with no sheet has no securities book to move, and the `?.` reads below
      // already assumed that — they just could not say it while `companyUpdates` was `any`. Now
      // the spread at the write site would silently produce a PARTIAL sheet, which is how a
      // balance-sheet line goes missing without anything failing.
      const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
      if (!existingSheet) return;
      // A clearing stage may only rewrite the instruments it actually cleared (§7.34). This
      // auction prices the BONDS; the bank's BILLS (cleared in 07f) pass through untouched.
      // Rebuilding the whole book from this auction's fills
      // deleted every bank's bill position with no cash leg — the exact WS5 bug, fixed on the
      // institutional path at the time and sitting unnoticed here until the per-bank identity
      // invariant existed to catch it (measured: 26.6B of USA bank bills vanished in week 1).
      // §3.13-BOOK d3b: the bank's own book is REGISTER ROWS — each bond this auction priced moves
      // by `transferHolding` against the house (wire and row in one operation), in FACE, under
      // the BANK party whose reserves pay for it. A bond the engine reports no holding for is
      // left where it is (the Record rebuild used to drop it with no wire).
      const heldFace = bankSovereignFaceByBond(ctx.v2, bank.id);
      const house = { kind: 'CLEARING_HOUSE' as const, region: regionId };
      let prevClearedLocal = 0, newClearedLocal = 0;
      bonds.forEach((b) => { prevClearedLocal += heldFace.get(b.id) ?? 0; });
      newHoldings.forEach((usd, instrumentId) => {
        newClearedLocal += usd;
        const deltaLocal = usd - (heldFace.get(instrumentId) ?? 0);
        if (!(Math.abs(deltaLocal) > 1)) return;
        // §3.13-BOOK f2a: the fill moves at the price this auction cleared, face by face.
        const spec = { instrumentType: 'GOV_BOND' as const, instrumentId, issuerRegion: regionId, valueLocal: Math.abs(deltaLocal) * (clearedPriceOf(ctx.v2, instrumentId) ?? 1), units: Math.abs(deltaLocal) };
        if (deltaLocal > 0) transferHolding(ctx.v2, house, bankPartyOf(bank.id), spec, 'sovereign bond clearing fill');
        else transferHolding(ctx.v2, bankPartyOf(bank.id), house, spec, 'sovereign bond clearing fill');
      });
      const cashDeltaLocal = result.netCashDeltaByParticipantId.get(bank.ticker) ?? 0;
      // The dealer fee inside the cash leg is an expense: cash left the bank beyond what the
      // bonds cost, and P&L must say so or the balance-sheet identity drifts by the fee.
      const feeLocal = Math.max(0, -(cashDeltaLocal + (newClearedLocal - prevClearedLocal)));
      if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
      // The securities and the P&L; the reserves leg settles below (SETL6), so that the bank
      // that sold and the bank that bought move against each other rather than each moving
      // alone.
      updateBankSheet(ctx, bank.ticker, {
        ...bookPnL(existingSheet, -feeLocal, 'sovereign book fee', bank.ticker),
      });
    });

    // Apply: the central bank's fills. No cash is debited — it paid with reserves it created,
    // which is what makes a central-bank purchase grow the monetary base instead of moving
    // money between holders. The sellers' cash legs are already credited above.
    // Reset every week even with no order, or the line reports a stale fill forever.
    if (reg.centralBankSheet) {
      reg.centralBankSheet.lastOpenMarketPurchasesLocal = 0;
      reg.centralBankSheet.lastOrderPlacedLocal = cbOrder?.orderedLocal ?? 0;
    }
    if (cbOrder && reg.centralBankSheet) {
      const cbFills = result.newParticipantHoldings.get(CENTRAL_BANK_PARTICIPANT_ID) ?? new Map<InstrumentId, number>();
      // Step 13 (W2) / §3.13-BOOK d3a: the central bank's fills are transfers from the house onto
      // its register book — wire and row in one operation.
      const filled = bookCentralBankFills(ctx.v2, regionId, bondIds, cbFills, 'sovereign bond clearing fill');
      reg.centralBankSheet.lastOpenMarketPurchasesLocal = Math.round(filled);
    }

    // Apply: the desks' inventory, owned by the banks that took it — register rows (§3.13-BOOK
    // d3d), and only the rows of the names this auction priced move: the bill rows are 07f's.
    applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });

    // SETL6: the book's whole cash side, through the clearing house. The central bank's leg is
    // named and settles to nothing — it pays with reserves it creates, which is what makes an
    // open-market purchase grow the monetary base instead of moving money between holders; the
    // reserves land at the sellers' banks through their own legs above.
    const entityIds = new Set(biddingEntities.map((e) => e.id));
    const bankTickers = new Set(regionBanks.map((b) => b.ticker));
    // ONE reading of who a participant is, for both halves of its settlement: the money and the
    // accrual ledger's key. The accrual walk names its holders the same way
    // (`sovereign-calendar.ts:accrueSovereignHolders`), so a balance moved here is a balance that
    // walk will find.
    const partyOfParticipant = participantPartyOf({ regionId, entityIds, deskTickers, bankTickers, bankIdOfTicker });
    // §3.13b: the accrued travels with the face — the ledger half here, the cash half below,
    // through the same clearing house as the paper.
    const accruedLeg = accruedOnFills(
      participants, result.newParticipantHoldings,
      (id) => accruedPerFaceById.get(id) ?? 0,
      (bondId, participantId, usd) => moveSovereignAccrued(
        ctx, regionId, bondId,
        partyOfParticipant(participantId)
          ?? defect(`${BOOK} accrued: participant '${participantId}' names no holder of record`),
        usd)
    );
    settleClearedBook(
      ctx, regionId, currencyOf(regionId), BOOK,
      result.netCashDeltaByParticipantId,
      partyOfParticipant,
      { netCashLocal: result.dealerNetCashLocal },
      feeDesksForRegion(ctx, regionId),
      // PUB: the treasury is paid for the paper this week's auction actually placed.
      primaryTakes(result, () => ({ kind: 'GOVERNMENT', region: regionId }), undefined, primaryAssetOf('GOV_BOND', regionId)),
      // The net is the ISSUER's: seasoned paper the primary placed carries accrued nobody has been
      // paid for yet, and the treasury's receivable to the holders rose by the same amount. Every
      // bond in this book has the same issuer, which is what makes a sovereign book a sovereign
      // book — a corporate one names the borrower whose paper moved.
      { ...accruedLeg, issuerOf: () => ({ kind: 'GOVERNMENT', region: regionId }) }
    );

    // §5-CLOSE O1: what this auction did not place is withdrawn from the ladder — paper nobody
    // holds is not debt — and the need rolls forward to the next issuance.
    instruments.forEach((inst) => {
      const o = result.primaryOutcomeById.get(inst.id);
      const placedLocal = o && !o.withdrawn ? Math.max(0, o.marketTakeLocal) : 0;
      const unplacedLocal = Math.max(0, (inst.primaryOfferingLocal ?? 0) - placedLocal);
      // §3.15b-ii: the treasury records what it offered, what the primary took and what it
      // withdraws — the one line a story about this auction can be told from.
      recordPrimaryOffering(reg, ctx.nextWeek, { bondId: inst.id, kind: 'BOND', offeredLocal: inst.primaryOfferingLocal ?? 0, placedLocal, withdrawnLocal: unplacedLocal > 1 ? unplacedLocal : 0 });
      if (unplacedLocal <= 1) return;
      // §3.13-SOV row 3: the paper that found no buyer is THIS BOND's, so it comes off THIS
      // BOND. It used to be withdrawn from a group and spread over whatever rungs were in it,
      // which took face off bonds the auction had actually placed.
      // §3.13-SOV row 2: withdrawn paper is face that ceased to exist, and it comes off THIS
      // BOND's own row by wire — the array-and-diff this replaces rebuilt a list to derive the
      // same retirement.
      const row = trancheRowOf(ctx.v2, inst.id);
      if (row === undefined) return;
      const takeLocal = Math.min(unplacedLocal, ctx.v2.tranches.principalLocal[row]);
      if (!(takeLocal > 0)) return;
      const govIssuer = governmentIssuer(regionId);
      retireTranche(ctx.v2, govIssuer, row, takeLocal, 'sovereign issuance withdrawn');
      commitLadder(ctx.v2, govIssuer,
        ladderRowsOf(ctx.v2, govIssuer.id).filter((r) => ctx.v2.tranches.principalLocal[r] > 0.01));
      // A3.5: withdrawn paper rolls into no side map — the treasury's account runs lower and the
      // next block sees the advance it drew.
    });
  });
}
