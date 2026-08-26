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
  clearedInputPriceIndex: number; // 1.0 = baseline; rises/falls with genuine scarcity/glut
  lastWeekInventoryLevelUSD: number; // explicit lag anchor — bidders always react to this, never same-week inventory
  unitPriceUSD?: number; // Per-region sub-unit price level
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
  ConsumerStaples: { upstream_extraction: 0.001 },
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
