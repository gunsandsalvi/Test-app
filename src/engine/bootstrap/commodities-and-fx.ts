/**
 * Commodities & FX Primitives
 *
 * Step 5 of the generative bootstrap pipeline. Commodity spot prices are derived from a
 * cost-of-production primitive against a per-commodity scarcity index (a structural
 * resource-endowment proxy) — real, understandable commodity-category names/ids (Crude Oil,
 * Copper, Wheat, ...) so a company's productLines/input recipe can name what it actually
 * produces or consumes, but the price series itself stays entirely synthetic: no real-world
 * observed prices, benchmarks, or exchange tickers are used. FX rates are derived from relative
 * purchasing power (productivity-per-capita) across the four generated economies rather than
 * quoted market rates.
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

// Generic-category real commodity names (Crude Oil, Copper, Wheat, etc.) rather than invented
// tickers — these describe the actual physical resource a company's productLines/industry
// input recipe (CATEGORY_INPUT_REQUIREMENTS) draws on, without tying to any specific real-world
// benchmark, exchange, or observed price series (spot/futures prices here are still entirely
// synthetic — see PRODUCTION_COST_UNIT below).
export const GENERATED_COMMODITIES: GeneratedCommodityDef[] = [
  { id: 'CRUDE_OIL', name: 'Crude Oil', category: 'Energy', unit: '$/bbl', scarcityIndex: 1.9, convenienceYield: 0.032, volatility: 0.30 },
  { id: 'HEAVY_CRUDE_OIL', name: 'Heavy Crude Oil', category: 'Energy', unit: '$/bbl', scarcityIndex: 2.0, convenienceYield: 0.035, volatility: 0.28 },
  { id: 'NATURAL_GAS', name: 'Natural Gas', category: 'Energy', unit: '$/mmbtu', scarcityIndex: 0.075, convenienceYield: 0.060, volatility: 0.45 },
  { id: 'GOLD', name: 'Gold', category: 'Metals', unit: '$/oz', scarcityIndex: 19.5, convenienceYield: 0.005, volatility: 0.16 },
  { id: 'SILVER', name: 'Silver', category: 'Metals', unit: '$/oz', scarcityIndex: 0.23, convenienceYield: 0.010, volatility: 0.26 },
  { id: 'COPPER', name: 'Copper', category: 'Metals', unit: '$/lb', scarcityIndex: 0.032, convenienceYield: 0.020, volatility: 0.22 },
  { id: 'WHEAT', name: 'Wheat', category: 'Agriculture', unit: '$/bu', scarcityIndex: 1.0, convenienceYield: 0.040, volatility: 0.28 },
  { id: 'CORN', name: 'Corn', category: 'Agriculture', unit: '$/bu', scarcityIndex: 0.72, convenienceYield: 0.035, volatility: 0.25 },
  { id: 'SOYBEANS', name: 'Soybeans', category: 'Agriculture', unit: '$/bu', scarcityIndex: 1.75, convenienceYield: 0.030, volatility: 0.24 },
];

export function getCommodityBaseSpotPrice(def: GeneratedCommodityDef): number {
  return Number((PRODUCTION_COST_UNIT * CATEGORY_COST_FACTOR[def.category] * def.scarcityIndex).toFixed(2));
}

/**
 * EVERY pair of currencies, because XB6 clears each one directly.
 *
 * Four of these existed before and two did not, which was fine only while every rate was derived
 * from a currency's value against the USD: a pair with no book still had a number, because the
 * number came from triangulation rather than from anybody trading it. Once pairs clear on their
 * own flow, a missing book is a bilateral flow with nowhere to go — so all six exist.
 */
export const GENERATED_FX_PAIR_LEGS: { base: RegionId; quote: RegionId }[] = [
  { base: 'EUR', quote: 'USA' },
  { base: 'UK', quote: 'USA' },
  { base: 'USA', quote: 'JPN' },
  { base: 'EUR', quote: 'UK' },
  { base: 'EUR', quote: 'JPN' },
  { base: 'UK', quote: 'JPN' },
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
