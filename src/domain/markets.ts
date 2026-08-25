/**
 * Market Indices & UI Tab Keys Domain Model
 *
 * Models composite equity indices, credit OAS spread benchmarks, commodity baskets, and main UI tab keys.
 * Written and updated by index calculation stages.
 */

export type TabKey = 'macro' | 'indices' | 'equities' | 'commodities' | 'bonds_cds' | 'derivatives' | 'risk';

export interface IndexMetric {
  name: string;
  symbol: string;
  value: number;
  change1W: number;
  historical: number[];
  unit: string;
}

export interface CompositeBenchmarkIndices {
  us500: IndexMetric;
  usIgOas: IndexMetric;
  usHyOas: IndexMetric;
  
  euStoxx: IndexMetric;
  euIgOas: IndexMetric;
  euHyOas: IndexMetric;
  
  uk100: IndexMetric;
  ukIgOas: IndexMetric;
  ukHyOas: IndexMetric;
  
  jp225: IndexMetric;
  jpIgOas: IndexMetric;
  jpHyOas: IndexMetric;
  
  global10YBenchmark: IndexMetric;
  gsciCommodity: IndexMetric;
  
  techIndex: IndexMetric;
  financialsIndex: IndexMetric;
  energyIndex: IndexMetric;
  industrialsIndex: IndexMetric;
  
  globalCreditComposite: IndexMetric;
  marketBreadth: number;
  pmiComposite: {
    headline: number;
    demandComponent: number;
    capexComponent: number;
    employmentComponent: number;
  };
}
