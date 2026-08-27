
import { RegionId, Portfolio, OccupationType, COMMODITY_CATEGORY_LINKAGE, InstitutionalEntity, InstitutionalEntityType, AssetAllocationTarget, ItemizedHolding, INDUSTRY_SUBUNITS } from '../../types';
import { DEALERS } from '../dealers';
import { GameState } from '../../types';
import { generateInitialCompanies } from '../companyGenerator';
import { getInitialRegions, getInitialFxPairs, getInitialCommodities, calculateCompositeIndices, calibrateIntensityShare } from '../macroEngine';
import { computeOccupationDemand, attributeItemizedHoldings, distributeRealTargetByWeight } from './stages/shared-helpers';
import { deriveSubUnitUnitPrice } from '../bootstrap/category-demand';

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
    const G = reg.governmentSpendingUSD * 52 * 0.35 * (1 + reg.fiscalStanceScore * 0.25);
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

    const regionFirmCount = companies.filter(c => c.region === regionId).length;

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
          upstreamScarcityIndex: 1.0,
          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          unitPriceUSD: deriveSubUnitUnitPrice(demandLevelUSD, su.buyerMix, reg.totalPopulation, regionFirmCount),
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
    const equityCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies.map(c => ({
      id: c.id,
      type: 'EQUITY',
      region: regionId,
      outstandingUSD: c.marketCap
    }));

    // Keyed by company id (aggregated across that issuer's own tranches), not per-tranche —
    // matches how the real corporate-bond clearing engine (07b-corporate-bond-clearing.ts)
    // tracks a participant's exposure per issuer, since all of an issuer's tranches reprice
    // together off one real cleared oasSpreadBps. A per-tranche key here would never match that
    // stage's per-company lookups, silently resetting every entity's real starting position to
    // zero on its very first real clearing week.
    const corpCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = regionCompanies
      .filter(c => (c.debtTranches || []).length > 0)
      .map(c => ({
        id: c.id,
        type: 'CORP_BOND',
        region: regionId,
        outstandingUSD: c.totalDebt,
      }));
    const totalCorpCandidatesUSD = corpCandidates.reduce((s, c) => s + c.outstandingUSD, 0) || 1;
    // Proportional-by-size, not attributeItemizedHoldings' size-sorted-greedy-with-a-40%-cap
    // fill: the real weekly clearing engine (07b-corporate-bond-clearing.ts) distributes an
    // entity's target across issuers by real debt-outstanding weight (tilted only by real
    // attractiveness, which is ~neutral at cold start); seeding the same shape here means an
    // entity's real week-1 gap per issuer is genuinely small, instead of the greedy fill
    // concentrating holdings in the 2-3 biggest issuers and leaving every smaller one to open
    // with an artificial, systemic buy gap on its first real clearing week.
    const attributeCorpBondHoldingsProportionally = (shareUSD: number): ItemizedHolding[] =>
      corpCandidates
        .filter(c => shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD) > 1)
        .map(c => ({
          instrumentId: c.id,
          instrumentType: c.type,
          issuerRegion: c.region,
          quantityOrNotionalUSD: shareUSD * (c.outstandingUSD / totalCorpCandidatesUSD),
        }));

    const govDebtTranches = reg.govDebtTranches || [];
    const sovCandidates: { id: string; type: ItemizedHolding['instrumentType']; region: RegionId; outstandingUSD: number }[] = govDebtTranches.map(gt => ({
      id: gt.id,
      type: 'GOV_BOND',
      region: regionId,
      outstandingUSD: gt.principalUSD
    }));

    reg.institutionalSector.itemizedHoldings = [
      ...attributeItemizedHoldings(reg.institutionalSector.corpBondHoldingsUSD, corpCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.sovBondHoldingsUSD, sovCandidates),
      ...attributeItemizedHoldings(reg.institutionalSector.equityHoldingsUSD, equityCandidates),
    ];

    // Build the individual InstitutionalEntity objects mapping to regional Companies
    const regionalInstCompanies = regionCompanies.filter(c => c.isInstitutionalEntity);

    // Real, bottom-up aggregate: the institutional sector's actual share of the real corporate
    // debt market (already a stable, real calibration used elsewhere in this codebase) — never
    // an independently-summed entity-level number that could come out larger than the market.
    // Each entity's own corpBondPct is a relative weight on this real, already-bounded pool (how
    // much MORE or LESS of it this entity wants versus its peers), not a free-standing dollar
    // target that could exceed the pool — see distributeRealTargetByWeight's doc comment. This
    // is the exact same derivation the real weekly clearing engine
    // (07b-corporate-bond-clearing.ts) uses, so week 1 starts already consistent with it instead
    // of needing a one-time correction on its first real week.
    const rawEntityCorpTargetsUSD = distributeRealTargetByWeight(
      regionalInstCompanies
        .filter(comp => comp.institutionalEntityType)
        .map(comp => {
          const role = comp.institutionalEntityType!;
          const share = comp.institutionalMarketShare ?? 0.33;
          const totalMacroAssetsUSD =
            (reg.institutionalSector.equityHoldingsUSD || 0) +
            (reg.institutionalSector.corpBondHoldingsUSD || 0) +
            (reg.institutionalSector.sovBondHoldingsUSD || 0) +
            (reg.institutionalSector.cashUSD || 0);
          return { id: comp.id, sizeWeight: totalMacroAssetsUSD * share, targetPct: allocationTargets[role].corpBondPct };
        }),
      reg.institutionalSector.corpBondHoldingsUSD || 0
    );

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

      const entCorpShareUSD = rawEntityCorpTargetsUSD.get(comp.id) ?? 0;
      const entSovShareUSD = (macroSector.sovBondHoldingsUSD || 0) * share;
      const entEquityShareUSD = (macroSector.equityHoldingsUSD || 0) * share;

      const itemizedHoldings = [
        ...attributeCorpBondHoldingsProportionally(entCorpShareUSD),
        ...attributeItemizedHoldings(entSovShareUSD, sovCandidates),
        ...attributeItemizedHoldings(entEquityShareUSD, equityCandidates),
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
    const week1OccDemand = computeOccupationDemand(regionCompanies, reg.privateSectorSegments, regionId, reg.governmentEmployment) as Record<OccupationType, number>;
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

  const topUsaCompanyIds = companies
    .filter(c => c.region === 'USA')
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 2)
    .map(c => c.id);
  const watchlist = [...topUsaCompanyIds, 'HEAVY_CRUDE_OIL', 'GOLD'];

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
    watchlist,
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



