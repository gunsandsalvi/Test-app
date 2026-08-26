/**
 * Industry & Product Category Domain Model
 *
 * Models standard industry taxonomy, sub-unit classifications, buyer mix breakdowns (Household, Government, Corporate),
 * and necessity tiers. Read and used across company product lines and market-clearing bidding stages.
 */

export type NecessityTier = 'Staple' | 'Standard' | 'Luxury';

export type Industry =
  | 'Energy' | 'MaterialsChemicals' | 'IndustrialsMachinery' | 'AerospaceDefense'
  | 'AutomotiveTransport' | 'TechHardwareSemis' | 'SoftwareDigitalServices' | 'Telecommunications'
  | 'HealthcarePharma' | 'ConsumerStaples' | 'ConsumerDiscretionaryRetail' | 'LuxuryGoods'
  | 'MediaEntertainment' | 'RealEstateConstruction';

export type ProductCategory = Industry;

export type BuyerType = 'HOUSEHOLD' | 'GOVERNMENT' | 'CORPORATE';

export interface IndustrySubUnit {
  unitId: string;
  label: string;
  buyerMix: Record<BuyerType, number>;
}

export const INDUSTRY_SUBUNITS: Record<Industry, IndustrySubUnit[]> = {
  Energy: [
    { unitId: 'upstream_extraction', label: 'Upstream Extraction', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 } },
    { unitId: 'refined_products', label: 'Refined Products', buyerMix: { HOUSEHOLD: 0.35, GOVERNMENT: 0.10, CORPORATE: 0.55 } },
  ],
  MaterialsChemicals: [
    { unitId: 'industrial_chemicals', label: 'Industrial Chemicals', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0, CORPORATE: 1.0 } },
    { unitId: 'household_chemicals', label: 'Household Chemicals', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 } },
    { unitId: 'agricultural_chemicals', label: 'Agricultural Chemicals', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 } },
    { unitId: 'specialty_metals', label: 'Specialty Metals & Mining', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 } },
    // 1$ is 1$: the raw-crop counterpart to specialty_metals — a raw-input sub-unit, not a
    // downstream consumer product, so it belongs alongside the other raw-material categories
    // here rather than under ConsumerStaples (whose OWN demand, as a CATEGORY_INPUT_REQUIREMENTS
    // demander of this same category, would otherwise self-referentially inflate its own bid).
    // Real supply comes from the WHEAT/CORN/SOYBEANS commodity producers (see
    // COMMODITY_CATEGORY_LINKAGE and companyGenerator.ts).
    { unitId: 'agricultural_commodities', label: 'Agricultural Commodities', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 } },
  ],
  IndustrialsMachinery: [
    { unitId: 'heavy_equipment', label: 'Heavy Equipment', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.20, CORPORATE: 0.80 } },
    { unitId: 'industrial_automation', label: 'Industrial Automation', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 } },
  ],
  AerospaceDefense: [
    { unitId: 'defense_systems', label: 'Defense Systems', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.90, CORPORATE: 0.10 } },
    { unitId: 'commercial_aerospace', label: 'Commercial Aerospace', buyerMix: { HOUSEHOLD: 0.05, GOVERNMENT: 0.10, CORPORATE: 0.85 } },
  ],
  AutomotiveTransport: [
    { unitId: 'passenger_vehicles', label: 'Passenger Vehicles', buyerMix: { HOUSEHOLD: 0.80, GOVERNMENT: 0.05, CORPORATE: 0.15 } },
    { unitId: 'commercial_fleet', label: 'Commercial Fleet & Logistics Equipment', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.10, CORPORATE: 0.90 } },
  ],
  TechHardwareSemis: [
    { unitId: 'semiconductors', label: 'Semiconductors', buyerMix: { HOUSEHOLD: 0.10, GOVERNMENT: 0.05, CORPORATE: 0.85 } },
    { unitId: 'consumer_devices', label: 'Consumer Devices', buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0.02, CORPORATE: 0.13 } },
  ],
  SoftwareDigitalServices: [
    { unitId: 'enterprise_software', label: 'Enterprise Software & Cloud', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.10, CORPORATE: 0.90 } },
    { unitId: 'consumer_software', label: 'Consumer Software & Subscriptions', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 } },
  ],
  Telecommunications: [
    { unitId: 'network_infrastructure', label: 'Network Infrastructure', buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.10, CORPORATE: 0.35 } },
  ],
  HealthcarePharma: [
    { unitId: 'pharmaceuticals', label: 'Pharmaceuticals', buyerMix: { HOUSEHOLD: 0.40, GOVERNMENT: 0.45, CORPORATE: 0.15 } },
    { unitId: 'medtech_devices', label: 'Medical Devices', buyerMix: { HOUSEHOLD: 0.15, GOVERNMENT: 0.50, CORPORATE: 0.35 } },
  ],
  ConsumerStaples: [
    { unitId: 'food_beverage', label: 'Food & Beverage', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 } },
    { unitId: 'household_essentials', label: 'Household Essentials', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 } },
  ],
  ConsumerDiscretionaryRetail: [
    { unitId: 'apparel_retail', label: 'Apparel & General Retail', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 } },
    { unitId: 'home_furnishings', label: 'Home Furnishings', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 } },
  ],
  LuxuryGoods: [
    { unitId: 'luxury_goods', label: 'Luxury Goods', buyerMix: { HOUSEHOLD: 1.0, GOVERNMENT: 0, CORPORATE: 0 } },
  ],
  MediaEntertainment: [
    { unitId: 'media_content', label: 'Media & Content', buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0, CORPORATE: 0.15 } },
  ],
  RealEstateConstruction: [
    { unitId: 'residential_construction', label: 'Residential Construction', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0.05, CORPORATE: 0.05 } },
    { unitId: 'commercial_construction', label: 'Commercial & Infrastructure Construction', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.45, CORPORATE: 0.55 } },
  ],
};


