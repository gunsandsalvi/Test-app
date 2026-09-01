/**
 * §7.317 step 1.1/1.2 — THE BACK KERNEL'S SEAM LANES.
 *
 * One pass reads every firm's capital-block inputs out of the object graph into typed lanes
 * BEFORE the shard loop; the core then reads rows, not objects. NaN is the undefined sentinel
 * wherever a `??` fallback is load-bearing (grossPPE, accumDep, cumulativeOutputUnits,
 * learningMultiplier, the capex priors, the baseline ratio) — the core re-applies the exact
 * fallback the object read had, so the arithmetic is bit-identical. Reductions over nested
 * structures (the three productLine×region folds, the tech-line test, the payout-ratio read)
 * happen HERE, in the same fold order the inline block used.
 *
 * String lanes (ticker/region/sector/homeBank) exist for the env-gated diagnostics and the
 * maintenance-bridge id; a worker core drops them — traces and object building stay main-side.
 */

import { Company } from '../types';
import { WeeklyStepContext, CompanyWeekUpdate } from '../engine/simulation/stages/context';
import { SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../engine/simulation/constants';
import { isInvestmentGrade } from '../engine/simulation/stages/asset-allocation';
import { isPubliclyListed } from '../domain/company';

export interface BackLanes {
  n: number;
  // --- capital block inputs (comp scalars; NaN = the field was undefined) ---
  grossPPEUSD: Float64Array;
  accumulatedDepreciationUSD: Float64Array;
  ppeDefaultUSD: Float64Array;          // annualRevenue × sector intensity, the ?? fallback
  annualRevenueUSD: Float64Array;
  cashUSD: Float64Array;
  currentLiabilitiesUSD: Float64Array;
  maintenanceCapexUSD: Float64Array;    // NaN = undefined
  growthCapexUSD: Float64Array;         // NaN = undefined
  capexUSD: Float64Array;
  maintenanceShortfallStreak: Float64Array; // NaN = undefined
  baselineGrowthCapexToRevenueRatio: Float64Array; // NaN = undefined
  marketCapUSD: Float64Array;
  totalDebtUSD: Float64Array;
  cumulativeOutputUnits: Float64Array;  // NaN = undefined (the seeding test)
  learningMultiplier: Float64Array;     // NaN = undefined
  lastLearningGrowthAnnual: Float64Array; // NaN = undefined
  rndExpenseUSD: Float64Array;          // NaN = undefined
  oasSpreadBps: Float64Array;
  idleStreakWeeks: Float64Array;        // NaN = undefined
  mothballedPpeShare: Float64Array;     // NaN = undefined
  mothballedStreakWeeks: Float64Array;  // NaN = undefined
  usefulLifeYears: Float64Array;        // sector table, resolved
  // --- weekUpdate scalars, ?? 0 resolved at the seam ---
  producedUnitsThisWeek: Float64Array;
  plantCapacityUnitsThisWeek: Float64Array;
  idleLineRevenueShare: Float64Array;
  // --- seam reductions over nested structures, in the inline fold order ---
  addressableGrowthAnnual: Float64Array;
  categoryShortfall: Float64Array;
  avgCompetitiveness: Float64Array;
  // --- flags ---
  isBanksSector: Uint8Array;
  hasTechLine: Uint8Array;
  investmentGrade: Uint8Array;
  // --- §7.317 step 1.6a: the debt/tail blocks' scalar reads ---
  sharesOutstanding: Float64Array;
  stockPrice: Float64Array;
  baselineDividendYield: Float64Array;
  dividendYield: Float64Array;
  earningsWeekModulo: Float64Array;     // NaN = undefined (the === undefined tests)
  eps: Float64Array;
  cdsSpreadBps: Float64Array;
  beta: Float64Array;                   // NaN = undefined
  baselineAnnualRevenueUSD: Float64Array;
  lastOpportunisticOfferingWeek: Float64Array; // NaN = undefined
  wasDefaulted: Uint8Array;
  wasMergerAcquired: Uint8Array;
  publiclyListed: Uint8Array;
  creditRating: string[];
  name: string[];
  companyId: string[];
  homeBankTicker: (string | undefined)[];
  // --- strings for diagnostics and the bridge tranche (main-side only) ---
  ticker: string[];
  region: Company['region'][];
  sector: Company['sector'][];
}

export function buildBackLanes(
  companies: Company[],
  updatedRegions: WeeklyStepContext['updatedRegions'],
  companyUpdates: Record<string, CompanyWeekUpdate>,
): BackLanes {
  const n = companies.length;
  const f = () => new Float64Array(n);
  const L: BackLanes = {
    n,
    grossPPEUSD: f(), accumulatedDepreciationUSD: f(), ppeDefaultUSD: f(),
    annualRevenueUSD: f(), cashUSD: f(), currentLiabilitiesUSD: f(),
    maintenanceCapexUSD: f(), growthCapexUSD: f(), capexUSD: f(),
    maintenanceShortfallStreak: f(), baselineGrowthCapexToRevenueRatio: f(),
    marketCapUSD: f(), totalDebtUSD: f(),
    cumulativeOutputUnits: f(), learningMultiplier: f(), lastLearningGrowthAnnual: f(),
    rndExpenseUSD: f(), oasSpreadBps: f(),
    idleStreakWeeks: f(), mothballedPpeShare: f(), mothballedStreakWeeks: f(),
    usefulLifeYears: f(),
    producedUnitsThisWeek: f(), plantCapacityUnitsThisWeek: f(), idleLineRevenueShare: f(),
    addressableGrowthAnnual: f(), categoryShortfall: f(), avgCompetitiveness: f(),
    isBanksSector: new Uint8Array(n), hasTechLine: new Uint8Array(n), investmentGrade: new Uint8Array(n),
    sharesOutstanding: f(), stockPrice: f(), baselineDividendYield: f(), dividendYield: f(),
    earningsWeekModulo: f(), eps: f(), cdsSpreadBps: f(), beta: f(),
    baselineAnnualRevenueUSD: f(), lastOpportunisticOfferingWeek: f(),
    wasDefaulted: new Uint8Array(n), wasMergerAcquired: new Uint8Array(n), publiclyListed: new Uint8Array(n),
    creditRating: new Array(n), name: new Array(n),
    companyId: new Array(n), homeBankTicker: new Array(n),
    ticker: new Array(n), region: new Array(n), sector: new Array(n),
  };
  const NaN_ = Number.NaN;
  for (let i = 0; i < n; i++) {
    const c = companies[i];
    const reg = updatedRegions[c.region];
    const wu = companyUpdates[c.ticker];
    L.ticker[i] = c.ticker; L.region[i] = c.region; L.sector[i] = c.sector;
    L.grossPPEUSD[i] = c.grossPPEUSD ?? NaN_;
    L.accumulatedDepreciationUSD[i] = c.accumulatedDepreciationUSD ?? NaN_;
    L.ppeDefaultUSD[i] = c.annualRevenue * (SECTOR_PPE_INTENSITY[c.sector] ?? 0.5);
    L.annualRevenueUSD[i] = c.annualRevenue;
    L.cashUSD[i] = c.cash;
    L.currentLiabilitiesUSD[i] = c.currentLiabilities;
    L.maintenanceCapexUSD[i] = c.maintenanceCapex ?? NaN_;
    L.growthCapexUSD[i] = c.growthCapex ?? NaN_;
    L.capexUSD[i] = c.capex;
    L.maintenanceShortfallStreak[i] = c.maintenanceShortfallStreak ?? NaN_;
    L.baselineGrowthCapexToRevenueRatio[i] = c.baselineGrowthCapexToRevenueRatio ?? NaN_;
    L.marketCapUSD[i] = c.marketCap;
    L.totalDebtUSD[i] = c.totalDebt;
    L.cumulativeOutputUnits[i] = c.cumulativeOutputUnits ?? NaN_;
    L.learningMultiplier[i] = c.learningMultiplier ?? NaN_;
    L.lastLearningGrowthAnnual[i] = c.lastLearningGrowthAnnual ?? NaN_;
    L.rndExpenseUSD[i] = c.rndExpense ?? NaN_;
    L.oasSpreadBps[i] = c.oasSpreadBps;
    L.idleStreakWeeks[i] = c.idleStreakWeeks ?? NaN_;
    L.mothballedPpeShare[i] = c.mothballedPpeShare ?? NaN_;
    L.mothballedStreakWeeks[i] = c.mothballedStreakWeeks ?? NaN_;
    L.usefulLifeYears[i] = SECTOR_PPE_USEFUL_LIFE_YEARS[c.sector] ?? 12;
    L.producedUnitsThisWeek[i] = wu?.producedUnitsThisWeek ?? 0;
    L.plantCapacityUnitsThisWeek[i] = wu?.plantCapacityUnitsThisWeek ?? 0;
    L.idleLineRevenueShare[i] = wu?.idleLineRevenueShare ?? 0;
    // the three folds, in the inline block's exact order
    const lines = c.productLines || [];
    let addr = 0;
    for (const l of lines) {
      const catDemand = reg?.categoryDemand[l.subUnitId];
      addr += Math.max(0, catDemand?.demandGrowthAnnual ?? 0) * l.revenueShare;
    }
    L.addressableGrowthAnnual[i] = addr;
    let shortfall = 0;
    for (const l of lines) {
      const cd = reg?.categoryDemand[l.subUnitId] as { totalUnitsSuppliedThisWeek?: number; totalUnitsDemandedThisWeek?: number } | undefined;
      const supplied = cd?.totalUnitsSuppliedThisWeek ?? 0;
      const demanded = cd?.totalUnitsDemandedThisWeek ?? 0;
      if (!(supplied > 0) || !(demanded > 0)) continue;
      shortfall += Math.max(0, demanded / supplied - 1) * (l.revenueShare ?? 1);
    }
    L.categoryShortfall[i] = shortfall;
    let compet = 0;
    for (const l of lines) compet += l.competitiveness;
    L.avgCompetitiveness[i] = compet / Math.max(1, lines.length);
    L.isBanksSector[i] = c.sector === 'Banks' ? 1 : 0;
    L.hasTechLine[i] = lines.some(l => l.industry === 'TechHardwareSemis' || l.industry === 'SoftwareDigitalServices') ? 1 : 0;
    L.investmentGrade[i] = isInvestmentGrade(c.creditRating) ? 1 : 0;
    L.sharesOutstanding[i] = c.sharesOutstanding;
    L.stockPrice[i] = c.stockPrice;
    L.baselineDividendYield[i] = c.baselineDividendYield;
    L.dividendYield[i] = c.dividendYield;
    L.earningsWeekModulo[i] = c.earningsWeekModulo ?? NaN_;
    L.eps[i] = c.eps;
    L.cdsSpreadBps[i] = c.cdsSpreadBps;
    L.beta[i] = c.beta ?? NaN_;
    L.baselineAnnualRevenueUSD[i] = c.baselineAnnualRevenue;
    L.lastOpportunisticOfferingWeek[i] = c.lastOpportunisticOfferingWeek ?? NaN_;
    L.wasDefaulted[i] = c.isDefaulted ? 1 : 0;
    L.wasMergerAcquired[i] = c.mergerAcquired ? 1 : 0;
    L.publiclyListed[i] = isPubliclyListed(c) ? 1 : 0;
    L.creditRating[i] = c.creditRating;
    L.name[i] = c.name;
    L.companyId[i] = c.id;
    L.homeBankTicker[i] = c.homeBankTicker;
  }
  return L;
}
