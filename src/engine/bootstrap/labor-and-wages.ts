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
import { LABOR_SHARE_OF_OUTPUT } from './national-accounts';

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

/**
 * Structural share of the labor force in each occupation at bootstrap. The single owner of this
 * mix: it used to be written out twice, independently, in macro/initialization.ts and
 * macro/evolution.ts. The weekly mix drifts from here as workers retrain
 * (`Region.occupationLaborForceShare`), but this baseline stays fixed — it is what the wage
 * table below is normalized against.
 */
export const BASELINE_OCCUPATION_LABOR_FORCE_SHARE: Record<OccupationType, number> = {
  GENERAL: 0.55,
  SKILLED_TRADES: 0.15,
  TECHNICAL_ENGINEERING: 0.12,
  SPECIALIZED_PROFESSIONAL: 0.08,
  MANAGERIAL_FINANCIAL: 0.10,
};

/**
 * Employment-weighted mean of the raw tier premiums over the baseline occupation mix (~1.4957).
 *
 * The premiums say how occupations are paid RELATIVE to each other; they must not also move the
 * absolute level of the wage bill, or the labor share silently becomes whatever the mix happens
 * to imply. That was the bug: the GENERAL wage was set to 62% of output per worker and every
 * higher tier multiplied up from there, so the aggregate wage bill came to 0.62 * 1.4957 = 93%
 * of output — and with capital income on top, household income reached 106.6% of GDP. Dividing
 * the premiums through by this mean preserves the entire relative wage structure while making
 * the aggregate wage bill exactly LABOR_SHARE_OF_OUTPUT of output at the baseline mix.
 *
 * Normalizing against the BASELINE mix (not the current, drifting one) is deliberate: a real
 * shift of the labor force toward higher-skill occupations genuinely should raise the average
 * wage, and normalizing against the live mix every week would cancel exactly that real effect.
 */
const BASELINE_WEIGHTED_TIER_PREMIUM = (Object.keys(OCCUPATION_SKILL_TIER) as OccupationType[]).reduce(
  (sum, occ) =>
    sum +
    BASELINE_OCCUPATION_LABOR_FORCE_SHARE[occ] * Math.pow(SKILL_TIER_WAGE_STEP, OCCUPATION_SKILL_TIER[occ] - 1),
  0
);

/**
 * Per-region occupation wage table, derived from productivity instead of a flat constant, and
 * scaled so that paying this table across the baseline occupation mix costs exactly
 * LABOR_SHARE_OF_OUTPUT of the region's output.
 */
export function getBaseAnnualWageUSD(regionId: RegionId): Record<OccupationType, number> {
  const productivity = getRegionProductivityPerCapitaUSD(regionId);
  const averageWage = productivity * LABOR_SHARE_OF_OUTPUT;
  const result = {} as Record<OccupationType, number>;
  (Object.keys(OCCUPATION_SKILL_TIER) as OccupationType[]).forEach((occ) => {
    const tier = OCCUPATION_SKILL_TIER[occ];
    const relativePremium = Math.pow(SKILL_TIER_WAGE_STEP, tier - 1) / BASELINE_WEIGHTED_TIER_PREMIUM;
    result[occ] = Number((averageWage * relativePremium).toFixed(0));
  });
  return result;
}

/**
 * HH — what an employer's payroll costs it for one week: its headcount, at the occupations it
 * employs, at the wage those occupations currently clear at.
 *
 * This is the one place a wage bill is computed, and every employer uses it — named firms,
 * SME pools, and the government. It replaces two different derivations that both keyed off
 * `estimatedHouseholdIncomeUSD / employed`: a per-capita income figure standing in for a wage,
 * which made every employer pay the same average, and — once household income became the sum of
 * what employers pay — made the number depend on itself.
 *
 * `wageMultiplier` is the employer's own position in the wage distribution: a firm's
 * `offeredWageIndex`, which moves with its own hiring success, or the SME tier's discount. The
 * per-occupation `wageIndex` is the market's, set in the labor market by what employers offer.
 */
export function weeklyWageBillUSD(
  headcount: number,
  occupationMix: Partial<Record<OccupationType, number>>,
  baseAnnualWageUSD: Record<OccupationType, number>,
  occupationPools: Record<OccupationType, { wageIndex: number }>,
  wageMultiplier = 1
): number {
  if (!(headcount > 0)) return 0;
  const annualPerWorkerUSD = (Object.keys(occupationMix) as OccupationType[]).reduce((sum, occ) => {
    const share = occupationMix[occ] ?? 0;
    if (share <= 0) return sum;
    return sum + share * (baseAnnualWageUSD[occ] ?? 0) * (occupationPools[occ]?.wageIndex ?? 1);
  }, 0);
  return (headcount * annualPerWorkerUSD * wageMultiplier) / 52;
}
