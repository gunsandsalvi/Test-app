import {
  AssetType,
  DebtTranche,
  Company,
  CreditRating,
  Dealer,
  GameState,
  Portfolio,
  Position,
  Region,
  RegionId,
  ReturnAttribution,
  Sector,
  NewsItem,
} from '../types';
import {
  calculateCompositeIndices,
  evolveCommodity,
  evolveFxPair,
  evolveRegionMacro,
  getInitialCommodities,
  getInitialFxPairs,
  getInitialRegions,
} from './macroEngine';
import { generateInitialCompanies, FIXED_SHARE_BY_RATING, generateIPOCompany } from './companyGenerator';
import { calculateExpectedCarry } from './carryCalculator';
import { DEALERS, getUnifiedInitialMarginRate } from './dealers';
import { calculateBlackScholesGreeks } from './blackScholes';
import {
  priceCommodityFutures,
  priceCorporateBond,
  priceCreditDefaultSwap,
  priceCrossCurrencyBasisSwap,
  priceEquity,
  priceInterestRateSwap,
  priceLeveragedLoan,
  RATING_OAS_SPREADS,
  SECTOR_BENCHMARKS,
} from './pricing';
import { priceSovereignBond, calculateNelsonSiegelZeroRate } from './nelsonSiegel';
import { generateWeeklyNews, EarningsReportEvent } from './newsGenerator';
import { formatQuarterFilingDate, formatSimulationDate } from './formatters';

/**
 * Determine credit rating based on Leverage (Debt/EBITDA) and Interest Coverage (EBIT/Interest)
 */
export function determineCreditRating(leverage: number, interestCoverage: number): CreditRating {
  if (interestCoverage < 0.8 || leverage > 8.5) return 'CCC';
  if (interestCoverage < 1.4 || leverage > 6.5) return 'B';
  if (interestCoverage < 2.5 || leverage > 5.0) return 'BB';
  if (interestCoverage < 4.0 || leverage > 3.8) return 'BBB';
  if (interestCoverage < 7.0 || leverage > 2.8) return 'A';
  if (interestCoverage < 12.0 || leverage > 1.8) return 'AA';
  return 'AAA';
}

const SECTOR_PRICING_POWER: Record<string, number> = {
  Tech: 0.55,
  Financials: 0.85,
  Industrials: 0.70,
  Energy: 0.90,
  Consumer: 0.50,
  Healthcare: 0.65,
  Utilities: 0.95,
};

const SECTOR_WAGE_SENSITIVITY: Record<string, number> = {
  Tech: 0.6,
  Financials: 0.5,
  Industrials: 1.3,
  Energy: 0.9,
  Consumer: 1.4,
  Healthcare: 1.0,
  Utilities: 0.7,
};

/**
 * Create initial Game State
 */
export function createInitialGameState(): GameState {
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  const companies = generateInitialCompanies();

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const hs = reg.householdState;
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const govBase = reg.estimatedHouseholdIncomeUSD * 0.18;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;
    const targets: Record<string, number> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
      GovernmentDefense: govBase * 0.30, 
      GovernmentInfrastructure: govBase * 0.45, 
      GovernmentHealthcare: govBase * 0.25,
      CorporateIndustrial: corpBase * 0.6, 
      CorporateTech: corpBase * 0.4,
    };
    Object.keys(targets).forEach(cat => {
      (regions[regionId].categoryDemand as any)[cat] = { demandLevelUSD: targets[cat], demandGrowthAnnual: 0, demandHistory: [targets[cat]] };
    });
  });

  const commodities = getInitialCommodities();
  const dealers = DEALERS;
  const compositeIndices = calculateCompositeIndices(companies, regions, commodities);
  const recentIPOs: { ticker: string; name: string; category: string; week: number }[] = [];

  const startingCash = 25_000_000; // $25M USD Hedge Fund Starting Capital
  const portfolio: Portfolio = {
    cashUSD: startingCash,
    startingCapitalUSD: startingCash,
    navUSD: startingCash,
    previousNavUSD: startingCash,
    historicalNav: [startingCash],
    historicalBenchmarks: [
      {
        week: 1,
        nav: startingCash,
        benchmark6040: startingCash,
        cashHurdle: startingCash,
      },
    ],
    positions: [],
    closedPositionsCount: 0,
    realizedPnLTotal: 0,
    cumulativeAttribution: {
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    lastWeekAttribution: {
      carryUSD: 0,
      macroRatesUSD: 0,
      creditSpreadUSD: 0,
      equityDeltaUSD: 0,
      volThetaUSD: 0,
    },
    totalRequiredMarginUSD: 0,
    maintenanceMarginUSD: 0,
    marginUtilizationPct: 0,
    isMarginCall: false,
    marginCallWarning: null,
    totalLeverage: 0,
    netDeltaUSD: 0,
    netGammaUSD: 0,
    netVegaUSD: 0,
    netDV01USD: 0,
  };

  return {
    currentWeek: 1,
    year: 2026,
    regions,
    fxPairs,
    companies,
    commodities,
    compositeIndices,
    recentIPOs,
    dealers,
    portfolio,
    watchlist: ['USA_NVST', 'USA_TXEN', 'BRENT', 'GOLD'],
    newsFeed: [
      {
        id: 'init_welcome',
        week: 1,
        title: 'Institutional Quant Trading Desk Initialized | Jan 05, 2026',
        description:
          'Portfolio unencumbered capital: $25,000,000 USD. Multi-region Nelson-Siegel curves, 200 corporate issuers, 3 Dealer axes, asynchronous quarterly earnings, and full Greeks attribution online.',
        category: 'MACRO',
        impactBadge: '[SYSTEM INIT]',
        sentimentDelta: 0.05,
        urgent: true,
      },
    ],
    turnSummary: null,
    selectedTab: 'macro',
    isTradeModalOpen: false,
    selectedInstrument: null,
    isNewsDrawerOpen: false,
    isWatchlistDrawerOpen: false,
    isCheatsheetOpen: false,
    isDiagnosticsOpen: false,
    diagnosticsLogs: [
      {
        week: 1,
        timestamp: new Date().toISOString(),
        category: 'EXECUTION',
        message: 'Engine Initialized: Multi-Region Macro <-> Micro Feedback Loop Active (Jan 05, 2026)',
        deltaText: '200 Corporate Issuers • 4 Nelson-Siegel Yield Curves • 9 Commodities Desk',
        data: { capitalUSD: startingCash, regionsCount: 4, firmsCount: companies.length },
      },
    ],
    chartModalData: null,
    isGameOver: false,
    gameOverReason: null,
  };
}

/**
 * Advance Simulation by One Week (T -> T+1)
 */

function checkForIPO(regionId: RegionId, reg: Region, companies: Company[], week: number): Company | null {
  if (week % 26 !== 0) return null;
  const categories = Object.keys(reg.categoryDemand) as string[];
  for (const cat of categories) {
    const demand = reg.categoryDemand[cat];
    if (!demand || demand.demandGrowthAnnual < 0.04) continue;
    const incumbents = companies.filter(c => c.region === regionId && !c.isDefaulted && (c.productLines || []).some(l => l.category === cat));
    const incumbentGrowthProxy = incumbents.length ? incumbents.reduce((s, c) => s + (c.annualRevenue - c.baselineAnnualRevenue) / Math.max(1, c.baselineAnnualRevenue), 0) / incumbents.length : 0;
    const supplyGap = demand.demandGrowthAnnual - incumbentGrowthProxy;
    if (supplyGap > 0.03 && Math.random() < 0.35) {
      return generateIPOCompany(regionId, cat, demand.demandLevelUSD, week);
    }
  }
  return null;
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

    const { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      { capexGdpContribution: boundedGdpContribution, marginCompression, creditContagionBps, bottomUpUnemploymentDelta, businessLoanBookInputUSD: regionFloatingPrincipal[regionId] },
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

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // Household demand (G2)
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const householdTargets: Partial<Record<string, number>> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
    };

    // Government demand (G3), tied to fiscalStanceScore
    const govProcurementBase = reg.estimatedHouseholdIncomeUSD * 0.18;
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
      const prevLevel = reg.categoryDemand[cat as keyof typeof reg.categoryDemand]?.demandLevelUSD ?? target;
      const newLevel = prevLevel * (1 - smoothing) + target * smoothing;
      const growthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      const prevHistory = reg.categoryDemand[cat as keyof typeof reg.categoryDemand]?.demandHistory ?? [];
      (reg.categoryDemand as any)[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual, demandHistory: [...prevHistory.slice(-25), newLevel] };
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
      const regimeTilt = SECTOR_REGIME_TILT[comp.sector]?.[reg.cycleRegime] ?? 0;

      // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
      const pricingPowerBeta = SECTOR_PRICING_POWER[comp.sector] ?? 0.65;
      // Operating margins update (Wage-Push compression)
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const wageCompression = Math.max(0, reg.householdState.wageGrowth - 0.025) * 0.15 * wageSensitivity;
      baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin + (Math.random() - 0.5) * 0.004 - (wageCompression / 52)));

      let categoryDrivenGrowth = 0;
    updatedProductLines = (comp.productLines || []).map((line) => {
      const catDemand = reg.categoryDemand[line.category as any];
      const categoryGrowth = catDemand?.demandGrowthAnnual ?? reg.gdpGrowth;
      const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
      const targetCompetitiveness = Math.max(-1, Math.min(1, marginEdge * 10));
      const newCompetitiveness = Number((line.competitiveness * 0.98 + targetCompetitiveness * 0.02).toFixed(3));
      const shareGainRate = Math.max(-0.02, Math.min(0.02, newCompetitiveness * 0.04));
      const newCategoryMarketShare = Math.max(0.001, Math.min(0.6, line.categoryMarketShare * (1 + shareGainRate / 52)));
      const lineGrowth = categoryGrowth + shareGainRate;
      categoryDrivenGrowth += lineGrowth * line.revenueShare;
      return { ...line, previousCategoryMarketShare: line.categoryMarketShare, competitiveness: newCompetitiveness, categoryMarketShare: newCategoryMarketShare };
    });
    const targetAnnualRevenue = baseRev * (1 + categoryDrivenGrowth + noise + reg.inflation * pricingPowerBeta);
      
      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));
      newEbitda = newRevenue * newEbitdaMargin;
      const da = newRevenue * 0.05;
      newEbit = Math.max(1, newEbitda - da);

      newNetIncome = Math.max(-50, (newEbit - annualInterest) * (1 - taxRate));
      newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));
    }

    // CapEx scales with revenue (capital intensity ~constant) and responds modestly to financing
    // cost (higher rates discourage investment) and cash health (distressed firms cut CapEx).
    const capexToRevenueRatio = comp.capex / Math.max(1, comp.annualRevenue); // preserves firm-specific intensity
    const rateDrag = Math.max(0, effectiveDebtRate - 0.04) * 1.5; // capex pulls back when funding costs rise above ~4%
    const cashHealthFactor = comp.cash < 0 ? 0.6 : 1.0; // firms in cash distress cut capex materially
    const tobinsQ = comp.marketCap / Math.max(1, comp.totalDebt + comp.annualRevenue * 1.5); // rough proxy
    const qCapexEffect = Math.max(-0.15, Math.min(0.15, (tobinsQ - 1) * 0.2));
    const targetCapex = newRevenue * capexToRevenueRatio * (1 - rateDrag) * cashHealthFactor * (1 + qCapexEffect);
    const newCapex = Math.max(0, comp.capex * 0.92 + targetCapex * 0.08); // smoothed transition, avoid whipsaws

    // Weekly Cash flow and debt amortization / prepayment
    const weeklyFreeCashFlow = newEbitda / 52 - newCapex / 52 - weeklyInterest;
    let newCash = comp.cash + weeklyFreeCashFlow;
    let newTotalDebt = comp.totalDebt;

    const newBaselineDividendYield = Number((comp.baselineDividendYield * 0.998 + comp.dividendYield * 0.002).toFixed(4));
    const targetDivYield = newBaselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0));
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
    const newLeverage = Number((newTotalDebt / Math.max(1, newEbitda)).toFixed(2));
    const newCoverage = Number((newEbit / Math.max(0.5, annualInterest)).toFixed(2));

    // Default trigger: Cash < 0 and Coverage < 0.8x
    let isDefaulted = false;
    let newRating = comp.creditRating;

    if (newCash < 0 && newCoverage < 0.8) {
      isDefaulted = true;
      newRating = 'D';
      defaultedTickers.push(comp.ticker);
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
        description: `${comp.name} refinanced a maturing $${(maturingTranche.principalUSD / 1000).toFixed(1)}B tranche (was ${oldRateDescription}) into a new ${newRateDescription} tranche.`,
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
      const rawSurprise = epsDiff / Math.max(0.01, Math.abs(consensusEps));
      lastEarningsSurprisePct = Number(Math.max(-0.50, Math.min(0.50, rawSurprise)).toFixed(3));

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

    return {
      ...comp,
      forwardPE: newForwardPE,
      baselineRecoveryRate: newBaselineRecoveryRate,
      baselineDividendYield: newBaselineDividendYield,
      previousEmployeeCount: comp.employeeCount,
      employeeCount: isDefaulted ? 0 : newEmployeeCount,
      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),
      debtTranches: updatedTranches,
      productLines: updatedProductLines,
      totalDebt: updatedTranches.reduce((s, t) => s + t.principalUSD, 0),
      dividendYield: Number(newDividendYield.toFixed(4)),
      capex: Number(newCapex.toFixed(1)),
      annualRevenue: Number(newRevenue.toFixed(1)),
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
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const bondPriced = priceSovereignBond(pos.tenorYears || 10, pos.fixedRate || 0.04, sovParams);
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

        marginReq = pos.notional * fxRateToUsd * marginRate;
        maintMargin = marginReq * 0.6;
        break;
      }

      case 'IRS': {
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        const irsPricing = priceInterestRateSwap(
          pos.notional,
          pos.fixedRate || 0.04,
          pos.tenorYears || 5,
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

        marginReq = pos.notional * fxRateToUsd * marginRate;
        maintMargin = marginReq * 0.6;
        break;
      }

      case 'CDS': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const cdsPricing = priceCreditDefaultSwap(
            pos.notional,
            pos.entryPrice,
            comp.oasSpreadBps,
            pos.tenorYears || 5,
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

          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.6;
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
          const xcsPricing = priceCrossCurrencyBasisSwap(
            pos.notional,
            fxPair.rate,
            pos.entryPrice,
            fxPair.basisSpreadBps,
            pos.tenorYears || 5,
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

          marginReq = pos.notional * fxPair.rate * marginRate;
          maintMargin = marginReq * 0.6;
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
