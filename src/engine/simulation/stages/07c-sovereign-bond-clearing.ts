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
import { distributeRealTargetByWeight, SOV_BILL_MAX_TENOR_YEARS } from './shared-helpers';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { WeeklyStepContext } from './context';
import { stagePurchaseBudgetUSD } from './institutional-balance-sheet';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { MAX_OVERWEIGHT_MULTIPLE } from './asset-allocation';

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
const MAX_WEEKLY_YIELD_MOVE_PCT = 0.20;
const SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS = 120;
const DURATION_PREMIUM_BPS_PER_YEAR = 4;
const INSTITUTIONAL_REAL_RETURN_BPS = 150;
// Sovereign bonds are typically the deepest, most liquid instrument in any market.
const BOND_LIQUIDITY_DEPTH = 2;
const DEALER_INVENTORY_PRESSURE_RATE = 0.15;
const DEALER_SPREAD_BPS = 5;
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
    const reg = ctx.updatedRegions[regionId];
    const liveTranches = reg.govDebtTranches || [];
    if (liveTranches.length === 0) return;

    const outstandingByBucket = new Map<string, number>();
    TENOR_BUCKETS.forEach((b) => outstandingByBucket.set(b.key, 0));
    liveTranches.forEach((t) => {
      // Bills (below 2Y) clear in 07f-short-debt-clearing.ts; folding them in here would count
      // the same paper in two markets and hand the two-year bucket a phantom float.
      if (t.tenorAtIssuanceYears < SOV_BILL_MAX_TENOR_YEARS) return;
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
        tradableFloatUSD: (outstandingByBucket.get(b.key) ?? 0) * (reg.sovBondOwnership.bankShare + reg.sovBondOwnership.institutionalShare),
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

      // A government bond carries no credit loss, so what a holder needs from it is the real
      // return its liabilities cost plus compensation for the duration it is committing. That is
      // the reservation yield; below it the money is better left at the central bank, which is
      // the same choice the banks below face and the reason the front end tracks policy.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const entityTarget = rawEntityTargets.get(entity.id) ?? 0;
      // The entity's real money for this auction (S11), apportioned across tenor buckets by
      // their share of the market. Banks below carry no such cap: their real constraint is the
      // reserve position S2 already built, not a cash budget.
      const classBudgetUSD = stagePurchaseBudgetUSD(entity, 'GOV_BOND');
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const bucketShareOfMarket = (outstandingByBucket.get(b.key) ?? 0) / totalOutstandingUSD;
        demandByInstrumentId.set(id, {
          reservationStat: computeSovereignReservationYieldBps(reg, b.years, INSTITUTIONAL_PREFERRED_TENOR_YEARS),
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

    const bankParticipants: ClearingParticipant[] = regionBanks.map((bank) => {
      const sheet = bank.bankBalanceSheet!;
      const currentByBucket = new Map<string, number>();
      Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
        currentByBucket.set(bucketInstrumentId(regionId, key), v);
      });

      // A bank's reservation yield is the administered rate it can earn on reserves instead, plus
      // what it needs for the duration risk a bond carries and cash does not. This is the same
      // bonds-versus-reserves choice that anchors the front end, now expressed as a price rather
      // than as a scaling factor on a quantity target.
      const demandByInstrumentId = new Map<string, ParticipantDemand>();
      const bankTarget = rawBankTargets.get(bank.ticker) ?? 0;
      activeBuckets.forEach((b) => {
        const id = bucketInstrumentId(regionId, b.key);
        const bucketShareOfMarket = (outstandingByBucket.get(b.key) ?? 0) / totalOutstandingUSD;
        demandByInstrumentId.set(id, {
          reservationStat: reg.policyRate * 10000 + durationPremiumBps(b.years, BANK_PREFERRED_TENOR_YEARS),
          maxHoldingUSD: bankTarget * bucketShareOfMarket * MAX_OVERWEIGHT_MULTIPLE,
          fullSizeStatRange: SOVEREIGN_FULL_SIZE_YIELD_RANGE_BPS,
        });
      });

      return { id: bank.ticker, currentHoldingsByInstrumentId: currentByBucket, demandByInstrumentId };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(bucketInstrumentId(regionId, p.tenorKey), p.inventoryUSD));

    const result = clearFinancialAsset(instruments, [...entityParticipants, ...bankParticipants], priorDealerInventoryById, {
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxWeeklyStatMovePct: MAX_WEEKLY_YIELD_MOVE_PCT,
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
        updated.set(entity.id, { ...entity, cashUSD: (entity.cashUSD ?? 0) + (result.netCashDeltaByParticipantId.get(entity.id) ?? 0), itemizedHoldings: [...(otherEntityHoldings.get(entity.id) ?? []), ...newGovHoldings] });
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
      // The cash leg of the bank's own portfolio trading: bonds bought are paid for out of the
      // bank's reserves, bonds sold return to them. Its securities and its money move together.
      ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
        ...existingSheet,
        sovereignBondHoldingsByTenor: newBuckets,
        sovereignBondHoldingsUSD: Number(newTotalUSD.toFixed(0)),
        cashReservesUSD: existingSheet!.cashReservesUSD + (result.netCashDeltaByParticipantId.get(bank.ticker) ?? 0),
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
