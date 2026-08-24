
import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche } from '../../types';
import { RATING_OAS_SPREADS, SECTOR_BENCHMARKS, priceEquity, priceCorporateBond, priceInterestRateSwap, priceCreditDefaultSwap, priceLeveragedLoan, priceCrossCurrencyBasisSwap } from '../pricing';
import { calculateNelsonSiegelZeroRate, priceSovereignBond } from '../nelsonSiegel';
import { EarningsReportEvent, generateWeeklyNews } from '../newsGenerator';
import { formatCurrency, formatQuarterFilingDate, formatSimulationDate } from '../formatters';
import { getUnifiedInitialMarginRate } from '../dealers';
import { calculateBlackScholesGreeks } from '../blackScholes';
import { calculateExpectedCarry } from '../carryCalculator';
import { GameState, Company, RegionId, Region, TradeableInstrument, Position, FxPair, CATEGORY_TRADABILITY, OccupationType, OccupationPool, SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX, PrivateSectorSegment, CATEGORY_INPUT_REQUIREMENTS } from '../../types';
import { determineCreditRating } from './credit';
import { checkForIPO } from './ipo';
import { SECTOR_PRICING_POWER, SECTOR_WAGE_SENSITIVITY } from './constants';
import { evolveRegionMacro, evolveFxPair, evolveCommodity, calculateCompositeIndices, evolveBankingSector, evolveRegionalWeather } from '../macroEngine';
import { priceCommodityFutures } from '../pricing';
import { FIXED_SHARE_BY_RATING } from '../companyGenerator';

export function computeOccupationDemand(companies: Company[], privateSegments: PrivateSectorSegment[], regionId: RegionId, governmentEmployment?: number): Record<OccupationType, number> {
  const demand: Record<OccupationType, number> = { GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0, SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0 };
  companies.filter(c => c.region === regionId && !c.isDefaulted).forEach(c => {
    const mix = SECTOR_OCCUPATION_MIX[c.sector] ?? { GENERAL: 1.0 };
    Object.entries(mix).forEach(([occ, share]) => { demand[occ as OccupationType] += c.employeeCount * (share ?? 0); });
  });
  (privateSegments || []).forEach(seg => {
    const mix = PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType];
    if (mix) {
      Object.entries(mix).forEach(([occ, share]) => { demand[occ as OccupationType] += seg.employment * (share ?? 0); });
    }
  });
  if (governmentEmployment && governmentEmployment > 0) {
    const govMix: Record<OccupationType, number> = {
      GENERAL: 0.40,
      SPECIALIZED_PROFESSIONAL: 0.35,
      MANAGERIAL_FINANCIAL: 0.15,
      TECHNICAL_ENGINEERING: 0.10,
      SKILLED_TRADES: 0.00,
    };
    Object.entries(govMix).forEach(([occ, share]) => {
      demand[occ as OccupationType] += governmentEmployment * share;
    });
  }
  return demand;
}

export function getBlendedWageGrowth(mix: Partial<Record<OccupationType, number>>, pools: Record<OccupationType, OccupationPool>): number {
  if (!pools) return 0.03;
  return Object.entries(mix).reduce((s, [occ, share]) => s + (pools[occ as OccupationType]?.wageGrowthAnnual ?? 0.03) * (share ?? 0), 0);
}

export function advanceWeeklyStep(state: GameState): GameState {
  if (state.isGameOver) return state;

  const nextWeek = state.currentWeek + 1;
  const year = 2026 + Math.floor((nextWeek - 1) / 52);
  const currentWeekMod13 = ((nextWeek - 1) % 13) + 1;
  const recentIPOs = [...(state.recentIPOs || [])];

  // 1. Calculate Micro -> Macro Feedback metrics from previous corporate state
  const prevActiveFirms = state.companies.filter((c) => !c.isDefaulted);
  
  const regionFloatingPrincipal: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  prevActiveFirms.forEach(f => {
    const floatingSum = (f.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
    regionFloatingPrincipal[f.region] += floatingSum;
  });

  const regionTrackedHealthSignal: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  (['USA','EUR','UK','JPN'] as RegionId[]).forEach(rid => {
    const firms = prevActiveFirms.filter(f => f.region === rid);
    if (firms.length === 0) return;
    regionTrackedHealthSignal[rid] = firms.reduce((s, f) => s + (f.annualRevenue - f.baselineAnnualRevenue) / Math.max(1, f.baselineAnnualRevenue), 0) / firms.length;
  });

  const regionPublicCompanyEmployment: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  (['USA','EUR','UK','JPN'] as RegionId[]).forEach(rid => {
    regionPublicCompanyEmployment[rid] = prevActiveFirms.filter(f => f.region === rid).reduce((s, f) => s + f.employeeCount, 0);
  });

  const totalCapex = prevActiveFirms.reduce((sum, c) => sum + c.capex, 0);
  const avgMargin = prevActiveFirms.reduce((sum, c) => sum + (c.ebitda / Math.max(1, c.annualRevenue)), 0) / Math.max(1, prevActiveFirms.length);
  const marginCompression = avgMargin < 0.22 ? 0.22 - avgMargin : 0.0;
  const recentDefaultsCount = state.companies.filter((c) => c.isDefaulted || c.creditRating === 'CCC').length;
  const creditContagionBps = recentDefaultsCount * 12;
  const systemicStressFactorGlobal = Math.min(0.3, creditContagionBps / 500);

  // 2. Evolve Multi-Region Macro States
  const globalInflationShock = (Math.random() - 0.5) * 0.0008;
  const globalGdpShock = (Math.random() - 0.5) * 0.001;

  const rateChanges: { region: RegionId; deltaBps: number }[] = [];
  const diagnosticLogs: any[] = [];
  const updatedRegions: Record<RegionId, any> = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = (state.compositeIndices.us500.change1W / Math.max(1, state.compositeIndices.us500.value)) || 0;
    if (regionId === 'EUR') equityRet = (state.compositeIndices.euStoxx.change1W / Math.max(1, state.compositeIndices.euStoxx.value)) || 0;
    if (regionId === 'UK') equityRet = (state.compositeIndices.uk100.change1W / Math.max(1, state.compositeIndices.uk100.value)) || 0;
    if (regionId === 'JPN') equityRet = (state.compositeIndices.jp225.change1W / Math.max(1, state.compositeIndices.jp225.value)) || 0;

    const REGIONAL_BASE_GDP: Record<string, number> = {
      USA: 28_000_000_000_000,
      EUR: 18_000_000_000_000,
      UK: 3_400_000_000_000,
      JPN: 4_200_000_000_000
    };
    const regionFirms = prevActiveFirms.filter(f => f.region === regionId);
    
    const regionEmployment = regionFirms.reduce((sum, f) => sum + f.employeeCount, 0);
    const regionEmploymentLastWeek = state.companies.filter(f => f.region === regionId).reduce((sum, f) => sum + (f.previousEmployeeCount || f.employeeCount), 0);
    const employmentChangePct = (regionEmployment - regionEmploymentLastWeek) / Math.max(1, regionEmploymentLastWeek);
    const bottomUpUnemploymentDelta = -employmentChangePct * 0.1;
    
    const totalRegionalCapEx = regionFirms.reduce((sum, f) => sum + (f.capex || 0), 0);
    const baseGdp = REGIONAL_BASE_GDP[regionId] || 10_000_000_000_000;
    const baselineExpectedCapEx = (baseGdp * 0.03) / 52;
    const capexDeltaDollars = totalRegionalCapEx - baselineExpectedCapEx;
    const capexGdpImpactWeekly = capexDeltaDollars / baseGdp;
    const boundedGdpContribution = Math.max(-0.005, Math.min(0.005, capexGdpImpactWeekly * 52));

    const regionOccDemand = computeOccupationDemand(
      prevActiveFirms,
      state.regions[regionId].privateSectorSegments,
      regionId,
      state.regions[regionId].governmentEmployment
    );

    const { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      {
        capexGdpContribution: boundedGdpContribution,
        marginCompression,
        creditContagionBps,
        bottomUpUnemploymentDelta,
        businessLoanBookInputUSD: regionFloatingPrincipal[regionId],
        trackedHealthSignal: regionTrackedHealthSignal[regionId],
        publicCompanyEmployment: regionPublicCompanyEmployment[regionId],
        occupationDemand: regionOccDemand,
      },
      nextWeek,
      equityRet,
      state.commodities
    );
    updatedRegions[regionId] = updatedRegion;
    if (isMeeting) {
      rateChanges.push({ region: regionId, deltaBps: rateDeltaBps });
    }
    
    // Add Macro Diagnostic Telemetry to Log
    diagnosticLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  // V7: Cross-border reserve / balance-sheet stance spillover effect
  const allRegionIds = Object.keys(updatedRegions) as RegionId[];
  const globalStanceAvg = allRegionIds.reduce((s, r) => s + (updatedRegions[r].balanceSheetStance ?? 0), 0) / Math.max(1, allRegionIds.length);
  allRegionIds.forEach(r => {
    const spilloverEffect = (globalStanceAvg - (updatedRegions[r].balanceSheetStance ?? 0)) * 0.05; // pulled gently toward the global average
    updatedRegions[r].creditConditionsSpilloverAdjustment = spilloverEffect;
  });

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    const categorySupplyGrowth: Record<string, number> = {};
    (Object.keys(reg.categoryDemand) as string[]).forEach(cat => {
      const firmsInCat = prevActiveFirms.filter(f => f.region === regionId && (f.productLines || []).some(l => l.category === cat));
      if (firmsInCat.length === 0) { categorySupplyGrowth[cat] = 0; return; }
      categorySupplyGrowth[cat] = firmsInCat.reduce((s, f) => {
        const line = f.productLines.find(l => l.category === cat)!;
        return s + (f.growthCapex / Math.max(1, f.annualRevenue)) * line.revenueShare;
      }, 0) / firmsInCat.length;
    });

    // Household demand (G2)
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const householdTargets: Partial<Record<string, number>> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
    };

    // Government demand (G3), tied to fiscalStanceScore
    const govProcurementBase = reg.governmentSpendingUSD * 52 * 0.35; // annualized spending, ~35% of which is procurement-style (vs. transfers/employee comp)
    const fiscalMultiplier = 1 + Math.max(-0.3, Math.min(0.3, reg.fiscalStanceScore * 0.25));
    const govTargets: Partial<Record<string, number>> = {
      GovernmentDefense: govProcurementBase * 0.30 * fiscalMultiplier,
      GovernmentInfrastructure: govProcurementBase * 0.45 * fiscalMultiplier,
      GovernmentHealthcare: govProcurementBase * 0.25 * fiscalMultiplier,
    };

    // Corporate demand (G3), tied to aggregate CapEx
    const rawCorporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const corpTargets = { CorporateIndustrial: newLaggedCorporateDemandBase * 0.6, CorporateTech: newLaggedCorporateDemandBase * 0.4 };

    const allTargets = { ...householdTargets, ...govTargets, ...corpTargets };
    const smoothingByCategory: Partial<Record<string, number>> = {
      StapleHousehold: 0.1, StandardHousehold: 0.1, LuxuryHousehold: 0.1,
      GovernmentDefense: 0.05, GovernmentInfrastructure: 0.05, GovernmentHealthcare: 0.05,
      CorporateIndustrial: 0.08, CorporateTech: 0.08,
    };

    Object.keys(allTargets).forEach((cat) => {
      const target = (allTargets as any)[cat]!;
      const smoothing = (smoothingByCategory as any)[cat] ?? 0.1;
      const existingEntry = reg.categoryDemand[cat as keyof typeof reg.categoryDemand];
      const hasPriorDemand = Boolean(existingEntry && existingEntry.demandLevelUSD > 0);
      const prevLevel = hasPriorDemand ? existingEntry.demandLevelUSD : target;
      const newLevel = hasPriorDemand ? prevLevel * (1 - smoothing) + target * smoothing : target;
      const rawGrowthAnnual = hasPriorDemand && prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      const growthAnnual = Math.max(-0.25, Math.min(0.25, rawGrowthAnnual));
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

    Object.keys(reg.categoryDemand).forEach(cat => {
      const entry = reg.categoryDemand[cat as any] as any;
      if (entry.inventoryLevelUSD === undefined) return;
      entry.inventoryLevelUSD = Math.max(0, (entry.inventoryLevelUSD ?? 0) + (entry.demandLevelUSD ?? 0) * 0.02 / 52);
    });

    // Stage 4: Input-Output Map + Weekly Clearing Bidding
    Object.keys(CATEGORY_INPUT_REQUIREMENTS).forEach(cat => {
      const requirements = CATEGORY_INPUT_REQUIREMENTS[cat];
      if (!requirements) return;
      Object.entries(requirements).forEach(([inputCat, intensity]) => {
        const supplier = reg.categoryDemand[inputCat as any] as any;
        const demander = reg.categoryDemand[cat as any] as any;
        if (!supplier || !demander) return;

        const lastWeekInventory = supplier.lastWeekInventoryLevelUSD ?? supplier.inventoryLevelUSD ?? 0;
        const weeklyProduction = (supplier.demandLevelUSD ?? 0) * 0.02 / 52;
        const totalAvailableSupply = lastWeekInventory + weeklyProduction;

        const bidQuantity = (demander.demandLevelUSD ?? 0) * (intensity ?? 0) / 52;
        const clearingRatio = totalAvailableSupply > 0 ? bidQuantity / totalAvailableSupply : 1;

        const targetPriceIndex = Math.max(0.5, Math.min(2.0, 1.0 + (clearingRatio - 1.0) * 0.4));
        const newPriceIndex = (supplier.clearedInputPriceIndex ?? 1.0) * 0.85 + targetPriceIndex * 0.15;

        const quantityFulfilled = Math.min(bidQuantity, totalAvailableSupply);
        const fulfillmentRatio = bidQuantity > 0 ? quantityFulfilled / bidQuantity : 1;

        supplier.clearedInputPriceIndex = Number(newPriceIndex.toFixed(4));
        supplier.inventoryLevelUSD = Math.max(0, totalAvailableSupply - quantityFulfilled);
        demander.inputCostPressure = Number(Math.max(0, newPriceIndex - 1.0).toFixed(4));
        demander._fulfillmentRatio = fulfillmentRatio; // transient, read by AA3 same week, not persisted
      });
    });
    // after the loop, snapshot this week's inventory as next week's lag anchor:
    Object.keys(reg.categoryDemand).forEach(cat => {
      const entry = reg.categoryDemand[cat as any] as any;
      entry.lastWeekInventoryLevelUSD = entry.inventoryLevelUSD ?? 0;
    });
  });

  function computeRealizedVol(historicalValues: number[], window: number): number {
    const recent = historicalValues.slice(-window);
    if (recent.length < 2) return 0.15;
    const returns = recent.slice(1).map((v, i) => Math.log(v / recent[i]));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance * 52);
  }
  const realizedIndexVol = computeRealizedVol(state.compositeIndices.us500.historical ?? [], 13);
  const baselineVol = 0.16;
  const usaRegime = updatedRegions.USA.cycleRegime;
  const regimeVolPremium = usaRegime === 'Recession' ? 0.08 : usaRegime === 'Slowdown' ? 0.03 : 0;
  const marketVolComponent = Math.max(0, realizedIndexVol - baselineVol) * 0.5 + regimeVolPremium;

  // 3. Evolve FX Pairs
  const updatedFxPairs = state.fxPairs.map((fx) => evolveFxPair(fx, updatedRegions));

  const getFxToUsd = (regionId: RegionId): number => {
    if (regionId === 'USA') return 1.0;
    if (regionId === 'EUR') {
      const eurUsd = updatedFxPairs.find((p) => p.pair === 'EUR/USD');
      return eurUsd ? eurUsd.rate : 1.08;
    }
    if (regionId === 'UK') {
      const gbpUsd = updatedFxPairs.find((p) => p.pair === 'GBP/USD');
      return gbpUsd ? gbpUsd.rate : 1.29;
    }
    if (regionId === 'JPN') {
      const usdjpy = updatedFxPairs.find((p) => p.pair === 'USD/JPY');
      return usdjpy ? 1 / usdjpy.rate : 1 / 154;
    }
    return 1.0;
  };

  // Trade Dynamics (Phase 3: T1)
  function computeRegionalCompetitiveness(companies: Company[], regionId: RegionId, category: string): number {
    const firms = companies.filter(c => c.region === regionId && !c.isDefaulted && (c.productLines || []).some(l => l.category === category));
    if (firms.length === 0) return 0;
    return firms.reduce((s, f) => {
      const line = f.productLines.find(l => l.category === category)!;
      return s + line.competitiveness * line.categoryMarketShare;
    }, 0) / firms.length;
  }

  function getFxCompetitivenessAdjustment(exporter: RegionId, importer: RegionId, fxPairs: FxPair[]): number {
    const pair = fxPairs.find(f => (f.base === exporter && f.quote === importer) || (f.base === importer && f.quote === exporter));
    if (!pair) return 0;
    const direction = pair.base === exporter ? -1 : 1; // if exporter is the base currency, a RISING rate means exporter is depreciating (rate = quote-per-base) — cheaper exports, so flip sign
    return Math.max(-0.1, Math.min(0.1, (pair.change1W / pair.rate) * direction * 5));
  }

  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];
  const regionExports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionImports: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  const regionCategoryExports: Record<RegionId, Record<string, number>> = {
    USA: {},
    EUR: {},
    UK: {},
    JPN: {},
  };

  regionIds.forEach(exporter => {
    regionIds.filter(r => r !== exporter).forEach(importer => {
      Object.keys(CATEGORY_TRADABILITY).forEach(cat => {
        const tradability = CATEGORY_TRADABILITY[cat];
        if (tradability < 0.1) return; // not worth computing for near-untradable categories
        const importerDemand = updatedRegions[importer].categoryDemand[cat as any]?.demandLevelUSD ?? 0;
        const exporterCompetitiveness = computeRegionalCompetitiveness(state.companies, exporter, cat);
        const fxCompetitiveness = getFxCompetitivenessAdjustment(exporter, importer, updatedFxPairs);
        const exportShareCapture = Math.max(0, Math.min(0.4, 0.1 + exporterCompetitiveness * 0.5 + fxCompetitiveness));
        const flow = importerDemand * tradability * exportShareCapture / regionIds.length; // divided since multiple exporters compete for the same import demand
        regionExports[exporter] += flow;
        regionImports[importer] += flow;
        regionCategoryExports[exporter][cat] = (regionCategoryExports[exporter][cat] ?? 0) + flow;
      });
    });
  });

  regionIds.forEach(r => {
    updatedRegions[r].exportsUSD = regionExports[r];
    updatedRegions[r].importsUSD = regionImports[r];
    updatedRegions[r].tradeBalance = regionExports[r] - regionImports[r];
  });

  // 4. Evolve Commodities
  const updatedCommodities = state.commodities.map((comm) =>
    evolveCommodity(comm, updatedRegions.USA.gdpGrowth, updatedRegions.USA.policyRate, updatedRegions)
  );

  // 5. Evolve 200 Company Fundamentals + Asynchronous Earnings + Debt Prepayment + M&A
  const ratingChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[] = [];
  const refinanceNews: NewsItem[] = [];
  const defaultedTickers: string[] = [];
  const earningsReportedThisTurn: EarningsReportEvent[] = [];

  const updatedCompanies: Company[] = state.companies.map((comp) => {
    if (comp.isDefaulted) {
      return { ...comp, previousEmployeeCount: 0, employeeCount: 0 };
    }

    const reg = updatedRegions[comp.region];
    const sec = SECTOR_BENCHMARKS[comp.sector];

    // Interest Expense (computed early so Banks can skip or use it if they had standard debt, but they mostly rely on BankingSector)
    const nonMaturingTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    const annualInterest = nonMaturingTranches.reduce((sum, t) => {
      if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
      return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
    }, 0);
    const weeklyInterest = annualInterest / 52;
    const effectiveDebtRate = annualInterest / Math.max(1, comp.totalDebt);
    const taxRate = 0.21;

    let updatedProductLines = comp.productLines || []; let newRevenue = 0;
    let baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    let newEbitdaMargin = 0;
    let newEbitda = 0;
    let newEbit = 0;
    let newNetIncome = 0;
    let newEps = 0;
    let newInputSupplyConstraintFactor = comp.inputSupplyConstraintFactor ?? 1.0;

    const executionNoise = (Math.random() - 0.5) * 0.3;
    const newExecutionQuality = Math.max(0.4, Math.min(1.8, (comp.executionQuality ?? 1.0) * 0.92 + 1.0 * 0.08 + executionNoise * 0.08));

    if (comp.sector === 'Banks') {
      const bs = reg.bankingSector;
      const share = comp.bankMarketShare ?? 0.25;
      const totalAssets = bs.businessLoanBookUSD + bs.consumerLoanBookUSD + bs.sovereignBondHoldingsUSD;
      const annualizedNetIncome = (bs.netInterestMarginPct * totalAssets - bs.businessLoanBookUSD * bs.loanLossProvisionRateAnnualPct) * share;
      const impliedRevenue = bs.netInterestMarginPct * totalAssets * share * 2.2;
      const impliedEbitda = annualizedNetIncome * 1.3;
      
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (impliedRevenue * 0.10));
      newEbitda = Math.max(5, (comp.ebitda * 0.90) + (impliedEbitda * 0.10));
      newEbitdaMargin = newEbitda / Math.max(1, newRevenue);
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);
      newNetIncome = annualizedNetIncome;
      newEps = Number((annualizedNetIncome / Math.max(1, comp.sharesOutstanding)).toFixed(2));
    } else {
      // Consumer Revenue Beta
      const creditTighteningPenalty = Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.015;
      const effectiveConsumptionGrowth = reg.householdState.realConsumptionGrowth - creditTighteningPenalty;


      // Weekly revenue transition
      const noise = (Math.random() - 0.5) * 0.015;
      const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;

      
      const SECTOR_REGIME_TILT: Record<string, Partial<Record<'Expansion' | 'Slowdown' | 'Recession' | 'Recovery', number>>> = {
        Industrials: { Expansion: 0.0015, Recovery: 0.002, Recession: -0.0015 },
        Energy:      { Expansion: 0.0012, Recovery: 0.0018, Recession: -0.001 },
        Tech:        { Expansion: 0.0015, Recovery: 0.0025, Recession: -0.002 },
        Consumer:    { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Healthcare:  { Recession: 0.0008, Slowdown: 0.0005 }, // defensive tailwind
        Utilities:   { Recession: 0.0006, Slowdown: 0.0004 },
      };

      const curveSlope = (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor10Y ?? 0) - (updatedRegions[comp.region].historicalZeroCurves.at(-1)?.tenor2Y ?? 0);
      const financialsTilt = comp.sector === 'Financials' ? Math.max(-0.001, Math.min(0.001, curveSlope * 0.02)) : 0;
      const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime as 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery'] ?? 0;

      // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
      const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
      // Operating margins update (Wage-Push compression, capacity decay, and competitive crowding)
      const capacityDecayPenalty = Math.min(0.08, (comp.maintenanceShortfallStreak ?? 0) * 0.003); // up to 8% margin erosion after ~27 consecutive underfunded weeks
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const compOccMix = SECTOR_OCCUPATION_MIX[comp.sector] ?? { GENERAL: 1.0 };
      const compWageGrowth = getBlendedWageGrowth(compOccMix, reg.occupationPools);
      const wageCompression = Math.max(0, compWageGrowth - 0.025) * 0.15 * wageSensitivity;
      const avgCrowdingIntensity = (comp.productLines || []).reduce((s, l) => {
        const catDemand = reg.categoryDemand[l.category as any];
        return s + (catDemand?.crowdingIntensity ?? 0) * l.revenueShare;
      }, 0);

      const compInputCategories = (comp.productLines || []).map(l => l.category).filter(c => CATEGORY_INPUT_REQUIREMENTS[c]);
      const relevantFulfillment = compInputCategories.length > 0
        ? compInputCategories.reduce((min, c) => Math.min(min, (reg.categoryDemand[c as any] as any)?._fulfillmentRatio ?? 1), 1)
        : 1;
      newInputSupplyConstraintFactor = Math.max(0.5, Math.min(1.0, (comp.inputSupplyConstraintFactor ?? 1.0) * 0.7 + relevantFulfillment * 0.3));

      const inputPriceDrag = compInputCategories.length > 0
        ? compInputCategories.reduce((s, c) => s + ((reg.categoryDemand[c as any] as any)?.inputCostPressure ?? 0), 0) / compInputCategories.length
        : 0;

      baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      const baselineMargin = comp.baselineEbitdaMargin ?? (comp.ebitda / Math.max(1, comp.annualRevenue));
      const targetMargin = Math.min(0.65, Math.max(0.04, baselineMargin - wageCompression - capacityDecayPenalty - avgCrowdingIntensity * 0.08 - inputPriceDrag * 0.03));
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin * 0.96 + targetMargin * 0.04 + (Math.random() - 0.5) * 0.004));

      const growthCapexToRev = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
      const estRateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
      const estCashHealth = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
      const estTobinsQ = comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5);
      const estQCapexEffect = Math.max(-0.15, Math.min(0.15, (estTobinsQ - 1) * 0.2));
      const estAvgComp = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
      const estCompEffect = Math.max(-0.1, Math.min(0.1, estAvgComp * 0.15));
      const estTargetGrowthCapex = baseRev * growthCapexToRev * (1 - estRateDrag) * estCashHealth * (1 + estQCapexEffect + estCompEffect);
      const estNewGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + estTargetGrowthCapex * 0.10);
      const growthInvestmentSignal = Math.max(-0.5, Math.min(0.5, ((estNewGrowthCapex - (comp.growthCapex ?? (comp.capex * 0.4))) / Math.max(1, (comp.growthCapex ?? (comp.capex * 0.4)))) * newExecutionQuality));

      let categoryDrivenGrowth = 0;
      updatedProductLines = (comp.productLines || []).map((line) => {
        const catDemand = reg.categoryDemand[line.category as any];
        const isHouseholdFacing = ['StapleHousehold', 'StandardHousehold', 'LuxuryHousehold'].includes(line.category);
        const categoryGrowth = (catDemand?.demandGrowthAnnual ?? reg.gdpGrowth) - (isHouseholdFacing ? creditTighteningPenalty : 0);
        const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
        // Mean reversion drag on competitiveness for outsized market share to prevent permanent monopolies (BUG-07)
        const highShareDrag = Math.max(0, (line.categoryMarketShare - 0.15) * 2.0);
        const targetCompetitiveness = Math.max(-1, Math.min(1, marginEdge * 10 + growthInvestmentSignal * 0.3 - highShareDrag));
        const newCompetitiveness = Number((line.competitiveness * 0.98 + targetCompetitiveness * 0.02).toFixed(3));
        const dominanceDrag = line.categoryMarketShare > 0.30 ? (line.categoryMarketShare - 0.30) * 0.5 : 0;
        const shareGainRate = Math.max(-0.01, Math.min(0.01, newCompetitiveness * 0.02 - dominanceDrag));
        const newCategoryMarketShare = Math.max(0.001, Math.min(0.50, line.categoryMarketShare * (1 + shareGainRate / 52)));
        
        const lineGrowth = categoryGrowth + shareGainRate;
        
        categoryDrivenGrowth += lineGrowth * line.revenueShare;
        const shouldSnapshot = nextWeek % 13 === 0;
        return {
          ...line,
          previousCategoryMarketShare: line.categoryMarketShare,
          categoryMarketShare13WeeksAgo: shouldSnapshot ? line.categoryMarketShare : (line.categoryMarketShare13WeeksAgo ?? line.categoryMarketShare),
          competitiveness: newCompetitiveness,
          categoryMarketShare: newCategoryMarketShare,
        };
      });
        const exportRevenueBoost = (comp.productLines || []).reduce((s, line) => {
          const tradability = CATEGORY_TRADABILITY[line.category] ?? 0;
          if (tradability < 0.1) return s;
          // this company's share of ITS region's export capture in this category, proportional to its domestic share
          const regionExportsInCat = regionCategoryExports[comp.region]?.[line.category] ?? 0;
          return s + (regionExportsInCat * line.categoryMarketShare * line.revenueShare) / Math.max(1, comp.annualRevenue);
        }, 0);
        const distressPenalty = comp.isDefaulted ? 0.50 : 1.0;
        const targetAnnualRevenue = baseRev * (1 + categoryDrivenGrowth + exportRevenueBoost + noise + reg.inflation * pricingPowerBeta) * distressPenalty * newInputSupplyConstraintFactor;
      
      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));
      newEbitda = newRevenue * newEbitdaMargin;
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);

      newNetIncome = Math.max(-50, (newEbit - annualInterest) * (1 - taxRate));
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    }

    // Maintenance — funded, not assumed:
    // 1. What maintenance WOULD cost if fully funded (capacity-based target)
    const maintenanceCapexToRevenueRatio = (comp.maintenanceCapex ?? (comp.capex * 0.6)) / Math.max(1, comp.annualRevenue);
    const targetMaintenanceCapex = newRevenue * maintenanceCapexToRevenueRatio;
    const weeklyDesiredMaintenanceCapex = targetMaintenanceCapex / 52;

    // 2. What the company can actually fund this week — operating cash + a small cash draw + limited new borrowing (IG only), never unlimited
    const weeklyOperatingCashFlow = newEbitda / 52 - weeklyInterest;
    const isInvestmentGrade = ['AAA', 'AA', 'A', 'BBB'].includes(comp.creditRating);
    const maintenanceBorrowingCapacity = isInvestmentGrade ? weeklyDesiredMaintenanceCapex * 0.5 : 0; // a distressed company cannot borrow its way out of deferred upkeep
    const availableFundingForMaintenance = Math.max(0, weeklyOperatingCashFlow) + Math.max(0, comp.cash) * 0.05 + maintenanceBorrowingCapacity;

    // 3. Fund what's affordable, defer the rest
    const weeklyFundedMaintenance = Math.min(weeklyDesiredMaintenanceCapex, availableFundingForMaintenance);
    const fundedMaintenanceCapex = weeklyFundedMaintenance * 52;
    const maintenanceShortfallThisWeek = Math.max(0, targetMaintenanceCapex - fundedMaintenanceCapex);
    const weeklyDebtFundedPortion = Math.max(0, Math.min(weeklyFundedMaintenance, maintenanceBorrowingCapacity) - Math.max(0, weeklyOperatingCashFlow));
    const newMaintenanceCapex = Math.max(0, (comp.maintenanceCapex ?? (comp.capex * 0.6)) * 0.95 + fundedMaintenanceCapex * 0.05);

    // 4. Debt-funded maintenance becomes a real new floating tranche — genuinely raises leverage and next week's interest, not a free lunch
    let maintenanceFundingTranches: DebtTranche[] = [];
    if (weeklyDebtFundedPortion > 1000) {
      const currentBaseSpreadBps = RATING_OAS_SPREADS[comp.creditRating]?.baseBps ?? comp.oasSpreadBps;
      maintenanceFundingTranches = [{
        id: `${comp.ticker}-MAINT-${nextWeek}`,
        principalUSD: weeklyDebtFundedPortion,
        rateType: 'FLOATING',
        floatingMarginBps: Math.round(currentBaseSpreadBps * 1.1), // priced wide — bridge/revolver-style, not term financing
        originationWeek: nextWeek,
        maturityWeek: nextWeek + 260,
        seniority: 'SENIOR',
      }];
    }

    // 5. Deferred maintenance compounds into real operational decay
    const newMaintenanceShortfallStreak = maintenanceShortfallThisWeek > 0
      ? (comp.maintenanceShortfallStreak ?? 0) + 1
      : Math.max(0, (comp.maintenanceShortfallStreak ?? 0) - 2); // recovers twice as fast as it accumulates

    // Growth — fully discretionary, now disciplined by addressable opportunity:
    // Genuine reinvestment opportunity — bounded by how fast this company's actual addressable categories are growing, not by ambition
    const avgCategoryOpportunity = (comp.productLines || []).reduce((s, l) => {
      const catDemand = reg.categoryDemand[l.category as any];
      return s + Math.max(0, catDemand?.demandGrowthAnnual ?? 0) * l.revenueShare;
    }, 0);
    const productiveReinvestmentEnvelope = newRevenue * Math.max(0.01, avgCategoryOpportunity) * 1.5; // generous multiple of addressable growth, not arbitrary

    const fcfBeforeGrowthCapex = Math.max(0, weeklyOperatingCashFlow * 52 - newMaintenanceCapex);
    const excessCashGeneration = Math.max(0, fcfBeforeGrowthCapex - productiveReinvestmentEnvelope);
    const payoutPressure = fcfBeforeGrowthCapex > 0 ? Math.min(1, excessCashGeneration / fcfBeforeGrowthCapex) : 0;

    const growthCapexToRevenueRatio = comp.baselineGrowthCapexToRevenueRatio ?? ((comp.growthCapex ?? (comp.capex * 0.4)) / Math.max(1, comp.annualRevenue));
    const rateDrag = Math.max(0, effectiveDebtRate - 0.04) * 2.0;
    const cashHealthFactor = comp.cash < 0 ? 0.05 : (comp.cash < comp.currentLiabilities * 0.25 ? 0.4 : 1.0);
    const tobinsQ = comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5);
    const qCapexEffect = Math.max(-0.15, Math.min(0.15, (tobinsQ - 1) * 0.2));
    const avgCompetitiveness = (comp.productLines || []).reduce((s, l) => s + l.competitiveness, 0) / Math.max(1, (comp.productLines || []).length);
    const competitivenessCapexEffect = Math.max(-0.1, Math.min(0.1, avgCompetitiveness * 0.15));
    const growthCapexAllocationShare = Math.max(0.4, 1 - payoutPressure * 0.75); // even at max payout pressure, still reinvests at least 40% — realistic, not zero
    const targetGrowthCapex = newRevenue * growthCapexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect + competitivenessCapexEffect) * growthCapexAllocationShare;
    const newGrowthCapex = Math.max(0, (comp.growthCapex ?? (comp.capex * 0.4)) * 0.90 + targetGrowthCapex * 0.10);

    const newCapex = comp.sector === 'Banks' ? 0 : (newMaintenanceCapex + newGrowthCapex);

    // Weekly Cash flow and debt amortization / prepayment
    const weeklyFreeCashFlow = comp.sector === 'Banks'
      ? (newNetIncome / 52)
      : (newEbitda / 52 - newCapex / 52 - weeklyInterest + weeklyDebtFundedPortion);
    let newCash = comp.cash + weeklyFreeCashFlow;
    let newTotalDebt = comp.totalDebt;

    const newBaselineDividendYield = Number((comp.baselineDividendYield * 0.998 + comp.dividendYield * 0.002).toFixed(4));
    const targetDivYield = newBaselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0)) * (1 + payoutPressure * 2.5);
    const newDividendYield = Math.max(0, comp.dividendYield * 0.9 + targetDivYield * 0.1);

    const headcountPressure = newCash < 0 ? -0.015 : (newEbitdaMargin < baseEbitdaMargin - 0.01 ? -0.002 : (reg.cycleRegime === 'Expansion' ? 0.001 : (reg.cycleRegime === 'Recession' ? -0.002 : 0)));
    const newEmployeeCount = Math.max(10, Math.round(comp.employeeCount * (1 + headcountPressure)));

    // Debt Prepayment Rule: When Cash > 2.5x Current Liabilities, retire debt principal
    if (newCash > 2.5 * comp.currentLiabilities && newTotalDebt > 50) {
      const prepayment = Math.min(newTotalDebt * 0.05, (newCash - 2.5 * comp.currentLiabilities) * 0.25);
      newCash -= prepayment;
      newTotalDebt -= prepayment;
    }

    // Credit metrics
    const newLeverage = comp.sector === 'Banks'
      ? Number((newTotalDebt / Math.max(1, newRevenue * 0.4)).toFixed(2))
      : Number((newTotalDebt / Math.max(1, newEbitda)).toFixed(2));
    const newCoverage = comp.sector === 'Banks'
      ? (reg.bankingSector.bankCapitalRatio < 0.05 ? 0.4 : 3.0)
      : Number((newEbit / Math.max(0.5, annualInterest)).toFixed(2));

    // Default trigger: Cash < 0 and Coverage < 0.8x (or previously defaulted)
    let isDefaulted = comp.isDefaulted || (newCash < 0 && newCoverage < 0.8);
    let newRating = comp.creditRating;

    if (isDefaulted) {
      newRating = 'D';
      if (!comp.isDefaulted) {
        defaultedTickers.push(comp.ticker);
        newRevenue = Number((newRevenue * 0.4).toFixed(1));
        newEbitda = 0;
        newEbit = 0;
      }
    } else {
      const calculatedRating = determineCreditRating(newLeverage, newCoverage);
      if (calculatedRating !== comp.creditRating && Math.random() < 0.25) {
        ratingChanges.push({
          ticker: comp.ticker,
          from: comp.creditRating,
          to: calculatedRating,
          name: comp.name,
        });
        newRating = calculatedRating;
      }
    }

    // Dynamic OAS credit spread & Leveraged Loan pricing
    const systemicCreditSpreadBps = Math.max(0, reg.bankingSector.creditConditionsIndex) * 150;
    const ratingSpreadConfig = RATING_OAS_SPREADS[newRating];
    const targetOasBps = ratingSpreadConfig.baseBps + (newLeverage > 4 ? (newLeverage - 4) * 50 : 0) + systemicCreditSpreadBps;
    const maturingTranche = comp.debtTranches.find(t => t.maturityWeek === nextWeek);
    let updatedTranches = comp.debtTranches.filter(t => t.maturityWeek !== nextWeek);
    let refinancingNewsItem: NewsItem | null = null;
    let refinancingSpreadShockBps = 0; // Kept to 0, or calculated if needed, but we rely on new interest calc now

    if (maturingTranche) {
      const currentFixedShare = FIXED_SHARE_BY_RATING[comp.creditRating] ?? 0.5; // re-evaluated at CURRENT rating
      const refinanceAsFixed = Math.random() < currentFixedShare;
      const currentBaseSpreadBps = RATING_OAS_SPREADS[comp.creditRating]?.baseBps ?? comp.oasSpreadBps;
      const sovParams10Y = updatedRegions[comp.region].yieldCurveParams;
      const tenYearSovRate = calculateNelsonSiegelZeroRate(10, sovParams10Y);

      const newTranche: DebtTranche = refinanceAsFixed
        ? {
            id: `${comp.ticker}-T${nextWeek}`,
            principalUSD: maturingTranche.principalUSD,
            rateType: 'FIXED',
            couponRate: tenYearSovRate + currentBaseSpreadBps / 10000,
            originationWeek: nextWeek,
            maturityWeek: nextWeek + 520,
            seniority: 'SENIOR',
          }
        : {
            id: `${comp.ticker}-T${nextWeek}`,
            principalUSD: maturingTranche.principalUSD,
            rateType: 'FLOATING',
            floatingMarginBps: Math.round(currentBaseSpreadBps * 0.85),
            originationWeek: nextWeek,
            maturityWeek: nextWeek + 260,
            seniority: 'SENIOR',
          };
      updatedTranches = [...updatedTranches, newTranche];

      const oldRateDescription = maturingTranche.rateType === 'FIXED' ? `${((maturingTranche.couponRate ?? 0) * 100).toFixed(1)}% fixed` : `policy+${maturingTranche.floatingMarginBps}bps floating`;
      const newRateDescription = newTranche.rateType === 'FIXED' ? `${((newTranche.couponRate ?? 0) * 100).toFixed(1)}% fixed` : `policy+${newTranche.floatingMarginBps}bps floating`;
      refinancingNewsItem = {
        id: `refinance-${comp.ticker}-${nextWeek}`,
        week: nextWeek,
        title: `${comp.ticker} Refinances Maturing Tranche`,
        description: `${comp.name} refinanced a maturing ${formatCurrency(maturingTranche.principalUSD, { compact: true })} tranche (was ${oldRateDescription}) into a new ${newRateDescription} tranche.`,
        category: 'CREDIT',
        impactBadge: newTranche.rateType === 'FLOATING' && maturingTranche.rateType === 'FIXED' ? '[REFINANCING SQUEEZE]' : '[REFINANCING]',
        impactRegion: comp.region,
        impactSector: comp.sector,
        sentimentDelta: newTranche.rateType === 'FLOATING' && maturingTranche.rateType === 'FIXED' ? -0.05 : 0,
        affectedTicker: comp.ticker,
        urgent: true,
      };
      refinanceNews.push(refinancingNewsItem);
    }

    if (maintenanceFundingTranches.length > 0) {
      updatedTranches = [...updatedTranches, ...maintenanceFundingTranches];
    }

    const newOasBps = Math.round(
      comp.oasSpreadBps + (targetOasBps - comp.oasSpreadBps) * 0.35 + refinancingSpreadShockBps + (Math.random() - 0.5) * 5
    );
    const newCdsSpreadBps = newOasBps + Math.floor(Math.random() * 8 - 4);

    const loanPricing = priceLeveragedLoan(
      comp.leveragedLoan.quotedMarginBps,
      newOasBps,
      comp.leveragedLoan.tenorYears,
      isDefaulted,
      0.65
    );

    // Asynchronous Quarterly Earnings cycle
    const isReportingThisWeek = !isDefaulted && comp.earningsWeekModulo === currentWeekMod13;
    let lastEarningsSurprisePct = comp.lastEarningsSurprisePct;
    let lastManagementCommentary = comp.lastManagementCommentary;
    let sentimentDelta = 0;

    let updatedConsensus = comp.dealerConsensus;

    if (isReportingThisWeek) {
      // Mean of Dealer Alpha, Beta, and Gamma estimates
      const alphaEps = comp.dealerConsensus?.alpha?.eps ?? comp.eps;
      const betaEps = comp.dealerConsensus?.beta?.eps ?? comp.eps;
      const gammaEps = comp.dealerConsensus?.gamma?.eps ?? comp.eps;
      const consensusEps = Number(((alphaEps + betaEps + gammaEps) / 3).toFixed(2));
      const actualEps = newEps;
      const epsDiff = actualEps - consensusEps;
      const rawSurprise = epsDiff / Math.max(Math.abs(consensusEps), Math.abs(actualEps), 1.0);
      lastEarningsSurprisePct = Number(Math.max(-2.0, Math.min(2.0, rawSurprise)).toFixed(3));

      // Management commentary & guidance snippet generation
      let guidanceSnippet = '';
      if (lastEarningsSurprisePct > 0.05) {
        guidanceSnippet = 'Management raises FY CapEx and operating margin guidance on strong forward demand.';
        lastManagementCommentary = `CEO affirmed record operational throughput and upgraded full-year EPS guidance (+${(lastEarningsSurprisePct * 100).toFixed(1)}% surprise).`;
        sentimentDelta = Math.min(0.35, lastEarningsSurprisePct * 2.0);
      } else if (lastEarningsSurprisePct < -0.05) {
        guidanceSnippet = 'Management moderates full-year revenue outlook and tightens working capital due to input cost pressures.';
        lastManagementCommentary = `Management cited sector supply headwinds and moderated CapEx plans (${(lastEarningsSurprisePct * 100).toFixed(1)}% miss).`;
        sentimentDelta = Math.max(-0.40, lastEarningsSurprisePct * 2.5);
      } else {
        guidanceSnippet = 'Management reaffirms FY baseline guidance with stable unit economics and operating backlog.';
        lastManagementCommentary = `In-line quarterly results with steady gross margins and stable backlog demand.`;
        sentimentDelta = (Math.random() - 0.5) * 0.05;
      }

      earningsReportedThisTurn.push({
        ticker: comp.ticker,
        name: comp.name,
        actualEps,
        consensusEps,
        surprisePct: lastEarningsSurprisePct,
        guidanceSnippet,
        sector: comp.sector,
        region: comp.region,
      });

      // Update next quarter 3-dealer forecasts
      const nextQuarterBaseEps = actualEps * (1 + sec.growthRate / 4);
      const nextAlphaEps = Number((nextQuarterBaseEps * 0.96).toFixed(2));
      const nextBetaEps = Number((nextQuarterBaseEps * (1 + reg.gdpGrowth)).toFixed(2));
      const nextGammaEps = Number((nextQuarterBaseEps * 1.08).toFixed(2));
      const newConsensusEps = Number(((nextAlphaEps + nextBetaEps + nextGammaEps) / 3).toFixed(2));

      const nextQuarterBaseRev = newRevenue * (1 + sec.growthRate / 4);
      const alphaRev = Number((nextQuarterBaseRev * 0.98).toFixed(1));
      const betaRev = Number((nextQuarterBaseRev * 1.02).toFixed(1));
      const gammaRev = Number((nextQuarterBaseRev * 1.06).toFixed(1));
      const newConsensusRev = Number(((alphaRev + betaRev + gammaRev) / 3).toFixed(1));

      updatedConsensus = {
        alpha: { eps: nextAlphaEps, revenue: alphaRev },
        beta: { eps: nextBetaEps, revenue: betaRev },
        gamma: { eps: nextGammaEps, revenue: gammaRev },
        consensusEps: newConsensusEps,
        consensusRevenue: newConsensusRev,
      };
    }

    const sectorPE = SECTOR_BENCHMARKS[comp.sector]?.basePE ?? 15;
    const realRate = reg.policyRate - reg.inflation;
    const rateEffect = -(realRate - reg.neutralRate) * 8;
    const growthEffect = (reg.gdpGrowth - reg.potentialGdpGrowth) * 4;
    const targetPE = sectorPE * (1 + Math.max(-0.5, Math.min(0.5, rateEffect + growthEffect)));
    const newForwardPE = Number((comp.forwardPE * 0.97 + Math.max(sectorPE * 0.5, Math.min(sectorPE * 1.6, targetPE)) * 0.03).toFixed(2));

    const newSentiment = Math.max(-1.0, Math.min(1.0, comp.sentiment * 0.85 + sentimentDelta));
    const newStockPrice = isDefaulted ? 0.0 : Number(priceEquity(newEps, newForwardPE, newSentiment, false).toFixed(2));
    const hist = [...comp.historicalPrices.slice(-51), newStockPrice];
    const newMarketCap = Number((newStockPrice * comp.sharesOutstanding).toFixed(0));
    const newSeniorBondYield = reg.zeroRates.tenor5Y + newOasBps / 10000;

    const quarterIdx = Math.floor((nextWeek - 1) / 13) + 4;
    const currentSnapshot = {
      week: nextWeek,
      filingPeriod: formatQuarterFilingDate(quarterIdx),
      filingDate: formatSimulationDate(nextWeek),
      annualRevenue: Number(newRevenue.toFixed(1)),
      ebitda: Number(newEbitda.toFixed(1)),
      ebit: Number(newEbit.toFixed(1)),
      netIncome: Number(newNetIncome.toFixed(1)),
      cash: Number(newCash.toFixed(1)),
      totalDebt: Number(newTotalDebt.toFixed(1)),
      leverage: newLeverage,
      interestCoverage: newCoverage,
      eps: newEps,
      creditRating: newRating,
    };
    const histFundamentals = isReportingThisWeek
      ? [...(comp.historicalFundamentals || []).slice(-3), currentSnapshot]
      : comp.historicalFundamentals || [];

    const systemicStressFactor = systemicStressFactorGlobal + Math.max(0, reg.bankingSector.creditConditionsIndex) * 0.3;
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));
    const trendWeeklyGrowth = (reg.potentialGdpGrowth + reg.targetInflation) / 52;
    const newBaselineAnnualRevenue = isDefaulted
      ? Number((comp.baselineAnnualRevenue * 0.995).toFixed(1))
      : Number((comp.baselineAnnualRevenue * (1 + trendWeeklyGrowth)).toFixed(1));

    return {
      ...comp,
      forwardPE: newForwardPE,
      baselineRecoveryRate: newBaselineRecoveryRate,
      baselineDividendYield: newBaselineDividendYield,
      previousEmployeeCount: comp.employeeCount,
      previousCapex: comp.capex,
      maintenanceCapex: Number(newMaintenanceCapex.toFixed(1)),
      growthCapex: Number(newGrowthCapex.toFixed(1)),
      maintenanceShortfallStreak: newMaintenanceShortfallStreak,
      executionQuality: Number(newExecutionQuality.toFixed(3)),
      inputSupplyConstraintFactor: Number(newInputSupplyConstraintFactor.toFixed(4)),
      employeeCount: isDefaulted ? 0 : newEmployeeCount,
      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),
      debtTranches: updatedTranches,
      productLines: updatedProductLines,
      totalDebt: updatedTranches.reduce((s, t) => s + t.principalUSD, 0),
      dividendYield: Number(newDividendYield.toFixed(4)),
      capex: Number(newCapex.toFixed(1)),
      annualRevenue: Number(newRevenue.toFixed(1)),
      baselineAnnualRevenue: newBaselineAnnualRevenue,
      ebitda: Number(newEbitda.toFixed(1)),
      ebit: Number(newEbit.toFixed(1)),
      netIncome: Number(newNetIncome.toFixed(1)),
      eps: newEps,
      cash: Number(newCash.toFixed(1)),
      leverage: newLeverage,
      interestCoverage: newCoverage,
      creditRating: newRating,
      ratingHistory: [...comp.ratingHistory.slice(-15), newRating],
      historicalFundamentals: histFundamentals,
      isDefaulted,
      stockPrice: newStockPrice,
      historicalPrices: hist,
      marketCap: newMarketCap,
      oasSpreadBps: newOasBps,
      cdsSpreadBps: newCdsSpreadBps,
      seniorBondYield: newSeniorBondYield,
      sentiment: newSentiment,
      reportedThisWeek: isReportingThisWeek,
      lastEarningsReportWeek: isReportingThisWeek ? nextWeek : comp.lastEarningsReportWeek,
      dealerConsensus: updatedConsensus,
      lastEarningsSurprisePct,
      lastManagementCommentary,
      leveragedLoan: {
        ...comp.leveragedLoan,
        pricePar: loanPricing.pricePar,
        discountMarginBps: loanPricing.discountMarginBps,
      },
    };
  });

  // 6. Generate Weekly Breaking News & Sentiment Shifts
  (Object.keys(updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const ipo = checkForIPO(regionId, reg, state.companies, nextWeek);
    if (ipo) {
      updatedCompanies.push(ipo);
      recentIPOs.push({ ticker: ipo.ticker, name: ipo.name, category: ipo.productLines?.[0]?.category || 'Unknown', week: nextWeek });
      if (recentIPOs.length > 20) recentIPOs.shift();
      diagnosticLogs.push({ 
        week: nextWeek,
        timestamp: new Date().toISOString(),
        category: 'MACRO',
        message: `New IPO: ${ipo.name} enters ${ipo.productLines?.[0]?.category} amid strong demand growth`,
        deltaText: '',
        data: { regionId }
      });
    }
  });

  // Phase 4a: Derived nominal GDP parallel diagnostic
  regionIds.forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // C — household consumption, already-established convention
    const consumptionComponentUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);

    // I — tracked company investment, scaled up to represent the whole private sector via Phase 1's employment split
    const trackedFirms = updatedCompanies.filter(f => f.region === regionId && !f.isDefaulted);
    const trackedInvestmentUSD = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedEmployment = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    const totalPrivateEmployment = (reg.privateSectorSegments || []).reduce((s, seg) => s + seg.employment, 0);
    const investmentScaleFactor = trackedEmployment > 0 ? (trackedEmployment + totalPrivateEmployment) / trackedEmployment : 1;
    const investmentComponentUSD = trackedInvestmentUSD * investmentScaleFactor;

    // G — government spending, already established in Phase 2 (weekly flow, annualize)
    const governmentComponentUSD = reg.governmentSpendingUSD * 52;

    // NX — net exports, already established in Phase 3 (already annualized-scale)
    const netExportsComponentUSD = reg.exportsUSD - reg.importsUSD;

    const newDerivedNominalGdpUSD = consumptionComponentUSD + investmentComponentUSD + governmentComponentUSD + netExportsComponentUSD;
    const newNominalGdpHistory = [...(reg.nominalGdpHistory || []).slice(-51), newDerivedNominalGdpUSD];
    const gdpLevel52WeeksAgo = newNominalGdpHistory.length >= 52 ? newNominalGdpHistory[0] : newDerivedNominalGdpUSD;
    const gdpGrowthBottomUp = gdpLevel52WeeksAgo > 0
      ? (newDerivedNominalGdpUSD / gdpLevel52WeeksAgo - 1) - reg.inflation
      : 0;

    const blendedGdpGrowth = (1 - (reg.bottomUpGdpWeight ?? 0.50)) * reg.gdpGrowth + (reg.bottomUpGdpWeight ?? 0.50) * gdpGrowthBottomUp;
    const clampedBlendedGdpGrowth = Math.max(-0.02, Math.min(0.045, blendedGdpGrowth)); // same safety backstop as before, now applied to the blend

    // Government Debt Tranches: roll-off and new issuance
    const maturedTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek <= nextWeek);
    const liveTranches = (reg.govDebtTranches || []).filter(t => t.maturityWeek > nextWeek);
    const maturedPrincipalUSD = maturedTranches.reduce((s, t) => s + t.principalUSD, 0);

    const weeklyDeficitUSD = Math.max(0, reg.governmentSpendingUSD - reg.governmentRevenueUSD) + maturedPrincipalUSD;

    // Curve-smart tenor allocation: read the actual yield curve shape already computed for this region.
    // Steep curve (long >> short) → issue shorter, cheaper debt now. Flat/inverted curve → lock in long
    // financing while it's relatively cheap, and reduce near-term rollover risk.
    const curveSteepness = reg.zeroRates.tenor30Y - reg.zeroRates.tenor2Y;
    const baseWeights = { t2: 0.30, t5: 0.30, t10: 0.25, t30: 0.15 };
    const steepnessAdjustment = Math.max(-0.15, Math.min(0.15, curveSteepness * 3));
    const tenorWeights = {
      t2: Math.max(0.10, baseWeights.t2 + steepnessAdjustment * 0.5),
      t5: baseWeights.t5,
      t10: Math.max(0.10, baseWeights.t10 - steepnessAdjustment * 0.3),
      t30: Math.max(0.05, baseWeights.t30 - steepnessAdjustment * 0.2),
    };
    const weightSum = tenorWeights.t2 + tenorWeights.t5 + tenorWeights.t10 + tenorWeights.t30;

    const newTranches: GovDebtTranche[] = [];
    if (weeklyDeficitUSD > 1000) {
      ([['t2', 2, 104], ['t5', 5, 260], ['t10', 10, 520], ['t30', 30, 1560]] as const).forEach(([key, tenorYears, tenorWeeks]) => {
        const principal = weeklyDeficitUSD * (tenorWeights[key] / weightSum);
        if (principal < 100) return;
        newTranches.push({
          id: `${regionId}-GOV-${tenorYears}Y-${nextWeek}`,
          principalUSD: principal,
          couponRate: calculateNelsonSiegelZeroRate(tenorYears, reg.yieldCurveParams), // priced off the region's own real curve
          originationWeek: nextWeek,
          maturityWeek: nextWeek + tenorWeeks,
          tenorAtIssuanceYears: tenorYears,
        });
      });
    }

    const totalGovDebtUSD = [...liveTranches, ...newTranches].reduce((s, t) => s + t.principalUSD, 0);
    const debtToGdpPctBottomUp = newDerivedNominalGdpUSD > 0 ? totalGovDebtUSD / newDerivedNominalGdpUSD : (reg.debtToGdpPctBottomUp || 0);

    updatedRegions[regionId] = {
      ...reg,
      gdpGrowth: clampedBlendedGdpGrowth, // overwrites this week's AR1-only value with the blended figure — this is what the Taylor rule, unemployment, wage growth all read going forward
      bottomUpGdpWeight: reg.bottomUpGdpWeight ?? 0.50, // unchanged this round — deliberately not auto-increasing; a future round raises this manually once more confidence is built
      derivedNominalGdpUSD: newDerivedNominalGdpUSD,
      gdpGrowthBottomUp: Number(Math.max(-0.5, Math.min(0.5, gdpGrowthBottomUp)).toFixed(4)), // generous diagnostic bound only — this is not the load-bearing clamp, just a display sanity guard since this is new and untrusted
      nominalGdpHistory: newNominalGdpHistory,
      consumptionComponentUSD,
      investmentComponentUSD,
      govDebtTranches: [...liveTranches, ...newTranches],
      debtToGdpPctBottomUp,
    };
  });

  const { newsItems, sectorSentimentShocks } = generateWeeklyNews(
    nextWeek,
    updatedRegions,
    updatedCompanies,
    rateChanges,
    ratingChanges,
    defaultedTickers,
    earningsReportedThisTurn
  );

  // 7. Calculate Updated Composite Benchmark Indices
  const updatedCompositeIndices = calculateCompositeIndices(
    updatedCompanies,
    updatedRegions,
    updatedCommodities,
    state.compositeIndices
  );

  // 8. Portfolio Mark-to-Market, Accruals, Attribution, and Margin Engine
  let weeklyInterestIncomeUSD = 0;
  let weeklyFinancingCostUSD = 0;
  let weeklyRealizedCashUSD = 0;
  let weeklyRealizedPnL = 0;
  let closedCount = 0;
  let totalRequiredMarginUSD = 0;
  let maintenanceMarginUSD = 0;
  let netDeltaUSD = 0;
  let netGammaUSD = 0;
  let netVegaUSD = 0;
  let netDV01USD = 0;

  let attributionCarry = 0;
  let attributionMacroRates = 0;
  let attributionCreditSpread = 0;
  let attributionEquityDelta = 0;
  let attributionVolTheta = 0;

  const usdPolicyRate = updatedRegions.USA.policyRate;
  weeklyInterestIncomeUSD = Math.max(0, state.portfolio.cashUSD) * (usdPolicyRate / 52);
  attributionCarry += weeklyInterestIncomeUSD;

  const updatedPositions: Position[] = state.portfolio.positions.map((pos) => {
    const fxRateToUsd = getFxToUsd(pos.region);
    let currentPrice = pos.currentPrice;
    let unrealizedPnL = 0;
    let delta = 0;
    let gamma = 0;
    let vega = 0;
    let theta = 0;
    let dv01 = 0;
    let weeklyFinancing = 0;

    const marginRate = getUnifiedInitialMarginRate(pos.assetType);
    let marginReq = pos.notional * fxRateToUsd * marginRate;
    let maintMargin = marginReq * 0.65;

    const prevPnL = pos.unrealizedPnL;

    switch (pos.assetType) {
      case 'EQUITY': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        if (comp) {
          currentPrice = comp.stockPrice;
          const posValueUSD = pos.quantity * currentPrice * fxRateToUsd;
          const entryValueUSD = pos.quantity * pos.entryPrice * fxRateToUsd;

          unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
          delta = pos.direction === 'LONG' ? posValueUSD : -posValueUSD;

          const carryEst = calculateExpectedCarry('EQUITY', pos.direction, posValueUSD, {
            policyRate: updatedRegions[pos.region].policyRate,
            dividendYield: comp.dividendYield || 0.018
          });
          
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          marginReq = posValueUSD * marginRate;
          maintMargin = marginReq * 0.65;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;
        }
        break;
      }

      case 'LEVERAGED_LOAN':
      case 'CORP_BOND': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const tranche = comp.debtTranches.find(t => t.id === pos.trancheId);
          if (!tranche) {
            currentPrice = comp.isDefaulted ? (comp.recoveryRate * 100) : 100;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            
            if (pos.direction === 'LONG') {
              weeklyRealizedCashUSD += posValueUSD; 
            } else {
              weeklyRealizedCashUSD -= posValueUSD;
            }
            weeklyRealizedPnL += unrealizedPnL;
            pos.isClosed = true;
            closedCount++;
            
            newsItems.push({
              id: `redemption-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Tranche Matured: ${pos.name}`,
              description: `Your position in ${pos.symbol} has been redeemed at ${currentPrice.toFixed(1)} points of par.`,
              category: 'CREDIT',
              impactBadge: '[REDEMPTION]',
              impactRegion: pos.region,
              sentimentDelta: 0,
              affectedTicker: comp.ticker,
              urgent: true
            });
            break;
          }

          const remainingTenorYears = Math.max(0.01, (tranche.maturityWeek - nextWeek) / 52);

          if (tranche.rateType === 'FIXED') {
            const bondPriced = priceCorporateBond(
              remainingTenorYears,
              tranche.couponRate ?? 0.05,
              sovParams,
              comp.oasSpreadBps,
              comp.isDefaulted,
              comp.recoveryRate
            );
            currentPrice = bondPriced.price;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

            const carryEst = calculateExpectedCarry('CORP_BOND', pos.direction, posValueUSD, {
              policyRate: updatedRegions[pos.region].policyRate,
              couponRate: tranche.couponRate ?? 0.05,
              cdsSpreadBps: comp.oasSpreadBps
            });
            weeklyFinancing = carryEst.components.financingCostUSD;
            attributionCarry += carryEst.weeklyCarryUSD;
            const pnlMove = unrealizedPnL - prevPnL;
            attributionCreditSpread += pnlMove * 0.7;
            attributionMacroRates += pnlMove * 0.3;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          } else {
            const loanPricing = priceLeveragedLoan(
              tranche.floatingMarginBps ?? 200,
              comp.oasSpreadBps,
              remainingTenorYears,
              comp.isDefaulted,
              comp.recoveryRate
            );
            currentPrice = loanPricing.pricePar;
            const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
            const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;
            unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
            const carryEst = calculateExpectedCarry('LEVERAGED_LOAN', pos.direction, posValueUSD, {
              policyRate: updatedRegions[pos.region].policyRate,
              cdsSpreadBps: tranche.floatingMarginBps ?? 200
            });
            weeklyFinancing = carryEst.components.financingCostUSD;
            attributionCarry += carryEst.weeklyCarryUSD;
            const pnlMove = unrealizedPnL - prevPnL;
            attributionCreditSpread += pnlMove * 0.8;
            attributionMacroRates += pnlMove * 0.2;
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.65;
          }
        }
        break;
      }

      case 'SOV_BOND': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 10) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 520));
        const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const bondPriced = priceSovereignBond(remainingTenorYears, pos.fixedRate || 0.04, sovParams);
        currentPrice = bondPriced.price;
        const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
        const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
        dv01 = (pos.quantity / 100) * bondPriced.dv01 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);

        const carryEst = calculateExpectedCarry('SOV_BOND', pos.direction, posValueUSD, {
          policyRate: updatedRegions[pos.region].policyRate,
          couponRate: pos.fixedRate || 0.04
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionMacroRates += pnlMove;

        // Check sovereign bond maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          closedCount++;
          const redemptionCash = pos.quantity * 1.0 * fxRateToUsd * (pos.direction === 'LONG' ? 1 : -1);
          weeklyRealizedCashUSD += redemptionCash;
          weeklyRealizedPnL += unrealizedPnL;
          newsItems.push({
            id: `sov-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `Sovereign Bond Matured: ${pos.name}`,
            description: `Your ${pos.region} bond position matured at week ${nextWeek} and was redeemed at par (100).`,
            category: 'MACRO',
            impactBadge: '[MATURITY]',
            impactRegion: pos.region,
            sentimentDelta: 0,
            urgent: true,
          });
        } else {
          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.6;
        }
        break;
      }

      case 'IRS': {
        const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
        const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const irsPricing = priceInterestRateSwap(
          pos.notional,
          pos.fixedRate || 0.04,
          remainingTenorYears,
          pos.direction as any,
          sovParams
        );
        currentPrice = irsPricing.currentParRate;
        unrealizedPnL = irsPricing.npv * fxRateToUsd;
        dv01 = irsPricing.dv01 * fxRateToUsd;

        const carryEst = calculateExpectedCarry('IRS', pos.direction as any, pos.notional * fxRateToUsd, {
          policyRate: updatedRegions[pos.region].policyRate,
          fixedRate: pos.fixedRate || 0.04,
          floatingRate: updatedRegions[pos.region].policyRate
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionMacroRates += pnlMove;

        // Check IRS maturity
        if (nextWeek >= maturityWeek) {
          pos.isClosed = true;
          closedCount++;
          weeklyRealizedPnL += unrealizedPnL;
          weeklyRealizedCashUSD += unrealizedPnL;
          newsItems.push({
            id: `irs-matured-${pos.id}-${nextWeek}`,
            week: nextWeek,
            title: `IRS Expired at Maturity: ${pos.name}`,
            description: `Your interest rate swap terminated at its scheduled maturity date.`,
            category: 'MACRO',
            impactBadge: '[EXPIRY]',
            impactRegion: pos.region,
            sentimentDelta: 0,
            urgent: false,
          });
        } else {
          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.6;
        }
        break;
      }

      case 'CDS': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
          const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
          const cdsPricing = priceCreditDefaultSwap(
            pos.notional,
            pos.entryPrice,
            comp.oasSpreadBps,
            remainingTenorYears,
            pos.direction as any,
            sovParams,
            comp.recoveryRate,
            comp.isDefaulted
          );
          currentPrice = cdsPricing.currentCdsSpreadBps;
          unrealizedPnL = cdsPricing.npv * fxRateToUsd;

          const carryEst = calculateExpectedCarry('CDS', pos.direction as any, pos.notional * fxRateToUsd, {
            policyRate: updatedRegions[pos.region].policyRate,
            cdsSpreadBps: pos.entryPrice
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionCreditSpread += pnlMove;

          // Check CDS maturity or default settlement
          if (comp.isDefaulted) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
          } else if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
            newsItems.push({
              id: `cds-expired-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `CDS Protection Expired: ${pos.name}`,
              description: `Credit Default Swap contract expired with no default credit trigger.`,
              category: 'CREDIT',
              impactBadge: '[EXPIRY]',
              impactRegion: pos.region,
              sentimentDelta: 0,
              urgent: false,
            });
          } else {
            marginReq = pos.notional * fxRateToUsd * marginRate;
            maintMargin = marginReq * 0.6;
          }
        }
        break;
      }

      case 'TRS': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        if (comp) {
          const assetReturn = (comp.stockPrice - pos.entryPrice) / pos.entryPrice;
          const regPolicyRate = updatedRegions[pos.region].policyRate;
          const financingRate = (regPolicyRate + 0.0075) / 52;

          const notionalUSD = pos.notional * fxRateToUsd;
          const priceReturnUSD = notionalUSD * assetReturn;

          const carryEst = calculateExpectedCarry('TRS', pos.direction, notionalUSD, {
            policyRate: regPolicyRate,
            dividendYield: comp.dividendYield || 0.02
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          unrealizedPnL = pos.direction === 'LONG' ? priceReturnUSD : -priceReturnUSD;
          delta = pos.direction === 'LONG' ? notionalUSD : -notionalUSD;
          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;

          marginReq = notionalUSD * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'COMMODITY': {
        const comm = updatedCommodities.find((c) => c.symbol === pos.symbol || c.id === pos.symbol);
        if (comm) {
          currentPrice = comm.spotPrice;
          const posValueUSD = pos.quantity * currentPrice;
          const entryValueUSD = pos.quantity * pos.entryPrice;

          unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
          delta = pos.direction === 'LONG' ? posValueUSD : -posValueUSD;

          const carryEst = calculateExpectedCarry('COMMODITY', pos.direction, posValueUSD, {
            policyRate: updatedRegions.USA.policyRate,
            convenienceYield: comm.convenienceYield
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;

          marginReq = posValueUSD * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'OPTION': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const underlyingPrice = comp ? comp.stockPrice : pos.underlyingPrice || 100;
        const strike = pos.strike || underlyingPrice;
        const remainingWeeks = Math.max(0.1, (pos.expiryWeek || nextWeek + 4) - nextWeek);
        const tYears = remainingWeeks / 52;
        const vol = (pos.impliedVol || 0.3) + marketVolComponent;
        const r = updatedRegions[pos.region].policyRate;

        const greeks = calculateBlackScholesGreeks(
          underlyingPrice,
          strike,
          tYears,
          r,
          vol,
          pos.optionType || 'CALL'
        );

        currentPrice = greeks.price;
        const contracts = pos.quantity;
        const posValueUSD = contracts * currentPrice * fxRateToUsd;
        const entryValueUSD = contracts * pos.entryPrice * fxRateToUsd;

        unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;

        const mult = pos.direction === 'LONG' ? 1 : -1;
        delta = mult * greeks.delta * contracts * underlyingPrice * fxRateToUsd;
        gamma = mult * greeks.gamma * contracts * underlyingPrice * fxRateToUsd;
        vega = mult * greeks.vega * contracts * fxRateToUsd;
        theta = mult * greeks.theta * contracts * fxRateToUsd;

        const carryEst = calculateExpectedCarry('OPTION', pos.direction, posValueUSD, {
          policyRate: r,
          thetaPerContractUSD: greeks.theta * fxRateToUsd,
          quantity: contracts
        });
        weeklyFinancing = carryEst.components.financingCostUSD;
        attributionCarry += carryEst.weeklyCarryUSD;

        const pnlMove = unrealizedPnL - prevPnL;
        attributionVolTheta += pnlMove * 0.4;
        attributionEquityDelta += pnlMove * 0.6;

        if (pos.direction === 'LONG') {
          marginReq = posValueUSD;
          maintMargin = posValueUSD * 0.5;
        } else {
          marginReq = (pos.notional || contracts * underlyingPrice) * 0.20 * fxRateToUsd;
          maintMargin = marginReq * 0.75;
        }
        break;
      }

      case 'XCS': {
        const fxPair = updatedFxPairs.find((p) => p.pair === pos.symbol);
        if (fxPair) {
          const maturityWeek = pos.maturityWeek || (pos.openedWeek ? pos.openedWeek + Math.round((pos.tenorYears || 5) * 52) : (pos.tenorYears ? nextWeek + Math.round(pos.tenorYears * 52) : nextWeek + 260));
          const remainingTenorYears = Math.max(0.01, (maturityWeek - nextWeek) / 52);
          const xcsPricing = priceCrossCurrencyBasisSwap(
            pos.notional,
            fxPair.rate,
            pos.entryPrice,
            fxPair.basisSpreadBps,
            remainingTenorYears,
            pos.direction as any
          );
          currentPrice = fxPair.basisSpreadBps;
          unrealizedPnL = xcsPricing.npvUSD;
          dv01 = xcsPricing.dv01USD;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionMacroRates += pnlMove;

          const carryEst = calculateExpectedCarry('XCS', pos.direction, pos.notional * fxPair.rate, {
            policyRate: updatedRegions[pos.region].policyRate,
            basisSpreadBps: fxPair.basisSpreadBps
          });
          weeklyFinancing = carryEst.components.financingCostUSD;
          attributionCarry += carryEst.weeklyCarryUSD;

          if (nextWeek >= maturityWeek) {
            pos.isClosed = true;
            closedCount++;
            weeklyRealizedPnL += unrealizedPnL;
            weeklyRealizedCashUSD += unrealizedPnL;
            newsItems.push({
              id: `xcs-matured-${pos.id}-${nextWeek}`,
              week: nextWeek,
              title: `Basis Swap Matured: ${pos.name}`,
              description: `Cross-currency basis swap terminated at scheduled maturity.`,
              category: 'MACRO',
              impactBadge: '[MATURITY]',
              impactRegion: pos.region,
              sentimentDelta: 0,
              urgent: false,
            });
          } else {
            marginReq = pos.notional * fxPair.rate * marginRate;
            maintMargin = marginReq * 0.6;
          }
        }
        break;
      }
    }

    weeklyFinancingCostUSD += weeklyFinancing;
    totalRequiredMarginUSD += marginReq;
    maintenanceMarginUSD += maintMargin;
    netDeltaUSD += delta;
    netGammaUSD += gamma;
    netVegaUSD += vega;
    netDV01USD += dv01;

    return {
      ...pos,
      currentPrice,
      unrealizedPnL: Number(unrealizedPnL.toFixed(0)),
      marginRequirement: Number(marginReq.toFixed(0)),
      maintenanceMargin: Number(maintMargin.toFixed(0)),
      weeklyFinancingCost: Number(weeklyFinancing.toFixed(0)),
      delta: Number(delta.toFixed(0)),
      gamma: Number(gamma.toFixed(0)),
      vega: Number(vega.toFixed(0)),
      theta: Number(theta.toFixed(0)),
      dv01: Number(dv01.toFixed(0)),
    };
  });
// Calculate updated Cash & NAV
  const finalPositions = updatedPositions.filter(p => !p.isClosed);
  const netWeeklyAccruals = weeklyInterestIncomeUSD - weeklyFinancingCostUSD;
  const updatedCashUSD = state.portfolio.cashUSD + netWeeklyAccruals + weeklyRealizedCashUSD;
  const totalUnrealizedPnL = finalPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const currentNavUSD = Math.max(0, updatedCashUSD + totalUnrealizedPnL);

  const pnlDeltaUSD = currentNavUSD - state.portfolio.navUSD;
  const pnlDeltaPct = state.portfolio.navUSD > 0 ? (pnlDeltaUSD / state.portfolio.navUSD) * 100 : 0;

  const totalGrossExposureUSD = finalPositions.reduce((sum, p) => sum + p.notional, 0);  const totalLeverage = Number((totalGrossExposureUSD / Math.max(1, currentNavUSD)).toFixed(1));
  const marginUtilizationPct = currentNavUSD > 0 ? Math.min(100, Math.round((totalRequiredMarginUSD / currentNavUSD) * 100)) : 100;

  let isGameOver = false;
  let gameOverReason: string | null = null;
  let isMarginCall = false;
  let marginCallWarning: string | null = null;

  if (currentNavUSD <= 1_000_000) {
    isGameOver = true;
    gameOverReason = 'INSOLVENCY: Portfolio NAV collapsed below $1,000,000 liquidation floor.';
  } else if (currentNavUSD < maintenanceMarginUSD) {
    isMarginCall = true;
    marginCallWarning = `CRITICAL MARGIN CALL: NAV ($${(currentNavUSD / 1e6).toFixed(2)}M) breached Maintenance Margin ($${(maintenanceMarginUSD / 1e6).toFixed(2)}M). Liquidate risky positions immediately.`;
  } else if (marginUtilizationPct > 80) {
    marginCallWarning = `WARNING: Margin Utilization reached ${marginUtilizationPct}%. Approaching initial margin limits.`;
  }

  // 60/40 benchmark & Cash hurdle update
  const prevBenchmark = state.portfolio.historicalBenchmarks.slice(-1)[0] || {
    benchmark6040: state.portfolio.startingCapitalUSD,
    cashHurdle: state.portfolio.startingCapitalUSD,
  };
  const b6040WeeklyReturn = 0.07 / 52 + (Math.random() - 0.5) * 0.012;
  const nextBenchmark6040 = prevBenchmark.benchmark6040 * (1 + b6040WeeklyReturn);
  const nextCashHurdle = prevBenchmark.cashHurdle * (1 + 0.05 / 52);

  const updatedBenchmarks = [
    ...state.portfolio.historicalBenchmarks.slice(-51),
    {
      week: nextWeek,
      nav: currentNavUSD,
      benchmark6040: Number(nextBenchmark6040.toFixed(0)),
      cashHurdle: Number(nextCashHurdle.toFixed(0)),
    },
  ];

  const lastWeekAttr: ReturnAttribution = {
    carryUSD: attributionCarry,
    macroRatesUSD: attributionMacroRates,
    creditSpreadUSD: attributionCreditSpread,
    equityDeltaUSD: attributionEquityDelta,
    volThetaUSD: attributionVolTheta,
  };

  const cumulativeAttr: ReturnAttribution = {
    carryUSD: state.portfolio.cumulativeAttribution.carryUSD + attributionCarry,
    macroRatesUSD: state.portfolio.cumulativeAttribution.macroRatesUSD + attributionMacroRates,
    creditSpreadUSD: state.portfolio.cumulativeAttribution.creditSpreadUSD + attributionCreditSpread,
    equityDeltaUSD: state.portfolio.cumulativeAttribution.equityDeltaUSD + attributionEquityDelta,
    volThetaUSD: state.portfolio.cumulativeAttribution.volThetaUSD + attributionVolTheta,
  };

  const updatedPortfolio: Portfolio = {
    cashUSD: updatedCashUSD,
    startingCapitalUSD: state.portfolio.startingCapitalUSD,
    navUSD: currentNavUSD,
    previousNavUSD: state.portfolio.navUSD,
    historicalNav: [...state.portfolio.historicalNav.slice(-51), currentNavUSD],
    historicalBenchmarks: updatedBenchmarks,
    positions: finalPositions,
    closedPositionsCount: state.portfolio.closedPositionsCount + closedCount,
    realizedPnLTotal: state.portfolio.realizedPnLTotal + weeklyRealizedPnL,
    cumulativeAttribution: cumulativeAttr,
    lastWeekAttribution: lastWeekAttr,
    totalRequiredMarginUSD,
    maintenanceMarginUSD,
    marginUtilizationPct,
    isMarginCall,
    marginCallWarning,
    totalLeverage,
    netDeltaUSD,
    netGammaUSD,
    netVegaUSD,
    netDV01USD,
  };

  const turnSummary = {
    week: nextWeek,
    pnlDeltaUSD,
    pnlDeltaPct,
    interestIncomeUSD: weeklyInterestIncomeUSD,
    financingCostUSD: weeklyFinancingCostUSD,
    defaultedCompanies: defaultedTickers,
    ratingsChanges: ratingChanges,
    earningsReported: earningsReportedThisTurn,
    marginAlert: marginCallWarning,
    attribution: lastWeekAttr,
  };

  const newStepLogs: any[] = [
    {
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `Macro Loop (T+${nextWeek}): Taylor target evolved across 4 sovereign nodes.`,
      deltaText: `Fed Policy: ${(updatedRegions.USA.policyRate * 100).toFixed(2)}% | ECB: ${(updatedRegions.EUR.policyRate * 100).toFixed(2)}% | BoE: ${(updatedRegions.UK.policyRate * 100).toFixed(2)}% | BoJ: ${(updatedRegions.JPN.policyRate * 100).toFixed(2)}%`,
      data: {
        rates: {
          USA: updatedRegions.USA.policyRate,
          EUR: updatedRegions.EUR.policyRate,
          UK: updatedRegions.UK.policyRate,
          JPN: updatedRegions.JPN.policyRate,
        },
        inflation: {
          USA: updatedRegions.USA.inflation,
          EUR: updatedRegions.EUR.inflation,
        },
      },
    },
    {
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MICRO',
      message: `Micro Aggregation: 200 firms aggregated into national GDP & inflation vector.`,
      deltaText: `Margin Compression: ${(marginCompression * 100).toFixed(2)}% | Default Contagion: +${creditContagionBps} bps`,
      data: {
        marginCompression,
        creditContagionBps,
        activeFirms: prevActiveFirms.length,
      },
    },
  ];

  if (earningsReportedThisTurn.length > 0) {
    newStepLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'EARNINGS',
      message: `Asynchronous Earnings: ${earningsReportedThisTurn.length} firms reported quarterly results.`,
      deltaText: earningsReportedThisTurn.map((e) => `${e.ticker} (${(e.surprisePct * 100).toFixed(1)}%)`).join(', '),
      data: { earnings: earningsReportedThisTurn },
    });
  }

  if (ratingChanges.length > 0 || defaultedTickers.length > 0) {
    newStepLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'CREDIT',
      message: `Credit Transition: ${ratingChanges.length} rating migration(s), ${defaultedTickers.length} default(s).`,
      deltaText: ratingChanges.map((r) => `${r.ticker}: ${r.from} -> ${r.to}`).concat(defaultedTickers.map((d) => `${d} DEFAULTED`)).join(', '),
      data: { ratingChanges, defaultedTickers },
    });
  }

  newStepLogs.push({
    week: nextWeek,
    timestamp: new Date().toISOString(),
    category: 'EXECUTION',
    message: `Weekly NAV Settlement: NAV $${(currentNavUSD / 1e6).toFixed(2)}M (PnL ${pnlDeltaUSD >= 0 ? '+' : ''}$${pnlDeltaUSD.toFixed(0)})`,
    deltaText: `Margin Util: ${marginUtilizationPct}% | Delta: $${(netDeltaUSD / 1e3).toFixed(1)}K | DV01: $${netDV01USD.toFixed(0)}`,
    data: {
      navUSD: currentNavUSD,
      pnlDeltaUSD,
      marginUtilizationPct,
      leverage: totalLeverage,
    },
  });

  const updatedDiagnosticsLogs = [...(state.diagnosticsLogs || []), ...diagnosticLogs, ...newStepLogs].slice(-100);

  // News feed strictly displays headlines generated during the current active weekly step
  const updatedNewsFeed = [...newsItems, ...refinanceNews];

  return {
    ...state,
    currentWeek: nextWeek,
    year,
    regions: updatedRegions,
    fxPairs: updatedFxPairs,
    companies: updatedCompanies,
    commodities: updatedCommodities,
    compositeIndices: updatedCompositeIndices,
    recentIPOs,
    marketVolPremium: Number(marketVolComponent.toFixed(4)),
    portfolio: updatedPortfolio,
    newsFeed: updatedNewsFeed,
    diagnosticsLogs: updatedDiagnosticsLogs,
    turnSummary,
    isGameOver,
    gameOverReason,
  };
}

export function computeOwnershipConservation(state: GameState): { region: RegionId; assetClass: string; totalShareAccounted: number; householdShareImplied: number }[] {
  const results: { region: RegionId; assetClass: string; totalShareAccounted: number; householdShareImplied: number }[] = [];
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(regionId => {
    const reg = state.regions[regionId];
    (['equityOwnership', 'corpBondOwnership', 'sovBondOwnership'] as const).forEach(key => {
      const o = reg[key];
      const foreignSum = Object.values(o.foreignShare).reduce((s: number, v: number) => s + v, 0);
      const totalShareAccounted = o.bankShare + o.institutionalShare + foreignSum + o.centralBankShare;
      results.push({
        region: regionId,
        assetClass: key,
        totalShareAccounted: Number(totalShareAccounted.toFixed(4)),
        householdShareImplied: Number((1 - totalShareAccounted).toFixed(4)),
      });
    });
  });
  return results;
}

