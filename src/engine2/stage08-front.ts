/**
 * ENGINE V2 — STAGE 08's FRONT HALF: the pass interface and orchestration (§7.305).
 *
 * The implementation lives in front-core.ts as three phases — SEAM (object reads → typed
 * lanes), CORE (the numeric kernel a worker can run over a row range; no object access) and
 * POST (object writes from the core's outputs). This module owns the stable surface the back
 * kernel consumes: the FrontPass scratch, the coupon-due flags, and the one entry point.
 *
 * THE RNG CONTRACT (unchanged from the inline pass this replaces): the front half draws ONE
 * uniform per active firm, first in the firm's entity-scoped stream — the seam precomputes each
 * firm's opening stream word (rng.ts scopedStreamSeed), the core opens by number and captures
 * the position after the draw, and the back kernel resumes each firm's stream from the capture,
 * so every remaining draw sees the value it always did.
 */

import { Company } from '../types';
import { CogsCostDrivers } from '../engine/companyGenerator';
import { WeeklyStepContext, CompanyWeekUpdate } from '../engine/simulation/stages/context';
import { V2World } from './world';
import { buildFrontSeam, allocCoreOut, runFrontCore, applyFrontPost, FRONT_CORE_TABLES } from './front-core';
import { setSharedLanes, lane64, laneU32, lane8 } from './shared-lanes';
import { frontWorkerCount, runFrontSharded } from './front-pool';
import { nativeFrontCore } from '../engine/simulation/stages/native-kernels';
import { NSUB, SUBUNITS, SUBUNIT_INDEX } from './state';
import { openGoodsPass, closeGoodsPass, goodsUnitsOfSub } from './lots';
import { consumeGoods } from '../engine/ledger/goods-ledger';
import { SUBSCRIPTION_WEEKLY_CHURN } from '../domain/industry-registry';
import { RECEIPTS_MEASUREMENT_WEIGHT } from '../domain/company';

type ProductLines = NonNullable<Company['productLines']>;
import type { ConstructionLot } from '../domain/plant';

/** The kernel's coupon-due flags, packed. */
export const DUE_BOND = 1, DUE_CP = 2, DUE_LOAN = 4;

export interface FrontPass {
  n: number;
  isActive: Uint8Array;
  /** 1 = this firm's P&L is a profile's; the kernel still runs that dispatch. */
  isProfile: Uint8Array;
  /** The firm's entity-scoped stream position AFTER the front half's one draw. */
  rngAfter: Uint32Array;
  weeklyPayrollLocal: Float64Array;
  annualInterest: Float64Array;
  facilityInterestWeeklyLocal: Float64Array;
  marketBondAccrualLocal: Float64Array;
  commercialPaperAccrualLocal: Float64Array;
  marketLoanAccrualLocal: Float64Array;
  couponDue: Uint8Array;
  effectiveDebtRate: Float64Array;
  capexCommissionedLocal: Float64Array;
  stillUnderConstruction: (ConstructionLot[])[];
  newExecutionQuality: Float64Array;
  carryingCostLocal: Float64Array;
  outputInv: Record<string, { unitsHeld: number; valueLocal: number }>[];
  updatedProductLines: ProductLines[];
  newRevenue: Float64Array;
  measuredInputConsumptionWeeklyLocal: Float64Array;
  /** §5-WIRES W4: units drawn from the input lots per (row × NSUB + sub) — the consumption record. */
  inputUnitsConsumed: Float64Array;
  newEbitda: Float64Array;
  newEbit: Float64Array;
  newNetIncome: Float64Array;
  newEps: Float64Array;
  taxPaidAnnualRateLocal: Float64Array;
  newInputSupplyConstraintFactor: Float64Array;
  newRecentFulfillmentEMA: Float64Array;
  newRecurringBaseLocal: (number | undefined)[];
  targetProductionLocal: Float64Array;
  costDrivers: (CogsCostDrivers | undefined)[];
}

let scratch: FrontPass | undefined;

function allocScratch(n: number): FrontPass {
  if (scratch && scratch.n >= n) {
    // §5-WIRES W4: the consumption record ACCUMULATES within the week (+= per recipe input), so
    // a reused scratch starts it at zero — measured: unreset, week 2's record carried week 1's.
    scratch.inputUnitsConsumed.fill(0);
    // Object-ref lanes must not leak last week's refs past this week's roster length.
    scratch.stillUnderConstruction.length = n;
    scratch.outputInv.length = n;
    scratch.updatedProductLines.length = n;
    scratch.newRecurringBaseLocal.length = n;
    scratch.costDrivers.length = n;
    return scratch;
  }
  scratch = {
    n,
    isActive: lane8(n),
    isProfile: lane8(n),
    rngAfter: laneU32(n),
    weeklyPayrollLocal: lane64(n),
    annualInterest: lane64(n),
    facilityInterestWeeklyLocal: lane64(n),
    marketBondAccrualLocal: lane64(n),
    commercialPaperAccrualLocal: lane64(n),
    marketLoanAccrualLocal: lane64(n),
    couponDue: lane8(n),
    effectiveDebtRate: lane64(n),
    capexCommissionedLocal: lane64(n),
    stillUnderConstruction: new Array(n),
    newExecutionQuality: lane64(n),
    carryingCostLocal: lane64(n),
    outputInv: new Array(n),
    updatedProductLines: new Array(n),
    newRevenue: lane64(n),
    measuredInputConsumptionWeeklyLocal: lane64(n),
    inputUnitsConsumed: lane64(n * NSUB),
    newEbitda: lane64(n),
    newEbit: lane64(n),
    newNetIncome: lane64(n),
    newEps: lane64(n),
    taxPaidAnnualRateLocal: lane64(n),
    newInputSupplyConstraintFactor: lane64(n),
    newRecentFulfillmentEMA: lane64(n),
    newRecurringBaseLocal: new Array(n),
    targetProductionLocal: lane64(n),
    costDrivers: new Array(n),
  };
  return scratch;
}

interface FrontPassInputs {
  v2: V2World;
  nextWeek: number;
  companyUpdates: Partial<Record<string, CompanyWeekUpdate>>;
  updatedRegions: WeeklyStepContext['updatedRegions'];
  /** Frozen pre-loop snapshots, built by the stage exactly as before. */
  supplyRelsByCustomer: Map<string, { supplierCompanyId: string; category: string; weeklyVolumeLocal: number; relationshipStrength: number }[]>;
  supplierShockStats: Map<string, { annualRevenue: number; invUSDByCategory: Map<string, number> }>;
  suppliedSubUnitsByRegion: Map<string, Set<string>>;
  companyStore: import('./company-store').CompanyStore;
}

/** Run the front half for every firm: seam, core (sharded when FRONT_WORKERS=n, serial
 *  otherwise — the SAME core either way), post. */
export function runStage08FrontPass(companies: Company[], inp: FrontPassInputs): FrontPass {
  setSharedLanes(frontWorkerCount() >= 2);
  const F = allocScratch(companies.length);
  const S = buildFrontSeam(companies, inp);
  const O = allocCoreOut(S);
  const traceSub = process.env.GOODS_TRACE === '1' ? SUBUNIT_INDEX.get('electricity') : undefined;
  const storeUnitsOf = (si: number): number => goodsUnitsOfSub(inp.v2, si);
  const before = traceSub !== undefined ? storeUnitsOf(traceSub) : 0;
  // §3.13-BOOK f3: the goods are the register's lots; a pass addresses them through a slot view
  // opened here and closed after the core ran — serial, native or sharded, one arithmetic.
  const P = openGoodsPass(inp.v2);
  if (!runFrontSharded(S, O, F, inp.v2, P)) {
    // §5-SCALE native cores: the C port of runFrontCore, oracle-verified bit-equal; the JS
    // core is the canonical fallback (no addon, NATIVE_KERNELS=0) — one world either way.
    const nativeRan = nativeFrontCore(S, O, F, P.views, P.free, FRONT_CORE_TABLES, {
      nsub: NSUB, churn: SUBSCRIPTION_WEEKLY_CHURN, weight: RECEIPTS_MEASUREMENT_WEIGHT,
    });
    if (!nativeRan) {
      runFrontCore(S, O, F, P.views, P.free, undefined, 0, companies.length);
    }
    closeGoodsPass(inp.v2, P);
  }
  if (traceSub !== undefined) {
    let lane = 0; for (let row = 0; row < companies.length; row++) lane += F.inputUnitsConsumed[row * NSUB + traceSub];
    console.log(`  [front-trace] electricity: store before ${before.toFixed(1)} after ${storeUnitsOf(traceSub).toFixed(1)} drawn(store) ${(before - storeUnitsOf(traceSub)).toFixed(1)} lane ${lane.toFixed(1)} firms ${companies.length} rows ${P.nSlots / NSUB}`);
  }
  applyFrontPost(companies, S, O, F, inp.v2, inp.companyUpdates, inp.updatedRegions);
  // §5-WIRES W4: what the recipes drew from the lots this week, recorded on the goods ledger —
  // the transformation half of the stock identity (the lots' own rows moved in the kernel).
  for (let row = 0; row < companies.length; row++) {
    const base = row * NSUB;
    for (let si = 0; si < NSUB; si++) {
      const u = F.inputUnitsConsumed[base + si];
      if (u > 0) consumeGoods(companies[row].region, SUBUNITS[si], u);
    }
  }
  return F;
}
