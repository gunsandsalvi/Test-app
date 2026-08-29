/**
 * Yield Curve & Policy Rate Primitives
 *
 * Step 6 of the generative bootstrap pipeline. The neutral rate is generated productivity
 * growth (a catch-up/convergence model against the productivity primitive from population.ts)
 * plus a chosen inflation-target primitive. Policy rate and Nelson-Siegel curve parameters are
 * derived from the neutral rate rather than quoted per-region.
 */

import { RegionId } from '../../types';
import { NelsonSiegelParams } from '../nelsonSiegel';
import { PRODUCTIVITY_UNIT_USD, getRegionProductivityPerCapitaUSD } from './population';

/** Chosen structural inflation-target primitive, shared by all regions. */
export const INFLATION_TARGET = 0.02;

// Trend growth for a region sitting exactly at the reference productivity level, and a
// catch-up (convergence) exponent: regions below the reference level grow faster, a
// standard structural growth-convergence assumption rather than an observed growth rate.
const BASE_TREND_GROWTH = 0.018;
const CONVERGENCE_EXPONENT = 0.6;

// The opening curve's slope and hump. SEED ONLY — 07c reprices every point from week 1 off real
// cleared demand, and this exists so week 1 has an anchor to move from. Watch it against §7.4:
// the honest seed is the shape that auction would itself clear, not a chosen slope.
const TERM_PREMIUM_SLOPE = -0.004;
const TERM_PREMIUM_CURVATURE = 0.006;
const CURVE_DECAY_LAMBDA = 2.0;

export function getRegionProductivityGrowth(regionId: RegionId): number {
  const productivity = getRegionProductivityPerCapitaUSD(regionId);
  const catchUpFactor = Math.pow(PRODUCTIVITY_UNIT_USD / productivity, CONVERGENCE_EXPONENT);
  return Number((BASE_TREND_GROWTH * catchUpFactor).toFixed(4));
}

export function getRegionNeutralRate(regionId: RegionId): number {
  return Number((getRegionProductivityGrowth(regionId) + INFLATION_TARGET).toFixed(4));
}

export function getRegionYieldCurveParams(regionId: RegionId): NelsonSiegelParams {
  return {
    beta0: getRegionNeutralRate(regionId),
    beta1: TERM_PREMIUM_SLOPE,
    beta2: TERM_PREMIUM_CURVATURE,
    lambda: CURVE_DECAY_LAMBDA,
  };
}

export function getRegionInitialPolicyRate(regionId: RegionId): number {
  return getRegionNeutralRate(regionId);
}
