/**
 * Market Microstructure Domain Model
 *
 * Models sub-unit bids, offers, supply contracts, category demand states, input-output requirement matrices,
 * and inter-company supply relationships. Owned and updated by category demand, input-output, and unit bidding simulation stages.
 */

export interface UnitBid {
  companyId?: string;
  isHouseholdAggregate?: boolean;
  isGovernmentAggregate?: boolean;
  quantityUnits: number;
  maxPriceUSD: number;
}

export interface UnitOffer {
  companyId: string;
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
  clearedInputPriceIndex: number; // 1.0 = baseline; this category's own real auction clearing price vs its baseline unit price — set unconditionally every week by 05-unit-bidding.ts for every category
  // 04-input-output.ts's OWN smoothed upstream scarcity/glut index for its input-category
  // categories (upstream_extraction, specialty_metals) — kept separate from
  // clearedInputPriceIndex above (used to collide: 05-unit-bidding.ts overwrote the very same
  // field with an unrelated same-week auction price ratio for every category, corrupting
  // stage04's own smoothed self-reference the following week).
  upstreamScarcityIndex?: number;
  lastWeekInventoryLevelUSD: number; // explicit lag anchor — bidders always react to this, never same-week inventory
  unitPriceUSD?: number; // Per-region sub-unit price level
  smoothedUnitPriceUSD?: number; // Slow-moving average of unitPriceUSD suppliers use to set production (see 05-unit-bidding.ts) — damps the cobweb-cycle instability of reacting to the raw last-cleared price
  // This category's real corporate-only demand share this week (see 03-category-demand.ts) —
  // stage05-unit-bidding.ts distributes this as real named corporate bids across every
  // potential buyer company, weighted by revenue share, instead of a hand-picked per-category
  // intensity constant that only covered a handful of categories.
  corporateDemandUSD?: number;
  _fulfillmentRatio?: number; // transient, read by AA3 same week, not persisted
  totalUnitsSuppliedThisWeek?: number;
  totalUnitsDemandedThisWeek?: number;
}

export const CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> = {
  TechHardwareSemis: { upstream_extraction: 0.008, specialty_metals: 0.010 },
  SoftwareDigitalServices: { upstream_extraction: 0.002 },
  AutomotiveTransport: { upstream_extraction: 0.025, specialty_metals: 0.030 },
  AerospaceDefense: { upstream_extraction: 0.020, specialty_metals: 0.025 },
  IndustrialsMachinery: { upstream_extraction: 0.015, specialty_metals: 0.030 },
  // 1$ is 1$: food/beverage production's real dominant input is raw crops, not energy — the
  // agricultural_commodities entry is the literal recipe requirement fed by real WHEAT/CORN/
  // SOYBEANS producer companies (see COMMODITY_CATEGORY_LINKAGE); upstream_extraction stays as
  // the (much smaller) energy cost of processing/transport.
  ConsumerStaples: { upstream_extraction: 0.001, agricultural_commodities: 0.12 },
  ConsumerDiscretionaryRetail: { upstream_extraction: 0.002 },
};

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
export const CAPEX_SUPPLIER_WEIGHTS: Record<string, number> = {
  heavy_equipment: 0.30,
  industrial_automation: 0.20,
  commercial_construction: 0.25,
  enterprise_software: 0.15,
  commercial_fleet: 0.10,
};

// Real, non-public counterparty for the share of capex a region's public companies can't supply
// (insufficient in-region public capacity in a given category) — private/non-traded firms in
// this segment are a genuine seller of the same goods, not a residual write-off.
export const CAPEX_CATEGORY_PRIVATE_SEGMENT: Record<string, 'MANUFACTURING' | 'CONSTRUCTION_REALESTATE' | 'PROFESSIONAL_SERVICES'> = {
  heavy_equipment: 'MANUFACTURING',
  industrial_automation: 'MANUFACTURING',
  commercial_construction: 'CONSTRUCTION_REALESTATE',
  enterprise_software: 'PROFESSIONAL_SERVICES',
  commercial_fleet: 'MANUFACTURING',
};

// Share of each capex category's demand met by real in-region public companies before falling
// back to the private-sector segment above — public capital-goods producers are typically the
// large/anchor suppliers, but plenty of real-world capex (small contractors, private IT
// consultancies, regional construction firms) genuinely goes to non-public firms.
export const CAPEX_PUBLIC_SUPPLY_SHARE = 0.65;

// 1$ is 1$ Phase 3: real non-public counterparty allowed to submit a genuine, sellable offer in
// 05-unit-bidding.ts's auction for these categories — not every category needs this (most have
// plenty of real public suppliers), but a few (confirmed: specialty_metals) can end up with
// literally zero real public-company suppliers generated in a region, permanently starving
// every company whose recipe needs them. Distinct from CAPEX_CATEGORY_PRIVATE_SEGMENT above
// (that's for capital-goods purchases settled in 08b-capex-settlement.ts; this is a real named
// seller inside the actual per-unit auction).
export const PRIVATE_SEGMENT_SUPPLY_CATEGORIES: Record<string, 'MANUFACTURING' | 'CONSTRUCTION_REALESTATE' | 'PROFESSIONAL_SERVICES'> = {
  upstream_extraction: 'MANUFACTURING',
  specialty_metals: 'MANUFACTURING',
};

// Share of the segment's real annual revenue treated as this category's real weekly production
// capacity when it participates as a seller — modest, since a segment plausibly does many
// things besides this one category, mirroring CAPEX_SUPPLIER_WEIGHTS' basket-share approach.
export const PRIVATE_SEGMENT_SUPPLY_SHARE = 0.08;
