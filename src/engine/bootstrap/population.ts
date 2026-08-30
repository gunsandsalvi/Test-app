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

/**
 * DEM — MORTALITY RISES EXPONENTIALLY WITH AGE (Gompertz), which is the one demographic fact a
 * real age structure needs and the model did not have.
 *
 * Two BIOLOGICAL primitives (rule 19's technology category): the hazard at age zero and how fast
 * it doubles. Everything demographic then falls out of them and the birth rate — life expectancy,
 * how long retirement lasts, how long a working life runs — instead of being stated separately
 * and inconsistently.
 *
 * **What this replaces was not an age structure at all.** `lifeCycleDistribution` was four shares
 * walked by drift constants (`retirementDrift = 0.0003`) and renormalised, and `deathRateAnnual`
 * was a linear proxy off the retired share. Together they implied a **33-year retirement and a
 * 133-year working life** (§7.169), which is why the savings life-cycle could not be derived from
 * them: `r/d` is not a lifespan when `d` is a fitted proxy.
 */
export const GOMPERTZ_HAZARD_AT_BIRTH_ANNUAL = 0.00012;
export const GOMPERTZ_DOUBLING_YEARS = 8.5;

/** DEM — the annual probability of dying at a given age. */
export function mortalityHazardAnnual(ageYears: number): number {
  const b = Math.LN2 / GOMPERTZ_DOUBLING_YEARS;
  return Math.min(1, GOMPERTZ_HAZARD_AT_BIRTH_ANNUAL * Math.exp(b * Math.max(0, ageYears)));
}

/**
 * DEM — REMAINING LIFE EXPECTANCY AT AN AGE, from the hazard alone.
 *
 * The one demographic number a pension needs and the model could not previously say: how long a
 * retiree has left to draw. `PENSION_BENEFIT_RATE_ANNUAL = 0.05` stated it as a flat 5% drawdown
 * — a twenty-year retirement asserted rather than derived, and unable to change when the
 * population ages. A fund pays out its entitlement over the years its members actually have.
 */
export function remainingLifeExpectancyYears(ageYears: number): number {
  let survive = 1;
  let years = 0;
  for (let a = Math.max(0, Math.floor(ageYears)); a < MAX_AGE_YEARS; a++) {
    survive *= Math.max(0, 1 - mortalityHazardAnnual(a));
    years += survive;
  }
  return Math.max(1, years);
}

/** DEM — the oldest age the structure carries. Nobody survives the hazard past it. */
export const MAX_AGE_YEARS = 100;

/**
 * DEM — the age at which people stop working, in this model.
 *
 * A POLICY primitive (rule 19's third category): a retirement age is legislated, not derived.
 * It is the ONE number that turns the age structure into a working/retired split, replacing four
 * drifting stage shares and their drift constants.
 */
export const RETIREMENT_AGE_YEARS = 65;
/** DEM — when people enter the workforce. Policy, same as above (school-leaving age). */
export const WORKFORCE_ENTRY_AGE_YEARS = 22;

/**
 * DEM — the stationary age distribution implied by the hazard and a given birth rate: what a
 * population that has been born and dying at these rates forever looks like. The seed's opening
 * age structure, and an OUTCOME of the two primitives rather than four stated shares (§7.4).
 */
export function stationaryAgeDistribution(birthRateAnnual: number): number[] {
  const survive: number[] = [];
  let s = 1;
  for (let a = 0; a < MAX_AGE_YEARS; a++) {
    survive.push(s);
    s *= Math.max(0, 1 - mortalityHazardAnnual(a));
  }
  const growth = Math.max(0, birthRateAnnual);
  // Weight each age by survival AND by how many were born that many years ago: a growing
  // population has proportionally more young people, which is the demographic transition arriving
  // as arithmetic rather than as a table.
  const raw = survive.map((sv, a) => sv * Math.pow(1 + growth, -a));
  const total = raw.reduce((x, y) => x + y, 0) || 1;
  return raw.map((x) => x / total);
}
