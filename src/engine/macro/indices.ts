import { isActiveCompany } from '../../domain/company';
import { Company, RegionId, Region, Commodity, CompositeBenchmarkIndices, IndexMetric } from '../../types';
import { generate52WeekHistory } from './utils';
type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D'; // Add this locally

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

    techIndex: makeIndexMetric('Global Tech Composite', 'TECH', 1000, prevIndices?.techIndex),
    financialsIndex: makeIndexMetric('Global Financials Composite', 'FIN', 1000, prevIndices?.financialsIndex),
    energyIndex: makeIndexMetric('Global Energy Composite', 'NRG', 1000, prevIndices?.energyIndex),
    industrialsIndex: makeIndexMetric('Global Industrials Composite', 'IND', 1000, prevIndices?.industrialsIndex),
    globalCreditComposite: makeIndexMetric('Global Credit Index', 'GCI', 100, prevIndices?.globalCreditComposite),
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

