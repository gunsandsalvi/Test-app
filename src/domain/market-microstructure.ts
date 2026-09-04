/** Bids, offers, supply contracts and the per-category demand state stages 03/04/05 pass between
 *  them. The input-output and capex-basket tables are views onto the industry registry. */

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
  maxPriceLocal: number;
}

export interface UnitOffer {
  companyId: string;
  /** XB3a: which region this supply comes FROM. See UnitBid.regionId. */
  regionId: RegionId;
  quantityUnits: number;
  minPriceLocal: number;
}

export interface SupplyContract {
  supplierCompanyId: string;
  customerCompanyId: string;
  subUnitId: string;
  priceLocal: number;
  quantityUnitsPerWeek: number;
  weeksRemaining: number;
  /**
   * IND11 — UNITS OWED AND NOT DELIVERED. The seller's backlog and the buyer's claim are the
   * same number because they are the same obligation, and this object is bilateral: one
   * representation, not two that can disagree (rule 4). Undelivered demand used to evaporate.
   */
  backlogUnits?: number;
  /** IND11 — consecutive weeks this supplier has under-delivered: the non-performance clock. */
  shortWeeks?: number;
  /**
   * IND11 — the published price this contract was struck against. An INDEXED contract (set at
   * formation for long durations) reprices in proportion to how far the market has moved from
   * it, so input-cost inflation passes through instead of being silently assigned to one side.
   * Absent = a fixed-price contract, which assigns it to the seller.
   */
  escalationBaseLocal?: number;
  /**
   * IND17 — WHAT THE CUSTOMER HAS PAID AHEAD. A long-cycle order is funded as the work is done,
   * not on handover: the buyer's money pays for the steel before the ship exists. It is the
   * seller's LIABILITY (goods owed, not revenue) and the buyer's ASSET, one number on the
   * bilateral object because it is one obligation — negative working capital, and a real
   * funding source for exactly the firms whose production ties up the most cash.
   */
  prepaidLocal?: number;
}

export interface CategoryDemandState {
  demandLevelAnnualLocal: number;
  demandGrowthAnnual: number;
  demandHistory: number[];
  crowdingIntensity: number;
  inventoryLevelLocal: number;
  inputCostPressure: number;
  /** This category's unit price at initialization — the FIXED baseline clearedInputPriceIndex is
   *  measured against. Stored once and never rewritten (S8). */
  baseUnitPriceLocal?: number;
  clearedInputPriceIndex: number; // 1.0 = baseline; this category's own real auction clearing price vs its baseline unit price — set unconditionally every week by 05-unit-bidding.ts for every category
  // 04-input-output.ts's OWN smoothed upstream scarcity/glut index for its input-category
  // categories (upstream_extraction, specialty_metals) — kept separate from
  // clearedInputPriceIndex above (used to collide: 05-unit-bidding.ts overwrote the very same
  // field with an unrelated same-week auction price ratio for every category, corrupting
  // stage04's own smoothed self-reference the following week).
  upstreamScarcityIndex?: number;
  lastWeekInventoryLevelLocal: number; // explicit lag anchor — bidders always react to this, never same-week inventory
  /**
   * What this good actually cost in this region this week: the volume-weighted average of every
   * price its buyers paid, across the local book AND their fills in the world book (XB3a). It is
   * the number every consumer of a regional price wants — the CPI basket, revenue, input costs —
   * and it is a MEASUREMENT of transactions, never an input to one. The two books each price
   * against their own anchor below.
   */
  unitPriceLocal?: number;
  /**
   * IND16 — what this good costs a HOUSEHOLD: the landed price above plus the channel's margin
   * for holding the stock it is sold out of (domain/distribution.ts). Three real price levels
   * now, each a real cost step with a real payee — ex-works is what the producer received,
   * `unitPriceLocal` is what a business pays delivered, and this is what is on the shelf. Recipes
   * and input costs keep reading the landed one, because that is genuinely what a firm pays.
   */
  shelfUnitPriceLocal?: number;
  /** The local book's own last cleared price — its anchor next week (XB3a). */
  localUnitPriceLocal?: number;
  smoothedUnitPriceLocal?: number; // Slow-moving average of the LOCAL book's cleared price, which its suppliers set production against (see 05-unit-bidding.ts) — damps the cobweb-cycle instability of reacting to the raw last-cleared price
  /** §7.249 — the category's own published price, one entry per week (last 13), so a firm's
   *  nominal growth can be deflated by the price of what IT sells over the SAME window. */
  priceHistory?: number[];
  /** The HOUSEHOLD leg of this category's demand this week, measured where it is owned: the
   *  cohorts' real consumption budgets (C), allocated by tier and buyer mix in stage 03. Stage
   *  05 sizes the household's bid ladder from THIS, never from `demandLevelAnnualLocal × hhShare` — the
   *  demand level carries the corporate leg (nominal firm revenues) and the Leontief
   *  intermediate half, so a budget carved from it scales with other buyers' prices instead of
   *  with household income. That was a second representation of one budget (rule 4), and the
   *  unanchored one: in any category with persistent excess demand it ratchets the household's
   *  reservation up with the price it itself set — measured as the EUR electricity runaway
   *  (price ×119 in ten weeks while unit shortage IMPROVED). A budget is a level in money. */
  householdDemandLocal?: number;
  // This category's real corporate-only demand share this week (see 03-category-demand.ts) —
  // stage05-unit-bidding.ts distributes this as real named corporate bids across every
  // potential buyer company, weighted by revenue share, instead of a hand-picked per-category
  // intensity constant that only covered a handful of categories.
  corporateDemandLocal?: number;
  /** IND16: what the producer received at the factory gate this week — the first of the three
   *  price levels (ex-works → landed `unitPriceLocal` → `shelfUnitPriceLocal`). Written by stage 05;
   *  currently recorded only (no reader) — surfaced from behind an `as any` by §7.241's Tier 0. */
  exWorksUnitPriceLocal?: number;
  _fulfillmentRatio?: number; // transient, read by AA3 same week, not persisted
  totalUnitsSuppliedThisWeek?: number;
  totalUnitsDemandedThisWeek?: number;
}

/**
 * §6: the ONE seed-time constructor of a CategoryDemandState. Two initialization sites used to
 * write this object shape out independently (macro/initialization and simulation/initialization
 * — a third writer, stage 03, is an UPDATER that spreads the existing entry and owns only its
 * demand-side fields). Duplicated shapes drift (§7.5): a field added to one copy and not the
 * other is exactly how the unitPriceLocal-drop bug family starts.
 */
export function createSeedCategoryDemandState(
  demandLevelAnnualLocal: number,
  demandGrowthAnnual: number,
  unitPriceLocal: number
): CategoryDemandState & { upstreamScarcityIndex: number; lastWeekInventoryLevelLocal: number; unitPriceLocal: number } {
  return {
    demandLevelAnnualLocal,
    demandGrowthAnnual,
    demandHistory: [demandLevelAnnualLocal],
    crowdingIntensity: 0.1,
    inventoryLevelLocal: demandLevelAnnualLocal * 0.10,
    inputCostPressure: 0,
    clearedInputPriceIndex: 1.0,
    upstreamScarcityIndex: 1.0,
    lastWeekInventoryLevelLocal: demandLevelAnnualLocal * 0.10,
    unitPriceLocal,
    // XB3a: both books open on the bootstrap price, so week 1 is the first week either of them
    // moves. Seeding the local book anywhere else would be a §7.4 cold start — a step change on
    // the opening week that reads as an economic event.
    localUnitPriceLocal: unitPriceLocal,
    smoothedUnitPriceLocal: unitPriceLocal,
    // XB3a-3: the week's real quantities, which the sourcing intent reads to decide where to buy
    // and how much freight to book. Seeded at the bootstrap demand a week represents, so the
    // opening week forms an intent against the same observables every later week does (§7.4).
    totalUnitsDemandedThisWeek: unitPriceLocal > 0 ? (demandLevelAnnualLocal / 52) / unitPriceLocal : 0,
    totalUnitsSuppliedThisWeek: unitPriceLocal > 0 ? (demandLevelAnnualLocal / 52) / unitPriceLocal : 0,
  };
}

// BP1a: derived from the industry registry (recipeInputs per producing industry).
export const CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> = VIEW_CATEGORY_INPUT_REQUIREMENTS;

export interface SupplyRelationship {
  supplierCompanyId: string;
  customerCompanyId: string;
  category: string;
  weeklyVolumeLocal: number;
  relationshipStrength: number;
}

// Every company's capex (equipment, automation/software, fleet, construction) is a purchase
// from real capital-goods-producing sub-units, not an abstract demand signal — this is the
// basket weighting used to split any buyer's weekly capex dollars across those categories.
// BP1a: derived from the industry registry (capexBasketWeight per capital-goods sub-unit).
export const CAPEX_SUPPLIER_WEIGHTS: Record<string, number> = VIEW_CAPEX_SUPPLIER_WEIGHTS;




