/**
 * ENGINE V2 — THE FRONT PASS IN THREE PHASES: SEAM → CORE → POST (§7.305, the worker chain).
 *
 * The company week's front half re-shaped so its arithmetic can leave the main thread:
 *
 *   SEAM  — every object read, once, into typed lanes: firm scalars with their ??-defaults
 *           RESOLVED (no sentinel arithmetic in the kernel), the ladder as CSR read-columns,
 *           product lines / output stock / construction queues as CSR, the supply-shock
 *           snapshot flattened, per-week market tables (price, fulfillment, crowding, supplied
 *           bitmask) per (region, sub-unit), and the per-(sector, region) wage rate the payroll
 *           factors into exactly (weeklyWageBillUSD is headcount × per-worker × index ÷ 52, so
 *           the per-worker term is one number per sector-region pair per week — float-identical).
 *
 *   CORE  — the numeric kernel: reads lanes, the static registry tables, the lot table and the
 *           entity-scoped RNG (by precomputed stream word, rng.ts's scopedStreamSeed); touches
 *           NO engine object. This is the function a worker will run over a row range; today it
 *           runs serially on the main thread — one code path, the flag only decides where.
 *
 *   POST  — every object write, once, from the core's outputs: revenue history, the three tax
 *           attributes, the evolved product-line objects, the output-stock record, construction
 *           survivors and the cost-driver rows. Object identity semantics match the inline pass
 *           it replaces except where noted (construction survivors materialise value-equal).
 *
 * Built under the user's no-tests directive (2026-09-01): formulas transplanted verbatim from
 * stage08-front.ts's inline pass; verification deferred to the end-of-build reckoning.
 */

import { Company, RegionId } from '../types';
import { WeeklyStepContext, CompanyWeekUpdate } from '../engine/simulation/stages/context';
import { isActiveCompany } from '../domain/company';
import { CATEGORY_INPUT_REQUIREMENTS } from '../domain/market-microstructure';
import { SUBSCRIPTION_WEEKLY_CHURN } from '../domain/industry-registry';
import { RECEIPTS_MEASUREMENT_WEIGHT } from '../domain/company';
import { industryOfSubUnit, firmInputIntensities, annualCarryingCostRateOf, INDUSTRY_REGISTRY } from '../domain/industry-registry';
import { SECTOR_OCCUPATION_MIX } from '../domain/region-macro';
import { SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../engine/simulation/constants';
import { CogsCostDrivers } from '../engine/companyGenerator';
import { industrialIncome } from '../domain/company-week/income-statement';
import { fulfillmentRatio } from '../domain/company-week/inventory';
import { revHistPush, V2World, rowOf } from './world';
import { ladderRowsOf, TR_FLOATING, TR_CP, TR_FACILITY } from './tranches';
import { LotViews, LotStore, consumeFifoOnViews } from './lots';
import { SUBUNITS, SUBUNIT_INDEX, NSUB } from './state';
import { getBaseAnnualWageUSD } from '../engine/bootstrap/labor-and-wages';
import { PROFILE_REGISTRY, profileKeyOf } from '../engine/simulation/stages/profiles';
import { random, getRngState, setRngState, scopedStreamSeed } from '../engine/rng';
import { lane64, lane32, laneU32, lane8 } from './shared-lanes';
import { FrontPass, DUE_BOND, DUE_CP, DUE_LOAN } from './stage08-front';

const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

type ProductLine = NonNullable<Company['productLines']>[number];

// ---- static registry tables, built once per process (the registry is fixed for a run) ----

/** Per sub-unit: recipe inputs as (input subIdx, intensity) pairs, CSR. */
const RECIPE_START = new Int32Array(NSUB + 1);
const RECIPE_INPUT: number[] = [];
const RECIPE_INTENSITY: number[] = [];
/** Per sub-unit: does ANY industry produce it (the private-segment supply fallback)? */
const HAS_INDUSTRY = new Uint8Array(NSUB);
/** Per sub-unit: subscription revenue mechanism? Carrying-cost weekly rate? */
const IS_SUBSCRIPTION = new Uint8Array(NSUB);
const CARRY_RATE_WEEKLY = new Float64Array(NSUB);
/** The three industrial sub-units the inventory override names. */
const INDUSTRIAL_SET = new Uint8Array(NSUB);
{
  const allSubs = Object.values(INDUSTRY_REGISTRY).flatMap((i) => i.subUnits);
  const mechById = new Map(allSubs.map((su) => [su.unitId, su.revenueMechanism]));
  let at = 0;
  for (let s = 0; s < NSUB; s++) {
    RECIPE_START[s] = at;
    const su = SUBUNITS[s];
    const reqs = CATEGORY_INPUT_REQUIREMENTS[su];
    if (reqs) {
      for (const [inputSu, intensity] of Object.entries(reqs)) {
        const idx = SUBUNIT_INDEX.get(inputSu);
        if (idx === undefined) continue;
        RECIPE_INPUT.push(idx);
        RECIPE_INTENSITY.push(intensity ?? 0);
        at++;
      }
    }
    HAS_INDUSTRY[s] = industryOfSubUnit(su) !== undefined ? 1 : 0;
    IS_SUBSCRIPTION[s] = mechById.get(su) === 'SUBSCRIPTION' ? 1 : 0;
    CARRY_RATE_WEEKLY[s] = annualCarryingCostRateOf(su) / 52;
    if (su === 'heavy_equipment' || su === 'industrial_automation' || su === 'industrial_chemicals') INDUSTRIAL_SET[s] = 1;
  }
  RECIPE_START[NSUB] = at;
}

/** §5-SCALE native cores — the static tables above, typed for the native front core's
 *  marshaling (built once; the registry is fixed for a run). */
export const FRONT_CORE_TABLES = {
  RECIPE_START,
  RECIPE_INPUT: Int32Array.from(RECIPE_INPUT),
  RECIPE_INTENSITY: Float64Array.from(RECIPE_INTENSITY),
  HAS_INDUSTRY,
  IS_SUBSCRIPTION,
  CARRY_RATE_WEEKLY,
  INDUSTRIAL_SET,
};

// ---- the seam's lanes ----

export interface FrontSeam {
  n: number;
  nextWeek: number;
  regionIds: RegionId[];
  /** Firm row -> region index (into regionIds). */
  regionIdx: Int32Array;
  isActive: Uint8Array;
  isProfile: Uint8Array;
  /** The entity scope's opening stream word (rng.ts scopedStreamSeed(comp.id, nextWeek)). */
  rngSeed: Uint32Array;
  /** v2 lot-table row for the firm. */
  lotRow: Int32Array;

  // resolved firm scalars (?? chains applied at the seam)
  employeeCount: Float64Array;
  offeredWageIndex: Float64Array;
  baselineEmployeeCount: Float64Array;
  totalDebt: Float64Array;
  annualRevenue: Float64Array;
  baselineAnnualRevenueResolved: Float64Array; // baselineAnnualRevenue || annualRevenue
  ebitda: Float64Array;
  cash: Float64Array;
  currentLiabilities: Float64Array;
  marketCap: Float64Array;
  sharesOutstanding: Float64Array;
  growthCapexResolved: Float64Array;           // growthCapex ?? capex*0.4
  maintenanceShortfallStreak: Float64Array;
  executionQuality0: Float64Array;             // ?? 1.0
  inputConstraint0: Float64Array;              // ?? 1.0
  fulfillEMA0: Float64Array;                   // ?? 1.0
  recurringBase0: Float64Array;                // NaN = undefined
  baselineGrowthRatioResolved: Float64Array;   // ?? growthCapexResolved / max(1, annualRevenue)
  baselineEbitdaMarginResolved: Float64Array;  // ?? ebitda / max(1, annualRevenue)
  openingGrossPpeUSD: Float64Array;
  openingNetPpeUSD: Float64Array;
  taxBasisOpenUSD: Float64Array;               // ?? openingNet
  carryforwardUSD: Float64Array;               // ?? 0
  usefulLifeYears: Float64Array;               // sector table ?? 12
  baselineInputRateSum: Float64Array;          // Σ firmInputIntensities values
  /** Per (sector-region pair resolved at seam): the wage-bill per-worker annual terms. */
  perWorkerAnnualUSD: Float64Array;            // at this week's pools, per firm
  perWorkerBaselineAnnualUSD: Float64Array;    // at reference pools, per firm

  // per-week region×sub-unit market tables
  mktUnitPrice: Float64Array;   // ?? 1
  mktFulfill: Float64Array;     // ?? 1
  mktCrowding: Float64Array;    // ?? 0
  mktExists: Uint8Array;
  suppliedMask: Uint8Array;     // region×NSUB: a real public supplier exists

  // per-week policy/tax per region
  policyRate: Float64Array;
  effectiveTaxRate: Float64Array;

  // ladder CSR (read-only view of comp.debtTranches, resolved)
  trStart: Int32Array;          // n+1
  trPrincipal: Float64Array;
  trAnnualRate: Float64Array;   // FIXED: coupon ?? 0.05 (rate itself); FLOATING: margin/1e4 term ADDED to policy at core
  trIsFloating: Uint8Array;
  trIsFacility: Uint8Array;
  trIsCP: Uint8Array;
  trMatWeek: Int32Array;
  trPeriodWeeks: Int32Array;    // max(1, round(52/perYear)) resolved
  trAnchorWeek: Int32Array;     // ?? 0

  // product lines CSR
  plStart: Int32Array;          // n+1
  plSub: Int32Array;
  plShare: Float64Array;
  plComp: Float64Array;
  plMktShare: Float64Array;

  // output stock CSR (record entries in order)
  outStart: Int32Array;
  outSub: Int32Array;
  outUnits: Float64Array;
  outValue: Float64Array;

  // construction CSR (assets then update capex, in order)
  ucStart: Int32Array;
  ucValue: Float64Array;
  ucServiceWeek: Int32Array;

  // supply-shock CSR
  shStart: Int32Array;
  shSupplierRevenue: Float64Array;
  shInvUSD: Float64Array;
  shStrength: Float64Array;

  // update scalars
  updSalesUSD: Float64Array;
  updHasTargetProd: Uint8Array;
  updTargetProdUSD: Float64Array;
}

/** The core's extra outputs the post phase materialises into objects. */
export interface FrontCoreOut {
  /** Per product line (parallel to the seam's pl CSR). */
  plNewComp: Float64Array;
  plNewShare: Float64Array;
  /** Per output-stock entry: the carrying-decayed value. */
  outNewValue: Float64Array;
  /** Per construction entry: 1 = still under construction. */
  ucKeep: Uint8Array;
  /** Line index (within the firm's CSR span) of the industrial override line, -1 = none. */
  industrialLineAt: Int32Array;
  /** A line whose category is missing from the region's demand table (fatal, thrown in post). */
  badLineAt: Int32Array;
  costWage: Float64Array;
  costInput: Float64Array;
  costDecay: Float64Array;
  costCrowd: Float64Array;
  taxCarryforwardOut: Float64Array;
  taxBasisOut: Float64Array;
  deferredTaxOut: Float64Array;
  hasRecurringOut: Uint8Array;
  recurringBaseOut: Float64Array;
}

const EMPTY_LINES: ProductLine[] = [];

/** Everything the seam reads beyond the companies themselves. */
export interface FrontSeamInputs {
  v2: V2World;
  nextWeek: number;
  companyUpdates: Record<string, CompanyWeekUpdate>;
  updatedRegions: WeeklyStepContext['updatedRegions'];
  supplyRelsByCustomer: Map<string, { supplierCompanyId: string; category: string; weeklyVolumeUSD: number; relationshipStrength: number }[]>;
  supplierShockStats: Map<string, { annualRevenue: number; invUSDByCategory: Map<string, number> }>;
  suppliedSubUnitsByRegion: Map<string, Set<string>>;
  companyStore: import('./company-store').CompanyStore;
}

export function buildFrontSeam(companies: Company[], inp: FrontSeamInputs): FrontSeam {
  const { v2, nextWeek, companyUpdates, updatedRegions, supplyRelsByCustomer, supplierShockStats, suppliedSubUnitsByRegion, companyStore } = inp;
  // §4.C Stage II.3a — the scalar block reads the company row store (refreshed by stage 08
  // just before this pass, so validity is by construction). NaN is the store's undefined; the
  // `??`/`||` resolutions below replay the object reads' semantics exactly.
  const CN = companyStore.num;
  const nn = (v: number, d: number): number => (Number.isNaN(v) ? d : v);
  const n = companies.length;
  const regionIds = Object.keys(updatedRegions) as RegionId[];
  const regionIndex = new Map(regionIds.map((r, i) => [r, i]));
  const R = regionIds.length;

  // counts first, so the CSRs allocate once
  let nTr = 0, nPl = 0, nOut = 0, nUc = 0, nSh = 0;
  for (const c of companies) {
    nTr += ladderRowsOf(v2, c.id).length;
    nPl += c.productLines?.length ?? 0;
    nOut += Object.keys(c.outputInventoryBySubUnit || {}).length;
    nUc += (c.assetsUnderConstruction?.length ?? 0) + (companyUpdates[c.ticker]?.capexUnderConstruction?.length ?? 0);
    nSh += supplyRelsByCustomer.get(c.id)?.length ?? 0;
  }

  const S: FrontSeam = {
    n, nextWeek, regionIds,
    regionIdx: lane32(n),
    isActive: lane8(n),
    isProfile: lane8(n),
    rngSeed: laneU32(n),
    lotRow: lane32(n),
    employeeCount: lane64(n),
    offeredWageIndex: lane64(n),
    baselineEmployeeCount: lane64(n),
    totalDebt: lane64(n),
    annualRevenue: lane64(n),
    baselineAnnualRevenueResolved: lane64(n),
    ebitda: lane64(n),
    cash: lane64(n),
    currentLiabilities: lane64(n),
    marketCap: lane64(n),
    sharesOutstanding: lane64(n),
    growthCapexResolved: lane64(n),
    maintenanceShortfallStreak: lane64(n),
    executionQuality0: lane64(n),
    inputConstraint0: lane64(n),
    fulfillEMA0: lane64(n),
    recurringBase0: lane64(n),
    baselineGrowthRatioResolved: lane64(n),
    baselineEbitdaMarginResolved: lane64(n),
    openingGrossPpeUSD: lane64(n),
    openingNetPpeUSD: lane64(n),
    taxBasisOpenUSD: lane64(n),
    carryforwardUSD: lane64(n),
    usefulLifeYears: lane64(n),
    baselineInputRateSum: lane64(n),
    perWorkerAnnualUSD: lane64(n),
    perWorkerBaselineAnnualUSD: lane64(n),
    mktUnitPrice: lane64(R * NSUB),
    mktFulfill: lane64(R * NSUB),
    mktCrowding: lane64(R * NSUB),
    mktExists: lane8(R * NSUB),
    suppliedMask: lane8(R * NSUB),
    policyRate: lane64(R),
    effectiveTaxRate: lane64(R),
    trStart: lane32(n + 1),
    trPrincipal: lane64(nTr),
    trAnnualRate: lane64(nTr),
    trIsFloating: lane8(nTr),
    trIsFacility: lane8(nTr),
    trIsCP: lane8(nTr),
    trMatWeek: lane32(nTr),
    trPeriodWeeks: lane32(nTr),
    trAnchorWeek: lane32(nTr),
    plStart: lane32(n + 1),
    plSub: lane32(nPl),
    plShare: lane64(nPl),
    plComp: lane64(nPl),
    plMktShare: lane64(nPl),
    outStart: lane32(n + 1),
    outSub: lane32(nOut),
    outUnits: lane64(nOut),
    outValue: lane64(nOut),
    ucStart: lane32(n + 1),
    ucValue: lane64(nUc),
    ucServiceWeek: lane32(nUc),
    shStart: lane32(n + 1),
    shSupplierRevenue: lane64(nSh),
    shInvUSD: lane64(nSh),
    shStrength: lane64(nSh),
    updSalesUSD: lane64(n),
    updHasTargetProd: lane8(n),
    updTargetProdUSD: lane64(n),
  };

  // per-week region tables
  for (let ri = 0; ri < R; ri++) {
    const reg = updatedRegions[regionIds[ri]];
    S.policyRate[ri] = reg.policyRate;
    S.effectiveTaxRate[ri] = reg.effectiveTaxRate;
    const supplied = suppliedSubUnitsByRegion.get(regionIds[ri]);
    for (let si = 0; si < NSUB; si++) {
      const cd = reg.categoryDemand[SUBUNITS[si]];
      const at = ri * NSUB + si;
      if (cd) {
        S.mktExists[at] = 1;
        S.mktUnitPrice[at] = cd.unitPriceUSD ?? 1;
        S.mktFulfill[at] = cd._fulfillmentRatio ?? 1;
        S.mktCrowding[at] = cd.crowdingIntensity ?? 0;
      } else {
        S.mktUnitPrice[at] = 1;
        S.mktFulfill[at] = 1;
      }
      if (supplied?.has(SUBUNITS[si])) S.suppliedMask[at] = 1;
    }
  }

  // per-(sector, region) wage terms this week — the payroll's own factorisation
  const perWorkerBySectorRegion = new Map<string, { now: number; base: number }>();
  const perWorkerOf = (sector: string, region: RegionId): { now: number; base: number } => {
    const key = sector + '|' + region;
    let v = perWorkerBySectorRegion.get(key);
    if (v === undefined) {
      const mix = SECTOR_OCCUPATION_MIX[sector as keyof typeof SECTOR_OCCUPATION_MIX] ?? { GENERAL: 1.0 };
      const baseWage = getBaseAnnualWageUSD(region);
      const pools = updatedRegions[region].occupationPools;
      // THE SAME Σ weeklyWageBillUSD folds, taken once — reckoning step 1 caught the first form
      // of this (annual/52 × 52) drifting the whole cash walk by one ULP per firm.
      let now = 0, base = 0;
      for (const occ of Object.keys(mix) as (keyof typeof mix)[]) {
        const share = mix[occ] ?? 0;
        if (share <= 0) continue;
        now += share * (baseWage[occ] ?? 0) * (pools[occ]?.wageIndex ?? 1);
        base += share * (baseWage[occ] ?? 0) * 1;
      }
      v = { now, base };
      perWorkerBySectorRegion.set(key, v);
    }
    return v;
  };

  let atTr = 0, atPl = 0, atOut = 0, atUc = 0, atSh = 0;
  for (let row = 0; row < n; row++) {
    const comp = companies[row];
    S.trStart[row] = atTr; S.plStart[row] = atPl; S.outStart[row] = atOut;
    S.ucStart[row] = atUc; S.shStart[row] = atSh;
    S.rngSeed[row] = scopedStreamSeed(comp.id, nextWeek);
    const active = isActiveCompany(comp);
    S.isActive[row] = active ? 1 : 0;
    if (!active) continue;
    const ri = regionIndex.get(comp.region as RegionId) ?? 0;
    S.regionIdx[row] = ri;
    S.isProfile[row] = PROFILE_REGISTRY[profileKeyOf(comp)] ? 1 : 0;
    S.lotRow[row] = rowOf(v2, comp.id);

    const empl = CN.employeeCount[row];
    S.employeeCount[row] = empl;
    S.offeredWageIndex[row] = nn(CN.offeredWageIndex[row], 1.0);
    S.baselineEmployeeCount[row] = nn(CN.baselineEmployeeCount[row], empl);
    S.totalDebt[row] = CN.totalDebt[row];
    const annualRev = CN.annualRevenue[row];
    S.annualRevenue[row] = annualRev;
    S.baselineAnnualRevenueResolved[row] = CN.baselineAnnualRevenue[row] || annualRev;
    const ebitdaV = CN.ebitda[row];
    S.ebitda[row] = ebitdaV;
    S.cash[row] = CN.cash[row];
    S.currentLiabilities[row] = CN.currentLiabilities[row];
    S.marketCap[row] = CN.marketCap[row];
    S.sharesOutstanding[row] = CN.sharesOutstanding[row];
    const growthCapexResolved = nn(CN.growthCapex[row], CN.capex[row] * 0.4);
    S.growthCapexResolved[row] = growthCapexResolved;
    S.maintenanceShortfallStreak[row] = nn(CN.maintenanceShortfallStreak[row], 0);
    S.executionQuality0[row] = nn(CN.executionQuality[row], 1.0);
    S.inputConstraint0[row] = nn(CN.inputSupplyConstraintFactor[row], 1.0);
    S.fulfillEMA0[row] = nn(CN.recentFulfillmentEMA[row], 1.0);
    S.recurringBase0[row] = CN.recurringRevenueBaseUSD[row];
    S.baselineGrowthRatioResolved[row] = nn(CN.baselineGrowthCapexToRevenueRatio[row],
      growthCapexResolved / Math.max(1, annualRev));
    S.baselineEbitdaMarginResolved[row] = nn(CN.baselineEbitdaMargin[row], ebitdaV / Math.max(1, annualRev));
    const openingGross = nn(CN.grossPPEUSD[row], annualRev * (SECTOR_PPE_INTENSITY[comp.sector] ?? 0.5));
    S.openingGrossPpeUSD[row] = openingGross;
    const openingNet = Math.max(0, openingGross - nn(CN.accumulatedDepreciationUSD[row], openingGross * 0.45));
    S.openingNetPpeUSD[row] = openingNet;
    S.taxBasisOpenUSD[row] = nn(CN.taxBasisPpeUSD[row], openingNet);
    S.carryforwardUSD[row] = nn(CN.taxLossCarryforwardUSD[row], 0);
    S.usefulLifeYears[row] = SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12;
    S.baselineInputRateSum[row] = Object.values(firmInputIntensities(comp.productLines, profileKeyOf(comp)))
      .reduce((a, b) => a + b, 0);
    const pw = perWorkerOf(comp.sector, comp.region as RegionId);
    S.perWorkerAnnualUSD[row] = pw.now;
    S.perWorkerBaselineAnnualUSD[row] = pw.base;

    // §7.311 — the ladder lanes fill from the row store (chain order = array order); the
    // resolved defaults are the same expressions with NaN as the absent sentinel.
    {
      const TS = v2.tranches;
      for (const tr of ladderRowsOf(v2, comp.id)) {
        S.trPrincipal[atTr] = TS.principalUSD[tr];
        const fl = TS.flags[tr];
        const floating = (fl & TR_FLOATING) !== 0;
        S.trIsFloating[atTr] = floating ? 1 : 0;
        S.trAnnualRate[atTr] = floating
          ? (Number.isNaN(TS.floatingMarginBps[tr]) ? 200 : TS.floatingMarginBps[tr]) / 10000
          : (Number.isNaN(TS.couponRate[tr]) ? 0.05 : TS.couponRate[tr]);
        S.trIsFacility[atTr] = fl & TR_FACILITY ? 1 : 0;
        S.trIsCP[atTr] = fl & TR_CP ? 1 : 0;
        S.trMatWeek[atTr] = TS.maturityWeek[tr] | 0;
        const perYear = !Number.isNaN(TS.paymentsPerYear[tr]) ? Math.max(1, TS.paymentsPerYear[tr])
          : ((fl & TR_CP) ? 1 : (!floating ? 2 : 4));
        S.trPeriodWeeks[atTr] = Math.max(1, Math.round(52 / perYear));
        S.trAnchorWeek[atTr] = (Number.isNaN(TS.paymentAnchorWeek[tr]) ? 0 : TS.paymentAnchorWeek[tr]) | 0;
        atTr++;
      }
    }
    for (const l of comp.productLines || []) {
      S.plSub[atPl] = SUBUNIT_INDEX.get(l.subUnitId) ?? -1;
      S.plShare[atPl] = l.revenueShare;
      S.plComp[atPl] = l.competitiveness;
      S.plMktShare[atPl] = l.categoryMarketShare;
      atPl++;
    }
    for (const [su, inv] of Object.entries(comp.outputInventoryBySubUnit || {})) {
      S.outSub[atOut] = SUBUNIT_INDEX.get(su) ?? -1;
      S.outUnits[atOut] = inv.unitsHeld;
      S.outValue[atOut] = inv.valueUSD;
      atOut++;
    }
    const update = companyUpdates[comp.ticker];
    for (const lot of comp.assetsUnderConstruction ?? []) {
      S.ucValue[atUc] = lot.valueUSD; S.ucServiceWeek[atUc] = lot.entersServiceWeek | 0; atUc++;
    }
    for (const lot of update?.capexUnderConstruction ?? []) {
      S.ucValue[atUc] = lot.valueUSD; S.ucServiceWeek[atUc] = lot.entersServiceWeek | 0; atUc++;
    }
    for (const rel of supplyRelsByCustomer.get(comp.id) ?? []) {
      const stats = supplierShockStats.get(rel.supplierCompanyId);
      S.shSupplierRevenue[atSh] = stats ? stats.annualRevenue : NaN;
      S.shInvUSD[atSh] = stats ? (stats.invUSDByCategory.get(rel.category) ?? NaN) : NaN;
      S.shStrength[atSh] = rel.relationshipStrength;
      atSh++;
    }
    S.updSalesUSD[row] = update?.salesUSD ?? 0;
    if (update?._targetProductionUSD !== undefined) {
      S.updHasTargetProd[row] = 1;
      S.updTargetProdUSD[row] = update._targetProductionUSD;
    }
  }
  S.trStart[n] = atTr; S.plStart[n] = atPl; S.outStart[n] = atOut;
  S.ucStart[n] = atUc; S.shStart[n] = atSh;
  return S;
}

export function allocCoreOut(S: FrontSeam): FrontCoreOut {
  const n = S.n;
  return {
    plNewComp: lane64(S.plStart[n]),
    plNewShare: lane64(S.plStart[n]),
    outNewValue: lane64(S.outStart[n]),
    ucKeep: lane8(S.ucStart[n]),
    industrialLineAt: lane32(n).fill(-1),
    badLineAt: lane32(n).fill(-1),
    costWage: lane64(n),
    costInput: lane64(n),
    costDecay: lane64(n),
    costCrowd: lane64(n),
    taxCarryforwardOut: lane64(n),
    taxBasisOut: lane64(n),
    deferredTaxOut: lane64(n),
    hasRecurringOut: lane8(n),
    recurringBaseOut: lane64(n),
  };
}

/**
 * THE NUMERIC CORE — one row range of the front half, objects untouched. The same statements
 * the inline pass ran, on lanes; every ??-default was resolved at the seam, every registry fact
 * is a static table, the RNG opens by stream word. A worker runs exactly this over its shard.
 */
export function runFrontCore(
  S: FrontSeam, O: FrontCoreOut, F: FrontPass,
  lots: LotViews, freeInto: LotStore | null, deadSink: number[] | undefined,
  lo: number, hi: number
): void {
  const week = S.nextWeek;
  for (let row = lo; row < hi; row++) {
    if (!S.isActive[row]) {
      F.isActive[row] = 0;
      F.isProfile[row] = 0;
      F.rngAfter[row] = S.rngSeed[row];
      continue;
    }
    F.isActive[row] = 1;
    const ri = S.regionIdx[row];
    const mktBase = ri * NSUB;

    // payroll — headcount × per-worker × index ÷ 52, the factorised identity
    const weeklyPayrollUSD = S.employeeCount[row] > 0
      ? (S.employeeCount[row] * S.perWorkerAnnualUSD[row] * S.offeredWageIndex[row]) / 52 : 0;
    const baselineWeeklyPayrollUSD = S.baselineEmployeeCount[row] > 0
      ? (S.baselineEmployeeCount[row] * S.perWorkerBaselineAnnualUSD[row] * 1) / 52 : 0;
    F.weeklyPayrollUSD[row] = weeklyPayrollUSD;

    // the ladder walk on read-columns
    let annualInterest = 0, facilityInterestWeeklyUSD = 0;
    let marketBondAccrualUSD = 0, commercialPaperAccrualUSD = 0, marketLoanAccrualUSD = 0;
    let due3 = 0;
    const policy = S.policyRate[ri];
    for (let t = S.trStart[row]; t < S.trStart[row + 1]; t++) {
      if (S.trMatWeek[t] === week) continue;
      const annualUSD = S.trIsFloating[t]
        ? S.trPrincipal[t] * (policy + S.trAnnualRate[t])
        : S.trPrincipal[t] * S.trAnnualRate[t];
      annualInterest += annualUSD;
      let due: boolean;
      if (S.trIsCP[t]) due = S.trMatWeek[t] === week;
      else {
        const since = week - S.trAnchorWeek[t];
        due = since > 0 && since % S.trPeriodWeeks[t] === 0;
      }
      const dueUSD = due ? (annualUSD * S.trPeriodWeeks[t]) / 52 : 0;
      if (S.trIsFacility[t]) { facilityInterestWeeklyUSD += dueUSD; continue; }
      if (S.trIsCP[t]) { commercialPaperAccrualUSD += annualUSD / 52; if (due) due3 |= DUE_CP; }
      else if (!S.trIsFloating[t]) { marketBondAccrualUSD += annualUSD / 52; if (due) due3 |= DUE_BOND; }
      else { marketLoanAccrualUSD += annualUSD / 52; if (due) due3 |= DUE_LOAN; }
    }
    F.annualInterest[row] = annualInterest;
    F.facilityInterestWeeklyUSD[row] = facilityInterestWeeklyUSD;
    F.marketBondAccrualUSD[row] = marketBondAccrualUSD;
    F.commercialPaperAccrualUSD[row] = commercialPaperAccrualUSD;
    F.marketLoanAccrualUSD[row] = marketLoanAccrualUSD;
    F.couponDue[row] = due3;
    const effectiveDebtRate = annualInterest / Math.max(1, S.totalDebt[row]);
    F.effectiveDebtRate[row] = effectiveDebtRate;

    // commissioning on the construction CSR
    let commissionedUSD = 0;
    for (let u = S.ucStart[row]; u < S.ucStart[row + 1]; u++) {
      if (S.ucServiceWeek[u] <= week) commissionedUSD += S.ucValue[u];
      else O.ucKeep[u] = 1;
    }
    F.capexCommissionedUSD[row] = commissionedUSD;

    // carrying cost on the output CSR (entry order = the record's key order)
    let carryingCostUSD = 0;
    for (let o = S.outStart[row]; o < S.outStart[row + 1]; o++) {
      const costUSD = S.outValue[o] * (S.outSub[o] >= 0 ? CARRY_RATE_WEEKLY[S.outSub[o]] : 0);
      carryingCostUSD += costUSD;
      O.outNewValue[o] = Math.max(0, S.outValue[o] - costUSD);
    }
    F.carryingCostUSD[row] = carryingCostUSD;

    // the front half's one draw, in the firm's own stream
    const savedStream = getRngState();
    setRngState(S.rngSeed[row]);
    const executionNoise = (random() - 0.5) * 0.3;
    const newExecutionQuality = (S.executionQuality0[row] * 0.92 + 1.0 * 0.08 + executionNoise * 0.08);
    F.newExecutionQuality[row] = newExecutionQuality;
    F.rngAfter[row] = getRngState();
    setRngState(savedStream);

    if (S.isProfile[row]) {
      F.isProfile[row] = 1;
      F.newRevenue[row] = 0;
      F.measuredInputConsumptionWeeklyUSD[row] = 0;
      F.newEbitda[row] = 0; F.newEbit[row] = 0; F.newNetIncome[row] = 0; F.newEps[row] = 0;
      F.taxPaidAnnualRateUSD[row] = 0;
      F.newInputSupplyConstraintFactor[row] = S.inputConstraint0[row];
      F.newRecentFulfillmentEMA[row] = S.fulfillEMA0[row];
      F.targetProductionUSD[row] = 0;
      continue;
    }
    F.isProfile[row] = 0;

    const annualRevenue = S.annualRevenue[row];
    const baseRev = S.baselineAnnualRevenueResolved[row];
    const capacityDecayPenalty = Math.min(0.08, S.maintenanceShortfallStreak[row] * 0.003);

    const plLo = S.plStart[row], plHi = S.plStart[row + 1];
    let avgCrowdingIntensity = 0;
    for (let p = plLo; p < plHi; p++) {
      const si = S.plSub[p];
      avgCrowdingIntensity += (si >= 0 && S.mktExists[mktBase + si] ? S.mktCrowding[mktBase + si] : 0) * S.plShare[p];
    }

    // fulfillment + FIFO over the static recipe CSR, in line order then recipe-entry order
    let relevantFulfillment = 1;
    let sawNeedingLine = false;
    for (let p = plLo; p < plHi; p++) {
      const si = S.plSub[p];
      if (si < 0 || RECIPE_START[si] === RECIPE_START[si + 1]) continue;
      sawNeedingLine = true;
      const f = S.mktExists[mktBase + si] ? S.mktFulfill[mktBase + si] : 1;
      if (f < relevantFulfillment) relevantFulfillment = f;
    }
    if (!sawNeedingLine) relevantFulfillment = 1;

    let physicalFulfillment = 1.0;
    let realInputConsumptionCostUSD = 0;
    const lotRow = S.lotRow[row];
    for (let p = plLo; p < plHi; p++) {
      const si = S.plSub[p];
      if (si < 0) continue;
      const rLo = RECIPE_START[si], rHi = RECIPE_START[si + 1];
      if (rLo === rHi) continue;
      const lineProductionUSD = (annualRevenue / 52) * S.plShare[p];
      for (let r = rLo; r < rHi; r++) {
        const inputSi = RECIPE_INPUT[r];
        const neededUSD = lineProductionUSD * RECIPE_INTENSITY[r];
        if (neededUSD <= 0) continue;
        const hasRealSupply = S.suppliedMask[mktBase + inputSi] === 1 || HAS_INDUSTRY[inputSi] === 1;
        if (!hasRealSupply) continue;
        const inputUnitPrice = S.mktExists[mktBase + inputSi] ? S.mktUnitPrice[mktBase + inputSi] : 1;
        const neededUnits = neededUSD / Math.max(0.01, inputUnitPrice);
        const drawn = consumeFifoOnViews(lots, lotRow, inputSi, neededUnits, freeInto, deadSink);
        physicalFulfillment = Math.min(physicalFulfillment, fulfillmentRatio(drawn.availableUnits, neededUnits));
        for (const lotCostUSD of drawn.costsUSD) realInputConsumptionCostUSD += lotCostUSD;
      }
    }
    const combinedFulfillment = Math.min(relevantFulfillment, physicalFulfillment);
    F.measuredInputConsumptionWeeklyUSD[row] = realInputConsumptionCostUSD;
    let newInputSupplyConstraintFactor = (S.inputConstraint0[row] * 0.7 + combinedFulfillment * 0.3);

    for (let sh = S.shStart[row]; sh < S.shStart[row + 1]; sh++) {
      const rev = S.shSupplierRevenue[sh];
      const inv = S.shInvUSD[sh];
      if (inv > rev * 0.15) {
        const distress = (inv / (rev * 0.15)) - 1;
        newInputSupplyConstraintFactor *= (1 - Math.min(0.2, distress * S.shStrength[sh] * 0.1));
      }
    }

    const baseEbitdaMargin = S.ebitda[row] / Math.max(1, annualRevenue);
    const baselineMargin = S.baselineEbitdaMarginResolved[row];
    const otherOpexRate = 1 - baselineMargin - S.baselineInputRateSum[row]
      - (baselineWeeklyPayrollUSD * 52) / Math.max(1, baseRev);
    const newEbitdaMargin = 1 - (realInputConsumptionCostUSD * 52 + weeklyPayrollUSD * 52
      + otherOpexRate * annualRevenue) / Math.max(1, annualRevenue);

    const growthCapex0 = S.growthCapexResolved[row];
    const estRateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
    const estCashHealth = S.cash[row] < 0 ? 0.05 : (S.cash[row] < S.currentLiabilities[row] * 0.25 ? 0.4 : 1.0);
    const estTobinsQ = Math.max(0.1, Math.min(10.0, S.marketCap[row] / Math.max(1, S.totalDebt[row] + annualRevenue * 1.5)));
    const estQCapexEffect = ((estTobinsQ - 1) * 0.2);
    let estAvgComp = 0;
    for (let p = plLo; p < plHi; p++) estAvgComp += S.plComp[p];
    estAvgComp /= Math.max(1, plHi - plLo);
    const estTargetGrowthCapex = baseRev * S.baselineGrowthRatioResolved[row] * (1 - estRateDrag) * estCashHealth
      * (1 + estQCapexEffect + estAvgComp * 0.15);
    const estNewGrowthCapex = Math.max(0, growthCapex0 * 0.90 + estTargetGrowthCapex * 0.10);
    const growthInvestmentSignal = ((estNewGrowthCapex - growthCapex0) / Math.max(1, growthCapex0)) * newExecutionQuality;

    // line evolution — numeric outputs; objects materialise in post
    const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
    for (let p = plLo; p < plHi; p++) {
      const si = S.plSub[p];
      if (si < 0 || !S.mktExists[mktBase + si]) { O.badLineAt[row] = p; break; }
      const dominanceDrag = S.plMktShare[p] > 0.30 ? (S.plMktShare[p] - 0.30) * 0.5 : 0;
      const targetCompetitiveness = 2.0 * Math.tanh((marginEdge * 16 + growthInvestmentSignal * 0.5) / 2.0);
      const newCompetitiveness = round3(S.plComp[p] * 0.98 + targetCompetitiveness * 0.02);
      const shareGainRate = (newCompetitiveness * 0.035 - dominanceDrag);
      O.plNewComp[p] = newCompetitiveness;
      O.plNewShare[p] = Math.max(0, S.plMktShare[p] * (1 + shareGainRate / 52));
    }
    for (let p = plLo; p < plHi; p++) {
      const si = S.plSub[p];
      if (si >= 0 && INDUSTRIAL_SET[si] === 1) { O.industrialLineAt[row] = p; break; }
    }

    const salesUSD = S.updSalesUSD[row];
    const targetProductionUSD = S.updHasTargetProd[row] ? S.updTargetProdUSD[row] : annualRevenue / 52;
    F.targetProductionUSD[row] = targetProductionUSD;
    F.newRecentFulfillmentEMA[row] = S.fulfillEMA0[row] * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;

    // revenue recognition — recurring share from the static mechanism table
    let recurring = 0, totalShare = 0;
    for (let p = plLo; p < plHi; p++) {
      const share = Math.max(0, S.plShare[p]);
      totalShare += share;
      if (S.plSub[p] >= 0 && IS_SUBSCRIPTION[S.plSub[p]] === 1) recurring += share;
    }
    const recurringShare = totalShare > 0 ? recurring / totalShare : 0;
    const unitShare = 1 - recurringShare;
    const base0 = S.recurringBase0[row];
    const priorRecurringUSD = recurringShare > 0
      ? (isNaN(base0) ? annualRevenue * recurringShare : base0)
      : 0;
    const priorUnitAnnualUSD = Math.max(0, annualRevenue - priorRecurringUSD);
    const unitRevenueUSD = priorUnitAnnualUSD * (1 - RECEIPTS_MEASUREMENT_WEIGHT)
      + (salesUSD * unitShare * 52) * RECEIPTS_MEASUREMENT_WEIGHT;
    let newRecurringBaseUSD: number;
    if (recurringShare > 0) {
      newRecurringBaseUSD = priorRecurringUSD * (1 - SUBSCRIPTION_WEEKLY_CHURN)
        + salesUSD * recurringShare * 52 * SUBSCRIPTION_WEEKLY_CHURN;
      O.hasRecurringOut[row] = 1;
    } else {
      O.hasRecurringOut[row] = isNaN(base0) ? 0 : 1;
      newRecurringBaseUSD = base0;
    }
    const newRevenue = Math.max(10, (recurringShare > 0 ? newRecurringBaseUSD : 0) + unitRevenueUSD);
    F.newRevenue[row] = newRevenue;

    const industrialPnl = industrialIncome({
      revenueUSD: newRevenue,
      ebitdaMargin: newEbitdaMargin,
      daShareOfRevenue: 0.05,
      annualInterestUSD: annualInterest,
      taxRate: S.effectiveTaxRate[ri],
      sharesOutstanding: S.sharesOutstanding[row],
      tax: {
        taxBasisPpeUSD: S.taxBasisOpenUSD[row],
        usefulLifeYears: S.usefulLifeYears[row],
        capexDeliveredAnnualUSD: commissionedUSD * 52,
        carryforwardUSD: S.carryforwardUSD[row],
        bookNetPpeUSD: S.openingNetPpeUSD[row],
      },
    });
    F.newEbitda[row] = industrialPnl.ebitdaUSD;
    F.newEbit[row] = industrialPnl.ebitUSD;
    F.newNetIncome[row] = industrialPnl.netIncomeUSD;
    F.newEps[row] = S.sharesOutstanding[row] > 0 ? round2(industrialPnl.netIncomeUSD / S.sharesOutstanding[row]) : 0;
    F.taxPaidAnnualRateUSD[row] = industrialPnl.taxPaidAnnualUSD;
    O.taxCarryforwardOut[row] = industrialPnl.taxLossCarryforwardUSD;
    O.taxBasisOut[row] = industrialPnl.taxBasisPpeUSD;
    O.deferredTaxOut[row] = industrialPnl.deferredTaxLiabilityUSD;
    F.newInputSupplyConstraintFactor[row] = newInputSupplyConstraintFactor;
    O.recurringBaseOut[row] = newRecurringBaseUSD;

    const revQ = newRevenue / 4;
    O.costWage[row] = 0;
    O.costInput[row] = (realInputConsumptionCostUSD / Math.max(1, targetProductionUSD)) * revQ;
    O.costDecay[row] = capacityDecayPenalty * revQ;
    O.costCrowd[row] = avgCrowdingIntensity * 0.08 * revQ;
  }
}

/** POST — the object writes, from the core's outputs, in row order on the main thread. */
export function applyFrontPost(
  companies: Company[], S: FrontSeam, O: FrontCoreOut, F: FrontPass, v2: V2World,
  companyUpdates: Record<string, CompanyWeekUpdate>, updatedRegions: WeeklyStepContext['updatedRegions']
): void {
  const week = S.nextWeek;
  const shouldSnapshot = week % 13 === 0;
  for (let row = 0; row < companies.length; row++) {
    if (!S.isActive[row]) continue;
    const comp = companies[row];

    // construction survivors (value-equal materialisation of commissionCapital's split)
    const keep: { valueUSD: number; entersServiceWeek: number }[] = [];
    for (let u = S.ucStart[row]; u < S.ucStart[row + 1]; u++) {
      if (O.ucKeep[u]) keep.push({ valueUSD: S.ucValue[u], entersServiceWeek: S.ucServiceWeek[u] });
    }
    F.stillUnderConstruction[row] = keep;

    // carrying-decayed output record, in the entry order the seam read
    const outRec: Record<string, { unitsHeld: number; valueUSD: number }> = {};
    for (let o = S.outStart[row]; o < S.outStart[row + 1]; o++) {
      outRec[SUBUNITS[S.outSub[o]]] = { unitsHeld: S.outUnits[o], valueUSD: O.outNewValue[o] };
    }

    if (F.isProfile[row]) {
      F.outputInv[row] = outRec;
      F.updatedProductLines[row] = comp.productLines || EMPTY_LINES;
      F.newRecurringBaseUSD[row] = comp.recurringRevenueBaseUSD;
      F.costDrivers[row] = undefined;
      continue;
    }

    if (O.badLineAt[row] >= 0) {
      const reg = updatedRegions[comp.region as RegionId];
      const p = O.badLineAt[row];
      const su = SUBUNITS[S.plSub[p]] ?? `#${S.plSub[p]}`;
      throw new Error(`subUnitId ${su} does not exist in reg.categoryDemand for region ${reg.id}. Available: ${Object.keys(reg.categoryDemand).join(', ')}`);
    }

    // the evolved lines — same spread the inline map produced
    const lines = comp.productLines || EMPTY_LINES;
    const updated: typeof lines = new Array(lines.length);
    for (let i = 0; i < lines.length; i++) {
      const p = S.plStart[row] + i;
      const line = lines[i];
      updated[i] = {
        ...line,
        previousCategoryMarketShare: line.categoryMarketShare,
        categoryMarketShare13WeeksAgo: shouldSnapshot ? line.categoryMarketShare : (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare),
        competitiveness: O.plNewComp[p],
        categoryMarketShare: O.plNewShare[p],
      };
    }
    F.updatedProductLines[row] = updated;

    // the industrial override, from the week's update record
    const ip = O.industrialLineAt[row];
    if (ip >= 0 && S.plShare[ip] > 0) {
      const su = SUBUNITS[S.plSub[ip]];
      const update = companyUpdates[comp.ticker];
      outRec[su] = update?.outputInventoryBySubUnit?.[su] ?? outRec[su] ?? { unitsHeld: 0, valueUSD: 0 };
    }
    F.outputInv[row] = outRec;

    F.newRecurringBaseUSD[row] = O.hasRecurringOut[row] ? O.recurringBaseOut[row] : undefined;
    revHistPush(v2, rowOf(v2, comp.id), F.newRevenue[row]);
    comp.taxLossCarryforwardUSD = O.taxCarryforwardOut[row];
    comp.taxBasisPpeUSD = O.taxBasisOut[row];
    comp.deferredTaxLiabilityUSD = O.deferredTaxOut[row];

    F.costDrivers[row] = {
      wagePressureUSD: O.costWage[row],
      inputPriceCostUSD: O.costInput[row],
      capacityDecayCostUSD: O.costDecay[row],
      crowdingCostUSD: O.costCrowd[row],
    } as CogsCostDrivers;
  }
}
