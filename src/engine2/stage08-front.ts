/**
 * ENGINE V2 — STAGE 08's FRONT HALF AS A PASS OVER ROWS (the strangler's first cut into the
 * company-week kernel; see state.ts's header for the campaign scope).
 *
 * Everything from kernel entry through the income statement — payroll, the debt-ladder interest
 * walk, the tax attributes, carrying cost, input-lot FIFO consumption, supply shocks, the
 * product-line evolution, revenue recognition and the industrial P&L — runs here for EVERY firm
 * before the remaining object kernel runs for ANY firm. Outputs land in struct-of-arrays scratch
 * the kernel reads by row. This is legal because the company week is order-invariant (§7.222):
 * firms interact only through pre-loop snapshots (supplierShockStats et al.), which this pass
 * receives frozen, exactly as the kernel did.
 *
 * THE RNG CONTRACT: the front half draws ONE uniform per active firm (execution noise), first in
 * the firm's entity-scoped stream. The pass opens the same scope the kernel used to open
 * (beginEntityScope(comp.id, nextWeek)), draws it, and CAPTURES the stream position; the kernel
 * loop resumes each firm's stream from that capture, so its remaining draws (the rating flip, the
 * profile modules) see exactly the values they always did. Bit-for-bit, not approximately.
 *
 * PROFILE-PATH firms (banks, insurers, managers, carriers): the shared front (payroll, ladder,
 * noise) runs here; their P&L dispatch stays in the kernel until profiles/ ports. The industrial
 * path — the ~2,400-firm bulk — is fully absorbed.
 *
 * Dead locals from the object kernel (payrollWeek's deviation, the voided fixed/floating due
 * sums, unsold production, the zeroed wage-compression pair) did not survive the transplant;
 * they drew no randomness and wrote no state.
 */

import { Company, RegionId } from '../types';
import { WeeklyStepContext, CompanyWeekUpdate } from '../engine/simulation/stages/context';
import { isActiveCompany, tranchePaymentDue } from '../domain/company';
import { CATEGORY_INPUT_REQUIREMENTS } from '../domain/market-microstructure';
import { recurringRevenueShare, SUBSCRIPTION_WEEKLY_CHURN } from '../domain/industry-registry';
import { RECEIPTS_MEASUREMENT_WEIGHT } from '../domain/company';
import { industryOfSubUnit, firmInputIntensities, annualCarryingCostRateOf } from '../domain/industry-registry';
import { SECTOR_OCCUPATION_MIX } from '../domain/region-macro';
import { SECTOR_PPE_USEFUL_LIFE_YEARS, SECTOR_PPE_INTENSITY } from '../engine/simulation/constants';
import { CogsCostDrivers } from '../engine/companyGenerator';
import { commissionCapital } from '../domain/company-week/capital-programme';
import { industrialIncome } from '../domain/company-week/income-statement';
import { chargeCarryingCost, fulfillmentRatio } from '../domain/company-week/inventory';
import { V2World } from './world';
import { consumeFifo } from './lots';
import { weeklyWageBillUSD, getBaseAnnualWageUSD } from '../engine/bootstrap/labor-and-wages';
import { PROFILE_REGISTRY, profileKeyOf } from '../engine/simulation/stages/profiles';
import { random, beginEntityScope, endEntityScope, getRngState } from '../engine/rng';

/**
 * SCALE / DECLARED RELABEL (the user's drift acceptance, 2026-09-01): decimal rounding by
 * arithmetic instead of a string round-trip. `Number(x.toFixed(n))` allocated, formatted and
 * re-parsed a string ~55k times a week across the kernel; these round the same numbers the
 * arithmetic way. Half-point and far-ULP cases can land one ULP differently than the decimal
 * string did — accepted numeric drift, no mechanism changes.
 */
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const round4 = (v: number) => Math.round(v * 10000) / 10000;


type ProductLines = NonNullable<Company['productLines']>;
type ConstructionLot = { valueUSD: number; entersServiceWeek: number };

/**
 * LAB — the wage pools at their reference level (moved here with the payroll that reads it).
 * A firm's BASELINE payroll is its baseline headcount at the wage table's own level.
 */
const BASELINE_WAGE_POOLS = {
  GENERAL: { wageIndex: 1 }, SKILLED_TRADES: { wageIndex: 1 },
  TECHNICAL_ENGINEERING: { wageIndex: 1 }, SPECIALIZED_PROFESSIONAL: { wageIndex: 1 },
  MANAGERIAL_FINANCIAL: { wageIndex: 1 },
} as Record<import('../types').OccupationType, { wageIndex: number }>;

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

/** Run the front half for every firm, in row order. One draw per active firm, captured. */
export function runStage08FrontPass(companies: Company[], inp: FrontPassInputs): FrontPass {
  const { v2, nextWeek, companyUpdates, updatedRegions, supplyRelsByCustomer, supplierShockStats, suppliedSubUnitsByRegion } = inp;
  const F = allocScratch(companies.length);

  for (let row = 0; row < companies.length; row++) {
    const comp = companies[row];
    const saved = beginEntityScope(comp.id, nextWeek);
    if (!isActiveCompany(comp)) {
      F.isActive[row] = 0;
      F.isProfile[row] = 0;
      F.rngAfter[row] = getRngState();
      endEntityScope(saved);
      continue;
    }
    F.isActive[row] = 1;
    const reg = updatedRegions[comp.region as RegionId];
    const weekUpdate = companyUpdates[comp.ticker];

    // IND-R1 / IND-R6: EVERY firm's payroll, before both forks (see the stage's history note).
    const weeklyPayrollUSD = weeklyWageBillUSD(
      comp.employeeCount,
      SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 },
      getBaseAnnualWageUSD(comp.region),
      reg.occupationPools,
      comp.offeredWageIndex ?? 1.0
    );
    const baselineWeeklyPayrollUSD = weeklyWageBillUSD(
      comp.baselineEmployeeCount ?? comp.employeeCount,
      SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 },
      getBaseAnnualWageUSD(comp.region),
      BASELINE_WAGE_POOLS,
      1.0
    );
    F.weeklyPayrollUSD[row] = weeklyPayrollUSD;

    // SCALE §7.303 — ONE PASS OVER THE LADDER (transplanted intact; subset order = array order).
    let annualInterest = 0;
    let facilityInterestWeeklyUSD = 0;
    let marketBondAccrualUSD = 0;
    let commercialPaperAccrualUSD = 0;
    let marketLoanAccrualUSD = 0;
    let due3 = 0;
    for (const t of comp.debtTranches) {
      if (t.maturityWeek === nextWeek) continue;
      const annualUSD = t.rateType === 'FIXED'
        ? t.principalUSD * (t.couponRate ?? 0.05)
        : t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
      annualInterest += annualUSD;
      const { due, weeksCovered } = tranchePaymentDue(t, nextWeek);
      const dueUSD = due ? (annualUSD * weeksCovered) / 52 : 0;
      if (t.isBankFacility) {
        facilityInterestWeeklyUSD += dueUSD;
        continue;
      }
      if (t.isCommercialPaper) {
        commercialPaperAccrualUSD += annualUSD / 52;
        if (due) due3 |= DUE_CP;
      } else if (t.rateType === 'FIXED') {
        marketBondAccrualUSD += annualUSD / 52;
        if (due) due3 |= DUE_BOND;
      } else {
        marketLoanAccrualUSD += annualUSD / 52;
        if (due) due3 |= DUE_LOAN;
      }
    }
    F.annualInterest[row] = annualInterest;
    F.facilityInterestWeeklyUSD[row] = facilityInterestWeeklyUSD;
    F.marketBondAccrualUSD[row] = marketBondAccrualUSD;
    F.commercialPaperAccrualUSD[row] = commercialPaperAccrualUSD;
    F.marketLoanAccrualUSD[row] = marketLoanAccrualUSD;
    F.couponDue[row] = due3;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    F.effectiveDebtRate[row] = effectiveDebtRate;
    const taxRate = reg.effectiveTaxRate;

    // §5-TAXR — the firm's tax attributes, gathered on the week's opening stocks. The
    // commissioning read (IND13) happens here, ONCE (the kernel's PP&E roll-forward reuses it).
    const underConstruction = [
      ...(comp.assetsUnderConstruction ?? []),
      ...(weekUpdate?.capexUnderConstruction ?? []),
    ];
    const { commissionedUSD: capexCommissionedThisWeekUSD, stillUnderConstruction } =
      commissionCapital(underConstruction, nextWeek);
    F.capexCommissionedUSD[row] = capexCommissionedThisWeekUSD;
    F.stillUnderConstruction[row] = stillUnderConstruction;
    const openingGrossPpeUSD = comp.grossPPEUSD ?? (comp.annualRevenue * (SECTOR_PPE_INTENSITY[comp.sector] ?? 0.5));
    const openingNetPpeUSD = Math.max(0,
      openingGrossPpeUSD - (comp.accumulatedDepreciationUSD ?? openingGrossPpeUSD * 0.45));
    const taxAttrs = {
      taxBasisPpeUSD: comp.taxBasisPpeUSD ?? openingNetPpeUSD,
      usefulLifeYears: SECTOR_PPE_USEFUL_LIFE_YEARS[comp.sector] ?? 12,
      capexDeliveredAnnualUSD: capexCommissionedThisWeekUSD * 52,
      carryforwardUSD: comp.taxLossCarryforwardUSD ?? 0,
      bookNetPpeUSD: openingNetPpeUSD,
    };

    let updatedProductLines = comp.productLines || [];
    let newInputSupplyConstraintFactor = comp.inputSupplyConstraintFactor ?? 1.0;
    let newRecentFulfillmentEMA = comp.recentFulfillmentEMA ?? 1.0;
    let newRecurringBaseUSD = comp.recurringRevenueBaseUSD;

    // IND1 — what it costs to hold a good is a property of THE GOOD (charged here, settled in
    // the kernel's cash walk, because the charge has a payee and the stock does not).
    const carried = chargeCarryingCost(comp.outputInventoryBySubUnit || {}, annualCarryingCostRateOf);
    const carryingCostUSD = carried.totalCostUSD;
    const newOutputInventoryBySubUnit: Record<string, { unitsHeld: number; valueUSD: number }> = carried.stock;
    F.carryingCostUSD[row] = carryingCostUSD;

    const executionNoise = (random() - 0.5) * 0.3;
    const newExecutionQuality = ((comp.executionQuality ?? 1.0) * 0.92 + 1.0 * 0.08 + executionNoise * 0.08);
    F.newExecutionQuality[row] = newExecutionQuality;
    // The front half's one draw is made; everything below is deterministic arithmetic.
    F.rngAfter[row] = getRngState();
    endEntityScope(saved);

    const profileKey = profileKeyOf(comp);
    const profileModule = PROFILE_REGISTRY[profileKey];
    if (profileModule) {
      // The profile dispatch stays in the kernel until profiles/ ports; store the shared front.
      F.isProfile[row] = 1;
      F.outputInv[row] = newOutputInventoryBySubUnit;
      F.updatedProductLines[row] = updatedProductLines;
      F.newRevenue[row] = 0;
      F.measuredInputConsumptionWeeklyUSD[row] = 0;
      F.newEbitda[row] = 0; F.newEbit[row] = 0; F.newNetIncome[row] = 0; F.newEps[row] = 0;
      F.taxPaidAnnualRateUSD[row] = 0;
      F.newInputSupplyConstraintFactor[row] = newInputSupplyConstraintFactor;
      F.newRecentFulfillmentEMA[row] = newRecentFulfillmentEMA;
      F.newRecurringBaseUSD[row] = newRecurringBaseUSD;
      F.targetProductionUSD[row] = 0;
      F.costDrivers[row] = undefined;
      continue;
    }
    F.isProfile[row] = 0;

    // ---- the industrial path, absorbed whole (HC3b / IND2 / IND3 / 1$-is-1$; see the stage's
    // own history for the full derivations — the formulas here are the same floats) ----
    const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;
    const capacityDecayPenalty = Math.min(0.08, (comp.maintenanceShortfallStreak ?? 0) * 0.003);
    const avgCrowdingIntensity = (comp.productLines || []).reduce((s, l) => {
      const catDemand = reg.categoryDemand[l.subUnitId];
      return s + (catDemand?.crowdingIntensity ?? 0) * l.revenueShare;
    }, 0);

    const linesNeedingInputs = (comp.productLines || []).filter(l => CATEGORY_INPUT_REQUIREMENTS[l.subUnitId]);
    const relevantFulfillment = linesNeedingInputs.length > 0
      ? linesNeedingInputs.reduce((min, l) => Math.min(min, reg.categoryDemand[l.subUnitId]?._fulfillmentRatio ?? 1), 1)
      : 1;

    let physicalFulfillment = 1.0;
    let realInputConsumptionCostUSD = 0;
    linesNeedingInputs.forEach(l => {
      const reqs = CATEGORY_INPUT_REQUIREMENTS[l.subUnitId];
      if (!reqs) return;
      const lineProductionUSD = (comp.annualRevenue / 52) * (l.revenueShare ?? 1.0);
      Object.entries(reqs).forEach(([inputSubUnit, intensity]) => {
        const neededUSD = lineProductionUSD * (intensity ?? 0);
        if (neededUSD <= 0) return;
        const hasRealSupply = (suppliedSubUnitsByRegion.get(comp.region)?.has(inputSubUnit) ?? false)
          || industryOfSubUnit(inputSubUnit) !== undefined;
        if (!hasRealSupply) return;
        const inputUnitPrice = reg.categoryDemand[inputSubUnit]?.unitPriceUSD ?? 1;
        const neededUnits = neededUSD / Math.max(0.01, inputUnitPrice);
        // ENGINE V2 (§7.304) — the FIFO draw runs on the persistent lot table, in place.
        const drawn = consumeFifo(v2, comp.id, inputSubUnit, neededUnits);
        physicalFulfillment = Math.min(physicalFulfillment,
          fulfillmentRatio(drawn.availableUnits, neededUnits));
        // Folded PER LOT, in consumption order (§7.237 — float addition is not associative).
        for (const lotCostUSD of drawn.costsUSD) realInputConsumptionCostUSD += lotCostUSD;
      });
    });
    const combinedFulfillment = Math.min(relevantFulfillment, physicalFulfillment);
    const measuredInputConsumptionWeeklyUSD = realInputConsumptionCostUSD;
    newInputSupplyConstraintFactor = ((comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + combinedFulfillment * 0.3);

    // Supply relationship shocks — from the pre-loop snapshot (the loop's one cross-company read).
    const rels = supplyRelsByCustomer.get(comp.id) ?? [];
    rels.forEach((rel) => {
      const stats = supplierShockStats.get(rel.supplierCompanyId);
      if (!stats) return;
      const supplierInvUSD = stats.invUSDByCategory.get(rel.category)!;
      if (supplierInvUSD > stats.annualRevenue * 0.15) {
        const distress = (supplierInvUSD / (stats.annualRevenue * 0.15)) - 1;
        newInputSupplyConstraintFactor *= (1 - Math.min(0.2, distress * rel.relationshipStrength * 0.1));
      }
    });

    const baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const baselineMargin = comp.baselineEbitdaMargin ?? (comp.ebitda / Math.max(1, comp.annualRevenue));

    // IND3 + CAP0 — the margin is an outcome of real costs, and the clamp is gone.
    const baselineInputRate = Object.values(firmInputIntensities(comp.productLines, profileKey))
      .reduce((a, b) => a + b, 0);
    const baselinePayrollRate = (baselineWeeklyPayrollUSD * 52) / Math.max(1, comp.baselineAnnualRevenue || comp.annualRevenue);
    const otherOpexRate = 1 - baselineMargin - baselineInputRate - baselinePayrollRate;

    const inputCostAnnualUSD = realInputConsumptionCostUSD * 52;
    const payrollAnnualUSD = weeklyPayrollUSD * 52;
    const otherOpexAnnualUSD = otherOpexRate * comp.annualRevenue;
    const newEbitdaMargin = 1 - (inputCostAnnualUSD + payrollAnnualUSD + otherOpexAnnualUSD) / Math.max(1, comp.annualRevenue);

    const growthCapexToRev = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
    const estRateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
    const estCashHealth = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
    const estTobinsQ = Math.max(0.1, Math.min(10.0, comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5)));
    const estQCapexEffect = ((estTobinsQ - 1) * 0.2);
    const estAvgComp = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
    const estCompEffect = (estAvgComp * 0.15);
    const estTargetGrowthCapex = baseRev * growthCapexToRev * (1 - estRateDrag) * estCashHealth * (1 + estQCapexEffect + estCompEffect);
    const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);

    const growthInvestmentSignal = (((estNewGrowthCapex - (comp.growthCapex ?? (comp.capex * 0.4))) / Math.max(1, (comp.growthCapex ?? (comp.capex * 0.4)))) * newExecutionQuality);

    updatedProductLines = (comp.productLines || []).map((line) => {
      const catDemand = reg.categoryDemand[line.subUnitId];
      if (!catDemand) {
        throw new Error(`subUnitId ${line.subUnitId} does not exist in reg.categoryDemand for region ${reg.id}. Available: ${Object.keys(reg.categoryDemand).join(', ')}`);
      }
      const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
      const dominanceDrag = line.categoryMarketShare > 0.30 ? (line.categoryMarketShare - 0.30) * 0.5 : 0;
      const targetCompetitiveness = 2.0 * Math.tanh((marginEdge * 16 + growthInvestmentSignal * 0.5) / 2.0);
      const newCompetitiveness = round3(line.competitiveness * 0.98 + targetCompetitiveness * 0.02);
      const shareGainRate = (newCompetitiveness * 0.035 - dominanceDrag);
      const newCategoryMarketShare = Math.max(0, line.categoryMarketShare * (1 + shareGainRate / 52)); // math guard, not a clamp

      const shouldSnapshot = nextWeek % 13 === 0;
      return {
        ...line,
        previousCategoryMarketShare: line.categoryMarketShare,
        categoryMarketShare13WeeksAgo: shouldSnapshot ? line.categoryMarketShare : (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare),
        competitiveness: newCompetitiveness,
        categoryMarketShare: newCategoryMarketShare,
      };
    });

    const industrialLine = (comp.productLines || []).find(l => l.subUnitId === 'heavy_equipment' || l.subUnitId === 'industrial_automation' || l.subUnitId === 'industrial_chemicals');

    // 1$ is 1$ Phase 1: stage 05 already ran this week's real per-unit auction — read it.
    const update = weekUpdate;
    const salesUSD = update?.salesUSD ?? 0;
    const targetProductionUSD = update?._targetProductionUSD ?? comp.annualRevenue / 52;
    newRecentFulfillmentEMA = (comp.recentFulfillmentEMA ?? 1.0) * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;
    if (industrialLine && industrialLine.revenueShare > 0) {
      const lineSubUnitId = industrialLine.subUnitId;
      newOutputInventoryBySubUnit[lineSubUnitId] = update?.outputInventoryBySubUnit?.[lineSubUnitId]
        ?? newOutputInventoryBySubUnit[lineSubUnitId]
        ?? { unitsHeld: 0, valueUSD: 0 };
    }

    // IND2 / HC3b — revenue is what was sold; a subscription's contracted base carries.
    const recurringShare = recurringRevenueShare(comp.productLines || []);
    const unitShare = 1 - recurringShare;
    const priorRecurringUSD = recurringShare > 0
      ? (comp.recurringRevenueBaseUSD ?? comp.annualRevenue * recurringShare)
      : 0;
    const priorUnitAnnualUSD = Math.max(0, comp.annualRevenue - priorRecurringUSD);
    const unitRevenueUSD = priorUnitAnnualUSD * (1 - RECEIPTS_MEASUREMENT_WEIGHT)
      + (salesUSD * unitShare * 52) * RECEIPTS_MEASUREMENT_WEIGHT;
    if (recurringShare > 0) {
      newRecurringBaseUSD = priorRecurringUSD * (1 - SUBSCRIPTION_WEEKLY_CHURN)
        + salesUSD * recurringShare * 52 * SUBSCRIPTION_WEEKLY_CHURN;
    }
    const newRevenue = Math.max(10, (recurringShare > 0 ? newRecurringBaseUSD ?? 0 : 0) + unitRevenueUSD);
    comp.revenueHistory = [...(comp.revenueHistory || [newRevenue]).slice(-12), newRevenue];

    // §5-STRUCT step 2 — same statement, industrial path; the loss pair is closed.
    const industrialPnl = industrialIncome({
      revenueUSD: newRevenue,
      ebitdaMargin: newEbitdaMargin,
      daShareOfRevenue: 0.05,
      annualInterestUSD: annualInterest,
      taxRate,
      sharesOutstanding: comp.sharesOutstanding,
      tax: taxAttrs,
    });
    const newEbitda = industrialPnl.ebitdaUSD;
    const newEbit = industrialPnl.ebitUSD;
    const newNetIncome = industrialPnl.netIncomeUSD;
    const newEps = comp.sharesOutstanding > 0 ? round2(newNetIncome / comp.sharesOutstanding) : 0;
    // §5-TAXR — the statement rolled the attributes one week; the firm carries them.
    F.taxPaidAnnualRateUSD[row] = industrialPnl.taxPaidAnnualUSD;
    comp.taxLossCarryforwardUSD = industrialPnl.taxLossCarryforwardUSD;
    comp.taxBasisPpeUSD = industrialPnl.taxBasisPpeUSD;
    comp.deferredTaxLiabilityUSD = industrialPnl.deferredTaxLiabilityUSD;

    // Quarterly dollar impact of the same cost drivers (backs the COGS drill-down).
    const revQ = newRevenue / 4;
    const costDriversUSD: CogsCostDrivers = {
      wagePressureUSD: 0,
      inputPriceCostUSD: (realInputConsumptionCostUSD / Math.max(1, targetProductionUSD)) * revQ,
      capacityDecayCostUSD: capacityDecayPenalty * revQ,
      crowdingCostUSD: avgCrowdingIntensity * 0.08 * revQ,
    };

    F.outputInv[row] = newOutputInventoryBySubUnit;
    F.updatedProductLines[row] = updatedProductLines;
    F.newRevenue[row] = newRevenue;
    F.measuredInputConsumptionWeeklyUSD[row] = measuredInputConsumptionWeeklyUSD;
    F.newEbitda[row] = newEbitda;
    F.newEbit[row] = newEbit;
    F.newNetIncome[row] = newNetIncome;
    F.newEps[row] = newEps;
    F.newInputSupplyConstraintFactor[row] = newInputSupplyConstraintFactor;
    F.newRecentFulfillmentEMA[row] = newRecentFulfillmentEMA;
    F.newRecurringBaseUSD[row] = newRecurringBaseUSD;
    F.targetProductionUSD[row] = targetProductionUSD;
    F.costDrivers[row] = costDriversUSD;
  }
  return F;
}
