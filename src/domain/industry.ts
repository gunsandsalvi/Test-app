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
 * The household bid's willingness-to-pay premium over the current price, per tier: a household
 * pays up for fuel when supply tightens and walks away from luxury at the same move.
 *
 * RULE 13, OPEN: both numbers are invented. `tanh(0.05) x 0.15` is a frozen constant wearing
 * arithmetic, and 2.5/1.0/0.35 are chosen elasticities. A household's willingness to pay is an
 * outcome of its budget and what share of it the good takes — which the cohorts now carry. Owner: COH.
 */
export const HOUSEHOLD_BID_BASE_PREMIUM = Math.tanh(0.05) * 0.15;
export const HOUSEHOLD_BID_PREMIUM_BY_TIER: Record<HouseholdPriceTier, number> = {
  STAPLE: 2.5, STANDARD: 1.0, LUXURY: 0.35,
};

export interface IndustrySubUnit {
  unitId: string;
  label: string;
  buyerMix: Record<BuyerType, number>;
}

// BP1a: derived from the industry registry.
export const INDUSTRY_SUBUNITS: Record<Industry, IndustrySubUnit[]> = VIEW_INDUSTRY_SUBUNITS;


