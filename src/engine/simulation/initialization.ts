
import { RegionId, Portfolio, OccupationType, COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, AssetAllocationTarget, ItemizedHolding, INDUSTRY_SUBUNITS } from '../../types';
import { DEALERS } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies } from '../companyGenerator';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand } from './core';

function attributeItemizedHoldingsLocal(
  sectorShareUSD: number,
  candidates: { id: string; type: string; region: RegionId; outstandingUSD: number }[]
): ItemizedHolding[] {
  const sorted = [...candidates].sort((a, b) => b.outstandingUSD - a.outstandingUSD);
  let remaining = sectorShareUSD;
  const result: ItemizedHolding[] = [];
  for (const c of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(c.outstandingUSD * 0.4, remaining); // no single sector holds more than 40% of any one issue
    if (take > 0) {
      result.push({
        instrumentId: c.id,
        instrumentType: c.type as any,
        issuerRegion: c.region,
        quantityOrNotionalUSD: take,
      });
      remaining -= take;
    }
  }
  return result;
}

export function createInitialGameState(): GameState {
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  const companies = generateInitialCompanies();

  const institutionalEntities: InstitutionalEntity[] = [];

  const allocationTargets: Record<InstitutionalEntityType, AssetAllocationTarget> = {
    INSURER: { govBondPct: 0.50, corpBondPct: 0.35, equityPct: 0.10, cashPct: 0.05 },
    ASSET_MANAGER: { govBondPct: 0.10, corpBondPct: 0.20, equityPct: 0.65, cashPct: 0.05 },
    PENSION_FUND: { govBondPct: 0.25, corpBondPct: 0.30, equityPct: 0.40, cashPct: 0.05 },
  };

  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const hs = reg.householdState;
    const C = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const G = reg.estimatedHouseholdIncomeUSD * 0.18;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;
    const I = corpBase;

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

    Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
      subUnits.forEach(su => {
        const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
        const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
        const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
        const demandLevelUSD = suHhDemand + suGovDemand + suCorpDemand;

        (regions[regionId].categoryDemand as any)[su.unitId] = {
          demandLevelUSD,
          demandGrowthAnnual: reg.gdpGrowth ?? 0.02,
          demandHistory: [demandLevelUSD],
          crowdingIntensity: 0.1,
          inventoryLevelUSD: demandLevelUSD * 0.10,
          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,
          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          
          unitPriceUSD: su.unitId === 'industrial_automation' ? 80000.0 : undefined,
        };
      });
    });

    // P3 / P4: Populate initial dollar holdings for institutional sectors from shares
    const regionCompanies = companies.filter(c => c.region === regionId);
    const totalMarketCap = regionCompanies.reduce((s, c) => s + c.marketCap, 0);
    const totalCorpDebt = regionCompanies.reduce((s, c) => s + c.totalDebt, 0);
    const totalSovDebt = reg.debtToGdpPct * reg.derivedNominalGdpUSD;

    reg.institutionalSector.equityHoldingsUSD = Number((reg.equityOwnership.institutionalShare * totalMarketCap).toFixed(0));
    reg.institutionalSector.corpBondHoldingsUSD = Number((reg.corpBondOwnership.institutionalShare * totalCorpDebt).toFixed(0));
    reg.institutionalSector.sovBondHoldingsUSD = Number((reg.sovBondOwnership.institutionalShare * totalSovDebt).toFixed(0));

    // Compile holding candidates for individual institutional entities and macro sectors
    const equityCandidates = regionCompanies.map(c => ({
      id: c.id,
      type: 'EQUITY',
      region: regionId,
      outstandingUSD: c.marketCap
    }));

    const corpCandidates: { id: string; type: string; region: RegionId; outstandingUSD: number }[] = [];
    regionCompanies.forEach(c => {
      (c.debtTranches || []).forEach(tranche => {
        corpCandidates.push({
          id: tranche.id,
          type: 'CORP_BOND',
          region: regionId,
          outstandingUSD: tranche.principalUSD
        });
      });
    });

    const govDebtTranches = reg.govDebtTranches || [];
    const sovCandidates = govDebtTranches.map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldingsLocal(reg.institutionalSector.corpBondHoldingsUSD, corpCandidates),
      ...attributeItemizedHoldingsLocal(reg.institutionalSector.sovBondHoldingsUSD, sovCandidates),
      ...attributeItemizedHoldingsLocal(reg.institutionalSector.equityHoldingsUSD, equityCandidates),
    ];

    // Build the individual InstitutionalEntity objects mapping to regional Companies
    const regionalInstCompanies = regionCompanies.filter(c => c.isInstitutionalEntity);
    regionalInstCompanies.forEach(comp => {
      const role = comp.institutionalEntityType;
      if (!role) return;

      const share = comp.institutionalMarketShare ?? 0.33;
      const macroSector = reg.institutionalSector;
      const totalMacroAssetsUSD =
        (macroSector.equityHoldingsUSD || 0) +
        (macroSector.corpBondHoldingsUSD || 0) +
        (macroSector.sovBondHoldingsUSD || 0) +
        (macroSector.cashUSD || 0);

      const totalAssetsUSD = totalMacroAssetsUSD * share;
      const equityCapitalUSD = totalAssetsUSD * 0.12; // 12% capital ratio

      const entCorpShareUSD = (macroSector.corpBondHoldingsUSD || 0) * share;
      const entSovShareUSD = (macroSector.sovBondHoldingsUSD || 0) * share;
      const entEquityShareUSD = (macroSector.equityHoldingsUSD || 0) * share;

      const itemizedHoldings = [
        ...attributeItemizedHoldingsLocal(entCorpShareUSD, corpCandidates),
        ...attributeItemizedHoldingsLocal(entSovShareUSD, sovCandidates),
        ...attributeItemizedHoldingsLocal(entEquityShareUSD, equityCandidates),
      ];

      institutionalEntities.push({
        id: comp.id,
        name: comp.name,
        ticker: comp.ticker,
        region: regionId,
        entityType: role,
        financialStatementProfile: comp.financialStatementProfile,
        totalAssetsUSD,
        equityCapitalUSD,
        sharesOutstanding: comp.sharesOutstanding,
        stockPrice: comp.stockPrice,
        itemizedHoldings,
        assetAllocationTarget: allocationTargets[role],
        isDefaulted: comp.isDefaulted,
        historicalPrices: [...comp.historicalPrices],
      });
    });

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
  const allGeneratedCompanies = companies;
  Object.keys(COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
    const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId];
    const calibratedShare = calibrateIntensityShare(commodityId, allGeneratedCompanies, regions, linkage.subUnitId);
    COMMODITY_CATEGORY_LINKAGE[commodityId] = { ...linkage, intensityShare: calibratedShare };
  });

  const dealers = DEALERS;
  const compositeIndices = calculateCompositeIndices(companies, regions, commodities);
  const recentIPOs: { ticker: string; name: string; category: string; week: number }[] = [];
  const recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[] = [];

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
    institutionalEntities,
    commodities,
    compositeIndices,
    recentIPOs,
    recentMergers,
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



