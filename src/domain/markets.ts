/**
 * The published index set and the UI's tab keys.
 *
 * RULE 4, OPEN: the field names below (`us500`, `euStoxx`, `uk100`, `jp225`, `gsciCommodity`) are
 * real-world index brands in the type itself, not only in the labels `macro/indices.ts` prints.
 * IDX renames both halves together.
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
