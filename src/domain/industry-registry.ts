/**
 * THE industry registry (BP1a) — rule 17's data half.
 *
 * One entry here is a product line: its label, who buys it, what it physically is, how its
 * capex and commodity linkages run, and — from day one, at today's implicit values — the dials
 * IND will turn (storability, carrying cost, production lead time, revenue mechanism). Adding a
 * good to the economy is adding ONE entry; no stage is edited, because stages never switch on an
 * industry — they ask this registry (rule 17).
 *
 * The legacy tables (`INDUSTRY_SUBUNITS`, `SUBUNIT_PHYSICAL`, `CATEGORY_INPUT_REQUIREMENTS`,
 * `CAPEX_SUPPLIER_WEIGHTS`, `CAPEX_CATEGORY_PRIVATE_SEGMENT`, `PRIVATE_SEGMENT_SUPPLY_CATEGORIES`,
 * `CATEGORY_PRICE_TIER`, `BASE_COMMODITY_CATEGORY_LINKAGE`) are DERIVED VIEWS re-exported from
 * their old homes — consumers migrate to the registry opportunistically and the views then die.
 * Key ITERATION ORDER in the views is load-bearing (stage 05's auction order and stage 04's
 * demander order carry the RNG lanes), so each view materialises in the exact order its legacy
 * literal had; where that differs from registry order, an explicit order list says so.
 *
 * Runtime-import-free by design (type-only imports), so nothing here can cycle.
 */

import type { Industry, BuyerType, HouseholdPriceTier } from './industry';
import type { DeliveryMode } from './goods-physical';

export type PrivateSegmentType = 'MANUFACTURING' | 'CONSTRUCTION_REALESTATE' | 'PROFESSIONAL_SERVICES';
/** IND2 will add SUBSCRIPTION | PROJECT | ROYALTY as profile modules; UNIT_SALE is today's world. */
export type RevenueMechanism = 'UNIT_SALE';

export interface SubUnitSpec {
  unitId: string;
  label: string;
  buyerMix: Record<BuyerType, number>;
  deliveryMode: DeliveryMode;
  /** USD per tonne at baseline price — a technological fact; absent for DIGITAL / IN_PLACE. */
  baselineValueDensityUsdPerTonne?: number;
  shelfLifeWeeks?: number;
  /** Absent = STANDARD via the lookup default (the legacy table only listed exceptions). */
  householdPriceTier?: HouseholdPriceTier;
  /** Share of any buyer's capex basket this category takes (capital-goods categories only). */
  capexBasketWeight?: number;
  capexPrivateSegment?: PrivateSegmentType;
  privateSupplySegment?: PrivateSegmentType;
  linkedCommodities?: { commodityId: string; intensityShare: number }[];
  // ---- IND's dials, at today's implicit values until IND turns them (see §5-IND). ----
  storable: boolean;
  carryingCostRate: number;
  productionLeadWeeks: number;
  revenueMechanism: RevenueMechanism;
}

export interface IndustrySpec {
  /** What a producer in this industry consumes per dollar of output (absent = no recipe). */
  recipeInputs?: Record<string, number>;
  subUnits: SubUnitSpec[];
}

export const INDUSTRY_REGISTRY: Record<Industry, IndustrySpec> = {
  Energy: {
    subUnits: [
      {
        unitId: 'upstream_extraction',
        label: "Upstream Extraction",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 400,
        privateSupplySegment: 'MANUFACTURING',
        linkedCommodities: [{ commodityId: 'CRUDE_OIL', intensityShare: 0.35 }, { commodityId: 'HEAVY_CRUDE_OIL', intensityShare: 0.3 }, { commodityId: 'NATURAL_GAS', intensityShare: 0.2 }],
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'refined_products',
        label: "Refined Products",
        buyerMix: { HOUSEHOLD: 0.35, GOVERNMENT: 0.1, CORPORATE: 0.55 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 800,
        householdPriceTier: 'STAPLE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MaterialsChemicals: {
    subUnits: [
      {
        unitId: 'industrial_chemicals',
        label: "Industrial Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0, CORPORATE: 1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 1_500,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'household_chemicals',
        label: "Household Chemicals",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 3_000,
        shelfLifeWeeks: 104,
        householdPriceTier: 'STAPLE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'agricultural_chemicals',
        label: "Agricultural Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 700,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'specialty_metals',
        label: "Specialty Metals & Mining",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 5_000,
        privateSupplySegment: 'MANUFACTURING',
        linkedCommodities: [{ commodityId: 'GOLD', intensityShare: 0.05 }, { commodityId: 'SILVER', intensityShare: 0.08 }, { commodityId: 'COPPER', intensityShare: 0.15 }],
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'agricultural_commodities',
        label: "Agricultural Commodities",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 300,
        shelfLifeWeeks: 26,
        householdPriceTier: 'STAPLE',
        linkedCommodities: [{ commodityId: 'WHEAT', intensityShare: 0.04 }, { commodityId: 'CORN', intensityShare: 0.04 }, { commodityId: 'SOYBEANS', intensityShare: 0.03 }],
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  IndustrialsMachinery: {
    recipeInputs: { upstream_extraction: 0.015, specialty_metals: 0.03 },
    subUnits: [
      {
        unitId: 'heavy_equipment',
        label: "Heavy Equipment",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.2, CORPORATE: 0.8 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 12_000,
        capexBasketWeight: 0.3,
        capexPrivateSegment: 'MANUFACTURING',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'industrial_automation',
        label: "Industrial Automation",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 40_000,
        capexBasketWeight: 0.2,
        capexPrivateSegment: 'MANUFACTURING',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AerospaceDefense: {
    recipeInputs: { upstream_extraction: 0.02, specialty_metals: 0.025 },
    subUnits: [
      {
        unitId: 'defense_systems',
        label: "Defense Systems",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.9, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_aerospace',
        label: "Commercial Aerospace",
        buyerMix: { HOUSEHOLD: 0.05, GOVERNMENT: 0.1, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 800_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AutomotiveTransport: {
    recipeInputs: { upstream_extraction: 0.025, specialty_metals: 0.03 },
    subUnits: [
      {
        unitId: 'passenger_vehicles',
        label: "Passenger Vehicles",
        buyerMix: { HOUSEHOLD: 0.8, GOVERNMENT: 0.05, CORPORATE: 0.15 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 25_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_fleet',
        label: "Commercial Fleet & Logistics Equipment",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.1, CORPORATE: 0.9 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 15_000,
        capexBasketWeight: 0.1,
        capexPrivateSegment: 'MANUFACTURING',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  TechHardwareSemis: {
    recipeInputs: { upstream_extraction: 0.008, specialty_metals: 0.01 },
    subUnits: [
      {
        unitId: 'semiconductors',
        label: "Semiconductors",
        buyerMix: { HOUSEHOLD: 0.1, GOVERNMENT: 0.05, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 500_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_devices',
        label: "Consumer Devices",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0.02, CORPORATE: 0.13 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  SoftwareDigitalServices: {
    recipeInputs: { upstream_extraction: 0.002 },
    subUnits: [
      {
        unitId: 'enterprise_software',
        label: "Enterprise Software & Cloud",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.1, CORPORATE: 0.9 },
        deliveryMode: 'DIGITAL',
        capexBasketWeight: 0.15,
        capexPrivateSegment: 'PROFESSIONAL_SERVICES',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_software',
        label: "Consumer Software & Subscriptions",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'DIGITAL',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  Telecommunications: {
    subUnits: [
      {
        unitId: 'network_infrastructure',
        label: "Network Infrastructure",
        buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.1, CORPORATE: 0.35 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 60_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  HealthcarePharma: {
    subUnits: [
      {
        unitId: 'pharmaceuticals',
        label: "Pharmaceuticals",
        buyerMix: { HOUSEHOLD: 0.4, GOVERNMENT: 0.45, CORPORATE: 0.15 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 400_000,
        shelfLifeWeeks: 104,
        householdPriceTier: 'STAPLE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'medtech_devices',
        label: "Medical Devices",
        buyerMix: { HOUSEHOLD: 0.15, GOVERNMENT: 0.5, CORPORATE: 0.35 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 200_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerStaples: {
    recipeInputs: { upstream_extraction: 0.001, agricultural_commodities: 0.12 },
    subUnits: [
      {
        unitId: 'food_beverage',
        label: "Food & Beverage",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 2_500,
        shelfLifeWeeks: 8,
        householdPriceTier: 'STAPLE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'household_essentials',
        label: "Household Essentials",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 4_000,
        householdPriceTier: 'STAPLE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerDiscretionaryRetail: {
    recipeInputs: { upstream_extraction: 0.002 },
    subUnits: [
      {
        unitId: 'apparel_retail',
        label: "Apparel & General Retail",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 20_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'home_furnishings',
        label: "Home Furnishings",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 4_000,
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  LuxuryGoods: {
    subUnits: [
      {
        unitId: 'luxury_goods',
        label: "Luxury Goods",
        buyerMix: { HOUSEHOLD: 1, GOVERNMENT: 0, CORPORATE: 0 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 200_000,
        householdPriceTier: 'LUXURY',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MediaEntertainment: {
    subUnits: [
      {
        unitId: 'media_content',
        label: "Media & Content",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0, CORPORATE: 0.15 },
        deliveryMode: 'DIGITAL',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  RealEstateConstruction: {
    subUnits: [
      {
        unitId: 'residential_construction',
        label: "Residential Construction",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0.05, CORPORATE: 0.05 },
        deliveryMode: 'IN_PLACE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_construction',
        label: "Commercial & Infrastructure Construction",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.45, CORPORATE: 0.55 },
        deliveryMode: 'IN_PLACE',
        capexBasketWeight: 0.25,
        capexPrivateSegment: 'CONSTRUCTION_REALESTATE',
        storable: true,
        carryingCostRate: 0.02,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
};

// ---------------------------------------------------------------------------------------------
// Derived views under the legacy names. Exact legacy key order throughout (see header).

const allSubUnits: SubUnitSpec[] = Object.values(INDUSTRY_REGISTRY).flatMap(i => i.subUnits);
const byId = new Map(allSubUnits.map(su => [su.unitId, su]));

export function subUnitSpecOf(unitId: string): SubUnitSpec | undefined {
  return byId.get(unitId);
}

export const VIEW_INDUSTRY_SUBUNITS: Record<Industry, { unitId: string; label: string; buyerMix: Record<BuyerType, number> }[]> =
  Object.fromEntries(
    Object.entries(INDUSTRY_REGISTRY).map(([ind, spec]) => [
      ind, spec.subUnits.map(su => ({ unitId: su.unitId, label: su.label, buyerMix: su.buyerMix })),
    ])
  ) as Record<Industry, { unitId: string; label: string; buyerMix: Record<BuyerType, number> }[]>;

export const VIEW_SUBUNIT_PHYSICAL: Record<string, { deliveryMode: DeliveryMode; baselineValueDensityUsdPerTonne?: number; shelfLifeWeeks?: number }> =
  Object.fromEntries(allSubUnits.map(su => [su.unitId, {
    deliveryMode: su.deliveryMode,
    ...(su.baselineValueDensityUsdPerTonne !== undefined ? { baselineValueDensityUsdPerTonne: su.baselineValueDensityUsdPerTonne } : {}),
    ...(su.shelfLifeWeeks !== undefined ? { shelfLifeWeeks: su.shelfLifeWeeks } : {}),
  }]));

/** Legacy literal order — 04-input-output's demander loop iterates this and carries RNG lanes. */
const RECIPE_INDUSTRY_ORDER: Industry[] = [
  'TechHardwareSemis', 'SoftwareDigitalServices', 'AutomotiveTransport', 'AerospaceDefense',
  'IndustrialsMachinery', 'ConsumerStaples', 'ConsumerDiscretionaryRetail',
];
export const VIEW_CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> =
  Object.fromEntries(RECIPE_INDUSTRY_ORDER.map(ind => [ind, { ...INDUSTRY_REGISTRY[ind].recipeInputs }]));

const CAPEX_ORDER = ['heavy_equipment', 'industrial_automation', 'commercial_construction', 'enterprise_software', 'commercial_fleet'];
export const VIEW_CAPEX_SUPPLIER_WEIGHTS: Record<string, number> =
  Object.fromEntries(CAPEX_ORDER.map(id => [id, byId.get(id)!.capexBasketWeight!]));
export const VIEW_CAPEX_CATEGORY_PRIVATE_SEGMENT: Record<string, PrivateSegmentType> =
  Object.fromEntries(CAPEX_ORDER.map(id => [id, byId.get(id)!.capexPrivateSegment!]));

export const VIEW_PRIVATE_SEGMENT_SUPPLY_CATEGORIES: Record<string, PrivateSegmentType> =
  Object.fromEntries(['upstream_extraction', 'specialty_metals'].map(id => [id, byId.get(id)!.privateSupplySegment!]));

const TIER_ORDER = ['refined_products', 'household_chemicals', 'food_beverage', 'household_essentials', 'pharmaceuticals', 'agricultural_commodities', 'luxury_goods'];
export const VIEW_CATEGORY_PRICE_TIER: Record<string, HouseholdPriceTier> =
  Object.fromEntries(TIER_ORDER.map(id => [id, byId.get(id)!.householdPriceTier!]));

/** Legacy commodity order preserved (working-table calibration iterates it). */
const LINKAGE_ORDER = ['CRUDE_OIL', 'HEAVY_CRUDE_OIL', 'NATURAL_GAS', 'GOLD', 'SILVER', 'COPPER', 'WHEAT', 'CORN', 'SOYBEANS'];
export const VIEW_BASE_COMMODITY_CATEGORY_LINKAGE: Record<string, { subUnitId: string; intensityShare: number }> = (() => {
  const flat = new Map<string, { subUnitId: string; intensityShare: number }>();
  allSubUnits.forEach(su => (su.linkedCommodities ?? []).forEach(l =>
    flat.set(l.commodityId, { subUnitId: su.unitId, intensityShare: l.intensityShare })));
  return Object.fromEntries(LINKAGE_ORDER.map(c => [c, flat.get(c)!]));
})();
