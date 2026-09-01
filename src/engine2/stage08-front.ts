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
import { buildFrontSeam, allocCoreOut, runFrontCore, applyFrontPost } from './front-core';

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
    isActive: new Uint8Array(n),
    isProfile: new Uint8Array(n),
    rngAfter: new Uint32Array(n),
    weeklyPayrollUSD: new Float64Array(n),
    annualInterest: new Float64Array(n),
    facilityInterestWeeklyUSD: new Float64Array(n),
    marketBondAccrualUSD: new Float64Array(n),
    commercialPaperAccrualUSD: new Float64Array(n),
    marketLoanAccrualUSD: new Float64Array(n),
    couponDue: new Uint8Array(n),
    effectiveDebtRate: new Float64Array(n),
    capexCommissionedUSD: new Float64Array(n),
    stillUnderConstruction: new Array(n),
    newExecutionQuality: new Float64Array(n),
    carryingCostUSD: new Float64Array(n),
    outputInv: new Array(n),
    updatedProductLines: new Array(n),
    newRevenue: new Float64Array(n),
    measuredInputConsumptionWeeklyUSD: new Float64Array(n),
    newEbitda: new Float64Array(n),
    newEbit: new Float64Array(n),
    newNetIncome: new Float64Array(n),
    newEps: new Float64Array(n),
    taxPaidAnnualRateUSD: new Float64Array(n),
    newInputSupplyConstraintFactor: new Float64Array(n),
    newRecentFulfillmentEMA: new Float64Array(n),
    newRecurringBaseUSD: new Array(n),
    targetProductionUSD: new Float64Array(n),
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
}

/** Run the front half for every firm: seam, core (serial today, shardable), post. */
export function runStage08FrontPass(companies: Company[], inp: FrontPassInputs): FrontPass {
  const F = allocScratch(companies.length);
  const S = buildFrontSeam(companies, inp);
  const O = allocCoreOut(S);
  runFrontCore(S, O, F, inp.v2, 0, companies.length);
  applyFrontPost(companies, S, O, F, inp.companyUpdates, inp.updatedRegions);
  return F;
}
