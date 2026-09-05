/** Bids, offers, supply contracts and the per-category demand state stages 03/04/05 pass between
 *  them. The input-output and capex-basket tables are views onto the industry registry. */

import { RegionId } from './geography';
import { VIEW_CATEGORY_INPUT_REQUIREMENTS } from './industry-registry';
import type { EntityId } from './ids';

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

export interface CategoryDemandState {
  demandLevelAnnualLocal: number;
  demandGrowthAnnual: number;
  demandHistory: number[];
  crowdingIntensity: number;
  /** This category's unit price at initialization — the FIXED baseline clearedInputPriceIndex is
   *  measured against. Stored once and never rewritten (S8). */
  baseUnitPriceLocal?: number;
  /** 1.0 = baseline: this category's own cleared landed price against `baseUnitPriceLocal`, set
   *  every week by stage 05 for every category. §3.23: the ONE price index a category carries —
   *  stage 04's formula index (`upstreamScarcityIndex`, `inputCostPressure`, `_fulfillmentRatio`)
   *  is deleted; a buyer's input prices are its inputs' own cleared prices, read through its recipe. */
  clearedInputPriceIndex: number;
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
   *  price levels (ex-works → landed `unitPriceLocal` → `shelfUnitPriceLocal`). Written by stage 05.
   *  §3.22: read by `domain/commodity-spot.ts` — a commodity's spot is this price, weighted by the
   *  units each origin supplied, in the numéraire. */
  exWorksUnitPriceLocal?: number;
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
): CategoryDemandState & { unitPriceLocal: number } {
  return {
    demandLevelAnnualLocal,
    demandGrowthAnnual,
    demandHistory: [demandLevelAnnualLocal],
    crowdingIntensity: 0.1,
    clearedInputPriceIndex: 1.0,
    unitPriceLocal,
    // XB3a: both books open on the bootstrap price, so week 1 is the first week either of them
    // moves. Seeding the local book anywhere else would be a §7.4 cold start — a step change on
    // the opening week that reads as an economic event.
    localUnitPriceLocal: unitPriceLocal,
    smoothedUnitPriceLocal: unitPriceLocal,
    // §3.22: the gate price opens where the books do, so the commodity's seed print is a read of
    // the same field every later week reads.
    exWorksUnitPriceLocal: unitPriceLocal,
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
  /** §3.13-BOOK slice (c2a): both ends of a supply relationship are FIRMS. */
  supplierCompanyId: EntityId;
  customerCompanyId: EntityId;
  category: string;
  weeklyVolumeLocal: number;
  relationshipStrength: number;
}

// §3.26-f-iv-b: every company's capex is a purchase from real capital-goods-producing sub-units,
// split by ITS industry's capital mix (`industry-registry.ts:capitalMixOf`); the one basket every
// buyer shared (`CAPEX_SUPPLIER_WEIGHTS`) is gone.




