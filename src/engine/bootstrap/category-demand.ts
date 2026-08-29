/**
 * Category Demand Pricing Primitives
 *
 * Step 4 of the generative bootstrap pipeline. Keeps the existing C+I+G / buyerMix demand
 * split, but derives each sub-unit's unit price as dollar demand divided by an estimated
 * physical volume (population x per-capita intensity for household/government-weighted
 * goods; firm count x per-firm intensity for corporate-weighted goods), replacing the
 * previous 27-entry literal price table.
 */

import { BuyerType } from '../../types';

/**
 * Physical units of a sub-unit good consumed per person and per firm per week.
 *
 * ONE NUMBER FOR EVERY GOOD, which is why every sub-unit's baseline price lands at the same
 * order of magnitude (~$70k) and a "unit" is an abstract bundle rather than a loaf or a car
 * (see `goods-physical.ts:unitMassTonnes`). Internally consistent, but it means the model has no
 * notion of RELATIVE physical consumption: a household consumes as many units of aerospace as of
 * food. The CPI basket is built on these weights, so the price index inherits it.
 *
 * The registry already carries per-good physics (value density, shelf life, delivery mode); a
 * per-sub-unit consumption intensity belongs beside them. Owner: IND (3) via the registry.
 */
const HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY = 0.02;
const CORPORATE_PER_FIRM_UNIT_INTENSITY = 1.5;

/** Rough interim firm-count estimate used only before real companies exist (see firms.ts). */
export const TARGET_FIRMS_PER_REGION = 200;

export function deriveSubUnitUnitPrice(
  demandLevelUSD: number,
  buyerMix: Record<BuyerType, number>,
  population: number,
  firmCount: number
): number {
  const householdWeight = buyerMix.HOUSEHOLD + buyerMix.GOVERNMENT; // government spending also serves the population
  const corporateWeight = buyerMix.CORPORATE;
  const physicalVolumeUnits = Math.max(
    1,
    population * HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY * householdWeight +
      firmCount * CORPORATE_PER_FIRM_UNIT_INTENSITY * corporateWeight
  );
  return Number((demandLevelUSD / physicalVolumeUnits).toFixed(2));
}
