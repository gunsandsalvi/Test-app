/**
 * Labor & Wages Primitives
 *
 * Step 2 of the generative bootstrap pipeline. Consumes population.ts's per-region
 * productivity level and derives an occupation-level wage table from it, replacing the
 * previously hardcoded flat BASE_ANNUAL_WAGE_USD constant table. Household income is the
 * sum of wage income across occupation pools (computed by callers from the returned table).
 */

import { RegionId, OccupationType } from '../../types';
import { getRegionProductivityPerCapitaUSD } from './population';

// Structural skill tier per occupation (1 = least specialized). The ordering is a modeling
// choice about which occupations command a wage premium, not a copied wage survey.
const OCCUPATION_SKILL_TIER: Record<OccupationType, number> = {
  GENERAL: 1,
  SKILLED_TRADES: 2,
  MANAGERIAL_FINANCIAL: 3,
  TECHNICAL_ENGINEERING: 4,
  SPECIALIZED_PROFESSIONAL: 5,
};

// Each skill tier pays a fixed proportional step over the tier below it (a structural
// coefficient, analogous to the sector/occupation mix ratios already used elsewhere).
const SKILL_TIER_WAGE_STEP = 1.35;

// GENERAL-tier annual wage as a share of the region's output-per-worker.
const GENERAL_WAGE_SHARE_OF_PRODUCTIVITY = 0.62;

/**
 * Per-region occupation wage table, derived from productivity instead of a flat constant.
 */
export function getBaseAnnualWageUSD(regionId: RegionId): Record<OccupationType, number> {
  const productivity = getRegionProductivityPerCapitaUSD(regionId);
  const generalWage = productivity * GENERAL_WAGE_SHARE_OF_PRODUCTIVITY;
  const result = {} as Record<OccupationType, number>;
  (Object.keys(OCCUPATION_SKILL_TIER) as OccupationType[]).forEach((occ) => {
    const tier = OCCUPATION_SKILL_TIER[occ];
    result[occ] = Number((generalWage * Math.pow(SKILL_TIER_WAGE_STEP, tier - 1)).toFixed(0));
  });
  return result;
}
