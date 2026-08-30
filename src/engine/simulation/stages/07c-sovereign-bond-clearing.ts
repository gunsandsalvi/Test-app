/**
 * Stage 7c: Sovereign Bond Real Clearing
 *
 * Foundational correction (Wall Street): a government bond's yield must be the actual result of
 * real supply and demand, exactly like corporate bonds — never a macro formula. This is the
 * sovereign-bond adapter over the generalized clearing engine (financial-clearing-engine.ts).
 *
 * Instruments are the region's own real, outstanding debt bucketed into the 4 standard tenor
 * points it's actually issued at (2Y/5Y/10Y/30Y — see 11-fiscal-and-sovereign-debt.ts's issuance
 * calendar). Real participants:
 *   - Each named bank, with its own real sovereignBondHoldingsByTenor and a real bottom-up target
 *     (sovBondOwnership.bankShare * the real outstanding stock, distributed across named banks
 *     by relative deposit size — never each bank independently computing depositsUSD * a ratio,
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
 * Banks also collectively play the dealer role (sovBondDealerInventory) exactly as they do for
 * corporate bonds — real primary-dealer market-making, distinct from their own real portfolio
 * holdings above.
 *
 * After clearing the 4 real tenor yields, the Nelson-Siegel curve (yieldCurveParams) is refit to
 * pass through them (fitNelsonSiegelParams) — the standard real-world technique for building a
 * full curve from a handful of actually observed points — so every other consumer of the curve
 * (corporate bond and loan pricing, swaps, FX, position mark-to-market) keeps working unchanged,
 * now riding on real cleared prices.
 *
 * This stage is the curve's ONLY owner. macro/evolution.ts used to recompute beta0/beta1/beta2
 * from macro formulas every week and overwrite whatever cleared here; that write is gone. Macro
 * conditions reach the curve exclusively through the participants' own attractiveness views
 * below: the administered policy rate via banks' real front-end arbitrage against central-bank
 * reserves, and inflation expectations via every holder's real yield and how much duration it is
 * being paid for.
 *
 * Must run after stage 2b (so banks' own balance sheets already reflect this week) and before
 * stage 8, 11, and 12 (all of which read yieldCurveParams/zeroRates as already-real values).
 */

import { GameState, RegionId, ItemizedHolding, InstitutionalEntity } from '../../../types';
import { SOV_BILL_MAX_TENOR_YEARS } from './shared-helpers';
import { mandateWeightForIssuer, mandateAllowsDuration } from '../../../domain/cross-border';
import { hedgedReservationAdjustmentBps } from '../../../domain/fx-hedging';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetUSD } from './institutional-balance-sheet';
import { pendingSettlementUSD } from './settlement';
import { settleClearedBook, feeDesksForRegion } from './book-settlement';
import { buildDealerDeskParticipants, applyDealerDeskFills, dealerDeskPartyOf, deskTickersOf } from './dealer-desks';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { MAX_OVERWEIGHT_MULTIPLE } from './asset-allocation';
import { centralBankParticipant, applyCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityUSD } from './repo-clearing';
import { encumberedFaceByBucket } from '../../../domain/repo';
import { MIN_CASH_BUFFER_RATIO, leverageHeadroomUSD, sovereignBookCapacityUSD, liquidityDrivenSovereignFloorUSD } from '../../macro/banking';

type ZeroRateField = 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y';
const TENOR_BUCKETS: { key: string; years: number; zeroRateField: ZeroRateField }[] = [
  { key: 't2', years: 2, zeroRateField: 'tenor2Y' },
  { key: 't5', years: 5, zeroRateField: 'tenor5Y' },
  { key: 't10', years: 10, zeroRateField: 'tenor10Y' },
  { key: 't30', years: 30, zeroRateField: 'tenor30Y' },
];

const MAX_WEEKLY_YIELD_MOVE_PCT = 0.20;
const SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS = 120;
const DURATION_PREMIUM_BPS_PER_YEAR = 4;
const INSTITUTIONAL_REAL_RETURN_BPS = 150;
/** G3b: one quote per book, shared with the player's ticket (domain/dealer-desk.ts). */
const DEALER_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK['sovereign bond'];

/** This book's name, as the desks and the clearing house know it. */
const BOOK = 'sovereign bond';
const BANK_PREFERRED_TENOR_YEARS = 3; // a bank's HQLA book skews shorter/more liquid than a typical bond investor
/**
 * Share of its policy government-bond allocation each holder keeps at ANY yield, because its
 * liabilities require the match. Insurers and pension funds are liability-driven and hold most of
 * their book through anything; an asset manager runs a benchmark it can deviate from but not
 * abandon; a hedge fund and a PE sponsor have no such obligation and can hold none.
 */
function liabilityDrivenCoreShare(entityType: string): number {
  switch (entityType) {
    case 'INSURER': return 0.70;
    case 'PENSION_FUND': return 0.75;
    case 'ASSET_MANAGER': return 0.40;
    default: return 0;
  }
}

const INSTITUTIONAL_PREFERRED_TENOR_YEARS = 12; // insurers/pension funds match long-dated liabilities

// How macro conditions reach the curve now that no formula writes it (see this file's header
// and the deleted block in macro/evolution.ts). Both signals are comparisons against real,
// already-existing quantities in the same units — the administered policy rate and the region's
// own expected inflation — never an independently invented "fair yield" level, which has no
// guaranteed relationship to the bootstrapped curve and saturates into a one-way tilt.
const POLICY_SPREAD_SCALE_BPS = 300; // pickup over the policy rate that fully forms a bank's front-end view
const MAX_POLICY_TILT = 0.20;
const FRONT_END_SUBSTITUTION_TENOR_YEARS = 3; // how far along the curve a bond still substitutes for cash at the CB
const RESERVE_SUBSTITUTION_SCALE_BPS = 300; // pickup over the policy rate that fully swings the bond-vs-reserves choice
const MAX_RESERVE_SUBSTITUTION = 0.5; // a bank must always carry some HQLA and cannot lever into unlimited bonds
const REAL_YIELD_SCALE_BPS = 1000; // real yield that fully forms a duration view
const MAX_INFLATION_TILT = 0.15;
const LONG_END_TENOR_YEARS = 20; // tenor at which a holder is fully exposed to the inflation view

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

function bucketInstrumentId(regionId: RegionId, tenorKey: string): string {
  return `${regionId}-GOV-${tenorKey}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Every holder's view of what a bond is really paying: its nominal yield less the inflation the
 * region actually expects, weighted by how much of that holder's money the tenor commits. Shared
 * by banks and institutions because it is not a mandate preference — it is arithmetic that
 * applies to anyone holding the paper.
 */
function realYieldSignal(
  reg: { expectedInflation: number; targetInflation: number },
  bucket: { years: number },
  currentYieldBps: number
): number {
  // Same horizon-matched expectation as the reservation above: a holder judging a 10-year bond's
  // real yield uses the inflation it expects over ten years, not this week's print.
  const realYieldBps = currentYieldBps - expectedInflationOverTenor(reg as any, bucket.years) * 10000;
  const durationExposure = Math.min(1, bucket.years / LONG_END_TENOR_YEARS);
  return clamp((realYieldBps / REAL_YIELD_SCALE_BPS) * durationExposure, -MAX_INFLATION_TILT, MAX_INFLATION_TILT);
}

export function runSovereignBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];
    const liveTranches = reg.govDebtTranches || [];
    if (liveTranches.length === 0) return;

    const outstandingByBucket = new Map<string, number>();
    const bucketKeyByTrancheId = new Map<string, string>();
    TENOR_BUCKETS.forEach((b) => outstandingByBucket.set(b.key, 0));
    liveTranches.forEach((t) => {
      // Bills (below 2Y) clear in 07f-short-debt-clearing.ts; folding them in here would count
      // the same paper in two markets and hand the two-year bucket a phantom float.
      if (t.tenorAtIssuanceYears < SOV_BILL_MAX_TENOR_YEARS) return;
      const bucket = TENOR_BUCKETS.reduce((best, b) =>
        Math.abs(b.years - t.tenorAtIssuanceYears) < Math.abs(best.years - t.tenorAtIssuanceYears) ? b : best
      );
      outstandingByBucket.set(bucket.key, (outstandingByBucket.get(bucket.key) ?? 0) + t.principalUSD);
      bucketKeyByTrancheId.set(t.id, bucket.key);
    });

    const activeBuckets = TENOR_BUCKETS.filter((b) => (outstandingByBucket.get(b.key) ?? 0) > 0);
    if (activeBuckets.length === 0) return;
    const bondBucketKeys = activeBuckets.map((b) => b.key);

    // PUB2b: the central bank's open-market order, placed by stage 11 last week. It is a size
    // with no reservation level — policy is a quantity this auction prices, not a premium.
    // Read BEFORE the float below, because whether it bids decides whether its book is for sale.
    const cbOrder = reg.centralBankSheet
      ? centralBankParticipant(reg.centralBankSheet, bondBucketKeys, (k) => bucketInstrumentId(regionId, k))
      : null;

    // OWN7 — the missing shrink. The float is what the participants in THIS book can hold
    // between them, not the whole issue. A holder that is not in the book keeps its position, so
    // its paper was never for sale, and handing it to the bidders is how the sovereign ledger
    // came to show every holder together owning ~114% of what exists. Two such holders:
    //   - the CENTRAL BANK on a week it places no order. `centralBankParticipant` returns null
    //     then, so it leaves the book holding ~15% of the stock while the float still counts it.
    //     On an order week it IS a participant (with `minHoldingUSD` = its book), so it is
    //     inside the float and nothing is subtracted.
    //   - CORPORATE TREASURIES, which park cash in short paper (stage 08) and never bid.
    // An institution holds this book's paper under the BUCKET instrument id, a corporate treasury
    // under a TRANCHE id — two id spaces for one instrument. Reading the wrong one silently counts
    // a whole book as passive: measured when it happened, the float collapsed and every real
    // holder was forced out into the dealer (institutions 201B -> 0, dealer 0 -> 99B).
    const bucketKeyByInstrumentId = new Map<string, string>();
    activeBuckets.forEach((b) => bucketKeyByInstrumentId.set(bucketInstrumentId(regionId, b.key), b.key));
    const bucketOf = (instrumentId: string): string | undefined =>
      bucketKeyByInstrumentId.get(instrumentId) ?? bucketKeyByTrancheId.get(instrumentId);

    const nonParticipantByBucket = new Map<string, number>();
    const reserveBucket = (key: string | undefined, usd: number) => {
      if (!key || !(usd > 0)) return;
      nonParticipantByBucket.set(key, (nonParticipantByBucket.get(key) ?? 0) + usd);
    };
    if (!cbOrder && reg.centralBankSheet) {
      Object.entries(reg.centralBankSheet.sovereignHoldingsByTenor || {})
        .forEach(([key, usd]) => reserveBucket(key, Number(usd) || 0));
    }
    ctx.prevActiveFirms.forEach((c) => {
      if (c.region !== regionId) return;
      (c.treasuryHoldings || []).forEach((h) =>
        reserveBucket(bucketOf(h.instrumentId), h.quantityOrNotionalUSD ?? 0));
    });

    //   - AND THE THIRD, which OWN7 missed: THE SHARE NO REAL BOOK HOLDS AT ALL. Measured at
    //     seed, the model's real books hold ~80% of every region's sovereign stock; the other
    //     ~20% sits with households, foreign official and retail — holders this model does not
    //     name yet. They are the purest case of "a holder that does not bid keeps its position",
    //     and the float counted every dollar of it as for sale. So the bidders bought paper from
    //     nobody, and because there is no passive book to decrement, the total held climbed past
    //     what exists: measured 80% at seed -> 101% by week 3, institutions +87B and banks +64B
    //     against +28B of actual new issuance (§7.124).
    //
    //     The residual is computed from the books themselves rather than stated: whatever the
    //     outstanding is, less what every real holder actually has. That makes the float exactly
    //     "what the participants in this book hold between them", which is what OWN7's rule says
    //     and what the other two carve-outs already implement.
    const realHoldingsByBucket = new Map<string, number>();
    const addReal = (key: string | undefined, usd: number) => {
      if (!key || !(usd > 0)) return;
      realHoldingsByBucket.set(key, (realHoldingsByBucket.get(key) ?? 0) + usd);
    };
    ctx.prevActiveFirms.forEach((c) => {
      if (c.region === regionId && c.bankBalanceSheet) {
        Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {})
          .forEach(([key, usd]) => addReal(key, Number(usd) || 0));
      }
      (c.treasuryHoldings || []).forEach((h) =>
        addReal(bucketOf(h.instrumentId), h.quantityOrNotionalUSD ?? 0));
    });
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      (e.itemizedHoldings || []).forEach((h) => {
        if (h.instrumentType !== 'GOV_BOND' || h.issuerRegion !== regionId) return;
        addReal(bucketOf(h.instrumentId), h.quantityOrNotionalUSD ?? 0);
      });
    });
    if (reg.centralBankSheet) {
      Object.entries(reg.centralBankSheet.sovereignHoldingsByTenor || {})
        .forEach(([key, usd]) => addReal(key, Number(usd) || 0));
    }
    // The desks' own book is held paper like any other: it comes out of what is reservable.
    // (This read named a field that does not exist on the row — `bucketKey` for `tenorKey` —
    // so the dealer's position had never once been subtracted. G3a.)
    (reg.bankingSector.sovBondDealerInventory || []).forEach((pos) => addReal(pos.tenorKey, pos.inventoryUSD));
    activeBuckets.forEach((b) => reserveBucket(b.key, Math.max(0,
      (outstandingByBucket.get(b.key) ?? 0) - (realHoldingsByBucket.get(b.key) ?? 0))));

    const totalOutstandingUSD = activeBuckets.reduce((s, b) => s + (outstandingByBucket.get(b.key) ?? 0), 0) || 1;
    const historyLen = reg.historicalZeroCurves?.length ?? 0;

    const instruments: ClearingInstrument[] = activeBuckets.map((b) => {
      const currentYieldDecimal = reg.zeroRates[b.zeroRateField];
      return {
        id: bucketInstrumentId(regionId, b.key),
        outstandingUSD: outstandingByBucket.get(b.key) ?? 0,
        // XB1 removed the `foreignShare` carve-out, which subtracted an owner that did not
        // exist. OWN7 puts back the carve-out that IS real: what holders outside this book
        // already own (above). Every bidder here is a real holder, so what is left is genuinely
        // in play — and the allocation now sums to the stock rather than past it.
        tradableFloatUSD: Math.max(0,
          (outstandingByBucket.get(b.key) ?? 0) - (nonParticipantByBucket.get(b.key) ?? 0)),
        currentStat: currentYieldDecimal * 10000, // bps
        statKind: 'YIELD_LIKE',
        durationYears: b.years,
        // No floor or ceiling — nominal sovereign yields have gone genuinely negative in real
        // markets; the actual bound is whatever real demand versus supply clears to.
      };
    });

    // Real participants: named banks (own HQLA-liquidity-driven book) + institutional entities
    // (own real target, distributed by relative weight — never an independent number).
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId);

    // XB1: every region's institutions bid here, not just this one's, and each one's target is
    // ITS OWN book — assets x its government-bond allocation x what its mandate allows in this
    // issuer's market. The imposed `institutionalShare x outstanding`, renormalized across a
    // fixed holder set, is gone: it decided the answer the auction is supposed to produce.
    const sovStockByRegion: Record<string, number> = {};
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
      sovStockByRegion[r] = (ctx.updatedRegions[r]?.govDebtTranches || [])
        .filter((t) => t.tenorAtIssuanceYears >= SOV_BILL_MAX_TENOR_YEARS)
        .reduce((a, t) => a + t.principalUSD, 0);
    });
    const biddingEntities = ctx.updatedInstitutionalEntities.filter(
      (e) => mandateAllowsDuration(e.entityType)
        && mandateWeightForIssuer(e.entityType, e.region, regionId, sovStockByRegion) > 0
    );
    const rawEntityTargets = new Map<string, number>(
      biddingEntities.map((e) => [
        e.id,
        e.totalAssetsUSD * e.assetAllocationTarget.govBondPct
          * mandateWeightForIssuer(e.entityType, e.region, regionId, sovStockByRegion),
      ])
    );
    // Banks stay DOMESTIC, and that is a mandate rather than an assigned share: a bank holds its
    // own sovereign as the liquidity buffer its regulator recognises, which is why it does not
    // reach for foreign paper to meet it. OWN3: how MUCH it holds is now its own number too —
    // see `sovereignBookCapacityUSD` / `liquidityDrivenSovereignFloorUSD`. The bills in 07f share
    // that one appetite with the bonds here, so both books apportion it over the whole
    // sovereign stock rather than each over its own half.
    const wholeSovStockUSD = liveTranches.reduce((s2, t) => s2 + Math.max(0, t.principalUSD), 0) || 1;

    /** The instruments THIS auction prices — every other holding passes through untouched. */
    const ownBucketInstrumentIds = new Set(activeBuckets.map((b) => bucketInstrumentId(regionId, b.key)));

    // SCALE C1: positions come off the shared store's GOV_BOND rows. Only the four BOND buckets
    // this auction actually prices are claimed. Bills are instrumentType GOV_BOND too, and clear
    // in 07f — sweeping them in here put them in the rebuilt-from-fills set, so this stage
    // deleted every bill position with no cash leg. Measured as the UK institutional book losing
    // 4.6B of bills in week 7 while its cash did not move. A stage may only rewrite the
    // instruments it cleared — unclaimed rows pass through the write-back untouched.
    const store = ctx.holdingsStore!;
    const entityParticipants: ClearingParticipant[] = biddingEntities.map((entity) => {
      const currentByBucket = new Map<string, number>();
      store.scan(entity.id, 'GOV_BOND', (h) => {
        if (!ownBucketInstrumentIds.has(h.instrumentId)) return false;
        currentByBucket.set(h.instrumentId, (currentByBucket.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        return true;
      });

      // A government bond carries no credit loss, so what a holder needs from it is the real
      // return its liabilities cost plus compensation for the duration it is committing. That is
      // the reservation yield; below it the money is better left at the central bank, which is
      // the same choice the banks below face and the reason the front end tracks policy.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const entityTarget = rawEntityTargets.get(entity.id) ?? 0;
      // The entity's real money for this auction (S11), apportioned across tenor buckets by
      // their share of the market. Banks below carry no such cap: their real constraint is the
      // reserve position S2 already built, not a cash budget.
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'GOV_BOND', pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: entity.id }));
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const bucketShareOfMarket = (outstandingByBucket.get(b.key) ?? 0) / totalOutstandingUSD;
        demandByInstrumentId.set(id, {
          // XB2: a foreign holder hedges this bond, so what it needs from it is its home
          // requirement plus the hedge's cost. Under CIP that is exactly the policy-rate
          // difference — which makes cross-border demand chase the spread over the LOCAL short
          // rate rather than the headline yield.
          reservationStat: computeSovereignReservationYieldBps(reg, b.years, INSTITUTIONAL_PREFERRED_TENOR_YEARS)
            + (entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
                ctx.updatedRegions[entity.region]?.policyRate ?? reg.policyRate, reg.policyRate)),
          maxHoldingUSD: entityTarget * bucketShareOfMarket * MAX_OVERWEIGHT_MULTIPLE,
          fullSizeStatRange: SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS,
          maxNetPurchaseUSD: classBudgetUSD * bucketShareOfMarket,
          // Liability-driven core: an insurer's claim reserves and a pension fund's benefit
          // promises still exist when yields look poor, and something has to match them.
          minHoldingUSD: entityTarget * bucketShareOfMarket * liabilityDrivenCoreShare(entity.entityType),
        });
      });

      return { id: entity.id, currentHoldingsByInstrumentId: currentByBucket, demandByInstrumentId };
    });

    const repoHaircuts = computeSovereignRepoHaircuts(reg);
    const bankParticipants: ClearingParticipant[] = regionBanks.map((bank) => {
      const sheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet!;
      const encumberedFace = encumberedFaceByBucket(reg.repoBook ?? [], bank.ticker);
      const currentByBucket = new Map<string, number>();
      Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
        currentByBucket.set(bucketInstrumentId(regionId, key), Number(v) || 0);
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
      const settledCashUSD = sheet.cashReservesUSD
        + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
      const fundableUSD = Math.min(
        Math.max(0, settledCashUSD - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO)
          + unencumberedBorrowingCapacityUSD(sheet, repoHaircuts, encumberedFace),
        leverageHeadroomUSD(sheet)
      );
      // REPO2: collateral already pledged cannot simultaneously be sold, and the pledge names
      // the paper. The floor is now the face of THIS bucket that is actually encumbered — a
      // blended share withheld thirty-year paper from the two-year book and vice versa.

      // A bank's reservation yield is the administered rate it can earn on reserves instead, plus
      // what it needs for the duration risk a bond carries and cash does not. This is the same
      // bonds-versus-reserves choice that anchors the front end, now expressed as a price rather
      // than as a scaling factor on a quantity target.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const appetiteUSD = sovereignBookCapacityUSD(sheet);
      const liquidityFloorUSD = liquidityDrivenSovereignFloorUSD(sheet);
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const bucketShareOfMarket = (outstandingByBucket.get(b.key) ?? 0) / totalOutstandingUSD;
        const bucketShareOfSovStock = (outstandingByBucket.get(b.key) ?? 0) / wholeSovStockUSD;
        demandByInstrumentId.set(id, {
          reservationStat: reg.policyRate * 10000 + durationPremiumBps(b.years, BANK_PREFERRED_TENOR_YEARS),
          maxHoldingUSD: appetiteUSD * bucketShareOfSovStock,
          fullSizeStatRange: SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS,
          maxNetPurchaseUSD: fundableUSD * bucketShareOfMarket,
          // Two floors, whichever binds: collateral already pledged overnight cannot be sold,
          // and a bank cannot sell below the liquidity its reserves do not already cover.
          minHoldingUSD: Math.max(
            encumberedFace.get(b.key) ?? 0,
            liquidityFloorUSD * bucketShareOfSovStock
          ),
        });
      });

      return { id: bank.ticker, currentHoldingsByInstrumentId: currentByBucket, demandByInstrumentId };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(bucketInstrumentId(regionId, p.tenorKey), p.inventoryUSD));

    // G3a: each bank's govvie desk, distinct from the investment book it also runs above.
    const deskParticipants = buildDealerDeskParticipants({
      ctx, banks: regionBanks, book: BOOK, instruments, spreadBps: DEALER_SPREAD_BPS,
    });
    const deskTickers = deskTickersOf(deskParticipants);

    const result = clearFinancialAsset(
      instruments,
      [...entityParticipants, ...bankParticipants, ...(cbOrder ? [cbOrder.participant] : []), ...deskParticipants],
      priorDealerInventoryById,
      { dealerSpreadBps: DEALER_SPREAD_BPS, maxWeeklyStatMovePct: MAX_WEEKLY_YIELD_MOVE_PCT }
    );
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);
    if (!result.anyCeilingAboveHolding) ctx.deadCeilingBooks.push(`${regionId} sovereign bond`);

    // Apply: real cleared yields -> refit the Nelson-Siegel curve so every other consumer rides
    // on these real points.
    const observedPoints = activeBuckets.map((b) => ({
      tenorYears: b.years,
      yield: (result.newStatById.get(bucketInstrumentId(regionId, b.key)) ?? reg.zeroRates[b.zeroRateField] * 10000) / 10000,
    }));
    const fittedParams = fitNelsonSiegelParams(observedPoints, reg.yieldCurveParams.lambda);
    const newZeroRates = { ...reg.zeroRates };
    activeBuckets.forEach((b) => {
      const point = observedPoints.find((p) => p.tenorYears === b.years)!;
      newZeroRates[b.zeroRateField] = point.yield;
    });
    newZeroRates.tenor3M = calculateNelsonSiegelZeroRate(0.25, fittedParams);
    reg.yieldCurveParams = fittedParams;
    reg.zeroRates = newZeroRates;

    // Apply: each entity's real new holdings — foreign holders included, which is what makes
    // the foreign share a measured outcome rather than a parameter.
    // SCALE C1: fills are appended to the store for the single write-back after 07e. SETL6: the
    // cash leg is settled below as payment instructions.
    biddingEntities.forEach((entity) => {
      const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
      const newGovHoldings: ItemizedHolding[] = [];
      newHoldings.forEach((usd, instrumentId) => {
        if (usd > 1) newGovHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalUSD: usd });
      });
      store.append(entity.id, newGovHoldings);
    });

    // Apply: each bank's real new holdings, keyed back to plain tenor keys, plus the derived
    // scalar total (sovereignBondHoldingsUSD stays the sum of buckets).
    regionBanks.forEach((bank) => {
      const newHoldings = result.newParticipantHoldings.get(bank.ticker) ?? new Map<string, number>();
      const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
      // A clearing stage may only rewrite the instruments it actually cleared (§7.34). This
      // auction prices the four BOND buckets; the bank's BILL buckets (b13/b26/b52, cleared in
      // 07f) pass through untouched. Rebuilding the whole book from this auction's fills
      // deleted every bank's bill position with no cash leg — the exact WS5 bug, fixed on the
      // institutional path at the time and sitting unnoticed here until the per-bank identity
      // invariant existed to catch it (measured: 26.6B of USA bank bills vanished in week 1).
      const newBuckets: Record<string, number> = {};
      Object.entries(existingSheet?.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
        if (!ownBucketInstrumentIds.has(bucketInstrumentId(regionId, key))) newBuckets[key] = Number(v) || 0;
      });
      newHoldings.forEach((usd, instrumentId) => {
        const key = instrumentId.replace(`${regionId}-GOV-`, '');
        newBuckets[key] = usd;
      });
      const prevClearedUSD = activeBuckets.reduce((s, b) => s + (existingSheet?.sovereignBondHoldingsByTenor?.[b.key] ?? 0), 0);
      const newClearedUSD = activeBuckets.reduce((s, b) => s + (newBuckets[b.key] ?? 0), 0);
      const newTotalUSD = Object.values(newBuckets).reduce((s, v) => s + v, 0);
      const cashDeltaUSD = result.netCashDeltaByParticipantId.get(bank.ticker) ?? 0;
      // The dealer fee inside the cash leg is an expense: cash left the bank beyond what the
      // bonds cost, and P&L must say so or the balance-sheet identity drifts by the fee.
      const feeUSD = Math.max(0, -(cashDeltaUSD + (newClearedUSD - prevClearedUSD)));
      if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
      // The securities and the P&L; the reserves leg settles below (SETL6), so that the bank
      // that sold and the bank that bought move against each other rather than each moving
      // alone.
      ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
        ...existingSheet,
        sovereignBondHoldingsByTenor: newBuckets,
        sovereignBondHoldingsUSD: Number(newTotalUSD.toFixed(0)),
        bankEquityUSD: existingSheet!.bankEquityUSD - feeUSD,
      };
    });

    // Apply: the central bank's fills. No cash is debited — it paid with reserves it created,
    // which is what makes a central-bank purchase grow the monetary base instead of moving
    // money between holders. The sellers' cash legs are already credited above.
    // Reset every week even with no order, or the line reports a stale fill forever.
    if (reg.centralBankSheet) {
      reg.centralBankSheet.lastOpenMarketPurchasesUSD = 0;
      reg.centralBankSheet.lastOrderPlacedUSD = cbOrder?.orderedUSD ?? 0;
    }
    if (cbOrder && reg.centralBankSheet) {
      const filled = applyCentralBankFills(
        reg.centralBankSheet, bondBucketKeys, (k) => bucketInstrumentId(regionId, k),
        result.newParticipantHoldings.get(CENTRAL_BANK_PARTICIPANT_ID) ?? new Map<string, number>()
      );
      reg.centralBankSheet.lastOpenMarketPurchasesUSD = Number(filled.toFixed(0));
    }

    // Apply: the desks' inventory, owned by the banks that took it. This auction prices the
    // BOND buckets only — the bill rows (07f's book) pass through, the same partition the
    // banks' own holdings above obey.
    const deskViewById = applyDealerDeskFills({ ctx, banks: regionBanks, book: BOOK, instruments, result });
    const billDealerRows = (reg.bankingSector.sovBondDealerInventory || []).filter((p) => p.tenorKey.startsWith('b'));
    const newDealerInventory: { tenorKey: string; inventoryUSD: number }[] = [];
    deskViewById.forEach((inventoryUSD, instrumentId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ tenorKey: instrumentId.replace(`${regionId}-GOV-`, ''), inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, sovBondDealerInventory: [...newDealerInventory, ...billDealerRows] };

    // SETL6: the book's whole cash side, through the clearing house. The central bank's leg is
    // named and settles to nothing — it pays with reserves it creates, which is what makes an
    // open-market purchase grow the monetary base instead of moving money between holders; the
    // reserves land at the sellers' banks through their own legs above.
    const entityIds = new Set(biddingEntities.map((e) => e.id));
    const bankTickers = new Set(regionBanks.map((b) => b.ticker));
    settleClearedBook(
      ctx, regionId, BOOK,
      result.netCashDeltaByParticipantId,
      (id) => (entityIds.has(id) ? { kind: 'INSTITUTION', id }
        : bankTickers.has(id) ? { kind: 'BANK_SECURITIES', ticker: id }
          : id === CENTRAL_BANK_PARTICIPANT_ID ? { kind: 'CENTRAL_BANK', region: regionId }
            : dealerDeskPartyOf(id, deskTickers)),
      { netCashUSD: result.dealerNetCashUSD, feeUSD: result.totalDealerRevenueUSD },
      feeDesksForRegion(ctx, regionId)
    );
  });
}
