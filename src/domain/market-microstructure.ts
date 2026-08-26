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
