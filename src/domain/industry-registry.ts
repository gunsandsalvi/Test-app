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

/** The producing sector whose companies carry an industry's lines — a GICS-style taxonomy
 * primitive. Financials and Banks produce no goods and now carry NO product line at all
 * (IND-R2): a line is what registers a supplier in stage 05's index, so the proxy line they used
 * to carry put 40 financial firms into the enterprise-software market. Their revenue comes from
 * their stage-08 profiles. */
export type ProducingSector = 'Tech' | 'Energy' | 'Industrials' | 'Consumer';
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
  linkedCommodities?: { commodityId: string; intensityShare: number }[];
  // ---- IND's dials. Storability and carrying cost are DERIVED from the physics above
  // (see isStorable / annualCarryingCostRateOf) rather than stated twice; these two are not
  // derivable from anything and are stated. ----
  productionLeadWeeks: number;
  revenueMechanism: RevenueMechanism;
}

export interface IndustrySpec {
  /** Which sector's companies produce this industry's goods (BP1b: line assignment reads this). */
  sector: ProducingSector;
  /**
   * SEG — the share of this industry's activity carried by firms too small to name: its SME
   * tier. A structural fact about how an industry is organised, and it differs enormously —
   * construction and professional services are SME-dominated because the efficient scale is a
   * crew or a practice, while semiconductors and aerospace are not because the efficient scale
   * is a fab or an assembly line. Stated per industry (rule 4 allows a real-world primitive;
   * it is not an equilibrium), and it is the ONLY size input the SME tier takes: a pool's
   * opening revenue is its industry's real demand times this, so the tier's composition is an
   * outcome of where demand actually is rather than five hardcoded GDP shares (§5-SEG).
   */
  smeShareOfActivity: number;
  /** What a producer in this industry consumes per dollar of output (absent = no recipe). */
  recipeInputs?: Record<string, number>;
  subUnits: SubUnitSpec[];
}

export const INDUSTRY_REGISTRY: Record<Industry, IndustrySpec> = {
  Energy: {
    sector: 'Energy',
    smeShareOfActivity: 0.15,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'upstream_extraction',
        label: "Upstream Extraction",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 400,
        linkedCommodities: [{ commodityId: 'CRUDE_OIL', intensityShare: 0.35 }, { commodityId: 'HEAVY_CRUDE_OIL', intensityShare: 0.3 }, { commodityId: 'NATURAL_GAS', intensityShare: 0.2 }],
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MaterialsChemicals: {
    sector: 'Industrials',
    smeShareOfActivity: 0.25,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'industrial_chemicals',
        label: "Industrial Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0, CORPORATE: 1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 1_500,
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'agricultural_chemicals',
        label: "Agricultural Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 700,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'specialty_metals',
        label: "Specialty Metals & Mining",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 5_000,
        linkedCommodities: [{ commodityId: 'GOLD', intensityShare: 0.05 }, { commodityId: 'SILVER', intensityShare: 0.08 }, { commodityId: 'COPPER', intensityShare: 0.15 }],
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  IndustrialsMachinery: {
    sector: 'Industrials',
    smeShareOfActivity: 0.42,
    recipeInputs: { upstream_extraction: 0.015, specialty_metals: 0.03, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'heavy_equipment',
        label: "Heavy Equipment",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.2, CORPORATE: 0.8 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 12_000,
        capexBasketWeight: 0.3,
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AerospaceDefense: {
    sector: 'Industrials',
    smeShareOfActivity: 0.14,
    recipeInputs: { upstream_extraction: 0.02, specialty_metals: 0.025, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'defense_systems',
        label: "Defense Systems",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.9, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_aerospace',
        label: "Commercial Aerospace",
        buyerMix: { HOUSEHOLD: 0.05, GOVERNMENT: 0.1, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 800_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AutomotiveTransport: {
    sector: 'Consumer',
    smeShareOfActivity: 0.22,
    recipeInputs: { upstream_extraction: 0.025, specialty_metals: 0.03, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'passenger_vehicles',
        label: "Passenger Vehicles",
        buyerMix: { HOUSEHOLD: 0.8, GOVERNMENT: 0.05, CORPORATE: 0.15 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 25_000,
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  TechHardwareSemis: {
    sector: 'Tech',
    smeShareOfActivity: 0.12,
    recipeInputs: { upstream_extraction: 0.008, specialty_metals: 0.01, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'semiconductors',
        label: "Semiconductors",
        buyerMix: { HOUSEHOLD: 0.1, GOVERNMENT: 0.05, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 500_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_devices',
        label: "Consumer Devices",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0.02, CORPORATE: 0.13 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  SoftwareDigitalServices: {
    sector: 'Tech',
    smeShareOfActivity: 0.35,
    recipeInputs: { upstream_extraction: 0.002, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'enterprise_software',
        label: "Enterprise Software & Cloud",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.1, CORPORATE: 0.9 },
        deliveryMode: 'DIGITAL',
        capexBasketWeight: 0.15,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_software',
        label: "Consumer Software & Subscriptions",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'DIGITAL',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  Telecommunications: {
    sector: 'Tech',
    smeShareOfActivity: 0.1,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'network_infrastructure',
        label: "Network Infrastructure",
        buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.1, CORPORATE: 0.35 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 60_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  HealthcarePharma: {
    sector: 'Consumer',
    smeShareOfActivity: 0.38,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'health_services',
        label: "Health Services",
        buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.43, CORPORATE: 0.02 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'pharmaceuticals',
        label: "Pharmaceuticals",
        buyerMix: { HOUSEHOLD: 0.4, GOVERNMENT: 0.45, CORPORATE: 0.15 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 400_000,
        shelfLifeWeeks: 104,
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'medtech_devices',
        label: "Medical Devices",
        buyerMix: { HOUSEHOLD: 0.15, GOVERNMENT: 0.5, CORPORATE: 0.35 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 200_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerStaples: {
    sector: 'Consumer',
    smeShareOfActivity: 0.28,
    recipeInputs: { upstream_extraction: 0.001, agricultural_commodities: 0.12, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'food_beverage',
        label: "Food & Beverage",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 2_500,
        shelfLifeWeeks: 8,
        householdPriceTier: 'STAPLE',
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
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerDiscretionaryRetail: {
    sector: 'Consumer',
    smeShareOfActivity: 0.52,
    recipeInputs: { upstream_extraction: 0.002, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'apparel_retail',
        label: "Apparel & General Retail",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 20_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'home_furnishings',
        label: "Home Furnishings",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 4_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  LuxuryGoods: {
    sector: 'Consumer',
    smeShareOfActivity: 0.2,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'luxury_goods',
        label: "Luxury Goods",
        buyerMix: { HOUSEHOLD: 1, GOVERNMENT: 0, CORPORATE: 0 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 200_000,
        householdPriceTier: 'LUXURY',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MediaEntertainment: {
    sector: 'Consumer',
    smeShareOfActivity: 0.45,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        unitId: 'media_content',
        label: "Media & Content",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0, CORPORATE: 0.15 },
        deliveryMode: 'DIGITAL',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  /**
   * SVC — services households buy. Roughly two thirds of consumption in a developed economy, and
   * until now the taxonomy had none of it: the whole consumption budget was allocated across
   * goods sub-units, so goods demand carried spending that in reality goes to rent, care,
   * restaurants and schooling. They clear in the same auction as everything else — IN_PLACE, so
   * they are made where they stand, carry no freight and cannot be inventoried (IND1).
   */
  PersonalConsumerServices: {
    sector: 'Consumer',
    smeShareOfActivity: 0.72,
    recipeInputs: { food_beverage: 0.22, household_essentials: 0.04, facilities_and_logistics: 0.05 },
    subUnits: [
      {
        unitId: 'food_service',
        label: "Food Service & Hospitality",
        buyerMix: { HOUSEHOLD: 0.92, GOVERNMENT: 0.02, CORPORATE: 0.06 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STANDARD',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'personal_care_services',
        label: "Personal & Household Services",
        buyerMix: { HOUSEHOLD: 0.96, GOVERNMENT: 0.02, CORPORATE: 0.02 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STANDARD',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'education_services',
        label: "Education & Training",
        buyerMix: { HOUSEHOLD: 0.42, GOVERNMENT: 0.55, CORPORATE: 0.03 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  /**
   * SVC — the services firms buy from each other: accountants, consultants, cleaning, security,
   * logistics, maintenance. This is what a company's operating cost beyond its bought inputs
   * actually IS, and it used to leave the model as a payment to nobody.
   */
  BusinessSupportServices: {
    sector: 'Industrials',
    smeShareOfActivity: 0.58,
    recipeInputs: { enterprise_software: 0.04, refined_products: 0.03 },
    subUnits: [
      {
        unitId: 'professional_services',
        label: "Professional & Advisory Services",
        buyerMix: { HOUSEHOLD: 0.06, GOVERNMENT: 0.14, CORPORATE: 0.80 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'facilities_and_logistics',
        label: "Facilities & Logistics Services",
        buyerMix: { HOUSEHOLD: 0.04, GOVERNMENT: 0.12, CORPORATE: 0.84 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'repair_and_maintenance',
        label: "Repair & Maintenance",
        buyerMix: { HOUSEHOLD: 0.50, GOVERNMENT: 0.08, CORPORATE: 0.42 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  RealEstateConstruction: {
    sector: 'Industrials',
    smeShareOfActivity: 0.78,
    recipeInputs: { professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
    subUnits: [
      {
        // SVC: the largest single line in household consumption in every developed economy, and
        // the model had no market for it — rent was inside a consumption budget that only ever
        // bid for goods.
        unitId: 'housing_rental_services',
        label: "Housing & Rental Services",
        buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0.04, CORPORATE: 0.06 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'residential_construction',
        label: "Residential Construction",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0.05, CORPORATE: 0.05 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_construction',
        label: "Commercial & Infrastructure Construction",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.45, CORPORATE: 0.55 },
        deliveryMode: 'IN_PLACE',
        capexBasketWeight: 0.25,
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
// SVC: EVERY industry with a recipe, not the seven the legacy table happened to list. The
// original order is preserved at the head so the existing industries keep their iteration
// position; the rest follow in registry order. An industry whose recipe was invisible here
// bought none of its inputs in the auction — which is what services were, for all fourteen.
const RECIPE_INDUSTRY_ORDER: Industry[] = [
  'TechHardwareSemis', 'SoftwareDigitalServices', 'AutomotiveTransport', 'AerospaceDefense',
  'IndustrialsMachinery', 'ConsumerStaples', 'ConsumerDiscretionaryRetail',
  ...(Object.keys(INDUSTRY_REGISTRY) as Industry[]).filter(ind =>
    INDUSTRY_REGISTRY[ind].recipeInputs
    && !['TechHardwareSemis', 'SoftwareDigitalServices', 'AutomotiveTransport', 'AerospaceDefense',
      'IndustrialsMachinery', 'ConsumerStaples', 'ConsumerDiscretionaryRetail'].includes(ind)),
];
export const VIEW_CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> =
  Object.fromEntries(RECIPE_INDUSTRY_ORDER.map(ind => [ind, { ...INDUSTRY_REGISTRY[ind].recipeInputs }]));

const CAPEX_ORDER = ['heavy_equipment', 'industrial_automation', 'commercial_construction', 'enterprise_software', 'commercial_fleet'];
export const VIEW_CAPEX_SUPPLIER_WEIGHTS: Record<string, number> =
  Object.fromEntries(CAPEX_ORDER.map(id => [id, byId.get(id)!.capexBasketWeight!]));


const TIER_ORDER = ['refined_products', 'household_chemicals', 'food_beverage', 'household_essentials', 'pharmaceuticals', 'agricultural_commodities', 'luxury_goods'];
export const VIEW_CATEGORY_PRICE_TIER: Record<string, HouseholdPriceTier> = Object.fromEntries([
  ...TIER_ORDER.map(id => [id, byId.get(id)!.householdPriceTier!] as const),
  // SVC: and every other sub-unit that declares a tier — rent and health are STAPLE, which is
  // what makes household demand for them inelastic when supply tightens.
  ...allSubUnits.filter(su => su.householdPriceTier && !TIER_ORDER.includes(su.unitId))
    .map(su => [su.unitId, su.householdPriceTier!] as const),
]);

/** Legacy commodity order preserved (working-table calibration iterates it). */
const LINKAGE_ORDER = ['CRUDE_OIL', 'HEAVY_CRUDE_OIL', 'NATURAL_GAS', 'GOLD', 'SILVER', 'COPPER', 'WHEAT', 'CORN', 'SOYBEANS'];
export const VIEW_BASE_COMMODITY_CATEGORY_LINKAGE: Record<string, { subUnitId: string; intensityShare: number }> = (() => {
  const flat = new Map<string, { subUnitId: string; intensityShare: number }>();
  allSubUnits.forEach(su => (su.linkedCommodities ?? []).forEach(l =>
    flat.set(l.commodityId, { subUnitId: su.unitId, intensityShare: l.intensityShare })));
  return Object.fromEntries(LINKAGE_ORDER.map(c => [c, flat.get(c)!]));
})();

/** BP1b: every sub-unit a sector's companies can produce, with its parent industry, in registry
 * order. The generator deals lines from this, weighted by each region's own seeded demand. */
export function subUnitsByProducingSector(): Record<ProducingSector, { industry: Industry; su: SubUnitSpec }[]> {
  const out: Record<ProducingSector, { industry: Industry; su: SubUnitSpec }[]> = {
    Tech: [], Energy: [], Industrials: [], Consumer: [],
  };
  (Object.entries(INDUSTRY_REGISTRY) as [Industry, IndustrySpec][]).forEach(([industry, spec]) => {
    spec.subUnits.forEach(su => out[spec.sector].push({ industry, su }));
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// IND1 — what a good physically is, on the holding side.

/**
 * What a year of warehouse costs per tonne held: rent, handling, insurance. The one stated
 * primitive here — a real-world cost, not a real-world outcome (rule 4) — and everything below
 * derives from it plus the physics each registry entry already carries.
 */
export const WAREHOUSE_USD_PER_TONNE_YEAR = 40;

/**
 * Can this good be held at all? Only a separable physical object can sit in a warehouse. Software
 * and media are copied on demand; a building is made where it stands. Neither has an inventory to
 * carry, and both were carrying one — measured: enterprise software held 159 units worth 5.9M,
 * spoiling like steel (§7.50).
 */
export function isStorable(unitId: string): boolean {
  return (byId.get(unitId)?.deliveryMode ?? 'PHYSICAL') === 'PHYSICAL';
}

/**
 * What holding a dollar of this good costs for a year, as a share of its value. Two real physical
 * terms, neither of them a chosen number:
 *
 *   STORAGE — a warehouse charges by the TONNE, so the cost per DOLLAR is the tonne price of
 *   space divided by the good's value density. A dollar of gravel occupies hundreds of times the
 *   space of a dollar of semiconductors, and now costs hundreds of times as much to hold. This is
 *   why bulk goods move to the buyer and dense goods sit in inventory.
 *
 *   SPOILAGE — a good with a shelf life is walking to zero at 1/shelfLife per week whether anyone
 *   buys it or not. That is what makes fresh food impossible to stockpile and is the physical
 *   reason those supply chains run to order.
 *
 * The flat 0.02 this replaces charged a semiconductor fab and a dairy the same rate to hold
 * their output.
 */
export function annualCarryingCostRateOf(unitId: string): number {
  const su = byId.get(unitId);
  if (!su || su.deliveryMode !== 'PHYSICAL') return 0;
  const density = su.baselineValueDensityUsdPerTonne;
  const storage = density && density > 0 ? WAREHOUSE_USD_PER_TONNE_YEAR / density : 0;
  const spoilage = su.shelfLifeWeeks && su.shelfLifeWeeks > 0 ? 52 / su.shelfLifeWeeks : 0;
  return storage + spoilage;
}

/**
 * What a purchase of this good IS to the firm buying it — the question the model never asked.
 *
 * Every corporate purchase used to be written as an input LOT, but only recipe inputs are ever
 * drawn down (stage 08 consumes what an industry's recipe names). Capital goods and general
 * operating purchases therefore accumulated forever: ~12k dead lots a week, 1.05M by week 120,
 * counted into the buyer's inventory line and consumed by nobody (§6, §7.81). The fix is not to
 * expire them; it is to route each purchase to what it physically is.
 *
 *   RECIPE_INPUT  — material that will be consumed making something. Held as a lot, drawn FIFO.
 *   CAPITAL_GOOD  — a machine, a building, a fleet, a system. Not inventory: it becomes PP&E on
 *                   delivery and depreciates over its life.
 *   OPERATING     — everything else a business buys and uses. Expensed; its cost already lives
 *                   in the operating margin and its cash in settled purchases.
 */
export type PurchaseKind = 'RECIPE_INPUT' | 'CAPITAL_GOOD' | 'OPERATING';

const recipeInputIds = new Set<string>(
  Object.values(INDUSTRY_REGISTRY).flatMap(spec => Object.keys(spec.recipeInputs ?? {}))
);

export function purchaseKindOf(unitId: string): PurchaseKind {
  if (recipeInputIds.has(unitId)) return 'RECIPE_INPUT';
  if (byId.get(unitId)?.capexBasketWeight !== undefined) return 'CAPITAL_GOOD';
  return 'OPERATING';
}

// ============================== SEG — the SME tier ==============================

/**
 * Every industry that has an SME tier: all of them, in registry order. This is the SEG tier's
 * whole roster — there is no second list to maintain, so an industry added to the registry has
 * a pool in every region the moment it exists (rule 17). It replaces `Industry`, five
 * hardcoded buckets that covered 7 of 36 sub-units and could never grow with the registry.
 */
export const SME_POOL_INDUSTRIES: Industry[] = Object.keys(INDUSTRY_REGISTRY) as Industry[];

/** The sub-units an SME pool in this industry produces — the same list its named firms produce. */
export function smePoolSubUnits(industry: Industry): SubUnitSpec[] {
  return INDUSTRY_REGISTRY[industry].subUnits;
}

/** What an SME pool in this industry consumes per dollar of output — its industry's own recipe. */
export function smePoolRecipeInputs(industry: Industry): Record<string, number> {
  return INDUSTRY_REGISTRY[industry].recipeInputs ?? {};
}

/** The commodities this industry's output is linked to, from its sub-units' own linkages — so a
 *  pool's commodity supply is derived from what it actually produces rather than from a
 *  hardcoded list bolted onto one bucket. */
export function smePoolLinkedCommodities(industry: Industry): { commodityId: string; intensityShare: number }[] {
  return INDUSTRY_REGISTRY[industry].subUnits.flatMap((su) => su.linkedCommodities ?? []);
}

/** Which industry produces a sub-unit — the parent lookup the SME tier needs to know whose pool
 *  offers into a given auction. Built once from the registry, so it can never disagree with it. */
const INDUSTRY_BY_SUBUNIT: Map<string, Industry> = (() => {
  const m = new Map<string, Industry>();
  (Object.entries(INDUSTRY_REGISTRY) as [Industry, IndustrySpec][])
    .forEach(([industry, spec]) => spec.subUnits.forEach((su) => m.set(su.unitId, industry)));
  return m;
})();

export function industryOfSubUnit(unitId: string): Industry | undefined {
  return INDUSTRY_BY_SUBUNIT.get(unitId);
}
