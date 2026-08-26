import { isActiveCompany, CreditRating } from '../../domain/company';
import { Company, RegionId, Region, Commodity, CompositeBenchmarkIndices, IndexMetric } from '../../types';
import { generate52WeekHistory } from './utils';
import { getRegionPopulation, getRegionProductivityPerCapitaUSD, POPULATION_UNIT, PRODUCTIVITY_UNIT_USD } from '../bootstrap/population';
import { RATING_OAS_SPREADS } from '../pricing';

// Index base level = a shared reference unit scaled by each region's generated economic size
// (population x productivity, relative to the same reference primitives), not a quoted real
// index level.
const INDEX_BASE_UNIT = 1000;
const REFERENCE_ECONOMIC_SIZE = POPULATION_UNIT * PRODUCTIVITY_UNIT_USD;
function regionIndexBase(regionId: RegionId): number {
  const economicSize = getRegionPopulation(regionId) * getRegionProductivityPerCapitaUSD(regionId);
  return Number((INDEX_BASE_UNIT * (economicSize / REFERENCE_ECONOMIC_SIZE)).toFixed(1));
}
// Fallback OAS spreads (used only when a region/rating bucket has no companies yet) come
// straight from the generated rating-spread table — a representative investment-grade and
// high-yield notch — rather than a separate per-region literal table.
const IG_OAS_FALLBACK = RATING_OAS_SPREADS.BBB.baseBps;
const HY_OAS_FALLBACK = RATING_OAS_SPREADS.B.baseBps;

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
    return Math.max(-0.15, Math.min(0.15, avgChange));
  };

  const usChange = getCapWeightedAvgPrice(usFirms, regionIndexBase('USA'));
  const euChange = getCapWeightedAvgPrice(euFirms, regionIndexBase('EUR'));
  const ukChange = getCapWeightedAvgPrice(ukFirms, regionIndexBase('UK'));
  const jpChange = getCapWeightedAvgPrice(jpFirms, regionIndexBase('JPN'));

  // Sector-filtered sub-indices
  const techFirms = companies.filter(c => c.sector === 'Tech');
  const finFirms = companies.filter(c => c.sector === 'Financials' || c.sector === 'Banks');
  const energyFirms = companies.filter(c => c.sector === 'Energy');
  const indFirms = companies.filter(c => c.sector === 'Industrials');

  const techChange = getCapWeightedAvgPrice(techFirms, 1000);
  const finChange = getCapWeightedAvgPrice(finFirms, 1000);
  const energyChange = getCapWeightedAvgPrice(energyFirms, 1000);
  const indChange = getCapWeightedAvgPrice(indFirms, 1000);

  const prevUS = prevIndices?.us500?.value ?? regionIndexBase('USA');
  const prevEU = prevIndices?.euStoxx?.value ?? regionIndexBase('EUR');
  const prevUK = prevIndices?.uk100?.value ?? regionIndexBase('UK');
  const prevJP = prevIndices?.jp225?.value ?? regionIndexBase('JPN');

  const prevTech = prevIndices?.techIndex?.value ?? 1000;
  const prevFin = prevIndices?.financialsIndex?.value ?? 1000;
  const prevEnergy = prevIndices?.energyIndex?.value ?? 1000;
  const prevInd = prevIndices?.industrialsIndex?.value ?? 1000;

  const newUS = Number((prevUS * (1 + (prevIndices ? usChange : 0))).toFixed(1));
  const newEU = Number((prevEU * (1 + (prevIndices ? euChange : 0))).toFixed(1));
  const newUK = Number((prevUK * (1 + (prevIndices ? ukChange : 0))).toFixed(1));
  const newJP = Number((prevJP * (1 + (prevIndices ? jpChange : 0))).toFixed(0));

  const newTech = Number((prevTech * (1 + (prevIndices ? techChange : 0))).toFixed(1));
  const newFin = Number((prevFin * (1 + (prevIndices ? finChange : 0))).toFixed(1));
  const newEnergy = Number((prevEnergy * (1 + (prevIndices ? energyChange : 0))).toFixed(1));
  const newInd = Number((prevInd * (1 + (prevIndices ? indChange : 0))).toFixed(1));


  const advancingCompanies = companies.filter((c) => {
    const prevP = c.historicalPrices[c.historicalPrices.length - 2] || c.stockPrice;
    return c.stockPrice > prevP;
  }).length;
  const marketBreadth = companies.length > 0 ? (advancingCompanies / companies.length) * 100 : 50;

  const igRatings: CreditRating[] = ['AAA', 'AA', 'A', 'BBB'];
  const hyRatings: CreditRating[] = ['BB', 'B', 'CCC', 'D'];

  const getDebtWeightedOas = (firms: Company[], ratings: CreditRating[], fallback: number) => {
    const subset = firms.filter(c => ratings.includes(c.creditRating) && isActiveCompany(c));
    if (subset.length === 0) return fallback;
    const totalDebt = subset.reduce((sum, c) => sum + c.totalDebt, 0);
    return Math.round(subset.reduce((sum, c) => sum + c.oasSpreadBps * (c.totalDebt / Math.max(1, totalDebt)), 0));
  };

  const usIgOas = getDebtWeightedOas(usFirms, igRatings, IG_OAS_FALLBACK);
  const usHyOas = getDebtWeightedOas(usFirms, hyRatings, HY_OAS_FALLBACK);
  const euIgOas = getDebtWeightedOas(euFirms, igRatings, IG_OAS_FALLBACK);
  const euHyOas = getDebtWeightedOas(euFirms, hyRatings, HY_OAS_FALLBACK);
  const ukIgOas = getDebtWeightedOas(ukFirms, igRatings, IG_OAS_FALLBACK);
  const ukHyOas = getDebtWeightedOas(ukFirms, hyRatings, HY_OAS_FALLBACK);
  const jpIgOas = getDebtWeightedOas(jpFirms, igRatings, IG_OAS_FALLBACK);
  const jpHyOas = getDebtWeightedOas(jpFirms, hyRatings, HY_OAS_FALLBACK);

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

  // 5. Global Commodity Composite Index
  const prevGsci = prevIndices?.gsciCommodity?.value ?? INDEX_BASE_UNIT;
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

    techIndex: makeIndexMetric('Global Tech Composite', 'TECH', newTech, prevIndices?.techIndex),
    financialsIndex: makeIndexMetric('Global Financials Composite', 'FIN', newFin, prevIndices?.financialsIndex),
    energyIndex: makeIndexMetric('Global Energy Composite', 'NRG', newEnergy, prevIndices?.energyIndex),
    industrialsIndex: makeIndexMetric('Global Industrials Composite', 'IND', newInd, prevIndices?.industrialsIndex),
    globalCreditComposite: makeIndexMetric('Global Credit Index', 'GCI', Number(((usIgOas + euIgOas + ukIgOas + jpIgOas) / 4).toFixed(1)), prevIndices?.globalCreditComposite, 'bps'),
    marketBreadth,
    pmiComposite: calculatePmiComposite(regions, companies),
  };
}

function calculatePmiComposite(regions: Record<RegionId, Region>, companies: Company[]): { headline: number; demandComponent: number; capexComponent: number; employmentComponent: number } {
  const usaCompanies = companies.filter(c => c.region === 'USA' && isActiveCompany(c));
  const avgCategoryDemandGrowth = Object.values(regions.USA.categoryDemand).reduce((s: number, d: any) => s + d.demandGrowthAnnual, 0) / Math.max(1, Object.keys(regions.USA.categoryDemand).length);
  const avgCapexGrowth = usaCompanies.length ? usaCompanies.reduce((s, c) => s + (c.capex - (c.previousCapex ?? c.capex)) / Math.max(1, c.previousCapex ?? c.capex), 0) / usaCompanies.length : 0;
  const avgHeadcountGrowth = usaCompanies.length ? usaCompanies.reduce((s, c) => s + (c.employeeCount - c.previousEmployeeCount) / Math.max(1, c.previousEmployeeCount), 0) / usaCompanies.length : 0;

  const demandComponent = 50 + 50 * Math.tanh(avgCategoryDemandGrowth * 4);
  const capexComponent = 50 + 50 * Math.tanh(avgCapexGrowth * 52 * 3);
  const employmentComponent = 50 + 50 * Math.tanh(avgHeadcountGrowth * 52 * 5);
  const headline = (demandComponent + capexComponent + employmentComponent) / 3;
  return { headline: Number(headline.toFixed(1)), demandComponent: Number(demandComponent.toFixed(1)), capexComponent: Number(capexComponent.toFixed(1)), employmentComponent: Number(employmentComponent.toFixed(1)) };
}

