
import { RegionId, Region, Portfolio, Dealer, OccupationType } from '../../types';
import { DEALERS } from '../dealers';
import { generateIPOCompany } from '../companyGenerator';
import { GameState, Company } from '../../types';
import { generateInitialCompanies } from '../companyGenerator';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices } from '../macroEngine';
import { computeOccupationDemand } from './core';

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
      (regions[regionId].categoryDemand as any)[cat] = {
        demandLevelUSD: targets[cat],
        demandGrowthAnnual: 0,
        demandHistory: [targets[cat]],
        crowdingIntensity: 0,
        inventoryLevelUSD: targets[cat] * 0.10,
        inputCostPressure: 0,
        clearedInputPriceIndex: 1.0,
        lastWeekInventoryLevelUSD: targets[cat] * 0.10,
      };
    });

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);
    const totalMarketCap = regionCompanies.reduce((s, c) => s + c.marketCap, 0);
    const totalCorpDebt = regionCompanies.reduce((s, c) => s + c.totalDebt, 0);
    const totalSovDebt = reg.debtToGdpPct * reg.derivedNominalGdpUSD;

    reg.institutionalSector.equityHoldingsUSD = Number((reg.equityOwnership.institutionalShare * totalMarketCap).toFixed(0));
    reg.institutionalSector.corpBondHoldingsUSD = Number((reg.corpBondOwnership.institutionalShare * totalCorpDebt).toFixed(0));
    reg.institutionalSector.sovBondHoldingsUSD = Number((reg.sovBondOwnership.institutionalShare * totalSovDebt).toFixed(0));

    // Calibrate initial occupationLaborForceShare from actual week-1 demand across companies & private segments
    // with realistic occupational tightness differentials
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.privateSectorSegments, regionId, reg.governmentEmployment);
    const week1DemandTotal = Object.values(week1OccDemand).reduce((s, v) => s + v, 0);
    const slackMultipliers: Record<OccupationType, number> = {
      GENERAL: 1.12,
      SKILLED_TRADES: 1.08,
      TECHNICAL_ENGINEERING: 1.04,
      SPECIALIZED_PROFESSIONAL: 1.05,
      MANAGERIAL_FINANCIAL: 1.07,
    };
    const calibratedShares = (Object.keys(week1OccDemand) as OccupationType[]).reduce((acc, occ) => {
      const mult = slackMultipliers[occ] ?? 1.08;
      acc[occ] = week1DemandTotal > 0 ? Math.max(0.03, (week1OccDemand[occ] / week1DemandTotal) * mult) : 0.2;
      return acc;
    }, {} as Record<OccupationType, number>);
    const shareSum = Object.values(calibratedShares).reduce((s, v) => s + v, 0);
    if (shareSum > 0) {
      (Object.keys(calibratedShares) as OccupationType[]).forEach(occ => {
        calibratedShares[occ] = Number((calibratedShares[occ] / shareSum).toFixed(4));
      });
    }
    reg.occupationLaborForceShare = calibratedShares;
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

