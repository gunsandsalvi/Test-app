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
import { NSUB } from './state';
import { SUBSCRIPTION_WEEKLY_CHURN } from '../domain/industry-registry';
import { RECEIPTS_MEASUREMENT_WEIGHT } from '../domain/company';

type ProductLines = NonNullable<Company['productLines']>;
type ConstructionLot = { valueUSD: number; entersServiceWeek: number };

/** The kernel's coupon-due flags, packed. */
export const DUE_BOND = 1, DUE_CP = 2, DUE_LOAN = 4;

export interface FrontPass {
  n: number;
  isActive: Uint8Array;
  /** 1 = this firm's P&L is a profile's; the kernel still runs that dispatch. */
  isProfile: Uint8Array;
  /** The firm's entity-scoped stream position AFTER the front half's one draw. */
  rngAfter: Uint32Array;
  weeklyPayrollUSD: Float64Array;
  annualInterest: Float64Array;
  facilityInterestWeeklyUSD: Float64Array;
  marketBondAccrualUSD: Float64Array;
  commercialPaperAccrualUSD: Float64Array;
  marketLoanAccrualUSD: Float64Array;
  couponDue: Uint8Array;
  effectiveDebtRate: Float64Array;
  capexCommissionedUSD: Float64Array;
  stillUnderConstruction: (ConstructionLot[])[];
  newExecutionQuality: Float64Array;
  carryingCostUSD: Float64Array;
  outputInv: Record<string, { unitsHeld: number; valueUSD: number }>[];
  updatedProductLines: ProductLines[];
  newRevenue: Float64Array;
  measuredInputConsumptionWeeklyUSD: Float64Array;
  newEbitda: Float64Array;
  newEbit: Float64Array;
  newNetIncome: Float64Array;
  newEps: Float64Array;
  taxPaidAnnualRateUSD: Float64Array;
  newInputSupplyConstraintFactor: Float64Array;
  newRecentFulfillmentEMA: Float64Array;
  newRecurringBaseUSD: (number | undefined)[];
  targetProductionUSD: Float64Array;
  costDrivers: (CogsCostDrivers | undefined)[];
}

let scratch: FrontPass | undefined;

function allocScratch(n: number): FrontPass {
  if (scratch && scratch.n >= n) {
    // Object-ref lanes must not leak last week's refs past this week's roster length.
    scratch.stillUnderConstruction.length = n;
    scratch.outputInv.length = n;
    scratch.updatedProductLines.length = n;
    scratch.newRecurringBaseUSD.length = n;
    scratch.costDrivers.length = n;
    return scratch;
  }
  scratch = {
    n,
    isActive: lane8(n),
    isProfile: lane8(n),
    rngAfter: laneU32(n),
    weeklyPayrollUSD: lane64(n),
    annualInterest: lane64(n),
    facilityInterestWeeklyUSD: lane64(n),
    marketBondAccrualUSD: lane64(n),
    commercialPaperAccrualUSD: lane64(n),
    marketLoanAccrualUSD: lane64(n),
    couponDue: lane8(n),
    effectiveDebtRate: lane64(n),
    capexCommissionedUSD: lane64(n),
    stillUnderConstruction: new Array(n),
    newExecutionQuality: lane64(n),
    carryingCostUSD: lane64(n),
    outputInv: new Array(n),
    updatedProductLines: new Array(n),
    newRevenue: lane64(n),
    measuredInputConsumptionWeeklyUSD: lane64(n),
    newEbitda: lane64(n),
    newEbit: lane64(n),
    newNetIncome: lane64(n),
    newEps: lane64(n),
    taxPaidAnnualRateUSD: lane64(n),
    newInputSupplyConstraintFactor: lane64(n),
    newRecentFulfillmentEMA: lane64(n),
    newRecurringBaseUSD: new Array(n),
    targetProductionUSD: lane64(n),
    costDrivers: new Array(n),
  };
  return scratch;
}

export interface FrontPassInputs {
  v2: V2World;
  nextWeek: number;
  companyUpdates: Record<string, CompanyWeekUpdate>;
  updatedRegions: WeeklyStepContext['updatedRegions'];
  /** Frozen pre-loop snapshots, built by the stage exactly as before. */
  supplyRelsByCustomer: Map<string, { supplierCompanyId: string; category: string; weeklyVolumeUSD: number; relationshipStrength: number }[]>;
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
  if (!runFrontSharded(S, O, F, inp.v2)) {
    // §5-SCALE native cores: the C port of runFrontCore, oracle-verified bit-equal; the JS
    // core is the canonical fallback (no addon, NATIVE_KERNELS=0) — one world either way.
    const nativeRan = nativeFrontCore(S, O, F, inp.v2.lots, FRONT_CORE_TABLES, {
      nsub: NSUB, churn: SUBSCRIPTION_WEEKLY_CHURN, weight: RECEIPTS_MEASUREMENT_WEIGHT,
    });
    if (!nativeRan) {
      runFrontCore(S, O, F, inp.v2.lots, inp.v2.lots, undefined, 0, companies.length);
    }
  }
  applyFrontPost(companies, S, O, F, inp.v2, inp.companyUpdates, inp.updatedRegions);
  return F;
}
