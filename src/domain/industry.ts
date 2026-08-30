/** The industry taxonomy's public types, plus the household price tier and its bid premium.
 *  The DATA all lives in `industry-registry.ts` — these are views onto it (rule 17). */

import { VIEW_CATEGORY_PRICE_TIER, VIEW_INDUSTRY_SUBUNITS } from './industry-registry';

export type NecessityTier = 'Staple' | 'Standard' | 'Luxury';

export type Industry =
  | 'Energy' | 'MaterialsChemicals' | 'IndustrialsMachinery' | 'AerospaceDefense'
  | 'AutomotiveTransport' | 'TechHardwareSemis' | 'SoftwareDigitalServices' | 'Telecommunications'
  | 'HealthcarePharma' | 'ConsumerStaples' | 'ConsumerDiscretionaryRetail' | 'LuxuryGoods'
  | 'MediaEntertainment' | 'RealEstateConstruction'
  | 'PersonalConsumerServices' | 'BusinessSupportServices';

export type ProductCategory = Industry;

export type BuyerType = 'HOUSEHOLD' | 'GOVERNMENT' | 'CORPORATE';

/**
 * HH4b — which price tier a household-facing category sells into. The tier decides two real
 * things: which slice of the household budget funds it (stage 03 allocates C by the cohort-
 * derived spend shares) and how price-sensitive the household bid is (stage 05's premium):
 * staples are the inelastic food-and-energy demand the bottom cohorts carry, luxury the
 * discretionary swing of the top ones. Categories with no household buyer never read this.
 */
export type HouseholdPriceTier = 'STAPLE' | 'STANDARD' | 'LUXURY';
// BP1a: derived from the industry registry — the registry is the single owner (rule 17).
export const CATEGORY_PRICE_TIER: Record<string, HouseholdPriceTier> = VIEW_CATEGORY_PRICE_TIER;
export const categoryPriceTier = (unitId: string): HouseholdPriceTier =>
  CATEGORY_PRICE_TIER[unitId] ?? 'STANDARD';

/**
 * COH4 — HOW FAR UP THE PRICE LADDER A HOUSEHOLD WILL FOLLOW A CATEGORY, from its own budget.
 *
 * What this replaces was `tanh(0.05) x 0.15` (a frozen constant wearing arithmetic) times
 * {2.5, 1.0, 0.35} (chosen elasticities), setting what a household pays above the going price in
 * every consumer category, every week. Two invented numbers in the stage that prices consumption.
 *
 * **The real defect underneath was the SHAPE, not the numbers** (rule 15). A household bid was one
 * step — a quantity at a ceiling — and a step cannot express a demand curve, so any single number
 * put in that ceiling stands in for a whole schedule. That is why the two honest derivations of it
 * differ by two orders of magnitude: one is the reservation for the FIRST unit and the other for
 * the MARGINAL one, and a step has only one slot.
 *
 * So the household posts a SCHEDULE now, like every other participant in this model
 * (`householdDemandLadder`), and the only thing left to state is how far the ladder REACHES — for
 * which the budget answers on its own. A household can move discretionary spending onto a line it
 * cannot defer and cannot move anything onto one it can, so the ceiling on a tier's price is the
 * reciprocal of the share of its budget that is committed at or below that tier. Both shares are
 * measured, weekly, by the cohorts (`householdState.stapleSpendShare` and the two beside it).
 */
export function householdPriceCeilingMultiple(
  tier: HouseholdPriceTier,
  spendShares: Record<HouseholdPriceTier, number>
): number {
  const staple = Math.max(0, spendShares.STAPLE);
  const standard = Math.max(0, spendShares.STANDARD);
  const luxury = Math.max(0, spendShares.LUXURY);
  const total = staple + standard + luxury;
  if (!(total > 0)) return 1;
  // A staple can draw on the whole budget; a standard good on everything that is not luxury; a
  // luxury on nothing but its own slice — a household facing a dearer luxury buys less of it,
  // which is what the ladder below already expresses without any premium at all.
  const reachable = tier === 'STAPLE' ? total
    : tier === 'STANDARD' ? staple + standard
      : luxury;
  const own = tier === 'STAPLE' ? staple : tier === 'STANDARD' ? standard : luxury;
  if (!(own > 0)) return 1;
  return Math.max(1, reachable / own);
}

/**
 * How many rungs the ladder is cut into. A RESOLUTION parameter (rule 19): more rungs approximate
 * the same curve more finely and the answer must not depend on it.
 */
export const HOUSEHOLD_DEMAND_LADDER_RUNGS = 6;

/**
 * The household's demand for one good as a real SCHEDULE: what it would buy at each of a ladder
 * of prices, as increments the auction can fill independently.
 *
 * Two real bounds and no elasticity anywhere. **Below**, the physical want — a household does not
 * buy a second dinner because dinner got cheaper, so the quantity saturates at what the registry
 * says it consumes. **Above**, the budget — `units = budget / price`, which is what "spending is
 * what a household can afford" means, truncated where the ladder stops reaching (above).
 *
 * Returned lowest price first. Each rung's quantity is the INCREMENT over the rung above it, so a
 * clearing price `p` fills exactly the rungs at or above it and the total demanded is the curve's
 * own value at `p`.
 */
export function householdDemandLadder(args: {
  weeklyBudgetUSD: number;
  referencePriceUSD: number;
  ceilingMultiple: number;
  satiationUnits: number;
  rungs?: number;
}): { units: number; maxPriceUSD: number }[] {
  const { weeklyBudgetUSD, referencePriceUSD, ceilingMultiple, satiationUnits } = args;
  const rungs = Math.max(1, args.rungs ?? HOUSEHOLD_DEMAND_LADDER_RUNGS);
  if (!(weeklyBudgetUSD > 0) || !(referencePriceUSD > 0)) return [];
  const top = referencePriceUSD * Math.max(1, ceilingMultiple);
  // The most it could ever want: what it physically consumes, or — with no registry intensity for
  // this good — what its budget buys at the lowest price the ladder reaches.
  const maxUnits = satiationUnits > 0 ? satiationUnits : weeklyBudgetUSD / referencePriceUSD;
  if (!(maxUnits > 0)) return [];

  // The rungs are equal QUANTITY steps, each priced at the level where that step is the marginal
  // one — `price = budget / quantity`, the curve read the other way round. Cutting the ladder on
  // the quantity axis makes the staircase exact at every step rather than conservative between
  // two prices, so what the household gets at a given clearing price does not depend on where
  // the rungs happened to fall.
  const step = maxUnits / rungs;
  const out: { units: number; maxPriceUSD: number }[] = [];
  for (let i = 1; i <= rungs; i++) {
    const quantity = step * i;
    const wantedAt = weeklyBudgetUSD / quantity;
    // A step the budget affords even at the ceiling is bid at the ceiling; the ladder never
    // reaches above what this tier's budget can be redirected to.
    out.push({ units: step, maxPriceUSD: Math.min(top, wantedAt) });
  }
  return out;
}

export interface IndustrySubUnit {
  unitId: string;
  label: string;
  buyerMix: Record<BuyerType, number>;
}

// BP1a: derived from the industry registry.
export const INDUSTRY_SUBUNITS: Record<Industry, IndustrySubUnit[]> = VIEW_INDUSTRY_SUBUNITS;
