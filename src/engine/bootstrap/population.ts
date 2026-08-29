/**
 * Population & Productivity Primitives
 *
 * Step 1 of the generative bootstrap pipeline. Every region's population and
 * output-per-worker level is a relative multiple of a single reference unit,
 * driven by small structural rank tables — never an observed national statistic.
 */

import { RegionId } from '../../types';

/** Reference population for structural size-rank 1. A design primitive, not a census figure. */
export const POPULATION_UNIT = 30_000_000;

/** Reference annual output-per-worker for structural productivity-rank 1. */
export const PRODUCTIVITY_UNIT_USD = 58_000;

// Structural size rank (1 = largest). An arbitrary modeling choice fixed for this simulation,
// not derived from any observed population ranking.
const POPULATION_SIZE_RANK: Record<RegionId, number> = { USA: 1, EUR: 2, JPN: 3, UK: 4 };
const POPULATION_ZIPF_EXPONENT = 0.7;

// Structural productivity rank, deliberately using a different order/spread than the population
// rank so "larger" and "more productive" are not forced to coincide.
const PRODUCTIVITY_RANK: Record<RegionId, number> = { USA: 1, UK: 1.8, EUR: 2.6, JPN: 2.2 };
const PRODUCTIVITY_ZIPF_EXPONENT = 0.4;

function zipfMultiple(rank: number, exponent: number): number {
  return 1 / Math.pow(rank, exponent);
}

export function getRegionPopulation(regionId: RegionId): number {
  const raw = POPULATION_UNIT * zipfMultiple(POPULATION_SIZE_RANK[regionId], POPULATION_ZIPF_EXPONENT);
  return Math.round(raw / 100_000) * 100_000;
}

export function getRegionProductivityPerCapitaUSD(regionId: RegionId): number {
  return Number((PRODUCTIVITY_UNIT_USD * zipfMultiple(PRODUCTIVITY_RANK[regionId], PRODUCTIVITY_ZIPF_EXPONENT)).toFixed(0));
}


/**
 * DEM — REGIONS DIFFER IN KIND, and the difference is generated rather than imported.
 *
 * All four opened with the same three constants — birth 1.0%, death 0.95%, migration 0.2% — so
 * populations differed only by their seeded level and every demographic-sensitive number (labour
 * supply, housing turnover, pension outflows) moved in lockstep. Real regions differ in KIND, not
 * scale.
 *
 * But rule 4 forbids the obvious fix. "Japan shrinks and ages, the USA grows by migration" is a
 * real-world OUTCOME, and a table of it would assume the answer. What is a legitimate primitive is
 * the mechanism behind it: **the demographic transition** — fertility falls as income per head
 * rises, one of the most robust regularities there is, and a relationship rather than a country's
 * result. So each region's fertility is derived from the productivity this model already generates
 * for it by Zipf rank, and which region ends up shrinking is an OUTCOME of that draw.
 *
 * Mortality is the other side: it follows the share of the population that is old, which
 * `lifeCycleDistribution` already carries, so an ageing region's death rate rises on its own.
 */
export const FERTILITY_AT_REFERENCE_PRODUCTIVITY = 0.0125;
export const FERTILITY_INCOME_ELASTICITY = -0.35;
export const MORTALITY_PER_RETIRED_SHARE = 0.030;

/** Region productivity relative to the set's mean — the income term the transition reads. */
function relativeProductivity(regionId: RegionId): number {
  const all = (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).map(getRegionProductivityPerCapitaUSD);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  return mean > 0 ? getRegionProductivityPerCapitaUSD(regionId) / mean : 1;
}

export function getRegionBirthRateAnnual(regionId: RegionId): number {
  const rel = Math.max(0.01, relativeProductivity(regionId));
  return Number((FERTILITY_AT_REFERENCE_PRODUCTIVITY * Math.pow(rel, FERTILITY_INCOME_ELASTICITY)).toFixed(5));
}

export function getRegionDeathRateAnnual(retiredShareOfPopulation: number): number {
  return Number((MORTALITY_PER_RETIRED_SHARE * Math.max(0, retiredShareOfPopulation)).toFixed(5));
}
