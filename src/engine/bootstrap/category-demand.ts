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

// Physical units of a typical sub-unit good consumed per person per week, and per firm per
// week — structural intensity constants (analogous to the existing buyerMix / demand-intensity
// coefficient tables), not observed prices.
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
