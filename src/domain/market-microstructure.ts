/**
 * Market Microstructure Domain Model
 *
 * Models sub-unit bids, offers, supply contracts, category demand states, input-output requirement matrices,
 * and inter-company supply relationships. Owned and updated by category demand, input-output, and unit bidding simulation stages.
 */

import { RegionId } from './geography';
import { VIEW_CATEGORY_INPUT_REQUIREMENTS, VIEW_CAPEX_SUPPLIER_WEIGHTS } from './industry-registry';

export interface UnitBid {
  companyId?: string;
  isHouseholdAggregate?: boolean;
  isGovernmentAggregate?: boolean;
  /** XB3a: which region this bid comes FROM. A global book mixes all four, and the settlement
   *  side has to know whose household bought, whose treasury was debited, and — for the trade
   *  accounting — which side of a border each fill crossed. */
  regionId: RegionId;
  quantityUnits: number;
  maxPriceUSD: number;
}

export interface UnitOffer {
  companyId: string;
  /** XB3a: which region this supply comes FROM. See UnitBid.regionId. */
  regionId: RegionId;
  quantityUnits: number;
  minPriceUSD: number;
}

export interface SupplyContract {
  supplierCompanyId: string;
  customerCompanyId: string;
  subUnitId: string;
  priceUSD: number;
  quantityUnitsPerWeek: number;
  weeksRemaining: number;
}

export interface CategoryDemandState {
  demandLevelUSD: number;
  demandGrowthAnnual: number;
  demandHistory: number[];
  crowdingIntensity: number;
  inventoryLevelUSD: number;
  inputCostPressure: number;
  /** This category's unit price at initialization — the FIXED baseline clearedInputPriceIndex is
   *  measured against. Stored once and never rewritten (S8). */
  baseUnitPriceUSD?: number;
  clearedInputPriceIndex: number; // 1.0 = baseline; this category's own real auction clearing price vs its baseline unit price — set unconditionally every week by 05-unit-bidding.ts for every category
  // 04-input-output.ts's OWN smoothed upstream scarcity/glut index for its input-category
  // categories (upstream_extraction, specialty_metals) — kept separate from
  // clearedInputPriceIndex above (used to collide: 05-unit-bidding.ts overwrote the very same
  // field with an unrelated same-week auction price ratio for every category, corrupting
  // stage04's own smoothed self-reference the following week).
  upstreamScarcityIndex?: number;
  lastWeekInventoryLevelUSD: number; // explicit lag anchor — bidders always react to this, never same-week inventory
  /**
   * What this good actually cost in this region this week: the volume-weighted average of every
   * price its buyers paid, across the local book AND their fills in the world book (XB3a). It is
   * the number every consumer of a regional price wants — the CPI basket, revenue, input costs —
   * and it is a MEASUREMENT of transactions, never an input to one. The two books each price
   * against their own anchor below.
   */
  unitPriceUSD?: number;
  /** The local book's own last cleared price — its anchor next week (XB3a). */
  localUnitPriceUSD?: number;
  smoothedUnitPriceUSD?: number; // Slow-moving average of the LOCAL book's cleared price, which its suppliers set production against (see 05-unit-bidding.ts) — damps the cobweb-cycle instability of reacting to the raw last-cleared price
  // This category's real corporate-only demand share this week (see 03-category-demand.ts) —
  // stage05-unit-bidding.ts distributes this as real named corporate bids across every
  // potential buyer company, weighted by revenue share, instead of a hand-picked per-category
  // intensity constant that only covered a handful of categories.
  corporateDemandUSD?: number;
  _fulfillmentRatio?: number; // transient, read by AA3 same week, not persisted
  totalUnitsSuppliedThisWeek?: number;
  totalUnitsDemandedThisWeek?: number;
}

/**
 * §6: the ONE seed-time constructor of a CategoryDemandState. Two initialization sites used to
 * write this object shape out independently (macro/initialization and simulation/initialization
 * — a third writer, stage 03, is an UPDATER that spreads the existing entry and owns only its
 * demand-side fields). Duplicated shapes drift (§7.5): a field added to one copy and not the
 * other is exactly how the unitPriceUSD-drop bug family starts.
 */
export function createSeedCategoryDemandState(
  demandLevelUSD: number,
  demandGrowthAnnual: number,
  unitPriceUSD: number
): CategoryDemandState & { upstreamScarcityIndex: number; lastWeekInventoryLevelUSD: number; unitPriceUSD: number } {
  return {
    demandLevelUSD,
    demandGrowthAnnual,
    demandHistory: [demandLevelUSD],
    crowdingIntensity: 0.1,
    inventoryLevelUSD: demandLevelUSD * 0.10,
    inputCostPressure: 0,
    clearedInputPriceIndex: 1.0,
    upstreamScarcityIndex: 1.0,
    lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
    unitPriceUSD,
    // XB3a: both books open on the bootstrap price, so week 1 is the first week either of them
    // moves. Seeding the local book anywhere else would be a §7.4 cold start — a step change on
    // the opening week that reads as an economic event.
    localUnitPriceUSD: unitPriceUSD,
    smoothedUnitPriceUSD: unitPriceUSD,
    // XB3a-3: the week's real quantities, which the sourcing intent reads to decide where to buy
    // and how much freight to book. Seeded at the bootstrap demand a week represents, so the
    // opening week forms an intent against the same observables every later week does (§7.4).
    totalUnitsDemandedThisWeek: unitPriceUSD > 0 ? (demandLevelUSD / 52) / unitPriceUSD : 0,
    totalUnitsSuppliedThisWeek: unitPriceUSD > 0 ? (demandLevelUSD / 52) / unitPriceUSD : 0,
  } as any;
}

// BP1a: derived from the industry registry (recipeInputs per producing industry).
export const CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> = VIEW_CATEGORY_INPUT_REQUIREMENTS;

export interface SupplyRelationship {
  supplierCompanyId: string;
  customerCompanyId: string;
  category: string;
  weeklyVolumeUSD: number;
  relationshipStrength: number;
}

// Every company's capex (equipment, automation/software, fleet, construction) is a purchase
// from real capital-goods-producing sub-units, not an abstract demand signal — this is the
// basket weighting used to split any buyer's weekly capex dollars across those categories.
// BP1a: derived from the industry registry (capexBasketWeight per capital-goods sub-unit).
export const CAPEX_SUPPLIER_WEIGHTS: Record<string, number> = VIEW_CAPEX_SUPPLIER_WEIGHTS;


// Share of each capex category's demand met by real in-region public companies before falling
// back to the SME pool of the category's own industry (SEG-B) — public capital-goods producers
// are typically the large/anchor suppliers, but plenty of real-world capex (small contractors,
// private IT consultancies, regional construction firms) genuinely goes to non-public firms.
export const CAPEX_PUBLIC_SUPPLY_SHARE = 0.65;


