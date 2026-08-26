/**
 * Commodities & FX Primitives
 *
 * Step 5 of the generative bootstrap pipeline. Commodity spot prices are derived from a
 * cost-of-production primitive against a per-commodity scarcity index (a structural
 * resource-endowment proxy), and use generic, non-real-ticker names/ids. FX rates are
 * derived from relative purchasing power (productivity-per-capita) across the four
 * generated economies rather than quoted market rates.
 */

import { RegionId } from '../../types';
import { getRegionProductivityPerCapitaUSD } from './population';

export type GeneratedCommodityCategory = 'Energy' | 'Metals' | 'Agriculture';

export interface GeneratedCommodityDef {
  id: string;
  name: string;
  category: GeneratedCommodityCategory;
  unit: string;
  scarcityIndex: number; // higher = scarcer = more expensive relative to the cost-of-production unit
  convenienceYield: number;
  volatility: number;
}

/** Reference cost-of-production primitive (generic currency units, not tied to any real market). */
export const PRODUCTION_COST_UNIT = 40;

// Per-category cost multiplier against the production-cost unit (structural coefficient
// reflecting relative extraction/processing complexity, not an observed price level).
const CATEGORY_COST_FACTOR: Record<GeneratedCommodityCategory, number> = {
  Energy: 1.0,
  Metals: 3.5,
  Agriculture: 0.15,
};

export const GENERATED_COMMODITIES: GeneratedCommodityDef[] = [
  { id: 'ENERGY_ALPHA', name: 'Energy Alpha Crude Stream', category: 'Energy', unit: '$/bbl', scarcityIndex: 1.9, convenienceYield: 0.032, volatility: 0.30 },
  { id: 'ENERGY_BETA', name: 'Energy Beta Crude Stream', category: 'Energy', unit: '$/bbl', scarcityIndex: 2.0, convenienceYield: 0.035, volatility: 0.28 },
  { id: 'ENERGY_GAMMA', name: 'Energy Gamma Gas Index', category: 'Energy', unit: '$/mmbtu', scarcityIndex: 0.075, convenienceYield: 0.060, volatility: 0.45 },
  { id: 'METAL_ALPHA', name: 'Metal Alpha Bullion', category: 'Metals', unit: '$/oz', scarcityIndex: 19.5, convenienceYield: 0.005, volatility: 0.16 },
  { id: 'METAL_BETA', name: 'Metal Beta Bullion', category: 'Metals', unit: '$/oz', scarcityIndex: 0.23, convenienceYield: 0.010, volatility: 0.26 },
  { id: 'METAL_GAMMA', name: 'Metal Gamma Ore Grade', category: 'Metals', unit: '$/lb', scarcityIndex: 0.032, convenienceYield: 0.020, volatility: 0.22 },
  { id: 'AGRI_ALPHA', name: 'Agri Alpha Grain', category: 'Agriculture', unit: '$/bu', scarcityIndex: 1.0, convenienceYield: 0.040, volatility: 0.28 },
  { id: 'AGRI_BETA', name: 'Agri Beta Grain', category: 'Agriculture', unit: '$/bu', scarcityIndex: 0.72, convenienceYield: 0.035, volatility: 0.25 },
  { id: 'AGRI_GAMMA', name: 'Agri Gamma Grain', category: 'Agriculture', unit: '$/bu', scarcityIndex: 1.75, convenienceYield: 0.030, volatility: 0.24 },
];

export function getCommodityBaseSpotPrice(def: GeneratedCommodityDef): number {
  return Number((PRODUCTION_COST_UNIT * CATEGORY_COST_FACTOR[def.category] * def.scarcityIndex).toFixed(2));
}

// Structural region ordering used to assign each of the four FX pairs a (base, quote) leg,
// mirroring the original pair count without hand-picking specific quoted rates.
export const GENERATED_FX_PAIR_LEGS: { base: RegionId; quote: RegionId }[] = [
  { base: 'EUR', quote: 'USA' },
  { base: 'UK', quote: 'USA' },
  { base: 'USA', quote: 'JPN' },
  { base: 'EUR', quote: 'UK' },
];

/**
 * Relative purchasing-power proxy: units of quote currency per 1 base currency, derived from
 * each region's generated productivity-per-capita (a stand-in price-level primitive) rather
 * than an observed spot rate.
 */
export function getInitialFxRate(base: RegionId, quote: RegionId): number {
  const baseLevel = getRegionProductivityPerCapitaUSD(base);
  const quoteLevel = getRegionProductivityPerCapitaUSD(quote);
  return Number((quoteLevel / baseLevel).toFixed(4));
}
