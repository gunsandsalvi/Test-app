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
 * COH4 — HOW MUCH OF ITS WIDER BUDGET A HOUSEHOLD WILL PUT ON ONE CATEGORY.
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
 * (`householdDemandLadder`), and what is left to state is how much MONEY it can put behind one —
 * for which the budget answers on its own. A household can move discretionary spending onto a line
 * it cannot defer and cannot move anything onto one it can, so the money reachable by a tier is
 * the share of the budget committed at or below it, and a category's own share of that is what it
 * already spends. Both shares are measured, weekly, by the cohorts
 * (`householdState.stapleSpendShare` and the two beside it).
 *
 * **This is a multiple of the BUDGET and never of a price** (rule 9, and §7.209 paid for the
 * distinction). Bounding the bid at `last week's price x this` looks equivalent and is not: the
 * reference moves with the price the bid itself sets, so the ceiling climbs at whatever rate it
 * just caused and there is nothing in the loop to stop it. A budget is a level in money. When a
 * price doubles against it, the quantity the household can buy halves — which is the only thing
 * that makes a demand curve slope down at all.
 */
export function householdBudgetReachMultiple(
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
  // Summed over a tier's categories this comes to exactly the reachable money and no more: each
  // one claims its own share of the tier's headroom, not the whole of it.
  return Math.max(1, reachable / own);
}

/**
 * How many rungs the ladder is cut into. A RESOLUTION parameter (rule 19): more rungs approximate
 * the same curve more finely and the answer must not depend on it. It does not — the rungs are cut
 * on the QUANTITY axis, so what a given clearing price fills is the curve's own value there.
 */
export const HOUSEHOLD_DEMAND_LADDER_RUNGS = 6;

/**
 * The household's demand for one good as a real SCHEDULE: what it would buy at each of a ladder
 * of prices, as increments the auction can fill independently.
 *
 * Two real bounds and no elasticity anywhere. **Above**, the physical want — a household does not
 * buy a second dinner because dinner got cheaper, so the quantity saturates at what the registry
 * says it consumes. **Below**, the money — `units = budget / price`, which is what "spending is
 * what a household can afford" means, and which is the whole of the downward slope: there is no
 * price ceiling in here at all, because a budget already is one.
 *
 * Returned lowest price first. Each rung's quantity is the INCREMENT over the rung above it, so a
 * clearing price `p` fills exactly the rungs at or above it and the total demanded is the curve's
 * own value at `p`.
 */
export function householdDemandLadder(args: {
  weeklyBudgetUSD: number;
  budgetReachMultiple: number;
  referencePriceUSD: number;
  satiationUnits: number;
  rungs?: number;
}): { units: number; maxPriceUSD: number }[] {
  const { weeklyBudgetUSD, referencePriceUSD, satiationUnits } = args;
  const rungs = Math.max(1, args.rungs ?? HOUSEHOLD_DEMAND_LADDER_RUNGS);
  if (!(weeklyBudgetUSD > 0)) return [];
  // The money this line can actually command: its own budget, plus the share of the wider budget
  // its tier can be defended with. This is the ONLY bound on what the household will pay.
  const reachableUSD = weeklyBudgetUSD * Math.max(1, args.budgetReachMultiple);
  // The most it could ever want: what it physically consumes, or — with no registry intensity for
  // this good — what that money buys at the going price.
  const maxUnits = satiationUnits > 0 ? satiationUnits
    : (referencePriceUSD > 0 ? reachableUSD / referencePriceUSD : 0);
  if (!(maxUnits > 0)) return [];

  // The rungs are equal QUANTITY steps, each priced at the level where that step is the marginal
  // one — `price = money / quantity`, the curve read the other way round. Cutting the ladder on
  // the quantity axis makes the staircase exact at every step rather than conservative between
  // two prices, so what the household gets at a given clearing price does not depend on where the
  // rungs happened to fall (probed at 3, 6 and 24 rungs: the same quantity to the cent).
  // The reservation for the WHOLE want: all the money this line can command, against all of it.
  // A household cannot bid past this and there is nothing arbitrary in it — both halves are
  // measured. It is also what stops the rung count from deciding the answer: an untruncated
  // `money / quantity` curve is unbounded as the quantity goes to zero, so the highest price the
  // ladder POSTS would be `rungs x the going price`, and in a market whose supply is short the top
  // of the demand curve IS the clearing price. A resolution parameter must not move the answer
  // (rule 19), and that one moved it linearly.
  const reservationUSD = reachableUSD / maxUnits;
  const step = maxUnits / rungs;
  const out: { units: number; maxPriceUSD: number }[] = [];
  for (let i = 1; i <= rungs; i++) {
    out.push({ units: step, maxPriceUSD: Math.min(reservationUSD, reachableUSD / (step * i)) });
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
