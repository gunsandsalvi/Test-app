import { Commodity, CompositeBenchmarkIndices, Company, CreditRating, FxPair, IndexMetric, Region, RegionId, WeatherAnomaly } from '../types';
import { calculateTenorZeroRates, NelsonSiegelParams } from './nelsonSiegel';
import { priceCommodityFutures } from './pricing';

export const INITIAL_WEATHER: Record<RegionId, WeatherAnomaly> = {
  USA: {
    region: 'USA',
    title: 'Midwest Agricultural Drought Warning',
    type: 'Drought',
    severity: 'Moderate',
    tempDeltaC: +2.8,
    economicImpact: 'Crop yields compressed across Great Plains. Agricultural supply chains face elevated price pressure.',
    affectedCommodityId: 'CORN',
    commodityImpactPct: 0.04,
    gdpImpactPct: -0.001,
    inflationImpactPct: 0.002,
  },
  UK: {
    region: 'UK',
    title: 'North Sea Polar Vortex & Cold Snap',
    type: 'Polar Vortex',
    severity: 'Moderate',
    tempDeltaC: -4.5,
    economicImpact: 'Sub-zero temperatures strain domestic heating grids. Wholesale natural gas and electricity demand surges.',
    affectedCommodityId: 'NATGAS',
    commodityImpactPct: 0.08,
    gdpImpactPct: -0.002,
    inflationImpactPct: 0.003,
  },
  EUR: {
    region: 'EUR',
    title: 'Mediterranean Summer Heatwave Alert',
    type: 'Heatwave',
    severity: 'Mild',
    tempDeltaC: +3.2,
    economicImpact: 'Peak electricity demand for cooling; hydro reservoirs running below seasonal averages.',
    affectedCommodityId: 'BRENT',
    commodityImpactPct: 0.03,
    gdpImpactPct: -0.001,
    inflationImpactPct: 0.0015,
  },
  JPN: {
    region: 'JPN',
    title: 'Pacific Monsoon Front',
    type: 'Monsoon',
    severity: 'Mild',
    tempDeltaC: +0.5,
    economicImpact: 'Maritime transport and port operations encounter localized weather delays.',
    commodityImpactPct: 0.01,
    gdpImpactPct: -0.0005,
    inflationImpactPct: 0.0005,
  },
};

/**
 * Generate or evolve regional weather systems
 */
export function evolveRegionalWeather(regionId: RegionId, current: WeatherAnomaly, week: number): WeatherAnomaly {
  if (Math.random() < 0.28) {
    const r = Math.random();
    let pick: WeatherAnomaly['type'] = 'Normal';
    if (r > 0.55) {
      const remaining: WeatherAnomaly['type'][] = ['Heatwave', 'Drought', 'Polar Vortex', 'Monsoon'];
      pick = remaining[Math.floor(Math.random() * remaining.length)];
    }

    if (pick === 'Normal') {
      return {
        region: regionId,
        title: 'Mild Seasonal Weather Baseline',
        type: 'Normal',
        severity: 'Normal',
        tempDeltaC: 0.0,
        economicImpact: 'Standard seasonal weather across industrial zones. Supply chains functioning smoothly.',
        commodityImpactPct: 0.0,
        gdpImpactPct: 0.0,
        inflationImpactPct: 0.0,
        weeksActive: 1,
      };
    }

    if (pick === 'Drought') {
      return {
        region: regionId,
        title: `${regionId} Regional Arid Drought Zone`,
        type: 'Drought',
        severity: 'Severe',
        tempDeltaC: +3.5,
        economicImpact: 'Precipitation shortfalls constrain hydro capacity and inland transport waterways.',
        affectedCommodityId: 'CORN',
        commodityImpactPct: 0.06,
        gdpImpactPct: -0.003,
        inflationImpactPct: 0.004,
        weeksActive: 1,
      };
    }

    if (pick === 'Heatwave') {
      return {
        region: regionId,
        title: `${regionId} High-Pressure Heatwave Alert`,
        type: 'Heatwave',
        severity: 'Moderate',
        tempDeltaC: +4.2,
        economicImpact: 'Commercial cooling drives wholesale power demand; oil refiners encounter peak summer run throughput.',
        affectedCommodityId: 'BRENT',
        commodityImpactPct: 0.05,
        gdpImpactPct: -0.002,
        inflationImpactPct: 0.003,
        weeksActive: 1,
      };
    }

    if (pick === 'Polar Vortex') {
      return {
        region: regionId,
        title: `${regionId} Arctic Vortex Freeze`,
        type: 'Polar Vortex',
        severity: 'Severe',
        tempDeltaC: -6.0,
        economicImpact: 'Severe freeze drives record heating gas withdrawals and regional supply bottlenecks.',
        affectedCommodityId: 'NATGAS',
        commodityImpactPct: 0.12,
        gdpImpactPct: -0.004,
        inflationImpactPct: 0.005,
        weeksActive: 1,
      };
    }

    if (pick === 'Monsoon') {
      return {
        region: regionId,
        title: `${regionId} Typhoon & Heavy Precipitation`,
        type: 'Monsoon',
        severity: 'Moderate',
        tempDeltaC: -1.0,
        economicImpact: 'Localized port disruptions and industrial supply chain transit delays.',
        commodityImpactPct: 0.02,
        gdpImpactPct: -0.002,
        inflationImpactPct: 0.001,
        weeksActive: 1,
      };
    }
  }

  return {
    ...current,
    weeksActive: (current.weeksActive || 0) + 1
  };
}

/**
 * Helper to generate realistic 52-week synthetic history ending at the current value
 */
export function generate52WeekHistory(currentVal: number, volatility: number = 0.02, minVal: number = 0.001): number[] {
  // Fix: In the initial state (Turn 1), historical data arrays start with only ONE realized data point.
  // Do NOT generate synthetic historical curves for past periods that never occurred in-game.
  return [currentVal];
}

/**
 * Initial Multi-Region Macro Setup
 */
export function getInitialRegions(): Record<RegionId, Region> {
  const usaParams: NelsonSiegelParams = { beta0: 0.044, beta1: -0.004, beta2: 0.010, lambda: 1.8 };
  const ukParams: NelsonSiegelParams = { beta0: 0.046, beta1: -0.005, beta2: 0.012, lambda: 1.9 };
  const jpnParams: NelsonSiegelParams = { beta0: 0.012, beta1: -0.010, beta2: 0.006, lambda: 2.5 };
  const eurParams: NelsonSiegelParams = { beta0: 0.030, beta1: -0.003, beta2: 0.008, lambda: 2.0 };

  const usaZeros = calculateTenorZeroRates(usaParams);
  const ukZeros = calculateTenorZeroRates(ukParams);
  const jpnZeros = calculateTenorZeroRates(jpnParams);
  const eurZeros = calculateTenorZeroRates(eurParams);

  return {
    USA: {
      id: 'USA',
      name: 'United States',
      currency: 'USD',
      symbol: '$',
      centralBank: 'Federal Reserve',
      cycleRegime: 'Expansion',
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      centralBankBalanceSheet: 8.5e12,
      policyRate: 0.0450,
      neutralRate: 0.0100, // r* = 1.00%
      inflation: 0.0260,
      coreInflation: 0.0240,
      expectedInflation: 0.0240,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0220,
      potentialGdpGrowth: 0.0210,
      unemploymentRate: 0.040,
      wageGrowth: 0.0360,
      tradeBalance: -62.0,
      currentAccountPctGdp: -0.030,
      fxReservesBlnUSD: 38.5,
      fiscalDeficitPctGdp: 0.062, // 6.2% of GDP (generates supply term premium)
      debtToGdpPct: 1.210, // 121.0% gross debt to GDP
      sovereignRating: 'AA',
      householdState: {
        consumerConfidence: 100,
        wageGrowth: 0.0360,
        savingsRate: 0.055,
        realConsumptionGrowth: 0.02,
      },
      dotPlot1Y: 0.0400,
      dotPlot2Y: 0.0325,
      historicalPolicyRates: generate52WeekHistory(0.0450, 0.008, 0.005),
      historicalInflation: generate52WeekHistory(0.0260, 0.006, 0.005),
      historicalCoreInflation: generate52WeekHistory(0.0240, 0.005, 0.005),
      historicalGdpGrowth: generate52WeekHistory(0.0220, 0.010, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0360, 0.006, 0.01),
      historicalDebtToGdp: generate52WeekHistory(1.210, 0.004, 0.8),
      weather: INITIAL_WEATHER.USA,
      yieldCurveParams: usaParams,
      zeroRates: usaZeros,
      historicalZeroCurves: [{ week: 1, ...usaZeros }],
    },
    UK: {
      id: 'UK',
      name: 'United Kingdom',
      currency: 'GBP',
      symbol: '£',
      centralBank: 'Bank of England',
      cycleRegime: 'Expansion',
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      centralBankBalanceSheet: 1.2e12,
      policyRate: 0.0475,
      neutralRate: 0.0075, // r* = 0.75%
      inflation: 0.0280,
      coreInflation: 0.0260,
      expectedInflation: 0.0260,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0130,
      potentialGdpGrowth: 0.0150,
      unemploymentRate: 0.042,
      wageGrowth: 0.0420,
      tradeBalance: -20.0,
      currentAccountPctGdp: -0.034,
      fxReservesBlnUSD: 185.2,
      fiscalDeficitPctGdp: 0.046,
      debtToGdpPct: 0.975,
      sovereignRating: 'AA',
      householdState: {
        consumerConfidence: 100,
        wageGrowth: 0.0420,
        savingsRate: 0.060,
        realConsumptionGrowth: 0.015,
      },
      dotPlot1Y: 0.0425,
      dotPlot2Y: 0.0350,
      historicalPolicyRates: generate52WeekHistory(0.0475, 0.008, 0.005),
      historicalInflation: generate52WeekHistory(0.0280, 0.006, 0.005),
      historicalCoreInflation: generate52WeekHistory(0.0260, 0.005, 0.005),
      historicalGdpGrowth: generate52WeekHistory(0.0130, 0.010, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0420, 0.006, 0.01),
      historicalDebtToGdp: generate52WeekHistory(0.975, 0.004, 0.6),
      weather: INITIAL_WEATHER.UK,
      yieldCurveParams: ukParams,
      zeroRates: ukZeros,
      historicalZeroCurves: [{ week: 1, ...ukZeros }],
    },
    JPN: {
      id: 'JPN',
      name: 'Japan',
      currency: 'JPY',
      symbol: '¥',
      centralBank: 'Bank of Japan',
      cycleRegime: 'Expansion',
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      centralBankBalanceSheet: 4.8e12,
      policyRate: 0.0025,
      neutralRate: -0.0025, // r* = -0.25%
      inflation: 0.0180,
      coreInflation: 0.0160,
      expectedInflation: 0.0160,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0100,
      potentialGdpGrowth: 0.0080,
      unemploymentRate: 0.024,
      wageGrowth: 0.0250,
      tradeBalance: 14.0,
      currentAccountPctGdp: 0.036,
      fxReservesBlnUSD: 1240.0,
      fiscalDeficitPctGdp: 0.055,
      debtToGdpPct: 2.550,
      sovereignRating: 'A',
      householdState: {
        consumerConfidence: 100,
        wageGrowth: 0.0250,
        savingsRate: 0.080,
        realConsumptionGrowth: 0.01,
      },
      dotPlot1Y: 0.0050,
      dotPlot2Y: 0.0075,
      historicalPolicyRates: generate52WeekHistory(0.0025, 0.004, -0.001),
      historicalInflation: generate52WeekHistory(0.0180, 0.006, 0.002),
      historicalCoreInflation: generate52WeekHistory(0.0160, 0.005, 0.002),
      historicalGdpGrowth: generate52WeekHistory(0.0100, 0.008, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0250, 0.005, 0.005),
      historicalDebtToGdp: generate52WeekHistory(2.550, 0.004, 1.5),
      weather: INITIAL_WEATHER.JPN,
      yieldCurveParams: jpnParams,
      zeroRates: jpnZeros,
      historicalZeroCurves: [{ week: 1, ...jpnZeros }],
    },
    EUR: {
      id: 'EUR',
      name: 'Eurozone',
      currency: 'EUR',
      symbol: '€',
      centralBank: 'European Central Bank',
      cycleRegime: 'Expansion',
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      centralBankBalanceSheet: 7.2e12,
      policyRate: 0.0325,
      neutralRate: 0.0050, // r* = 0.50%
      inflation: 0.0230,
      coreInflation: 0.0220,
      expectedInflation: 0.0220,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0120,
      potentialGdpGrowth: 0.0140,
      unemploymentRate: 0.063,
      wageGrowth: 0.0320,
      tradeBalance: 26.0,
      currentAccountPctGdp: 0.022,
      fxReservesBlnUSD: 890.5,
      fiscalDeficitPctGdp: 0.034,
      debtToGdpPct: 0.880,
      sovereignRating: 'AAA',
      householdState: {
        consumerConfidence: 100,
        wageGrowth: 0.0320,
        savingsRate: 0.070,
        realConsumptionGrowth: 0.008,
      },
      dotPlot1Y: 0.0275,
      dotPlot2Y: 0.0225,
      historicalPolicyRates: generate52WeekHistory(0.0325, 0.008, 0.002),
      historicalInflation: generate52WeekHistory(0.0230, 0.006, 0.002),
      historicalCoreInflation: generate52WeekHistory(0.0220, 0.005, 0.002),
      historicalGdpGrowth: generate52WeekHistory(0.0120, 0.008, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0320, 0.006, 0.005),
      historicalDebtToGdp: generate52WeekHistory(0.880, 0.004, 0.5),
      weather: INITIAL_WEATHER.EUR,
      yieldCurveParams: eurParams,
      zeroRates: eurZeros,
      historicalZeroCurves: [{ week: 1, ...eurZeros }],
    },
  };
}

/**
 * Initial FX Pairs Matrix
 */
export function getInitialFxPairs(): FxPair[] {
  return [
    {
      pair: 'EUR/USD',
      base: 'EUR',
      quote: 'USA',
      rate: 1.0860,
      historicalRates: generate52WeekHistory(1.0860, 0.015, 0.95),
      change1W: 0.0010,
      basisSpreadBps: -18,
    },
    {
      pair: 'GBP/USD',
      base: 'UK',
      quote: 'USA',
      rate: 1.2940,
      historicalRates: generate52WeekHistory(1.2940, 0.015, 1.10),
      change1W: 0.0015,
      basisSpreadBps: -12,
    },
    {
      pair: 'USD/JPY',
      base: 'USA',
      quote: 'JPN',
      rate: 154.20,
      historicalRates: generate52WeekHistory(154.20, 0.02, 130.0),
      change1W: 0.30,
      basisSpreadBps: -34,
    },
    {
      pair: 'EUR/GBP',
      base: 'EUR',
      quote: 'UK',
      rate: 0.8390,
      historicalRates: generate52WeekHistory(0.8390, 0.01, 0.78),
      change1W: 0.0,
      basisSpreadBps: -6,
    },
  ];
}

/**
 * Initial Commodities (9 Coverage assets across Energy, Metals, Agriculture)
 */
export function getInitialCommodities(): Commodity[] {
  const rf = 0.0475;
  return [
    // 1. Energy
    {
      id: 'WTI',
      name: 'WTI Light Sweet Crude',
      symbol: 'WTI',
      category: 'Energy',
      unit: '$/bbl',
      spotPrice: 73.80,
      historicalPrices: generate52WeekHistory(73.80, 0.035, 45.0),
      convenienceYield: 0.032,
      futures1M: priceCommodityFutures(73.80, rf, 0.032, 1 / 12),
      futures3M: priceCommodityFutures(73.80, rf, 0.032, 3 / 12),
      futures6M: priceCommodityFutures(73.80, rf, 0.032, 6 / 12),
      change1W: 0.65,
      volatility: 0.30,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 46,
    },
    {
      id: 'BRENT',
      name: 'Brent Crude Oil',
      symbol: 'BRENT',
      category: 'Energy',
      unit: '$/bbl',
      spotPrice: 78.50,
      historicalPrices: generate52WeekHistory(78.50, 0.035, 50.0),
      convenienceYield: 0.035,
      futures1M: priceCommodityFutures(78.50, rf, 0.035, 1 / 12),
      futures3M: priceCommodityFutures(78.50, rf, 0.035, 3 / 12),
      futures6M: priceCommodityFutures(78.50, rf, 0.035, 6 / 12),
      change1W: 0.50,
      volatility: 0.28,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 48,
    },
    {
      id: 'NATGAS',
      name: 'Henry Hub Natural Gas',
      symbol: 'NATGAS',
      category: 'Energy',
      unit: '$/MMBtu',
      spotPrice: 2.85,
      historicalPrices: generate52WeekHistory(2.85, 0.06, 1.8),
      convenienceYield: 0.060,
      futures1M: priceCommodityFutures(2.85, rf, 0.060, 1 / 12),
      futures3M: priceCommodityFutures(2.85, rf, 0.060, 3 / 12),
      futures6M: priceCommodityFutures(2.85, rf, 0.060, 6 / 12),
      change1W: 0.05,
      volatility: 0.45,
      supplyDemandBalance: 'Deficit (Tight Supply)',
      inventoryLevelPct: 38,
    },
    // 2. Metals
    {
      id: 'GOLD',
      name: 'Gold Spot',
      symbol: 'GOLD',
      category: 'Metals',
      unit: '$/oz',
      spotPrice: 2680.0,
      historicalPrices: generate52WeekHistory(2680.0, 0.015, 2000.0),
      convenienceYield: 0.005,
      futures1M: priceCommodityFutures(2680.0, rf, 0.005, 1 / 12),
      futures3M: priceCommodityFutures(2680.0, rf, 0.005, 3 / 12),
      futures6M: priceCommodityFutures(2680.0, rf, 0.005, 6 / 12),
      change1W: 15.0,
      volatility: 0.16,
      supplyDemandBalance: 'Deficit (Tight Supply)',
      inventoryLevelPct: 35,
    },
    {
      id: 'SILVER',
      name: 'Silver Spot',
      symbol: 'SILVER',
      category: 'Metals',
      unit: '$/oz',
      spotPrice: 31.50,
      historicalPrices: generate52WeekHistory(31.50, 0.03, 22.0),
      convenienceYield: 0.010,
      futures1M: priceCommodityFutures(31.50, rf, 0.010, 1 / 12),
      futures3M: priceCommodityFutures(31.50, rf, 0.010, 3 / 12),
      futures6M: priceCommodityFutures(31.50, rf, 0.010, 6 / 12),
      change1W: 0.42,
      volatility: 0.26,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 44,
    },
    {
      id: 'COPPER',
      name: 'LME High Grade Copper',
      symbol: 'COPPER',
      category: 'Metals',
      unit: '$/lb',
      spotPrice: 4.45,
      historicalPrices: generate52WeekHistory(4.45, 0.025, 3.2),
      convenienceYield: 0.020,
      futures1M: priceCommodityFutures(4.45, rf, 0.020, 1 / 12),
      futures3M: priceCommodityFutures(4.45, rf, 0.020, 3 / 12),
      futures6M: priceCommodityFutures(4.45, rf, 0.020, 6 / 12),
      change1W: 0.04,
      volatility: 0.22,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 52,
    },
    // 3. Agriculture
    {
      id: 'WHEAT',
      name: 'Chicago SRW Wheat',
      symbol: 'WHEAT',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 5.85,
      historicalPrices: generate52WeekHistory(5.85, 0.035, 4.5),
      convenienceYield: 0.040,
      futures1M: priceCommodityFutures(5.85, rf, 0.040, 1 / 12),
      futures3M: priceCommodityFutures(5.85, rf, 0.040, 3 / 12),
      futures6M: priceCommodityFutures(5.85, rf, 0.040, 6 / 12),
      change1W: -0.08,
      volatility: 0.28,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 54,
    },
    {
      id: 'CORN',
      name: 'US Corn Futures Proxy',
      symbol: 'CORN',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 4.30,
      historicalPrices: generate52WeekHistory(4.30, 0.03, 3.6),
      convenienceYield: 0.035,
      futures1M: priceCommodityFutures(4.30, rf, 0.035, 1 / 12),
      futures3M: priceCommodityFutures(4.30, rf, 0.035, 3 / 12),
      futures6M: priceCommodityFutures(4.30, rf, 0.035, 6 / 12),
      change1W: 0.06,
      volatility: 0.25,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 51,
    },
    {
      id: 'SOYBEANS',
      name: 'Chicago Soybeans',
      symbol: 'SOYBEANS',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 10.25,
      historicalPrices: generate52WeekHistory(10.25, 0.03, 8.5),
      convenienceYield: 0.030,
      futures1M: priceCommodityFutures(10.25, rf, 0.030, 1 / 12),
      futures3M: priceCommodityFutures(10.25, rf, 0.030, 3 / 12),
      futures6M: priceCommodityFutures(10.25, rf, 0.030, 6 / 12),
      change1W: 0.12,
      volatility: 0.24,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 49,
    },
  ];
}

/**
 * Weekly Central Bank Inertial Taylor Rule & Yield Curve Evolution with Micro Feedback
 */
export function evolveRegionMacro(
  region: Region,
  globalShock: { gdpShock: number; inflationShock: number },
  microFeedback: { capexGdpContribution: number; marginCompression: number; creditContagionBps: number },
  week: number,
  equityReturn: number = 0,
  prevCommodities: Commodity[] = []
): {
  updatedRegion: Region;
  rateChanged: boolean;
  rateDeltaBps: number;
  isMeeting: boolean;
  diagnosticString: string;
} {
  const updatedWeather = evolveRegionalWeather(region.id, region.weather, week);

  const weatherDecay = Math.pow(0.55, Math.max(0, updatedWeather.weeksActive - 1));
  let weatherInfShock = updatedWeather.inflationImpactPct * weatherDecay;
  
  if (updatedWeather.affectedCommodityId && prevCommodities.length > 0) {
    const affectedComm = prevCommodities.find(c => c.id === updatedWeather.affectedCommodityId || c.symbol === updatedWeather.affectedCommodityId);
    if (affectedComm && affectedComm.historicalPrices.length >= 2) {
      const lastPrice = affectedComm.historicalPrices[affectedComm.historicalPrices.length - 1];
      const prevPrice = affectedComm.historicalPrices[affectedComm.historicalPrices.length - 2];
      const realizedCommodityChangePct = (lastPrice - prevPrice) / prevPrice;
      const consumptionBasketWeight = 0.03; // Assumed share of CPI basket
      weatherInfShock = (realizedCommodityChangePct * consumptionBasketWeight) * weatherDecay;
    }
  }

  const weatherGdpShock = updatedWeather.gdpImpactPct * weatherDecay;

  // Micro-to-Macro Transmission:
  // 1. Aggregate Corporate CapEx produces realistic incremental additions to national GDP (bounded -0.5% to +0.5%)
  const capexGdpFeedback = microFeedback.capexGdpContribution;
  
  // 2. Margin compression forces hiring freezes, cooling wage inflation
  const laborCooling = microFeedback.marginCompression * 0.15;
  
  // 3. Fiscal deficit > 6% injects supply-side term premium
  const fiscalDeficitTermPremium = region.fiscalDeficitPctGdp > 0.06 ? (region.fiscalDeficitPctGdp - 0.06) * 0.4 : 0;

  const infNoise = (Math.random() - 0.5) * 0.0008 + globalShock.inflationShock + weatherInfShock * 0.20 - laborCooling * 0.0008;

  // --- GDP CALCULATION REWRITE ---
  const potentialGdp = region.potentialGdpGrowth;
  
  // 1. Autoregressive AR(1) base with mean-reversion to potential GDP
  const gdpPersistence = region.cycleRegime === 'Recession' ? 0.75 : 0.85; // Strong gravity pulling back to potential
  const noiseMultiplier = region.cycleRegime === 'Recession' ? 1.5 : 1.0;
  const stochasticNoise = (Math.random() - 0.5) * 0.001 * noiseMultiplier; // +/- 5 bps random variation (increased in recession)
  const baseGdp = (region.gdpGrowth * gdpPersistence) + (potentialGdp * (1 - gdpPersistence)) + stochasticNoise + globalShock.gdpShock + weatherGdpShock * 0.20;

  // 2. Incremental bounded shocks (Annualized bps)
  const capexContribAnnual = capexGdpFeedback; // Already bounded and annualized in simulation.ts
  const prevHS = region.householdState || { consumerConfidence: 100, wageGrowth: region.wageGrowth, savingsRate: 0.06, realConsumptionGrowth: 0.02 };
  const consumerContribAnnual = Math.max(-0.002, Math.min(0.002, (prevHS.consumerConfidence - 100) * 0.0001)); // Max +/- 20 bps

  // Real Rate Demand Channel
  const realRateGap = (region.policyRate - region.inflation) - region.neutralRate;
  const monetaryDrag = Math.max(-0.025, Math.min(0.025, -realRateGap * 0.35));

  // Process recession shocks
  let scheduledShock = 0;
  const remainingShocks = region.recessionShockQueue.filter(s => {
    if (s.week === week) {
      scheduledShock += s.shock;
      return false;
    }
    return true;
  });

  // 3. Set new GDP Growth: Must be absolute rate, NOT compounded
  const updatedGdpGrowth = baseGdp + capexContribAnnual + consumerContribAnnual + monetaryDrag + scheduledShock;

  // 4. Absolute hard clamp to prevent runaway simulation
  const newGdpGrowth = Math.max(-0.02, Math.min(0.045, updatedGdpGrowth)); // Bounded between -2.0% and +4.5%

  let newInflation = Math.max(0.0050, Math.min(0.20, Number((region.inflation + infNoise).toFixed(4))));
  const newUnemployment = Math.max(0.032, Math.min(0.100, Number((region.unemploymentRate + (potentialGdp - newGdpGrowth) * 0.25 + (microFeedback.marginCompression > 0 ? 0.0004 : -0.0002)).toFixed(3))));
  const unempDelta = newUnemployment - region.unemploymentRate;

  let newCycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery' = 'Slowdown';
  if (newGdpGrowth < 0) newCycleRegime = 'Recession';
  else if (newGdpGrowth > potentialGdp + 0.005) newCycleRegime = region.cycleRegime === 'Recession' ? 'Recovery' : 'Expansion';
  else if (region.cycleRegime === 'Recession' && newGdpGrowth >= 0) newCycleRegime = 'Recovery';
  
  // Consumer & Household Sector Simulation
  const nairu = 0.045; 
  const slackGap = nairu - newUnemployment;
  const taperedSlackEffect = slackGap > 0.01 ? 0.01 + (slackGap - 0.01) * 0.3 : slackGap;
  const newWageGrowth = Math.max(0.0, Math.min(0.08, 0.025 + 0.8 * taperedSlackEffect + 0.1 * region.expectedInflation));
  
  const cciUnempMultiplier = (newCycleRegime === 'Recession' || newCycleRegime === 'Slowdown') && unempDelta > 0 ? 0.75 : 0.5;
  const contagionHit = microFeedback.creditContagionBps > 50 ? (microFeedback.creditContagionBps / 100) * 0.5 : 0;
  const newCCI = Math.max(60, Math.min(140, prevHS.consumerConfidence + 0.3 * (newWageGrowth - region.inflation) * 100 + 0.1 * (equityReturn * 100) - cciUnempMultiplier * unempDelta * 100 - contagionHit));

  const newSavingsRate = Math.max(0.02, Math.min(0.18, 0.06 + 0.2 * (region.policyRate - 0.02) - 0.1 * ((newCCI - 100) / 100)));
  const newRealConsumptionGrowth = (1 - newSavingsRate) * (newWageGrowth - region.inflation) * (newCCI / 100);

  const wagePushInflation = (newWageGrowth - 0.015) * 0.8;
  
  // Wage-push inflation adds to CPI (scaled for weekly turn)
  newInflation = Math.max(0.0050, Math.min(0.20, Number((newInflation + wagePushInflation * 0.02).toFixed(4))));
  const newCoreInflation = Number((newInflation * 0.92 + wagePushInflation * 0.1).toFixed(4));
  const newExpectedInflation = region.expectedInflation * 0.9 + newInflation * 0.1;

  // Calibrated Inertial Taylor Rule:
  // Target: i*_t = r* + pi_t + 0.5(pi_t - pi*) + 0.5(y_t - y*)
  const rStar = region.neutralRate; // US: 1.00%, UK: 0.75%, EU: 0.50%, JP: -0.25%
  const piStar = region.targetInflation; // 2.00% across all central banks
  
  const output_gap = Math.max(-0.03, Math.min(0.03, newGdpGrowth - potentialGdp));
  const inflation_gap = Math.max(-0.02, Math.min(0.04, newExpectedInflation - piStar));
  const taylorTarget = rStar + newExpectedInflation + 0.5 * inflation_gap + 0.5 * output_gap;

  let rateChanged = false;
  let newPolicyRate = region.policyRate;
  let rateDeltaBps = 0;

  // Central banks evaluate policy rates strictly once per quarter (every 13 weeks) or off-cycle if drastically behind curve
  const isMeeting = (week % 13 === 0) || Math.abs(taylorTarget - region.policyRate) > 0.03;
  if (isMeeting) {
    const rawQuarterlyDelta = taylorTarget - region.policyRate;
    let meetingDecisionBps = 0;
    
    // Clamp the quarterly policy move to standard discrete steps
    if (rawQuarterlyDelta >= 0.0200) meetingDecisionBps = 0.0150;       // +150 bps
    else if (rawQuarterlyDelta >= 0.0100) meetingDecisionBps = 0.0100;  // +100 bps
    else if (rawQuarterlyDelta >= 0.0035) meetingDecisionBps = 0.0050;       // +50 bps
    else if (rawQuarterlyDelta >= 0.0010) meetingDecisionBps = 0.0025;  // +25 bps
    else if (rawQuarterlyDelta <= -0.0200) meetingDecisionBps = -0.0150;// -150 bps
    else if (rawQuarterlyDelta <= -0.0100) meetingDecisionBps = -0.0100;// -100 bps
    else if (rawQuarterlyDelta <= -0.0035) meetingDecisionBps = -0.0050;// -50 bps
    else if (rawQuarterlyDelta <= -0.0010) meetingDecisionBps = -0.0025;// -25 bps

    newPolicyRate = Math.max(0.00, Math.min(0.25, region.policyRate + meetingDecisionBps));
    if (region.id === 'JPN') newPolicyRate = Math.max(-0.001, Math.min(0.025, newPolicyRate));

    if (newPolicyRate !== region.policyRate) {
      rateChanged = true;
      rateDeltaBps = Math.round((newPolicyRate - region.policyRate) * 10000);
    }
  }

  const smoothedTargetRate = taylorTarget; // Used for dot plot and curve parameters

  // --- DIAGNOSTIC TELEMETRY OUTPUT ---
  const capexBps = Math.round(capexContribAnnual * 10000);
  const consBps = Math.round(consumerContribAnnual * 10000);
  const outGapBps = Math.round(output_gap * 10000);
  const infGapBps = Math.round(inflation_gap * 10000);
  
  const diagnosticString = `Prior GDP: ${(region.gdpGrowth * 100).toFixed(2)}% | CapEx Boost: ${capexBps > 0 ? '+' : ''}${capexBps} bps | Cons Demand: ${consBps > 0 ? '+' : ''}${consBps} bps | Net Realized GDP: ${(newGdpGrowth * 100).toFixed(2)}%
Potential GDP: ${(potentialGdp * 100).toFixed(2)}% | Output Gap: ${outGapBps > 0 ? '+' : ''}${outGapBps} bps | CPI: ${(newInflation * 100).toFixed(2)}% (Gap ${infGapBps > 0 ? '+' : ''}${infGapBps} bps)
Taylor Target: ${(taylorTarget * 100).toFixed(2)}% | Current Policy: ${(region.policyRate * 100).toFixed(2)}% | Meeting Decision: ${rateChanged ? `${rateDeltaBps > 0 ? '+' : ''}${rateDeltaBps} bps -> ${(newPolicyRate * 100).toFixed(2)}%` : 'Hold'}`;

  // Dot Plot projections converging toward Taylor target & long-run neutral
  const dotPlot1Y = Number((newPolicyRate * 0.4 + smoothedTargetRate * 0.6).toFixed(4));
  const dotPlot2Y = Number((smoothedTargetRate * 0.35 + (rStar + piStar) * 0.65).toFixed(4));

  const qePace = newCycleRegime === 'Recession' ? 50e9 : (newCycleRegime === 'Expansion' ? -15e9 : 0);
  const newCbBalance = Math.max(0, region.centralBankBalanceSheet + qePace);
  const cbChangePct = (newCbBalance - region.centralBankBalanceSheet) / Math.max(1, region.centralBankBalanceSheet);
  const qePremium = cbChangePct * -0.5;

  // Update Nelson-Siegel yield curve parameters
  const newBeta0 = Math.max(
    0.012,
    region.yieldCurveParams.beta0 + (newInflation - piStar) * 0.04 + fiscalDeficitTermPremium * 0.02 + (microFeedback.creditContagionBps / 10000) * 0.04 + qePremium + (Math.random() - 0.5) * 0.0003
  );
  const newBeta1 = newPolicyRate - newBeta0 + (Math.random() - 0.5) * 0.0002;
  const newBeta2 =
    region.yieldCurveParams.beta2 + (newGdpGrowth - region.potentialGdpGrowth) * 0.06 + (Math.random() - 0.5) * 0.0003;

  const newCurveParams: NelsonSiegelParams = {
    beta0: newBeta0,
    beta1: newBeta1,
    beta2: newBeta2,
    lambda: region.yieldCurveParams.lambda,
  };

  const newZeroRates = calculateTenorZeroRates(newCurveParams);

  let newInversionCount = region.inversionWeeksCount;
  if (newZeroRates['2Y'] > newZeroRates['10Y']) {
    newInversionCount++;
    if (newInversionCount === 8) {
      // Push shock 13 weeks out
      remainingShocks.push({ week: week + 13, shock: -0.015 });
    }
  } else {
    newInversionCount = 0;
  }

  const nominalGdpGrowthWeekly = (newGdpGrowth + newInflation) / 52; // real growth + inflation ≈ nominal growth
  const weeklyDebtToGdpChange = (region.fiscalDeficitPctGdp / 52) - (nominalGdpGrowthWeekly * region.debtToGdpPct);
  const newDebtToGdpPct = Number((region.debtToGdpPct + weeklyDebtToGdpChange).toFixed(4));

  const histPolicy = [...region.historicalPolicyRates.slice(-51), newPolicyRate];
  const histInf = [...region.historicalInflation.slice(-51), newInflation];
  const histCore = [...(region.historicalCoreInflation || region.historicalInflation).slice(-51), newCoreInflation];
  const histGdp = [...region.historicalGdpGrowth.slice(-51), newGdpGrowth];
  const histWage = [...(region.historicalWageGrowth || region.historicalInflation).slice(-51), Number((newWageGrowth).toFixed(4))];
  const histDebt = [...(region.historicalDebtToGdp || [1.0]).slice(-51), newDebtToGdpPct];
  const histCurves = [...region.historicalZeroCurves.slice(-51), { week, ...newZeroRates }];

  const updatedRegion: Region = {
    ...region,
    cycleRegime: newCycleRegime,
    inversionWeeksCount: newInversionCount,
    recessionShockQueue: remainingShocks,
    centralBankBalanceSheet: newCbBalance,
    policyRate: newPolicyRate,
    inflation: newInflation,
    coreInflation: newCoreInflation,
    expectedInflation: newExpectedInflation,
    gdpGrowth: newGdpGrowth,
    wageGrowth: Number(newWageGrowth.toFixed(4)),
    debtToGdpPct: newDebtToGdpPct,
    unemploymentRate: newUnemployment,
    householdState: {
      consumerConfidence: newCCI,
      wageGrowth: newWageGrowth,
      savingsRate: newSavingsRate,
      realConsumptionGrowth: newRealConsumptionGrowth,
    },
    dotPlot1Y,
    dotPlot2Y,
    tradeBalance: Number((region.tradeBalance + (Math.random() - 0.5) * 1.0).toFixed(1)),
    yieldCurveParams: newCurveParams,
    zeroRates: newZeroRates,
    weather: updatedWeather,
    historicalPolicyRates: histPolicy,
    historicalInflation: histInf,
    historicalCoreInflation: histCore,
    historicalGdpGrowth: histGdp,
    historicalWageGrowth: histWage,
    historicalDebtToGdp: histDebt,
    historicalZeroCurves: histCurves,
  };

  return { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString };
}

/**
 * FX Uncovered Interest Rate Parity with stochastic drift and trade balance shocks
 */
export function evolveFxPair(fx: FxPair, regions: Record<RegionId, Region>): FxPair {
  const dt = 1 / 52;
  const baseRegion = regions[fx.base];
  const quoteRegion = regions[fx.quote];

  const rDomestic = quoteRegion.policyRate;
  const rForeign = baseRegion.policyRate;

  const rateDiff = rDomestic - rForeign;
  const sigmaFx = 0.08;
  const eps = (Math.random() - 0.5) * Math.sqrt(dt) * 2;

  const tradeShock = (baseRegion.tradeBalance - quoteRegion.tradeBalance) * 0.00002;

  const drift = rateDiff * dt * 0.3 + sigmaFx * eps + tradeShock;
  const newRate = Number((fx.rate * Math.exp(drift)).toFixed(4));
  const change1W = Number((newRate - fx.rate).toFixed(4));

  const basisNoise = (Math.random() - 0.5) * 2.0;
  const newBasisBps = Math.round(fx.basisSpreadBps + basisNoise + (rDomestic - rForeign) * 20);

  const hist = [...fx.historicalRates.slice(-51), newRate];

  return {
    ...fx,
    rate: newRate,
    change1W,
    historicalRates: hist,
    basisSpreadBps: Math.min(-2, Math.max(-80, newBasisBps)),
  };
}

/**
 * Evolve Commodities with Weather & Supply/Demand shocks
 */
export function evolveCommodity(
  comm: Commodity,
  globalGrowth: number,
  rfUSD: number,
  regions: Record<RegionId, Region>
): Commodity {
  const dt = 1 / 52;
  const demandShock = globalGrowth * 0.8;
  const randomEps = (Math.random() - 0.5) * comm.volatility * Math.sqrt(dt);

  let weatherBoost = 0;
  Object.values(regions).forEach((r) => {
    if (r.weather.affectedCommodityId === comm.id || r.weather.affectedCommodityId === comm.symbol) {
      const decay = Math.pow(0.55, Math.max(0, (r.weather.weeksActive || 0) - 1));
      weatherBoost += r.weather.commodityImpactPct * decay;
    }
  });

  const drift = demandShock * dt + randomEps + weatherBoost * dt * 4;
  const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(drift)).toFixed(2)));
  const change1W = Number((newSpot - comm.spotPrice).toFixed(2));

  const f1M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 1 / 12).toFixed(2));
  const f3M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 3 / 12).toFixed(2));
  const f6M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 6 / 12).toFixed(2));

  const hist = [...comm.historicalPrices.slice(-51), newSpot];

  const inventoryLevelPct = Math.max(20, Math.min(80, Math.round(comm.inventoryLevelPct + (Math.random() - 0.5) * 3 - (weatherBoost > 0 ? 4 : 0))));
  const supplyDemandBalance = inventoryLevelPct < 40 ? 'Deficit (Tight Supply)' : inventoryLevelPct > 60 ? 'Surplus (Oversupplied)' : 'Balanced';

  return {
    ...comm,
    spotPrice: newSpot,
    change1W,
    historicalPrices: hist,
    futures1M: f1M,
    futures3M: f3M,
    futures6M: f6M,
    inventoryLevelPct,
    supplyDemandBalance,
  };
}

/**
 * Calculate Non-Tradable Composite Benchmark Indices
 */
export function calculateCompositeIndices(
  companies: Company[],
  regions: Record<RegionId, Region>,
  commodities?: Commodity[],
  prevIndices?: CompositeBenchmarkIndices
): CompositeBenchmarkIndices {
  // 1. Equities Cap-weighted calculations
  const usFirms = companies.filter((c) => c.region === 'USA');
  const euFirms = companies.filter((c) => c.region === 'EUR');
  const ukFirms = companies.filter((c) => c.region === 'UK');
  const jpFirms = companies.filter((c) => c.region === 'JPN');

  const getCapWeightedAvgPrice = (firms: Company[], baseIndex: number) => {
    if (firms.length === 0) return baseIndex;
    const totalCap = firms.reduce((sum, f) => sum + f.marketCap, 0);
    const avgChange = firms.reduce((sum, f) => {
      const prevP = f.historicalPrices[f.historicalPrices.length - 2] || f.stockPrice;
      const chg = prevP > 0 ? (f.stockPrice - prevP) / prevP : 0;
      return sum + chg * (f.marketCap / Math.max(1, totalCap));
    }, 0);
    return avgChange;
  };

  const usChange = getCapWeightedAvgPrice(usFirms, 5850);
  const euChange = getCapWeightedAvgPrice(euFirms, 5020);
  const ukChange = getCapWeightedAvgPrice(ukFirms, 8280);
  const jpChange = getCapWeightedAvgPrice(jpFirms, 38900);

  const prevUS = prevIndices?.us500?.value ?? 5850;
  const prevEU = prevIndices?.euStoxx?.value ?? 5020;
  const prevUK = prevIndices?.uk100?.value ?? 8280;
  const prevJP = prevIndices?.jp225?.value ?? 38900;

  const newUS = Number((prevUS * (1 + (prevIndices ? usChange : 0))).toFixed(1));
  const newEU = Number((prevEU * (1 + (prevIndices ? euChange : 0))).toFixed(1));
  const newUK = Number((prevUK * (1 + (prevIndices ? ukChange : 0))).toFixed(1));
  const newJP = Number((prevJP * (1 + (prevIndices ? jpChange : 0))).toFixed(0));

  const igRatings: CreditRating[] = ['AAA', 'AA', 'A', 'BBB'];
  const hyRatings: CreditRating[] = ['BB', 'B', 'CCC', 'D'];

  const getDebtWeightedOas = (firms: Company[], ratings: CreditRating[], fallback: number) => {
    const subset = firms.filter(c => ratings.includes(c.creditRating) && !c.isDefaulted);
    if (subset.length === 0) return fallback;
    const totalDebt = subset.reduce((sum, c) => sum + c.totalDebt, 0);
    return Math.round(subset.reduce((sum, c) => sum + c.oasSpreadBps * (c.totalDebt / Math.max(1, totalDebt)), 0));
  };

  const usIgOas = getDebtWeightedOas(usFirms, igRatings, 120);
  const usHyOas = getDebtWeightedOas(usFirms, hyRatings, 380);
  const euIgOas = getDebtWeightedOas(euFirms, igRatings, 118);
  const euHyOas = getDebtWeightedOas(euFirms, hyRatings, 390);
  const ukIgOas = getDebtWeightedOas(ukFirms, igRatings, 130);
  const ukHyOas = getDebtWeightedOas(ukFirms, hyRatings, 410);
  const jpIgOas = getDebtWeightedOas(jpFirms, igRatings, 90);
  const jpHyOas = getDebtWeightedOas(jpFirms, hyRatings, 320);

  // 4. Global 10Y Benchmark Average
  const global10Y = Number(
    (
      (regions.USA.zeroRates.tenor10Y +
        regions.EUR.zeroRates.tenor10Y +
        regions.UK.zeroRates.tenor10Y +
        regions.JPN.zeroRates.tenor10Y) /
      4 *
      100
    ).toFixed(2)
  );

  // 5. Global Commodity Index (S&P GSCI Commodity Proxy)
  const prevGsci = prevIndices?.gsciCommodity?.value ?? 540.0;
  let commChange = 0;
  if (commodities && commodities.length > 0) {
    commChange = commodities.reduce((sum, c) => {
      const prevP = c.historicalPrices[c.historicalPrices.length - 2] || c.spotPrice;
      const chg = prevP > 0 ? (c.spotPrice - prevP) / prevP : 0;
      return sum + chg / commodities.length;
    }, 0);
  }
  const newGsci = Number((prevGsci * (1 + (prevIndices ? commChange : 0))).toFixed(1));

  const makeIndexMetric = (
    name: string,
    symbol: string,
    val: number,
    prev?: IndexMetric,
    unit: string = 'pts'
  ): IndexMetric => {
    const hist = prev ? [...prev.historical.slice(-51), val] : generate52WeekHistory(val, 0.015);
    const prevVal = prev?.value ?? val;
    const change1W = Number((val - prevVal).toFixed(2));
    return { name, symbol, value: val, change1W, historical: hist, unit };
  };

  return {
    us500: makeIndexMetric('S&P 500 Composite', 'US 500', newUS, prevIndices?.us500),
    usIgOas: makeIndexMetric('US IG Corporate OAS', 'US IG OAS', usIgOas, prevIndices?.usIgOas, 'bps'),
    usHyOas: makeIndexMetric('US HY Corporate OAS', 'US HY OAS', usHyOas, prevIndices?.usHyOas, 'bps'),

    euStoxx: makeIndexMetric('Euro Stoxx 50', 'EU Stoxx', newEU, prevIndices?.euStoxx),
    euIgOas: makeIndexMetric('EUR IG Corporate OAS', 'EUR IG OAS', euIgOas, prevIndices?.euIgOas, 'bps'),
    euHyOas: makeIndexMetric('EUR HY Corporate OAS', 'EUR HY OAS', euHyOas, prevIndices?.euHyOas, 'bps'),

    uk100: makeIndexMetric('FTSE 100', 'UK 100', newUK, prevIndices?.uk100),
    ukIgOas: makeIndexMetric('GBP IG Corporate OAS', 'GBP IG OAS', ukIgOas, prevIndices?.ukIgOas, 'bps'),
    ukHyOas: makeIndexMetric('GBP HY Corporate OAS', 'GBP HY OAS', ukHyOas, prevIndices?.ukHyOas, 'bps'),

    jp225: makeIndexMetric('Nikkei 225', 'JP 225', newJP, prevIndices?.jp225),
    jpIgOas: makeIndexMetric('JPY IG Corporate OAS', 'JPY IG OAS', jpIgOas, prevIndices?.jpIgOas, 'bps'),
    jpHyOas: makeIndexMetric('JPY HY Corporate OAS', 'JPY HY OAS', jpHyOas, prevIndices?.jpHyOas, 'bps'),

    global10YBenchmark: makeIndexMetric('Global 10Y Benchmark Yield', 'G10Y Yield', global10Y, prevIndices?.global10YBenchmark, '%'),
    gsciCommodity: makeIndexMetric('S&P GSCI Commodity Index', 'GSCI Index', newGsci, prevIndices?.gsciCommodity, 'pts'),
  };
}
