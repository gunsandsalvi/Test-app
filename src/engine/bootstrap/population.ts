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
