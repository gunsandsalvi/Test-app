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
import { isPubliclyListed, managedEntityIdsOf } from '../domain/company';
import { industryOfSubUnit, financingProfileOf } from '../domain/industry-registry';
import { CompanyStore } from './company-store';
import { patienceWeeksOf, riskAversionOf } from '../domain/preferences';

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
  demandSlackRevenueShare: Float64Array;
  wuSalesUSD: Float64Array;
  wuPurchasesUSD: Float64Array;
  wuTradeReceivableBookedUSD: Float64Array;
  wuTradeReceivableCollectedUSD: Float64Array;
  wuTradePayableBookedUSD: Float64Array;
  wuTradePayableSettledUSD: Float64Array;
  wuCapexPurchasesUSD: Float64Array;
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
  employeeCount: Float64Array;
  employeeCountUpdate: Float64Array;       // NaN = no update / no field (the ?? fallback)
  accruedTaxLiabilityUSD: Float64Array;    // NaN = undefined
  bankCapitalRatio: Float64Array;          // NaN = no bank sheet
  customerConcentration: Float64Array;     // NaN = undefined
  supplierConcentration: Float64Array;     // NaN = undefined
  hasVehicle: Uint8Array;
  boundaryTraceKey: string[];
  // --- §7.325 W1: core-A's last object/ctx reads, resolved at the seam ---
  occupationMixDrift: Company['occupationMixDrift'][]; // object refs, read-only in A
  maxPayoutRatio: Float64Array;            // IND4 industry payout discipline, resolved
  // §5-BRAINS — the management's two primitives, resolved at the seam (median when undrawn).
  mgmtPatienceWeeks: Float64Array;
  mgmtRiskAversion: Float64Array;
  expectedEbitdaUSD: Float64Array;         // NaN = no expectation yet
  carrierFreightRevenueUSD: Float64Array;  // ctx maps, read-frozen during the loop (§7.318)
  channelMarginRevenueUSD: Float64Array;
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
  entityIds: Set<string>,
  carrierFreightRevenue: Record<string, number>,
  channelMarginRevenue: Record<string, number>,
  S: CompanyStore,
): BackLanes {
  const n = companies.length;
  const f = () => new Float64Array(n);
  // §4.C Stage II.1 — the 1:1 scalar lanes ALIAS the company row store (refreshed by the stage
  // just before this call, so validity is by construction): same values, same NaN-as-undefined
  // convention, zero copies. Only the derived lanes (folds, flags, registry tables, weekUpdate
  // scalars) are still built here.
  const N = S.num, T = S.str;
  const L: BackLanes = {
    n,
    grossPPEUSD: N.grossPPEUSD, accumulatedDepreciationUSD: N.accumulatedDepreciationUSD, ppeDefaultUSD: f(),
    annualRevenueUSD: N.annualRevenue, cashUSD: N.cash, currentLiabilitiesUSD: N.currentLiabilities,
    maintenanceCapexUSD: N.maintenanceCapex, growthCapexUSD: N.growthCapex, capexUSD: N.capex,
    maintenanceShortfallStreak: N.maintenanceShortfallStreak, baselineGrowthCapexToRevenueRatio: N.baselineGrowthCapexToRevenueRatio,
    marketCapUSD: N.marketCap, totalDebtUSD: N.totalDebt,
    cumulativeOutputUnits: N.cumulativeOutputUnits, learningMultiplier: N.learningMultiplier, lastLearningGrowthAnnual: N.lastLearningGrowthAnnual,
    rndExpenseUSD: N.rndExpense, oasSpreadBps: N.oasSpreadBps,
    idleStreakWeeks: N.idleStreakWeeks, mothballedPpeShare: N.mothballedPpeShare, mothballedStreakWeeks: N.mothballedStreakWeeks,
    usefulLifeYears: f(),
    producedUnitsThisWeek: f(), plantCapacityUnitsThisWeek: f(), idleLineRevenueShare: f(), demandSlackRevenueShare: f(),
    wuSalesUSD: f(), wuPurchasesUSD: f(), wuTradeReceivableBookedUSD: f(),
    wuTradeReceivableCollectedUSD: f(), wuTradePayableBookedUSD: f(),
    wuTradePayableSettledUSD: f(), wuCapexPurchasesUSD: f(),
    addressableGrowthAnnual: f(), categoryShortfall: f(), avgCompetitiveness: f(),
    isBanksSector: new Uint8Array(n), hasTechLine: new Uint8Array(n), investmentGrade: new Uint8Array(n),
    sharesOutstanding: N.sharesOutstanding, stockPrice: N.stockPrice, baselineDividendYield: N.baselineDividendYield, dividendYield: N.dividendYield,
    earningsWeekModulo: N.earningsWeekModulo, eps: N.eps, cdsSpreadBps: N.cdsSpreadBps, beta: N.beta,
    baselineAnnualRevenueUSD: N.baselineAnnualRevenue, lastOpportunisticOfferingWeek: N.lastOpportunisticOfferingWeek,
    employeeCount: N.employeeCount, employeeCountUpdate: f(),
    accruedTaxLiabilityUSD: N.accruedTaxLiabilityUSD, bankCapitalRatio: f(),
    customerConcentration: N.customerConcentration, supplierConcentration: N.supplierConcentration,
    hasVehicle: new Uint8Array(n), boundaryTraceKey: new Array(n),
    occupationMixDrift: new Array(n), maxPayoutRatio: f(),
    mgmtPatienceWeeks: f(), mgmtRiskAversion: f(), expectedEbitdaUSD: N.expectedEbitdaUSD,
    carrierFreightRevenueUSD: f(), channelMarginRevenueUSD: f(),
    wasDefaulted: new Uint8Array(n), wasMergerAcquired: new Uint8Array(n), publiclyListed: new Uint8Array(n),
    creditRating: T.creditRating as string[], name: T.name as string[],
    companyId: T.id as string[], homeBankTicker: T.homeBankTicker,
    ticker: T.ticker as string[], region: T.region as Company['region'][], sector: T.sector as Company['sector'][],
  };
  const NaN_ = Number.NaN;
  for (let i = 0; i < n; i++) {
    const c = companies[i];
    const reg = updatedRegions[c.region];
    const wu = companyUpdates[c.ticker];
    L.ppeDefaultUSD[i] = c.annualRevenue * (SECTOR_PPE_INTENSITY[c.sector] ?? 0.5);
    L.usefulLifeYears[i] = SECTOR_PPE_USEFUL_LIFE_YEARS[c.sector] ?? 12;
    L.producedUnitsThisWeek[i] = wu?.producedUnitsThisWeek ?? 0;
    L.plantCapacityUnitsThisWeek[i] = wu?.plantCapacityUnitsThisWeek ?? 0;
    L.idleLineRevenueShare[i] = wu?.idleLineRevenueShare ?? 0;
    L.demandSlackRevenueShare[i] = wu?.demandSlackRevenueShare ?? 0;
    L.wuSalesUSD[i] = wu?.salesUSD ?? 0;
    L.wuPurchasesUSD[i] = wu?.purchasesUSD ?? 0;
    L.wuTradeReceivableBookedUSD[i] = wu?.tradeReceivableBookedUSD ?? 0;
    L.wuTradeReceivableCollectedUSD[i] = wu?.tradeReceivableCollectedUSD ?? 0;
    L.wuTradePayableBookedUSD[i] = wu?.tradePayableBookedUSD ?? 0;
    L.wuTradePayableSettledUSD[i] = wu?.tradePayableSettledUSD ?? 0;
    L.wuCapexPurchasesUSD[i] = wu?.capexPurchasesUSD ?? 0;
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
    L.employeeCountUpdate[i] = wu?.employeeCount ?? NaN_;
    L.bankCapitalRatio[i] = c.bankBalanceSheet?.bankCapitalRatio ?? NaN_;
    // NOTE (§7.320): revenueVolatility is NOT seam-computable — the PROFILE modules append
    // comp.revenueHistory MID-LOOP (profiles/bank.ts:52 and siblings), after any seam and
    // before the rating reads it. The fold stays closure-side; the week-2 rating drift that
    // taught this is the record's.
    L.hasVehicle[i] = !c.isBankEntity && c.isInstitutionalEntity
      && entityIds.has(managedEntityIdsOf(c)[0]) ? 1 : 0;
    L.occupationMixDrift[i] = c.occupationMixDrift;
    // IND4 — the same read maxDividendPayoutRatioOf made (0.6 = its stated default).
    const primaryLine = lines[0];
    const primaryIndustry = primaryLine ? industryOfSubUnit(primaryLine.subUnitId) : undefined;
    L.maxPayoutRatio[i] = primaryIndustry ? financingProfileOf(primaryIndustry).maxPayoutRatio : 0.6;
    L.mgmtPatienceWeeks[i] = patienceWeeksOf(c.management);
    L.mgmtRiskAversion[i] = riskAversionOf(c.management);
    L.carrierFreightRevenueUSD[i] = carrierFreightRevenue[c.ticker] ?? 0;
    L.channelMarginRevenueUSD[i] = channelMarginRevenue[c.ticker] ?? 0;
    L.boundaryTraceKey[i] = `${c.region}:${c.financialStatementProfile ?? c.sector ?? '?'}:${c.ticker}`;
    L.wasDefaulted[i] = c.isDefaulted ? 1 : 0;
    L.wasMergerAcquired[i] = c.mergerAcquired ? 1 : 0;
    L.publiclyListed[i] = isPubliclyListed(c) ? 1 : 0;
  }
  return L;
}
