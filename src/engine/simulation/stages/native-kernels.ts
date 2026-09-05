/**
 * §5-SCALE, the native-cores campaign (§7.308) — the loader and the only gate.
 *
 * Loads `native/build/kernels.node` (built per-machine by `npm run build:native`; the artifact
 * is never committed) and registers each verified C core at its injection point. Everything
 * here is defensive by design: Node-only, absent-addon-silent, and `NATIVE_KERNELS=0` is the
 * kill-switch — in every one of those cases the canonical JS path runs and the world is the
 * same world, because a core may only register after passing the §5-SCALE oracle gate
 * (bit-equal outputs on captured real inputs, then a STATE_DUMP differ at 4 and 13 weeks).
 *
 * Marshaling is positional (arrays of typed arrays in an order fixed here and mirrored in
 * kernels.c) — a name lookup per array per call would be pure overhead on a hot path.
 */
import { createRequire } from 'node:module';
import {
  PackedClearing, KernelShardResult, registerNativeKernel,
 } from './financial-clearing-engine';

interface NativeAddon {
  clearingKernel(
    inArrs: (Float64Array | Uint8Array)[],
    scalars: Float64Array,
    outArrs: (Float64Array | Uint8Array | Int32Array)[],
  ): number;
}

function loadAddon(): NativeAddon | null {
  if (typeof process === 'undefined' || !process.versions.node) return null;
  if (process.env.NATIVE_KERNELS === '0') return null;
  try {
    const req = createRequire(import.meta.url);
    // src/engine/simulation/stages -> repo root
    return req(new URL('../../../../native/build/kernels.node', import.meta.url).pathname) as NativeAddon;
  } catch {
    return null; // addon not built (or not loadable here): the JS path is canonical anyway
  }
}

const addon = loadAddon();

if (addon) {
  const scalars = new Float64Array(5);
  registerNativeKernel((packed: PackedClearing, from: number, to: number): KernelShardResult => {
    const span = to - from;
    const out: KernelShardResult = {
      from, to,
      clearedStat: new Float64Array(span),
      uncleared: new Uint8Array(span),
      dealerInventory: new Float64Array(span),
      primaryWithdrawn: new Uint8Array(span),
      primaryMarketTake: new Float64Array(span),
      hasPrimary: new Uint8Array(span),
      fillInst: new Int32Array(span * packed.pCount),
      fillPart: new Int32Array(span * packed.pCount),
      fillFilled: new Float64Array(span * packed.pCount),
      fillTraded: new Float64Array(span * packed.pCount),
      fillCount: 0,
    };
    scalars[0] = packed.n; scalars[1] = packed.pCount;
    scalars[2] = Number.NaN; scalars[3] = Number.NaN; // §3.26-e-i / §3.19-i: the spread and cap slots are empty; the kernel reads nothing from them
    scalars[4] = packed.unsoldStaysWithHolder ? 1 : 0;
    out.fillCount = addon.clearingKernel(
      [packed.float, packed.offering, packed.withdrawStat, packed.currentStat,
        packed.yieldLike, packed.skip, packed.present,
        packed.dRes, packed.dRange, packed.dMaxH, packed.dMaxNet, packed.dMinH, packed.prevHolding],
      scalars,
      [out.clearedStat, out.dealerInventory, out.primaryWithdrawn,
        out.primaryMarketTake, out.hasPrimary, out.fillInst, out.fillPart,
        out.fillFilled, out.fillTraded, out.uncleared],
    );
    return out;
  });
}

// ---- the stage-08 front core (engine2/front-core.ts runFrontCore, ported) ----

import type { FrontSeam, FrontCoreOut } from '../../../engine2/front-core';
import type { FrontPass } from '../../../engine2/stage08-front';
import type { LotViews, LotFreeList } from '../../../engine2/lots';

interface FrontAddon extends NativeAddon {
  frontCore(
    seam: ArrayBufferView[], tablesAndLots: ArrayBufferView[],
    outs: ArrayBufferView[], scalars: Float64Array,
  ): number;
}

interface FrontCoreTables {
  RECIPE_START: Int32Array; RECIPE_INPUT: Int32Array; RECIPE_INTENSITY: Float64Array;
  HAS_INDUSTRY: Uint8Array; IS_SUBSCRIPTION: Uint8Array; CARRY_RATE_WEEKLY: Float64Array;
  INDUSTRIAL_SET: Uint8Array;
}

/**
 * Run the native front core in place of `runFrontCore` over [0, n). Returns false when the
 * addon is absent (caller falls through to the JS core — one world either way). Mutates the
 * lot table exactly as the JS core does, including the free list via the returned head.
 * The three positional orders below are mirrored in kernels.c — change both or neither.
 */
export function nativeFrontCore(
  S: FrontSeam, O: FrontCoreOut, F: FrontPass, lots: LotViews, free: LotFreeList, tables: FrontCoreTables,
  consts: { nsub: number; churn: number; weight: number },
): boolean {
  const a = addon as FrontAddon | null;
  if (!a || typeof a.frontCore !== 'function') return false;
  const seam: ArrayBufferView[] = [
    S.regionIdx, S.isActive, S.isProfile, S.rngSeed, S.lotRow,
    S.employeeCount, S.offeredWageIndex, S.baselineEmployeeCount, S.totalDebt,
    S.annualRevenue, S.baselineAnnualRevenueResolved, S.ebitda, S.cash, S.currentLiabilities,
    S.marketCap, S.sharesOutstanding, S.growthCapexResolved, S.maintenanceShortfallStreak,
    S.executionQuality0, S.inputConstraint0, S.fulfillEMA0, S.recurringBase0,
    S.baselineGrowthRatioResolved, S.baselineEbitdaMarginResolved, S.depreciationAnnualLocal, S.openingNetPpeLocal, S.taxBasisOpenLocal,
    S.carryforwardLocal, S.usefulLifeYears, S.baselineInputRateSum, S.perWorkerAnnualLocal, S.perWorkerBaselineAnnualLocal,
    S.mktUnitPrice, S.mktCrowding, S.mktExists, S.suppliedMask,
    S.policyRate, S.effectiveTaxRate,
    S.trStart, S.trPrincipal, S.trAnnualRate, S.trIsFloating, S.trIsFacility,
    S.trIsCP, S.trMatWeek, S.trPeriodWeeks, S.trAnchorWeek,
    S.plStart, S.plSub, S.plShare, S.plComp, S.plMktShare,
    S.outStart, S.outSub, S.outValue,
    S.ucStart, S.ucValue, S.ucServiceWeek,
    S.shStart, S.shSupplierRevenue, S.shInvLocal, S.shStrength,
    S.updSalesLocal, S.updHasTargetProd, S.updTargetProdLocal,
  ];
  const tl: ArrayBufferView[] = [
    tables.RECIPE_START, tables.RECIPE_INPUT, tables.RECIPE_INTENSITY,
    tables.HAS_INDUSTRY, tables.IS_SUBSCRIPTION, tables.CARRY_RATE_WEEKLY, tables.INDUSTRIAL_SET,
    lots.units, lots.priceLocal, lots.acquiredWeek, lots.next, lots.head, lots.tail,
  ];
  const outs: ArrayBufferView[] = [
    F.isActive, F.isProfile, F.rngAfter,
    F.weeklyPayrollLocal, F.annualInterest, F.facilityInterestWeeklyLocal,
    F.marketBondAccrualLocal, F.commercialPaperAccrualLocal, F.marketLoanAccrualLocal,
    F.couponDue, F.effectiveDebtRate, F.capexCommissionedLocal, F.newExecutionQuality,
    F.carryingCostLocal, F.newRevenue, F.measuredInputConsumptionWeeklyLocal,
    F.newEbitda, F.newEbit, F.newNetIncome, F.newEps,
    F.taxPaidAnnualRateLocal, F.newInputSupplyConstraintFactor, F.newRecentFulfillmentEMA, F.targetProductionLocal,
    O.plNewComp, O.plNewShare, O.ucKeep,
    O.industrialLineAt, O.badLineAt,
    O.costWage, O.costInput, O.costDecay, O.costCrowd,
    O.taxCarryforwardOut, O.taxBasisOut, O.deferredTaxOut,
    O.hasRecurringOut, O.recurringBaseOut,
  ];
  const scalars = new Float64Array([S.n, S.nextWeek, consts.nsub, consts.churn, consts.weight, free.freeHead]);
  free.freeHead = a.frontCore(seam, tl, outs, scalars);
  return true;
}
