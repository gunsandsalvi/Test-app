/**
 * Commodities & FX Primitives
 *
 * Step 5 of the generative bootstrap pipeline. NAT1: a commodity's seed spot is its marginal
 * producer's own COST — extraction cost per tonne divided by the saleable units a tonne yields —
 * and where it actually trades is stage 07's answer from week one. FX is derived from relative
 * productivity-per-capita rather than a quoted rate.
 *
 * The rule-4 violation this header used to deny, and NAT1 closed, is recorded in full on
 * `GENERATED_COMMODITIES` below: the old `PRODUCTION_COST_UNIT x categoryCostFactor x
 * scarcityIndex` multiplied out to eight recognisable real market prices, with `scarcityIndex`
 * back-solved out of the other two factors to produce them.
 */

import { RegionId } from '../../types';
import { getRegionProductivityPerCapitaUSD } from './population';

export type GeneratedCommodityCategory = 'Energy' | 'Metals' | 'Agriculture';

export interface GeneratedCommodityDef {
  id: string;
  name: string;
  category: GeneratedCommodityCategory;
  unit: string;
  /**
   * NAT1 — what it costs to win one TONNE of the raw material: to dig, pump or harvest it and
   * make it saleable, in generic currency units. A technology primitive (rule 4 permits one);
   * it says nothing about what the stuff sells for.
   */
  extractionCostPerTonne: number;
  /**
   * NAT1 — how many PRICED UNITS come out of a tonne of what was won: ore grade for a metal,
   * barrels per tonne for a crude, mmbtu per tonne for gas, bushels per tonne for a crop. A
   * physical fact about the resource, which is what rule 4 means by a primitive.
   */
  unitsPerTonne: number;
  convenienceYield: number;
  volatility: number;
}

/**
 * NAT1 — THE SEED NO LONGER IMPORTS PRICES, AND THIS IS WHAT IT USED TO DO.
 *
 * The old primitives were `PRODUCTION_COST_UNIT x CATEGORY_COST_FACTOR x scarcityIndex`, and the
 * review showed what they multiplied out to: crude $76.00/bbl, gas $3.00/mmbtu, gold $2,730/oz,
 * silver $32.20/oz, copper $4.48/lb, wheat $6.00/bu, corn $4.32/bu, soybeans $10.50/bu — every
 * one of them the observed market price, with `scarcityIndex` back-solved out of the other two
 * factors to produce it. That is rule 4 exactly: a real-world OUTCOME imported as an input. And
 * the import was not even faithful — heavy crude seeded ABOVE light, where real heavy grades
 * trade at a discount, because nothing physical was constraining the numbers.
 *
 * What replaces them is what the file always claimed to have: **extraction cost per tonne, and
 * how many saleable units a tonne yields.** The cost per unit is their quotient, and the SEED
 * PRICE IS THAT COST — the level below which the marginal producer will not sell. Where the
 * market actually trades is stage 07's answer from week one, not this file's.
 *
 * The prices this produces are NOT the observed ones and are not meant to be. Heavy crude now
 * seeds BELOW light for the physical reason it does in reality: a tonne of it yields fewer
 * barrels. That reversal is the test that the primitives are doing the work.
 */
export const GENERATED_COMMODITIES: GeneratedCommodityDef[] = [
  // A tonne of light crude yields ~7.3 barrels; heavier grades are denser, so a tonne of them is
  // fewer barrels — and they sit shallower and cost less to lift.
  { id: 'CRUDE_OIL', name: 'Crude Oil', category: 'Energy', unit: '$/bbl', extractionCostPerTonne: 220, unitsPerTonne: 7.33, convenienceYield: 0.032, volatility: 0.30 },
  { id: 'HEAVY_CRUDE_OIL', name: 'Heavy Crude Oil', category: 'Energy', unit: '$/bbl', extractionCostPerTonne: 170, unitsPerTonne: 6.50, convenienceYield: 0.035, volatility: 0.28 },
  // A tonne of gas carries ~48 mmbtu of energy.
  { id: 'NATURAL_GAS', name: 'Natural Gas', category: 'Energy', unit: '$/mmbtu', extractionCostPerTonne: 100, unitsPerTonne: 48, convenienceYield: 0.060, volatility: 0.45 },
  // Ore grades: ~1 g of gold and ~60 g of silver per tonne of rock, ~0.6% copper.
  { id: 'GOLD', name: 'Gold', category: 'Metals', unit: '$/oz', extractionCostPerTonne: 60, unitsPerTonne: 0.032, convenienceYield: 0.005, volatility: 0.16 },
  { id: 'SILVER', name: 'Silver', category: 'Metals', unit: '$/oz', extractionCostPerTonne: 60, unitsPerTonne: 1.93, convenienceYield: 0.010, volatility: 0.26 },
  { id: 'COPPER', name: 'Copper', category: 'Metals', unit: '$/lb', extractionCostPerTonne: 60, unitsPerTonne: 13.2, convenienceYield: 0.020, volatility: 0.22 },
  // Bushels per tonne are the crops' own physical conversions.
  { id: 'WHEAT', name: 'Wheat', category: 'Agriculture', unit: '$/bu', extractionCostPerTonne: 180, unitsPerTonne: 36.74, convenienceYield: 0.040, volatility: 0.28 },
  { id: 'CORN', name: 'Corn', category: 'Agriculture', unit: '$/bu', extractionCostPerTonne: 150, unitsPerTonne: 39.37, convenienceYield: 0.035, volatility: 0.25 },
  { id: 'SOYBEANS', name: 'Soybeans', category: 'Agriculture', unit: '$/bu', extractionCostPerTonne: 330, unitsPerTonne: 36.74, convenienceYield: 0.030, volatility: 0.24 },
];

/** The marginal producer's cost per saleable unit — the floor it will not sell below, and the
 *  seed level. Where the market trades is stage 07's answer, from week one. */
export function getCommodityBaseSpotPrice(def: GeneratedCommodityDef): number {
  return Number((def.extractionCostPerTonne / Math.max(1e-9, def.unitsPerTonne)).toFixed(2));
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
