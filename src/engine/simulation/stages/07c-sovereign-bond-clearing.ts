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
import { distributeRealTargetByWeight } from './shared-helpers';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { WeeklyStepContext } from './context';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant } from './financial-clearing-engine';

type ZeroRateField = 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y';
const TENOR_BUCKETS: { key: string; years: number; zeroRateField: ZeroRateField }[] = [
  { key: 't2', years: 2, zeroRateField: 'tenor2Y' },
  { key: 't5', years: 5, zeroRateField: 'tenor5Y' },
  { key: 't10', years: 10, zeroRateField: 'tenor10Y' },
  { key: 't30', years: 30, zeroRateField: 'tenor30Y' },
];

const STRATEGIC_TARGET_DRIFT_RATE = 0.05;
const WEEKLY_TACTICAL_REBALANCE_RATE = 0.20;
const MAX_MOMENTUM_TILT = 0.15;
const MAX_DURATION_TILT = 0.15;
const MOMENTUM_SCALE_BPS = 200;
// Sovereign bonds are typically the deepest, most liquid instrument in any market.
const BOND_LIQUIDITY_DEPTH = 2;
const DEALER_INVENTORY_PRESSURE_RATE = 0.15;
const DEALER_SPREAD_BPS = 5;
const BANK_PREFERRED_TENOR_YEARS = 3; // a bank's HQLA book skews shorter/more liquid than a typical bond investor
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
  reg: { expectedInflation: number },
  bucket: { years: number },
  currentYieldBps: number
): number {
  const realYieldBps = currentYieldBps - reg.expectedInflation * 10000;
  const durationExposure = Math.min(1, bucket.years / LONG_END_TENOR_YEARS);
  return clamp((realYieldBps / REAL_YIELD_SCALE_BPS) * durationExposure, -MAX_INFLATION_TILT, MAX_INFLATION_TILT);
}

export function runSovereignBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const liveTranches = reg.govDebtTranches || [];
    if (liveTranches.length === 0) return;

    const outstandingByBucket = new Map<string, number>();
    TENOR_BUCKETS.forEach((b) => outstandingByBucket.set(b.key, 0));
    liveTranches.forEach((t) => {
      const bucket = TENOR_BUCKETS.reduce((best, b) =>
        Math.abs(b.years - t.tenorAtIssuanceYears) < Math.abs(best.years - t.tenorAtIssuanceYears) ? b : best
      );
      outstandingByBucket.set(bucket.key, (outstandingByBucket.get(bucket.key) ?? 0) + t.principalUSD);
    });

    const activeBuckets = TENOR_BUCKETS.filter((b) => (outstandingByBucket.get(b.key) ?? 0) > 0);
    if (activeBuckets.length === 0) return;
    const totalOutstandingUSD = activeBuckets.reduce((s, b) => s + (outstandingByBucket.get(b.key) ?? 0), 0) || 1;
    const historyLen = reg.historicalZeroCurves?.length ?? 0;

    const instruments: ClearingInstrument[] = activeBuckets.map((b) => {
      const currentYieldDecimal = reg.zeroRates[b.zeroRateField];
      return {
        id: bucketInstrumentId(regionId, b.key),
        outstandingUSD: outstandingByBucket.get(b.key) ?? 0,
        currentStat: currentYieldDecimal * 10000, // work in bps, matching the engine's duration math
        statKind: 'YIELD_LIKE',
        durationYears: b.years,
        statDirection: -1, // yield falls when net buying pushes the bond's price up
        // No floor or ceiling — nominal sovereign yields have gone genuinely negative in real
        // markets; the actual bound is whatever real demand versus supply clears to.
      };
    });

    // Real participants: named banks (own HQLA-liquidity-driven book) + institutional entities
    // (own real target, distributed by relative weight — never an independent number).
    const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet);
    const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId);

    const rawInstitutionalTargetUSD = reg.sovBondOwnership.institutionalShare * totalOutstandingUSD;
    const rawEntityTargets = distributeRealTargetByWeight(
      regionEntities.map((e) => ({ id: e.id, sizeWeight: e.totalAssetsUSD, targetPct: e.assetAllocationTarget.govBondPct })),
      rawInstitutionalTargetUSD
    );
    // Same real, bottom-up derivation for banks: reg.sovBondOwnership.bankShare * the real
    // outstanding stock is the actual, already-bounded aggregate bank claim — never each named
    // bank independently computing depositsUSD * a ratio, which has no structural relationship
    // to how much sovereign debt actually exists and can (and did, before this fix) imply the
    // banking sector wanting several times the entire market.
    const rawBankTargetUSD = reg.sovBondOwnership.bankShare * totalOutstandingUSD;
    const rawBankTargets = distributeRealTargetByWeight(
      regionBanks.map((b) => ({ id: b.ticker, sizeWeight: b.bankBalanceSheet!.depositsUSD, targetPct: 1 })),
      rawBankTargetUSD
    );

    const otherEntityHoldings = new Map<string, ItemizedHolding[]>();
    const entityParticipants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentByBucket = new Map<string, number>();
      const other: ItemizedHolding[] = [];
      entity.itemizedHoldings.forEach((h) => {
        if (h.instrumentType === 'GOV_BOND') {
          currentByBucket.set(h.instrumentId, (currentByBucket.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        } else {
          other.push(h);
        }
      });
      otherEntityHoldings.set(entity.id, other);
      const currentTotalUSD = Array.from(currentByBucket.values()).reduce((s, v) => s + v, 0);
      const rawTargetUSD = rawEntityTargets.get(entity.id) ?? 0;
      const slowTargetUSD = currentTotalUSD + (rawTargetUSD - currentTotalUSD) * STRATEGIC_TARGET_DRIFT_RATE;

      // No standalone "value versus fair yield" signal here (unlike corporate bonds): an
      // independently-invented fair-yield-level formula has no guaranteed relationship to
      // whatever process actually bootstrapped this region's initial curve, and a persistent
      // level mismatch between the two would show up as a systematic, saturating, never-mean-
      // reverting tilt rather than real information — confirmed by testing (it produced a
      // runaway yield spiral). A properly-calibrated fair-value anchor for sovereign curves is a
      // real follow-up, not something to fake here.
      //
      // The recent-yield-change signal below is intentionally mean-reverting, not trend-
      // following, unlike corporate bonds' momentum: a sovereign yield in this model carries no
      // credit/default risk, so a recent rise is purely a valuation event (the bond got cheaper),
      // which a real value-driven bond investor treats as MORE attractive, not a warning sign —
      // there's no "deteriorating fundamentals" story for risk-free debt the way there is for a
      // credit spread. Trend-following here (confirmed by testing) is a genuine runaway: a small
      // initial move gets bought/sold further in the same direction with nothing to turn it
      // around, unlike corporate bonds where a dominant value signal keeps momentum secondary.
      const attractivenessByInstrumentId = new Map<string, number>();
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const currentYieldBps = reg.zeroRates[b.zeroRateField] * 10000;
        const historicalYieldBps = historyLen >= 4 ? reg.historicalZeroCurves[historyLen - 4][b.zeroRateField] * 10000 : currentYieldBps;
        const meanReversionSignal = clamp((currentYieldBps - historicalYieldBps) / MOMENTUM_SCALE_BPS, -MAX_MOMENTUM_TILT, MAX_MOMENTUM_TILT);
        const durationGap = Math.abs(b.years - INSTITUTIONAL_PREFERRED_TENOR_YEARS);
        const durationSignal = clamp(MAX_DURATION_TILT - durationGap * 0.01, -MAX_DURATION_TILT, MAX_DURATION_TILT);
        // What a bond is actually worth to whoever holds it is its REAL yield, so rising
        // inflation expectations make the compensation on offer worse — and worse by more the
        // longer the money is committed, which is why a real term premium widens the curve
        // rather than shifting it in parallel. This is how inflation reaches the long end now
        // that no formula writes beta2.
        attractivenessByInstrumentId.set(id, clamp(meanReversionSignal + durationSignal + realYieldSignal(reg, b, currentYieldBps), -1, 1));
      });

      return {
        id: entity.id,
        targetTotalUSD: slowTargetUSD,
        currentHoldingsByInstrumentId: currentByBucket,
        attractivenessByInstrumentId,
      };
    });

    const bankParticipants: ClearingParticipant[] = regionBanks.map((bank) => {
      const sheet = bank.bankBalanceSheet!;
      const currentByBucket = new Map<string, number>();
      Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
        currentByBucket.set(bucketInstrumentId(regionId, key), v);
      });
      const currentTotalUSD = Array.from(currentByBucket.values()).reduce((s, v) => s + v, 0);
      // A bank's sovereign book and its reserve account at the central bank compete for the same
      // cash: both are high-quality liquid assets, and the central bank pays an administered rate
      // on one of them. So the SIZE of the book, not just its shape, responds to what the curve
      // pays relative to that rate — a tilt across tenors alone can only ever decide which bond
      // to own, never whether to own bonds at all. Without this the front end drifted hundreds of
      // basis points below the policy rate with nothing to stop it: every participant crowded
      // into short paper to escape duration, and no one had the one option a real bank always
      // has, which is to hold the cash instead.
      //
      // Weighted toward the tenors that genuinely substitute for cash, because that is where the
      // choice is actually being made. The bound is structural rather than a price limit: a bank
      // must carry some liquid assets whatever the rate says, and cannot fund an unbounded bond
      // book off its balance sheet.
      const substitutabilityWeights = activeBuckets.map((b) => 1 / (1 + b.years / FRONT_END_SUBSTITUTION_TENOR_YEARS));
      const weightSum = substitutabilityWeights.reduce((sum, w) => sum + w, 0) || 1;
      const cashComparableYieldBps = activeBuckets.reduce(
        (sum, b, i) => sum + reg.zeroRates[b.zeroRateField] * 10000 * substitutabilityWeights[i], 0
      ) / weightSum;
      const reserveSubstitution = clamp(
        (cashComparableYieldBps - reg.policyRate * 10000) / RESERVE_SUBSTITUTION_SCALE_BPS,
        -MAX_RESERVE_SUBSTITUTION,
        MAX_RESERVE_SUBSTITUTION
      );
      // The structural share moves slowly, the way a real strategic allocation does; the
      // bond-versus-reserves choice is layered on top of it rather than inside it, because that
      // is a treasury decision taken on the day the rate changes, not a policy review. Folding it
      // into the slow drift throttled a central-bank hike down to well under half its real
      // pass-through into front-end yields.
      const structuralTargetUSD = rawBankTargets.get(bank.ticker) ?? 0;
      const slowTargetUSD = (currentTotalUSD + (structuralTargetUSD - currentTotalUSD) * STRATEGIC_TARGET_DRIFT_RATE)
        * (1 + reserveSubstitution);

      const attractivenessByInstrumentId = new Map<string, number>();
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const currentYieldBps = reg.zeroRates[b.zeroRateField] * 10000;
        const durationGap = Math.abs(b.years - BANK_PREFERRED_TENOR_YEARS);
        const durationSignal = clamp(MAX_DURATION_TILT - durationGap * 0.02, -MAX_DURATION_TILT, MAX_DURATION_TILT);
        // Real front-end arbitrage, and the reason the policy rate still reaches the curve
        // without anyone writing it there: a bank holding this bond is choosing not to leave the
        // cash at the central bank earning the administered rate (it funds and places at the
        // SRF/ON RRP corridor around exactly that rate). A bond yielding more than the corridor
        // is worth owning; when the central bank hikes past it, the same bond is worth selling.
        // The two are near-perfect substitutes at the front end and barely substitutes at all
        // far out, so the signal fades along the curve — which is why a hike bites hardest on
        // short yields.
        const yieldPickupOverPolicyBps = currentYieldBps - reg.policyRate * 10000;
        const cashSubstitutability = 1 / (1 + b.years / FRONT_END_SUBSTITUTION_TENOR_YEARS);
        const policyCorridorSignal = clamp(
          (yieldPickupOverPolicyBps / POLICY_SPREAD_SCALE_BPS) * cashSubstitutability,
          -MAX_POLICY_TILT,
          MAX_POLICY_TILT
        );
        attractivenessByInstrumentId.set(id, clamp(durationSignal + policyCorridorSignal + realYieldSignal(reg, b, currentYieldBps), -1, 1));
      });

      return {
        id: bank.ticker,
        targetTotalUSD: slowTargetUSD,
        currentHoldingsByInstrumentId: currentByBucket,
        attractivenessByInstrumentId,
      };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(bucketInstrumentId(regionId, p.tenorKey), p.inventoryUSD));

    const result = clearFinancialAsset(instruments, [...entityParticipants, ...bankParticipants], priorDealerInventoryById, {
      weeklyRebalanceRate: WEEKLY_TACTICAL_REBALANCE_RATE,
      liquidityDepth: BOND_LIQUIDITY_DEPTH,
      dealerInventoryPressureRate: DEALER_INVENTORY_PRESSURE_RATE,
      dealerSpreadBps: DEALER_SPREAD_BPS,
    });

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

    // Apply: each entity's real new holdings.
    if (regionEntities.length > 0) {
      const updated = new Map<string, InstitutionalEntity>();
      regionEntities.forEach((entity) => {
        const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
        const newGovHoldings: ItemizedHolding[] = [];
        newHoldings.forEach((usd, instrumentId) => {
          if (usd > 1) newGovHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalUSD: usd });
        });
        updated.set(entity.id, { ...entity, itemizedHoldings: [...(otherEntityHoldings.get(entity.id) ?? []), ...newGovHoldings] });
      });
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => updated.get(e.id) ?? e);
    }

    // Apply: each bank's real new holdings, keyed back to plain tenor keys, plus the derived
    // scalar total (sovereignBondHoldingsUSD stays the sum of buckets).
    regionBanks.forEach((bank) => {
      const newHoldings = result.newParticipantHoldings.get(bank.ticker) ?? new Map<string, number>();
      const newBuckets: Record<string, number> = {};
      newHoldings.forEach((usd, instrumentId) => {
        const key = instrumentId.replace(`${regionId}-GOV-`, '');
        newBuckets[key] = usd;
      });
      const newTotalUSD = Object.values(newBuckets).reduce((s, v) => s + v, 0);
      const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
      if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
      ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
        ...existingSheet,
        sovereignBondHoldingsByTenor: newBuckets,
        sovereignBondHoldingsUSD: Number(newTotalUSD.toFixed(0)),
      };
    });

    // Apply: real dealer inventory + trading revenue, credited to each named bank by market
    // share — same pattern as the corporate-bond dealer desk.
    const newDealerInventory: { tenorKey: string; inventoryUSD: number }[] = [];
    result.newDealerInventoryById.forEach((inventoryUSD, instrumentId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ tenorKey: instrumentId.replace(`${regionId}-GOV-`, ''), inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, sovBondDealerInventory: newDealerInventory };

    if (result.totalDealerRevenueUSD > 0 && regionBanks.length > 0) {
      regionBanks.forEach((bank) => {
        const share = bank.bankMarketShare ?? 1 / Math.max(1, regionBanks.length);
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
        ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
          ...existingSheet,
          bankEquityUSD: existingSheet.bankEquityUSD + result.totalDealerRevenueUSD * share,
        };
      });
    }
  });
}
