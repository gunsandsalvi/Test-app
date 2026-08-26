

import { isActiveCompany } from '../../../domain/company';
import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche, SupplyRelationship } from '../../../types';
import { SECTOR_BENCHMARKS, priceEquity, priceCorporateBond, priceInterestRateSwap, priceCreditDefaultSwap, priceLeveragedLoan, priceCrossCurrencyBasisSwap } from '../../pricing';
import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../../nelsonSiegel';
import { EarningsReportEvent, generateWeeklyNews } from '../../newsGenerator';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../../formatters';
import { getUnifiedInitialMarginRate } from '../../dealers';
import { calculateBlackScholesGreeks } from '../../blackScholes';
import { calculateExpectedCarry } from '../../carryCalculator';
import { CORPORATE_DEMAND_INTENSITY } from "../../domain/industry";
import { GameState, Company, Region, RegionId, Position, FxPair, CATEGORY_TRADABILITY, OccupationType, OccupationPool, SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX, PrivateSectorSegment, CATEGORY_INPUT_REQUIREMENTS, AssetOwnershipShares, ItemizedHolding, INDUSTRY_SUBUNITS, Industry, UnitBid, UnitOffer, SupplyContract, SegmentFinancial } from '../../../types';
import { determineCreditRating } from '../credit';
import { checkForIPO } from '../ipo';
import { checkForMerger } from '../merger';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from '../constants';
import { evolveRegionMacro, evolveFxPair, evolveCommodity, calculateCompositeIndices } from '../../macroEngine';
import { FIXED_SHARE_BY_RATING, buildQuarterlyFundamentalSnapshot } from '../../companyGenerator';
import { PipelineContext } from '../pipeline';


export function runStage_03_category_demand(ctx: PipelineContext): PipelineContext {
    let prevActiveFirms = ctx.prevActiveFirms;
    let diagnosticLogs = ctx.diagnosticLogs;
    let nextWeek = ctx.nextWeek;
    let formSupplyRelationships = ctx.formSupplyRelationships;

  Object.keys(ctx.updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = ctx.updatedRegions[regionId];
    const hs = reg.householdState;
    // We will extract variables from ctx
        // (We will let typescript complain and manually fix it, or just use any)
        const categorySupplyGrowth: Record<string, number> = {};
    (Object.keys(reg.categoryDemand) as string[]).forEach(cat => {
      const firmsInCat = prevActiveFirms.filter(f => f.region === regionId && (f.productLines || []).some(l => l.subUnitId === cat));
      if (firmsInCat.length === 0) { categorySupplyGrowth[cat] = 0; return; }
      categorySupplyGrowth[cat] = firmsInCat.reduce((s, f) => {
        const line = f.productLines.find(l => l.subUnitId === cat)!;
        return s + (f.growthCapex / Math.max(1, f.annualRevenue)) * line.revenueShare;
      }, 0) / firmsInCat.length;
    });

    // Compute active GDP components for bottom-up demand targets
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const G = reg.governmentSpendingUSD * 52 * 0.35 * (1 + reg.fiscalStanceScore * 0.25);
    const rawCorporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const I = newLaggedCorporateDemandBase;

    let totalHhWeight = 0;
    let totalGovWeight = 0;
    let totalCorpWeight = 0;

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        totalHhWeight += su.buyerMix.HOUSEHOLD;
        totalGovWeight += su.buyerMix.GOVERNMENT;
        totalCorpWeight += su.buyerMix.CORPORATE;
      });
    });

    const allTargets: Record<string, number> = {};
    const smoothingByCategory: Record<string, number> = {};

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        allTargets[su.unitId] = suHhDemand + suGovDemand + suCorpDemand;
        
        if (su.buyerMix.HOUSEHOLD > 0.5) smoothingByCategory[su.unitId] = 0.1;
        else if (su.buyerMix.GOVERNMENT > 0.5) smoothingByCategory[su.unitId] = 0.05;
        else smoothingByCategory[su.unitId] = 0.08;
      });
    });

    Object.keys(allTargets).forEach((cat) => {
      const target = allTargets[cat]!;
      if (isNaN(target)) {
        diagnosticLogs.push({
          week: nextWeek,
          level: 'ERROR',
          message: `NaN target demand for category ${cat} in region ${regionId}. C=${C}, G=${G}, I=${I}`,
        });
      }
      const smoothing = smoothingByCategory[cat] ?? 0.1;
      const existingEntry = reg.categoryDemand[cat as keyof typeof reg.categoryDemand];
      const hasPriorDemand = Boolean(existingEntry && existingEntry.demandLevelUSD > 0);
      const prevLevel = hasPriorDemand ? existingEntry.demandLevelUSD : target;
      const newLevel = hasPriorDemand ? prevLevel * (1 - smoothing) + target * smoothing : target;
      const isStartupTransition = (ctx.state.currentWeek <= 1) || prevLevel < newLevel * 0.2 || newLevel < prevLevel * 0.2;
      const rawGrowthAnnual = hasPriorDemand && prevLevel > 0 && !isStartupTransition ? ((newLevel / prevLevel) - 1) * 52 : 0;
      const growthAnnual = Number.isFinite(rawGrowthAnnual) ? rawGrowthAnnual : 0;
      const prevHistory = existingEntry?.demandHistory ?? [];
      const crowdingIntensity = Math.max(0, Math.min(1, (categorySupplyGrowth[cat] ?? 0) * 8 - (target ? growthAnnual : 0)));
      (reg.categoryDemand as any)[cat] = {
        demandLevelUSD: newLevel,
        demandGrowthAnnual: growthAnnual,
        demandHistory: [...prevHistory.slice(-25), newLevel],
        crowdingIntensity,
        inventoryLevelUSD: existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
        inputCostPressure: existingEntry?.inputCostPressure ?? 0,
        clearedInputPriceIndex: existingEntry?.clearedInputPriceIndex ?? 1.0,
        lastWeekInventoryLevelUSD: existingEntry?.lastWeekInventoryLevelUSD ?? existingEntry?.inventoryLevelUSD ?? (newLevel * 0.10),
      };
    });

    // Supply Relationships (PROJ-10)
    if (ctx.state.currentWeek % 13 === 0 || !(reg as any).supplyRelationships || (reg as any).supplyRelationships.length === 0) {
      (reg as any).supplyRelationships = formSupplyRelationships(regionId, prevActiveFirms);
    }
    
  });
        ctx.prevActiveFirms = prevActiveFirms;
    ctx.diagnosticLogs = diagnosticLogs;
    ctx.nextWeek = nextWeek;
    ctx.formSupplyRelationships = formSupplyRelationships;
    return ctx;
}
