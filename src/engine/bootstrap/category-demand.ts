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
import { subUnitSpecOf } from '../../domain/industry-registry';

/**
 * IND-R3 — the per-good intensities now live on the registry entry beside the physics
 * (`SubUnitSpec.householdUnitsPerCapitaAnnual` / `corporateUnitsPerFirmAnnual`), which is where
 * this comment always said they belonged. What stood here was ONE number for every good, so a
 * household consumed as many units of aerospace as of food, every baseline price landed at the
 * same order of magnitude, and a "unit" was an abstract bundle rather than a thing.
 *
 * These are the fallbacks for a sub-unit that declares neither, kept so the function is total.
 */
const FALLBACK_HOUSEHOLD_UNITS_PER_CAPITA_ANNUAL = 0.02;
const FALLBACK_CORPORATE_UNITS_PER_FIRM_ANNUAL = 1.5;

/** Rough interim firm-count estimate used only before real companies exist (see firms.ts). */
export const TARGET_FIRMS_PER_REGION = 200;

/**
 * CHAIN-E/§7.127 — pass FINAL demand here, never total output.
 *
 * The volume below counts FINAL buyers only: people and firms as end users. Once CHAIN-E made
 * `demandLevelUSD` the total output X (final plus what other producers consume), feeding X to a
 * final-buyer volume turned every dollar of intermediate demand into PRICE instead of quantity —
 * and the more intermediate-heavy the good, the worse. Measured: upstream extraction opened ~3x
 * too dear and the auction then cleared it to **0.02x** of that over twenty weeks, with refined
 * products, chemicals and electricity behind it, while aerospace and defense ran to 14x. That
 * dispersion was read as a deflation.
 *
 * One price serves both: the intermediate buyer pays what the final buyer pays, and its quantity
 * is its dollars at that price.
 */
export function deriveSubUnitUnitPrice(
  finalDemandUSD: number,
  buyerMix: Record<BuyerType, number>,
  population: number,
  firmCount: number,
  unitId?: string,
  intermediateDemandUSD?: number
): number {
  const householdWeight = buyerMix.HOUSEHOLD + buyerMix.GOVERNMENT; // government spending also serves the population
  const corporateWeight = buyerMix.CORPORATE;
  const spec = unitId ? subUnitSpecOf(unitId) : undefined;
  const hhIntensity = spec?.householdUnitsPerCapitaAnnual ?? FALLBACK_HOUSEHOLD_UNITS_PER_CAPITA_ANNUAL;
  const corpIntensity = spec?.corporateUnitsPerFirmAnnual ?? FALLBACK_CORPORATE_UNITS_PER_FIRM_ANNUAL;
  // A PURE INTERMEDIATE has no final buyer to price it: final demand is $0 by construction, so
  // this rule seeded its price at 0 and every reader shipped it weightless (§7.241's guard is
  // what makes that loud). Its buyers are producers, so the same §7.127 construction applies to
  // THEM: the dollars its actual buyers pay over the physical volume those buyers take. This is
  // not the intermediate-demand-as-price trap — the trap was a FINAL-buyer volume under a
  // total-output numerator; here numerator and volume count the same (producer) buyers.
  if (!(finalDemandUSD > 0) && (intermediateDemandUSD ?? 0) > 0) {
    const producerVolumeUnits = Math.max(1, firmCount * corpIntensity * corporateWeight);
    return Number(((intermediateDemandUSD as number) / producerVolumeUnits).toFixed(2));
  }
  const physicalVolumeUnits = Math.max(
    1,
    population * hhIntensity * householdWeight + firmCount * corpIntensity * corporateWeight
  );
  return Number((finalDemandUSD / physicalVolumeUnits).toFixed(2));
}
