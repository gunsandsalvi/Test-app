/**
 * The published index set and the UI's tab keys.
 *
 * RULE 4, OPEN: the field names below (`usaComposite`, `eurComposite`, `ukComposite`, `jpnComposite`, `commodityComposite`) are
 * real-world index brands in the type itself, not only in the labels `macro/indices.ts` prints.
 * IDX renames both halves together.
 */

export interface IndexMetric {
  name: string;
  symbol: string;
  value: number;
  change1W: number;
  historical: number[];
  unit: string;
}

export interface CompositeBenchmarkIndices {
  usaComposite: IndexMetric;
  usIgOas: IndexMetric;
  usHyOas: IndexMetric;
  
  eurComposite: IndexMetric;
  euIgOas: IndexMetric;
  euHyOas: IndexMetric;
  
  ukComposite: IndexMetric;
  ukIgOas: IndexMetric;
  ukHyOas: IndexMetric;
  
  jpnComposite: IndexMetric;
  jpIgOas: IndexMetric;
  jpHyOas: IndexMetric;
  
  global10YBenchmark: IndexMetric;
  commodityComposite: IndexMetric;
  
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
