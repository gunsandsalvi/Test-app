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
  // Indices are PUBLIC-market objects: a private firm (HC Wave 1) has no quote and no index
  // membership, so it must not enter a cap-weighted average with a zero market cap.
  const listed = companies.filter((c) => c.listingStatus !== 'PRIVATE');
  const usFirms = listed.filter((c) => c.region === 'USA');
  const euFirms = listed.filter((c) => c.region === 'EUR');
  const ukFirms = listed.filter((c) => c.region === 'UK');
  const jpFirms = listed.filter((c) => c.region === 'JPN');

  /**
 * IDX / RULE 4 — a published index name is GENERATED, like every ticker and company name in this
 * model. What stood here was 'S&P 500 Composite', 'Euro Stoxx 50', 'FTSE 100', 'Nikkei 225' and
 * 'S&P GSCI Commodity Index': five real brands, in the UI, in a model whose whole discipline is
 * that nothing real-world is imported. No constituent count in the name either: a real index
 * names one because its membership is fixed at that size, and this one's is re-struck quarterly
 * from the market that exists (`stages/index-calculation.ts`), so a number would be a brand too.
 */
function regionIndexName(regionId: RegionId): string {
  return `${regionId} Composite`;
}
function regionIndexShortName(regionId: RegionId): string {
  return `${regionId} Comp`;
}
const COMMODITY_INDEX_NAME = 'Broad Commodity Index';
const COMMODITY_INDEX_SHORT_NAME = 'Commodities';

const getCapWeightedAvgPrice = (firms: Company[], baseIndex: number) => {
    if (firms.length === 0) return baseIndex;
    const totalCap = firms.reduce((sum, f) => sum + f.marketCap, 0);
    const avgChange = firms.reduce((sum, f) => {
      const prevP = f.historicalPrices[f.historicalPrices.length - 2] || f.stockPrice;
      const chg = prevP > 0 ? (f.stockPrice - prevP) / prevP : 0;
      return sum + chg * (f.marketCap / Math.max(1, totalCap));
    }, 0);
    // IDX: no bound. An index is the cap-weighted move of its own constituents, whatever that
    // is — a STATISTIC, not a price and not a level. The +/-15%/wk clamp that stood here only
    // hid §6's equity runaway inside the published number while the constituents themselves ran,
    // which is the one thing a published index must never do (rule 2).
    return avgChange;
  };

  const usChange = getCapWeightedAvgPrice(usFirms, regionIndexBase('USA'));
  const euChange = getCapWeightedAvgPrice(euFirms, regionIndexBase('EUR'));
  const ukChange = getCapWeightedAvgPrice(ukFirms, regionIndexBase('UK'));
  const jpChange = getCapWeightedAvgPrice(jpFirms, regionIndexBase('JPN'));

  // IDX: sector sub-indices filter to `listed` like the regional ones. They did not, which was
  // harmless only while a private firm's marketCap was 0 — a latent double-count waiting for the
  // moment one carried a quote.
  const techFirms = listed.filter(c => c.sector === 'Tech');
  const finFirms = listed.filter(c => c.sector === 'Financials' || c.sector === 'Banks');
  const energyFirms = listed.filter(c => c.sector === 'Energy');
  const indFirms = listed.filter(c => c.sector === 'Industrials');

  const techChange = getCapWeightedAvgPrice(techFirms, 1000);
  const finChange = getCapWeightedAvgPrice(finFirms, 1000);
  const energyChange = getCapWeightedAvgPrice(energyFirms, 1000);
  const indChange = getCapWeightedAvgPrice(indFirms, 1000);

  const prevUS = prevIndices?.usaComposite?.value ?? regionIndexBase('USA');
  const prevEU = prevIndices?.eurComposite?.value ?? regionIndexBase('EUR');
  const prevUK = prevIndices?.ukComposite?.value ?? regionIndexBase('UK');
  const prevJP = prevIndices?.jpnComposite?.value ?? regionIndexBase('JPN');

  const prevTech = prevIndices?.techIndex?.value ?? 1000;
  const prevFin = prevIndices?.financialsIndex?.value ?? 1000;
  const prevEnergy = prevIndices?.energyIndex?.value ?? 1000;
  const prevInd = prevIndices?.industrialsIndex?.value ?? 1000;

  const newUS = Number((prevUS * (1 + (prevIndices ? usChange : 0))).toFixed(1));
  const newEU = Number((prevEU * (1 + (prevIndices ? euChange : 0))).toFixed(1));
  const newUK = Number((prevUK * (1 + (prevIndices ? ukChange : 0))).toFixed(1));
  const newJP = Math.round((prevJP * (1 + (prevIndices ? jpChange : 0))));

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
  const prevGsci = prevIndices?.commodityComposite?.value ?? INDEX_BASE_UNIT;
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
    usaComposite: makeIndexMetric(regionIndexName('USA'), regionIndexShortName('USA'), newUS, prevIndices?.usaComposite),
    usIgOas: makeIndexMetric('US IG Corporate OAS', 'US IG OAS', usIgOas, prevIndices?.usIgOas, 'bps'),
    usHyOas: makeIndexMetric('US HY Corporate OAS', 'US HY OAS', usHyOas, prevIndices?.usHyOas, 'bps'),

    eurComposite: makeIndexMetric(regionIndexName('EUR'), regionIndexShortName('EUR'), newEU, prevIndices?.eurComposite),
    euIgOas: makeIndexMetric('EUR IG Corporate OAS', 'EUR IG OAS', euIgOas, prevIndices?.euIgOas, 'bps'),
    euHyOas: makeIndexMetric('EUR HY Corporate OAS', 'EUR HY OAS', euHyOas, prevIndices?.euHyOas, 'bps'),

    ukComposite: makeIndexMetric(regionIndexName('UK'), regionIndexShortName('UK'), newUK, prevIndices?.ukComposite),
    ukIgOas: makeIndexMetric('GBP IG Corporate OAS', 'GBP IG OAS', ukIgOas, prevIndices?.ukIgOas, 'bps'),
    ukHyOas: makeIndexMetric('GBP HY Corporate OAS', 'GBP HY OAS', ukHyOas, prevIndices?.ukHyOas, 'bps'),

    jpnComposite: makeIndexMetric(regionIndexName('JPN'), regionIndexShortName('JPN'), newJP, prevIndices?.jpnComposite),
    jpIgOas: makeIndexMetric('JPY IG Corporate OAS', 'JPY IG OAS', jpIgOas, prevIndices?.jpIgOas, 'bps'),
    jpHyOas: makeIndexMetric('JPY HY Corporate OAS', 'JPY HY OAS', jpHyOas, prevIndices?.jpHyOas, 'bps'),

    global10YBenchmark: makeIndexMetric('Global 10Y Benchmark Yield', 'G10Y Yield', global10Y, prevIndices?.global10YBenchmark, '%'),
    commodityComposite: makeIndexMetric(COMMODITY_INDEX_NAME, COMMODITY_INDEX_SHORT_NAME, newGsci, prevIndices?.commodityComposite, 'pts'),

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



/**
 * IDX — the region's published index, by region. One lookup instead of the `region === 'USA' ? …`
 * chain that was spelled out at each consumer.
 */
export function regionIndexOf(indices: CompositeBenchmarkIndices, regionId: RegionId): IndexMetric {
  return regionId === 'USA' ? indices.usaComposite
    : regionId === 'EUR' ? indices.eurComposite
    : regionId === 'UK' ? indices.ukComposite
    : indices.jpnComposite;
}

/** How many weeks of returns a measured beta is struck on once the history exists. */
export const BETA_MEASUREMENT_WEEKS = 52;

/**
 * IDX — BETA IS A MEASUREMENT, and this model produces both series it needs every week.
 *
 * It was stated per sector in `bootstrap/firms.ts` and then used to discount the very stock that
 * should produce it — equity valuation, LAB's cost of capital, the seed's capital charge — so a
 * name's риск premium was a property of its sector label rather than of how its price actually
 * moved. Now: the covariance of this name's cleared returns with its region's index, over the
 * covariance of the index with itself. The sector number survives only as the opening prior,
 * until there are enough real weeks to strike one.
 */
export function measureBeta(stockPrices: number[] | undefined, indexHistory: number[] | undefined, priorBeta: number): number {
  const px = stockPrices ?? [];
  const ix = indexHistory ?? [];
  const n = Math.min(px.length, ix.length, BETA_MEASUREMENT_WEEKS + 1);
  if (n < 12) return priorBeta;
  const pr = px.slice(-n), ir = ix.slice(-n);
  const rs: number[] = [], rm: number[] = [];
  for (let i = 1; i < n; i++) {
    if (!(pr[i - 1] > 0) || !(ir[i - 1] > 0)) continue;
    rs.push((pr[i] - pr[i - 1]) / pr[i - 1]);
    rm.push((ir[i] - ir[i - 1]) / ir[i - 1]);
  }
  if (rs.length < 8) return priorBeta;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const ms = mean(rs), mi = mean(rm);
  let cov = 0, varM = 0;
  for (let i = 0; i < rs.length; i++) { cov += (rs[i] - ms) * (rm[i] - mi); varM += (rm[i] - mi) ** 2; }
  if (!(varM > 1e-12)) return priorBeta;
  return Number((cov / varM).toFixed(3));
}
