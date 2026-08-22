import {
  AssetType,
  Company,
  CreditRating,
  Dealer,
  GameState,
  Portfolio,
  Position,
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
import { generateInitialCompanies } from './companyGenerator';
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
import { priceSovereignBond } from './nelsonSiegel';
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

/**
 * Create initial Game State
 */
export function createInitialGameState(): GameState {
  const regions = getInitialRegions();
  const fxPairs = getInitialFxPairs();
  const companies = generateInitialCompanies();
  const commodities = getInitialCommodities();
  const dealers = DEALERS;
  const compositeIndices = calculateCompositeIndices(companies, regions, commodities);

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
export function advanceWeeklyStep(state: GameState): GameState {
  if (state.isGameOver) return state;

  const nextWeek = state.currentWeek + 1;
  const year = 2026 + Math.floor((nextWeek - 1) / 52);
  const currentWeekMod13 = ((nextWeek - 1) % 13) + 1;

  // 1. Calculate Micro -> Macro Feedback metrics from previous corporate state
  const prevActiveFirms = state.companies.filter((c) => !c.isDefaulted);
  const totalCapex = prevActiveFirms.reduce((sum, c) => sum + c.capex, 0);
  const avgMargin = prevActiveFirms.reduce((sum, c) => sum + (c.ebitda / Math.max(1, c.annualRevenue)), 0) / Math.max(1, prevActiveFirms.length);
  const marginCompression = avgMargin < 0.22 ? 0.22 - avgMargin : 0.0;
  const recentDefaultsCount = state.companies.filter((c) => c.isDefaulted).length;
  const creditContagionBps = recentDefaultsCount * 12;

  // 2. Evolve Multi-Region Macro States
  const globalInflationShock = (Math.random() - 0.49) * 0.0008;
  const globalGdpShock = (Math.random() - 0.49) * 0.001;

  const rateChanges: { region: RegionId; deltaBps: number }[] = [];
  const diagnosticLogs: NewsItem[] = [];
  const updatedRegions: Record<RegionId, any> = { ...state.regions };

  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {
    let equityRet = 0;
    if (regionId === 'USA') equityRet = state.compositeIndices.us500.change1W || 0;
    if (regionId === 'EUR') equityRet = state.compositeIndices.euStoxx.change1W || 0;
    if (regionId === 'UK') equityRet = state.compositeIndices.uk100.change1W || 0;
    if (regionId === 'JPN') equityRet = state.compositeIndices.jp225.change1W || 0;

    const REGIONAL_BASE_GDP: Record<string, number> = {
      USA: 28_000_000_000_000,
      EUR: 18_000_000_000_000,
      UK: 3_400_000_000_000,
      JPN: 4_200_000_000_000
    };
    const regionFirms = prevActiveFirms.filter(f => f.region === regionId);
    const totalRegionalCapEx = regionFirms.reduce((sum, f) => sum + (f.capex || 0), 0);
    const baseGdp = REGIONAL_BASE_GDP[regionId] || 10_000_000_000_000;
    const baselineExpectedCapEx = (baseGdp * 0.03) / 52;
    const capexDeltaDollars = totalRegionalCapEx - baselineExpectedCapEx;
    const capexGdpImpactWeekly = capexDeltaDollars / baseGdp;
    const boundedGdpContribution = Math.max(-0.005, Math.min(0.005, capexGdpImpactWeekly * 52));

    const { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      { capexGdpContribution: boundedGdpContribution, marginCompression, creditContagionBps },
      nextWeek,
      equityRet
    );
    updatedRegions[regionId] = updatedRegion;
    if (isMeeting) {
      rateChanges.push({ region: regionId, deltaBps: rateDeltaBps });
    }
    
    // Add Macro Diagnostic Telemetry to Log
    diagnosticLogs.push({
      id: `diag-macro-${regionId}-${nextWeek}`,
      week: nextWeek,
      category: 'MACRO',
      title: `[MACRO] ${regionId} GDP Breakdown:`,
      description: diagnosticString,
      impactBadge: '[DIAGNOSTIC]',
      impactRegion: regionId,
      sentimentDelta: 0,
      urgent: false
    });
  });

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
  const defaultedTickers: string[] = [];
  const earningsReportedThisTurn: EarningsReportEvent[] = [];

  const updatedCompanies: Company[] = state.companies.map((comp) => {
    if (comp.isDefaulted) {
      return comp;
    }

    const reg = updatedRegions[comp.region];
    const sec = SECTOR_BENCHMARKS[comp.sector];

    // Consumer Revenue Beta
    let consumerRevBoost = 0;
    if (comp.sector === 'Consumer') consumerRevBoost = reg.householdState.realConsumptionGrowth * 1.6;
    else if (comp.sector === 'Tech') consumerRevBoost = reg.householdState.realConsumptionGrowth * 1.1;
    else consumerRevBoost = reg.householdState.realConsumptionGrowth * 0.4;

    // Weekly revenue transition
    const noise = (Math.random() - 0.49) * 0.015;
    const baseRev = comp.baselineAnnualRevenue || comp.annualRevenue;
    const sectorGdpBeta = comp.beta;
    
    // Re-anchor target annual revenue to baseline capacity adjusted for regional GDP and consumer momentum
    const targetAnnualRevenue = baseRev * (1 + (reg.gdpGrowth * sectorGdpBeta) + consumerRevBoost + noise);
    
    // Smooth transition to target revenue (no exponential weekly compounding)
    const newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));

    // Operating margins update (Wage-Push compression)
    const wageCompression = Math.max(0, reg.householdState.wageGrowth - 0.025) * 0.15;
    const baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
    const newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin + (Math.random() - 0.5) * 0.004 - (wageCompression / 52)));
    const newEbitda = newRevenue * newEbitdaMargin;
    const da = newRevenue * 0.05;
    const newEbit = Math.max(1, newEbitda - da);

    // Interest Expense
    const effectiveDebtRate = reg.policyRate + comp.oasSpreadBps / 10000;
    const weeklyInterest = (comp.totalDebt * effectiveDebtRate) / 52;
    const annualInterest = comp.totalDebt * effectiveDebtRate;
    const taxRate = 0.21;
    const newNetIncome = Math.max(-50, (newEbit - annualInterest) * (1 - taxRate));
    let newEps = Number((newNetIncome / comp.sharesOutstanding).toFixed(2));

    // Weekly Cash flow and debt amortization / prepayment
    const weeklyFreeCashFlow = newEbitda / 52 - comp.capex / 52 - weeklyInterest;
    let newCash = comp.cash + weeklyFreeCashFlow;
    let newTotalDebt = comp.totalDebt;

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
    const ratingSpreadConfig = RATING_OAS_SPREADS[newRating];
    const targetOasBps = ratingSpreadConfig.baseBps + (newLeverage > 4 ? (newLeverage - 4) * 50 : 0);
    const newOasBps = Math.round(
      comp.oasSpreadBps + (targetOasBps - comp.oasSpreadBps) * 0.35 + (Math.random() - 0.5) * 5
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

    const newSentiment = Math.max(-1.0, Math.min(1.0, comp.sentiment * 0.85 + sentimentDelta));
    const newStockPrice = isDefaulted ? 0.0 : Number(priceEquity(newEps, comp.forwardPE, newSentiment, false).toFixed(2));
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

    return {
      ...comp,
      annualRevenue: Number(newRevenue.toFixed(1)),
      ebitda: Number(newEbitda.toFixed(1)),
      ebit: Number(newEbit.toFixed(1)),
      netIncome: Number(newNetIncome.toFixed(1)),
      eps: newEps,
      cash: Number(newCash.toFixed(1)),
      totalDebt: Number(newTotalDebt.toFixed(1)),
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

          const divYield = comp.dividendYield || 0.018;
          const weeklyDiv = (posValueUSD * divYield) / 52;

          if (pos.direction === 'LONG') {
            unrealizedPnL = posValueUSD - entryValueUSD;
            delta = posValueUSD;
            weeklyFinancing = (posValueUSD * (updatedRegions[pos.region].policyRate + 0.005)) / 52;
            attributionCarry += weeklyDiv - weeklyFinancing;
          } else {
            unrealizedPnL = entryValueUSD - posValueUSD;
            delta = -posValueUSD;
            weeklyFinancing = (posValueUSD * (divYield + 0.015)) / 52;
            attributionCarry -= weeklyFinancing;
          }

          marginReq = posValueUSD * marginRate;
          maintMargin = marginReq * 0.65;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionEquityDelta += pnlMove;
        }
        break;
      }

      case 'LEVERAGED_LOAN': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        if (comp) {
          currentPrice = comp.leveragedLoan.pricePar;
          const posValueUSD = pos.quantity * (currentPrice / 100) * fxRateToUsd;
          const entryValueUSD = pos.quantity * (pos.entryPrice / 100) * fxRateToUsd;

          unrealizedPnL = pos.direction === 'LONG' ? posValueUSD - entryValueUSD : entryValueUSD - posValueUSD;
          const loanRate = updatedRegions[pos.region].policyRate + comp.leveragedLoan.quotedMarginBps / 10000;
          const couponAccrual = (pos.notional * loanRate) / 52 * fxRateToUsd;
          const fundingCost = (posValueUSD * (updatedRegions[pos.region].policyRate + 0.005)) / 52;
          weeklyFinancing = fundingCost;
          attributionCarry += pos.direction === 'LONG' ? couponAccrual - fundingCost : -couponAccrual - fundingCost;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionCreditSpread += pnlMove * 0.8;
          attributionMacroRates += pnlMove * 0.2;

          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.65;
        }
        break;
      }

      case 'CORP_BOND': {
        const comp = updatedCompanies.find((c) => c.ticker === pos.symbol);
        const sovParams = updatedRegions[pos.region].yieldCurveParams;
        if (comp) {
          const bondPriced = priceCorporateBond(
            pos.tenorYears || 5,
            pos.fixedRate || 0.05,
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

          const couponAccrual = (pos.notional * (pos.fixedRate || 0.05)) / 52 * fxRateToUsd;
          const fundingCost = (posValueUSD * (updatedRegions[pos.region].policyRate + 0.004)) / 52;
          weeklyFinancing = fundingCost;
          attributionCarry += pos.direction === 'LONG' ? couponAccrual - fundingCost : -couponAccrual - fundingCost;

          const pnlMove = unrealizedPnL - prevPnL;
          attributionCreditSpread += pnlMove * 0.7;
          attributionMacroRates += pnlMove * 0.3;

          marginReq = pos.notional * fxRateToUsd * marginRate;
          maintMargin = marginReq * 0.65;
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

        const couponAccrual = (pos.notional * (pos.fixedRate || 0.04)) / 52 * fxRateToUsd;
        const fundingCost = (posValueUSD * (updatedRegions[pos.region].policyRate + 0.002)) / 52;
        weeklyFinancing = fundingCost;
        attributionCarry += pos.direction === 'LONG' ? couponAccrual - fundingCost : -couponAccrual - fundingCost;

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

        const fltRate = updatedRegions[pos.region].policyRate;
        const fixRate = pos.fixedRate || 0.04;
        const weeklyNetIrsCarry =
          pos.direction === 'PAY_FIXED'
            ? (pos.notional * (fltRate - fixRate) * fxRateToUsd) / 52
            : (pos.notional * (fixRate - fltRate) * fxRateToUsd) / 52;
        attributionCarry += weeklyNetIrsCarry;

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

          const weeklyCdsCarry = (pos.notional * (pos.entryPrice / 10000) * fxRateToUsd) / 52;
          attributionCarry += pos.direction === 'BUY_PROTECTION' ? -weeklyCdsCarry : weeklyCdsCarry;

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
          weeklyFinancing = notionalUSD * financingRate;

          unrealizedPnL =
            pos.direction === 'LONG' ? priceReturnUSD - weeklyFinancing : -priceReturnUSD - weeklyFinancing;
          delta = pos.direction === 'LONG' ? notionalUSD : -notionalUSD;

          attributionCarry -= weeklyFinancing;
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

          const fundingCost = (posValueUSD * (updatedRegions.USA.policyRate + 0.003)) / 52;
          const weeklyConvenienceYield = (posValueUSD * comm.convenienceYield) / 52;
          weeklyFinancing = fundingCost;
          attributionCarry += pos.direction === 'LONG' ? weeklyConvenienceYield - fundingCost : -weeklyConvenienceYield - fundingCost;

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
        const vol = pos.impliedVol || 0.3;
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

        const weeklyThetaDecay = (theta * 7) / 365;
        attributionCarry += weeklyThetaDecay;

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
  const netWeeklyAccruals = weeklyInterestIncomeUSD - weeklyFinancingCostUSD;
  const updatedCashUSD = state.portfolio.cashUSD + netWeeklyAccruals;
  const totalUnrealizedPnL = updatedPositions.reduce((sum, p) => sum + p.unrealizedPnL, 0);
  const currentNavUSD = Math.max(0, updatedCashUSD + totalUnrealizedPnL);

  const pnlDeltaUSD = currentNavUSD - state.portfolio.navUSD;
  const pnlDeltaPct = state.portfolio.navUSD > 0 ? (pnlDeltaUSD / state.portfolio.navUSD) * 100 : 0;

  const totalGrossExposureUSD = updatedPositions.reduce((sum, p) => sum + p.notional, 0);
  const totalLeverage = Number((totalGrossExposureUSD / Math.max(1, currentNavUSD)).toFixed(1));
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
  const b6040WeeklyReturn = 0.07 / 52 + (Math.random() - 0.48) * 0.012;
  const nextBenchmark6040 = prevBenchmark.benchmark6040 * (1 + b6040WeeklyReturn);
  const nextCashHurdle = prevBenchmark.cashHurdle * (1 + 0.05 / 52);

  const updatedBenchmarks = [
    ...state.portfolio.historicalBenchmarks.slice(-25),
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
    historicalNav: [...state.portfolio.historicalNav.slice(-25), currentNavUSD],
    historicalBenchmarks: updatedBenchmarks,
    positions: updatedPositions,
    closedPositionsCount: state.portfolio.closedPositionsCount,
    realizedPnLTotal: state.portfolio.realizedPnLTotal,
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

  const updatedDiagnosticsLogs = [...(state.diagnosticsLogs || []), ...newStepLogs].slice(-100);

  // News feed strictly displays headlines generated during the current active weekly step
  const updatedNewsFeed = [...diagnosticLogs, ...newsItems];

  return {
    ...state,
    currentWeek: nextWeek,
    year,
    regions: updatedRegions,
    fxPairs: updatedFxPairs,
    companies: updatedCompanies,
    commodities: updatedCommodities,
    compositeIndices: updatedCompositeIndices,
    portfolio: updatedPortfolio,
    newsFeed: updatedNewsFeed,
    diagnosticsLogs: updatedDiagnosticsLogs,
    turnSummary,
    isGameOver,
    gameOverReason,
  };
}
