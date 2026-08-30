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
 * Import-light by design so nothing here can cycle: type-only imports, plus `defect`, which is
 * a bare throw with no imports of its own.
 */

import type { Industry, BuyerType, HouseholdPriceTier } from './industry';
import type { DeliveryMode } from './goods-physical';
import { defect } from './defect';

/** The producing sector whose companies carry an industry's lines — a GICS-style taxonomy
 * primitive. Financials and Banks produce no goods and now carry NO product line at all
 * (IND-R2): a line is what registers a supplier in stage 05's index, so the proxy line they used
 * to carry put 40 financial firms into the enterprise-software market. Their revenue comes from
 * their stage-08 profiles. */
export type ProducingSector = 'Tech' | 'Energy' | 'Industrials' | 'Consumer';
/**
 * IND2 — how a cleared transaction becomes REVENUE on the seller's books. Stage 05 keeps clearing
 * the transaction; this decides what the seller may recognise from it, and when.
 *
 * - `UNIT_SALE` — recognised on delivery, and what is not sold this week is not revenue this
 *   week. Every good in the model behaved this way, whatever it was.
 * - `SUBSCRIPTION` — the sale buys a CONTRACT, not a unit. It keeps paying until it churns, so
 *   the seller carries a recurring base (`recurringRevenueBaseUSD`) that survives a quarter with
 *   no new sales, and a week it cannot ship does not cost it the contract. This is the whole
 *   difference between a software company and a steel mill, and the model could not express it.
 *
 * PROJECT (booked to backlog, recognised as delivered) and ROYALTY (a share of someone else's
 * volume) need a backlog STOCK to live on, which is IND10/IND11's; they land there rather than
 * here so the stock has one owner.
 */
export type RevenueMechanism = 'UNIT_SALE' | 'SUBSCRIPTION';

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
  /**
   * IND-R3 — how much of this good a person consumes in a year, RELATIVE to every other good.
   *
   * There used to be one number for all 37 (`HOUSEHOLD_PER_CAPITA_UNIT_INTENSITY = 0.02`), so a
   * household consumed as many units of aerospace as of food, every baseline price landed at the
   * same order of magnitude, and a "unit" was an abstract bundle rather than a thing. The CPI
   * basket is built on these weights, so the price index inherited it.
   *
   * The absolute scale is a free choice — it only sets what one unit means — so what is stated
   * here is RELATIVE frequency, which is a real technological and behavioural primitive (rule 4
   * allows the primitive; it forbids the equilibrium). Food is bought constantly, a vehicle
   * rarely, an airliner almost never. Absent = the corporate-only goods below, which no household
   * buys directly.
   */
  householdUnitsPerCapitaAnnual?: number;
  /** IND-R3, the corporate side: units a firm consumes a year, relative across goods. */
  corporateUnitsPerFirmAnnual?: number;
  /**
   * CHAIN-D — this product's BILL OF MATERIALS: what one dollar of it consumes, by sub-unit.
   *
   * **It lives on the PRODUCT, not the industry, and that is the whole point of this field.**
   * It used to sit on `IndustrySpec`, which meant crude extraction, refining and power
   * generation shared one recipe because they share a sector. The only thing you can honestly
   * say about three unrelated processes at once is what they have in COMMON — so every
   * industry recipe collapsed to the same overhead line (professional services 0.05, facilities
   * 0.04, repair 0.02, identical in 13 of 16) with almost no materials in it. **The shallowness
   * §7.111 measured was a consequence of the granularity, not of the numbers:** at industry
   * level a real BOM is unwriteable. Refining buys crude, a fab buys process chemicals, a
   * building buys steel and cement, and none of those statements is about a sector.
   *
   * Each coefficient is a TECHNOLOGICAL primitive — what the process physically takes — in the
   * same sense as IND5's energy intensities (rule 4 allows the primitive; it forbids the
   * outcome). **The aggregate intermediate share is therefore an OUTCOME of these, never a
   * target to hit**, and no coefficient here was chosen to move it.
   *
   * A recipe may not name its own product: a self-loop would have a firm bidding against
   * itself for its own output. Asserted at load (see below).
   */
  recipeInputs?: Record<string, number>;
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
  /**
   * IND4 — how an industry FUNDS itself and what it pays out. Two structural facts, both
   * primitives in rule 4's sense (a relationship between an industry's assets and its balance
   * sheet, not any real firm's observed capital structure).
   *
   * `fixedRateTilt` multiplies the rating-based fixed/floating split: long-lived assets are
   * funded long (a grid, a network, a building), asset-light and fast-obsolescing ones borrow
   * short and floating. Rating still decides the base — an issuer's access to the bond market is
   * its credit quality's — and this tilts it by what the money is buying.
   *
   * `maxPayoutRatio` is the most of its earnings a board in this industry will distribute. It
   * was one number, 0.6, for every firm in the model: a mature network operator and a growth
   * software firm had identical payout discipline, which is the single clearest thing that is
   * NOT alike across industries.
   *
   * NOT here, deliberately: `cyclicalityBeta`, which §5-IND4 originally listed. Beta is a
   * MEASUREMENT now (§7.134) — stating one per industry would restore exactly what IDX deleted.
   */
  financingProfile: { fixedRateTilt: number; maxPayoutRatio: number };
  subUnits: SubUnitSpec[];
}

export const INDUSTRY_REGISTRY: Record<Industry, IndustrySpec> = {
  Energy: {
    sector: 'Energy',
    smeShareOfActivity: 0.15,
    financingProfile: { fixedRateTilt: 1.15, maxPayoutRatio: 0.7 },
    subUnits: [
      {
        unitId: 'upstream_extraction',
        corporateUnitsPerFirmAnnual: 40.0,
        recipeInputs: { refined_products: 0.04, industrial_chemicals: 0.02, specialty_metals: 0.02, electricity: 0.03, professional_services: 0.04, facilities_and_logistics: 0.05, repair_and_maintenance: 0.06 },
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
        householdUnitsPerCapitaAnnual: 6.0, corporateUnitsPerFirmAnnual: 60.0,
        recipeInputs: { upstream_extraction: 0.55, industrial_chemicals: 0.02, electricity: 0.03, professional_services: 0.02, facilities_and_logistics: 0.04, repair_and_maintenance: 0.04 },
        label: "Refined Products",
        buyerMix: { HOUSEHOLD: 0.35, GOVERNMENT: 0.1, CORPORATE: 0.55 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 800,
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        // IND5. Electricity is the one input every industry buys and the model had none, which
        // is part of why its recipes are so thin (§7.111: mean intensity 0.138 against a real
        // ~0.5, and that thinness is what puts every firm on the cost-of-capital line).
        //
        // Its physics do the work here rather than a table: `IN_PLACE` means it is delivered
        // where it is consumed, so it carries no freight and cannot cross a border — which is
        // what a grid is — and `isStorable` reads that mode, so electricity is the model's one
        // genuinely NON-STORABLE good. It must be produced the week it is used. That falls out
        // of the delivery mode; nothing states it.
        //
        // Generated at the margin from gas, so its price moves with the fuel — the real channel
        // by which an energy shock reaches every other industry's cost base.
        unitId: 'electricity',
        householdUnitsPerCapitaAnnual: 20.0, corporateUnitsPerFirmAnnual: 120.0,
        recipeInputs: { upstream_extraction: 0.22, refined_products: 0.06, specialty_metals: 0.01, professional_services: 0.02, facilities_and_logistics: 0.02, repair_and_maintenance: 0.06 },
        label: "Electricity",
        buyerMix: { HOUSEHOLD: 0.30, GOVERNMENT: 0.05, CORPORATE: 0.65 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STAPLE',
        linkedCommodities: [{ commodityId: 'NATURAL_GAS', intensityShare: 0.45 }],
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MaterialsChemicals: {
    sector: 'Industrials',
    smeShareOfActivity: 0.25,
    financingProfile: { fixedRateTilt: 1.1, maxPayoutRatio: 0.55 },
    subUnits: [
      {
        unitId: 'industrial_chemicals',
        corporateUnitsPerFirmAnnual: 45.0,
        recipeInputs: { refined_products: 0.30, upstream_extraction: 0.08, specialty_metals: 0.01, electricity: 0.09, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.05 },
        label: "Industrial Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0, CORPORATE: 1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 1_500,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'household_chemicals',
        householdUnitsPerCapitaAnnual: 8.0, corporateUnitsPerFirmAnnual: 4.0,
        recipeInputs: { industrial_chemicals: 0.28, electricity: 0.05, professional_services: 0.04, facilities_and_logistics: 0.06, repair_and_maintenance: 0.03 },
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
        corporateUnitsPerFirmAnnual: 12.0,
        recipeInputs: { industrial_chemicals: 0.25, upstream_extraction: 0.06, electricity: 0.08, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.04 },
        label: "Agricultural Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 700,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'specialty_metals',
        corporateUnitsPerFirmAnnual: 35.0,
        recipeInputs: { upstream_extraction: 0.30, industrial_chemicals: 0.04, electricity: 0.12, professional_services: 0.02, facilities_and_logistics: 0.05, repair_and_maintenance: 0.05 },
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
        householdUnitsPerCapitaAnnual: 4.0, corporateUnitsPerFirmAnnual: 30.0,
        recipeInputs: { agricultural_chemicals: 0.14, refined_products: 0.05, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.05, repair_and_maintenance: 0.04 },
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
    financingProfile: { fixedRateTilt: 1.05, maxPayoutRatio: 0.5 },
    subUnits: [
      {
        unitId: 'heavy_equipment',
        corporateUnitsPerFirmAnnual: 1.2,
        recipeInputs: { specialty_metals: 0.26, industrial_automation: 0.06, semiconductors: 0.03, industrial_chemicals: 0.03, electricity: 0.03, professional_services: 0.04, facilities_and_logistics: 0.04, repair_and_maintenance: 0.03 },
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
        corporateUnitsPerFirmAnnual: 1.5,
        recipeInputs: { semiconductors: 0.14, specialty_metals: 0.10, enterprise_software: 0.05, industrial_chemicals: 0.02, electricity: 0.02, professional_services: 0.06, facilities_and_logistics: 0.03, repair_and_maintenance: 0.02 },
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
    financingProfile: { fixedRateTilt: 1.1, maxPayoutRatio: 0.45 },
    subUnits: [
      {
        unitId: 'defense_systems',
        corporateUnitsPerFirmAnnual: 0.15,
        recipeInputs: { specialty_metals: 0.14, semiconductors: 0.10, industrial_automation: 0.05, enterprise_software: 0.04, industrial_chemicals: 0.03, electricity: 0.02, professional_services: 0.08, facilities_and_logistics: 0.03, repair_and_maintenance: 0.03 },
        label: "Defense Systems",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.9, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_aerospace',
        corporateUnitsPerFirmAnnual: 0.1,
        recipeInputs: { specialty_metals: 0.20, semiconductors: 0.07, industrial_automation: 0.04, industrial_chemicals: 0.04, electricity: 0.02, professional_services: 0.07, facilities_and_logistics: 0.04, repair_and_maintenance: 0.03 },
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
    financingProfile: { fixedRateTilt: 1.05, maxPayoutRatio: 0.45 },
    subUnits: [
      {
        unitId: 'passenger_vehicles',
        householdUnitsPerCapitaAnnual: 0.08, corporateUnitsPerFirmAnnual: 0.8,
        recipeInputs: { specialty_metals: 0.22, semiconductors: 0.08, industrial_chemicals: 0.07, consumer_devices: 0.03, industrial_automation: 0.03, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
        label: "Passenger Vehicles",
        buyerMix: { HOUSEHOLD: 0.8, GOVERNMENT: 0.05, CORPORATE: 0.15 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 25_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_fleet',
        corporateUnitsPerFirmAnnual: 0.6,
        recipeInputs: { specialty_metals: 0.24, semiconductors: 0.06, industrial_chemicals: 0.06, industrial_automation: 0.03, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
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
    financingProfile: { fixedRateTilt: 0.9, maxPayoutRatio: 0.3 },
    subUnits: [
      {
        unitId: 'semiconductors',
        corporateUnitsPerFirmAnnual: 20.0,
        recipeInputs: { industrial_chemicals: 0.12, specialty_metals: 0.05, industrial_automation: 0.04, enterprise_software: 0.03, electricity: 0.06, professional_services: 0.04, facilities_and_logistics: 0.03, repair_and_maintenance: 0.05 },
        label: "Semiconductors",
        buyerMix: { HOUSEHOLD: 0.1, GOVERNMENT: 0.05, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 500_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_devices',
        householdUnitsPerCapitaAnnual: 0.6, corporateUnitsPerFirmAnnual: 3.0,
        recipeInputs: { semiconductors: 0.28, specialty_metals: 0.06, industrial_chemicals: 0.04, consumer_software: 0.02, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.02 },
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
    financingProfile: { fixedRateTilt: 0.8, maxPayoutRatio: 0.2 },
    subUnits: [
      {
        unitId: 'enterprise_software',
        corporateUnitsPerFirmAnnual: 8.0,
        recipeInputs: { network_infrastructure: 0.05, semiconductors: 0.01, electricity: 0.02, professional_services: 0.08, facilities_and_logistics: 0.02, repair_and_maintenance: 0.01 },
        label: "Enterprise Software & Cloud",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.1, CORPORATE: 0.9 },
        deliveryMode: 'DIGITAL',
        capexBasketWeight: 0.15,
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
      {
        unitId: 'consumer_software',
        householdUnitsPerCapitaAnnual: 3.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { network_infrastructure: 0.06, media_content: 0.04, electricity: 0.02, professional_services: 0.05, facilities_and_logistics: 0.01, repair_and_maintenance: 0.01 },
        label: "Consumer Software & Subscriptions",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'DIGITAL',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
    ],
  },
  Telecommunications: {
    sector: 'Tech',
    smeShareOfActivity: 0.1,
    financingProfile: { fixedRateTilt: 1.2, maxPayoutRatio: 0.75 },
    subUnits: [
      {
        unitId: 'network_infrastructure',
        householdUnitsPerCapitaAnnual: 2.0, corporateUnitsPerFirmAnnual: 6.0,
        recipeInputs: { consumer_devices: 0.08, semiconductors: 0.05, enterprise_software: 0.04, specialty_metals: 0.03, electricity: 0.06, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.07 },
        label: "Network Infrastructure",
        buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.1, CORPORATE: 0.35 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 60_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
    ],
  },
  HealthcarePharma: {
    sector: 'Consumer',
    smeShareOfActivity: 0.38,
    financingProfile: { fixedRateTilt: 1.0, maxPayoutRatio: 0.45 },
    subUnits: [
      {
        unitId: 'health_services',
        householdUnitsPerCapitaAnnual: 6.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { pharmaceuticals: 0.14, medtech_devices: 0.08, household_essentials: 0.03, electricity: 0.02, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
        label: "Health Services",
        buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.43, CORPORATE: 0.02 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'pharmaceuticals',
        householdUnitsPerCapitaAnnual: 9.0, corporateUnitsPerFirmAnnual: 0.5,
        recipeInputs: { industrial_chemicals: 0.16, agricultural_chemicals: 0.02, industrial_automation: 0.02, electricity: 0.03, professional_services: 0.07, facilities_and_logistics: 0.04, repair_and_maintenance: 0.03 },
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
        householdUnitsPerCapitaAnnual: 0.4, corporateUnitsPerFirmAnnual: 0.8,
        recipeInputs: { semiconductors: 0.09, specialty_metals: 0.08, industrial_chemicals: 0.05, industrial_automation: 0.03, electricity: 0.02, professional_services: 0.06, facilities_and_logistics: 0.04, repair_and_maintenance: 0.02 },
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
    financingProfile: { fixedRateTilt: 1.1, maxPayoutRatio: 0.65 },
    subUnits: [
      {
        unitId: 'food_beverage',
        householdUnitsPerCapitaAnnual: 120.0, corporateUnitsPerFirmAnnual: 8.0,
        recipeInputs: { agricultural_commodities: 0.34, industrial_chemicals: 0.03, household_chemicals: 0.02, specialty_metals: 0.02, electricity: 0.03, professional_services: 0.02, facilities_and_logistics: 0.06, repair_and_maintenance: 0.03 },
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
        householdUnitsPerCapitaAnnual: 40.0, corporateUnitsPerFirmAnnual: 6.0,
        recipeInputs: { household_chemicals: 0.18, industrial_chemicals: 0.08, agricultural_commodities: 0.05, specialty_metals: 0.02, electricity: 0.03, professional_services: 0.02, facilities_and_logistics: 0.06, repair_and_maintenance: 0.02 },
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
    financingProfile: { fixedRateTilt: 0.95, maxPayoutRatio: 0.4 },
    subUnits: [
      {
        unitId: 'apparel_retail',
        householdUnitsPerCapitaAnnual: 10.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { household_essentials: 0.10, agricultural_commodities: 0.06, luxury_goods: 0.04, industrial_chemicals: 0.04, housing_rental_services: 0.05, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.09, repair_and_maintenance: 0.01 },
        label: "Apparel & General Retail",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 20_000,
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'home_furnishings',
        householdUnitsPerCapitaAnnual: 1.5, corporateUnitsPerFirmAnnual: 1.5,
        recipeInputs: { specialty_metals: 0.08, industrial_chemicals: 0.07, agricultural_commodities: 0.04, consumer_devices: 0.04, housing_rental_services: 0.04, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.08, repair_and_maintenance: 0.02 },
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
    financingProfile: { fixedRateTilt: 0.95, maxPayoutRatio: 0.5 },
    subUnits: [
      {
        unitId: 'luxury_goods',
        householdUnitsPerCapitaAnnual: 0.5, corporateUnitsPerFirmAnnual: 0.2,
        recipeInputs: { specialty_metals: 0.16, apparel_retail: 0.04, household_chemicals: 0.02, housing_rental_services: 0.03, electricity: 0.01, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.01 },
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
    financingProfile: { fixedRateTilt: 0.85, maxPayoutRatio: 0.3 },
    subUnits: [
      {
        unitId: 'media_content',
        householdUnitsPerCapitaAnnual: 15.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { network_infrastructure: 0.05, consumer_software: 0.03, electricity: 0.02, professional_services: 0.09, facilities_and_logistics: 0.02, repair_and_maintenance: 0.01 },
        label: "Media & Content",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0, CORPORATE: 0.15 },
        deliveryMode: 'DIGITAL',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
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
    financingProfile: { fixedRateTilt: 0.9, maxPayoutRatio: 0.4 },
    subUnits: [
      {
        unitId: 'food_service',
        householdUnitsPerCapitaAnnual: 30.0, corporateUnitsPerFirmAnnual: 3.0,
        recipeInputs: { food_beverage: 0.30, household_essentials: 0.03, housing_rental_services: 0.06, electricity: 0.03, professional_services: 0.01, facilities_and_logistics: 0.03, repair_and_maintenance: 0.02 },
        label: "Food Service & Hospitality",
        buyerMix: { HOUSEHOLD: 0.92, GOVERNMENT: 0.02, CORPORATE: 0.06 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STANDARD',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'personal_care_services',
        householdUnitsPerCapitaAnnual: 8.0, corporateUnitsPerFirmAnnual: 0.5,
        recipeInputs: { household_chemicals: 0.06, household_essentials: 0.03, housing_rental_services: 0.06, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.02, repair_and_maintenance: 0.01 },
        label: "Personal & Household Services",
        buyerMix: { HOUSEHOLD: 0.96, GOVERNMENT: 0.02, CORPORATE: 0.02 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STANDARD',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'education_services',
        householdUnitsPerCapitaAnnual: 3.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { housing_rental_services: 0.05, enterprise_software: 0.03, consumer_devices: 0.02, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.02, repair_and_maintenance: 0.02 },
        label: "Education & Training",
        buyerMix: { HOUSEHOLD: 0.42, GOVERNMENT: 0.55, CORPORATE: 0.03 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
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
    financingProfile: { fixedRateTilt: 0.85, maxPayoutRatio: 0.45 },
    subUnits: [
      {
        unitId: 'professional_services',
        householdUnitsPerCapitaAnnual: 1.0, corporateUnitsPerFirmAnnual: 14.0,
        recipeInputs: { enterprise_software: 0.05, housing_rental_services: 0.05, consumer_devices: 0.02, network_infrastructure: 0.02, electricity: 0.01, facilities_and_logistics: 0.02, repair_and_maintenance: 0.01 },
        label: "Professional & Advisory Services",
        buyerMix: { HOUSEHOLD: 0.06, GOVERNMENT: 0.14, CORPORATE: 0.80 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'facilities_and_logistics',
        householdUnitsPerCapitaAnnual: 2.0, corporateUnitsPerFirmAnnual: 18.0,
        recipeInputs: { refined_products: 0.14, commercial_fleet: 0.05, housing_rental_services: 0.05, enterprise_software: 0.02, electricity: 0.03, professional_services: 0.02, repair_and_maintenance: 0.05 },
        label: "Facilities & Logistics Services",
        buyerMix: { HOUSEHOLD: 0.04, GOVERNMENT: 0.12, CORPORATE: 0.84 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
      {
        unitId: 'repair_and_maintenance',
        householdUnitsPerCapitaAnnual: 2.0, corporateUnitsPerFirmAnnual: 10.0,
        recipeInputs: { specialty_metals: 0.09, heavy_equipment: 0.04, industrial_chemicals: 0.04, refined_products: 0.04, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.04 },
        label: "Repair & Maintenance",
        buyerMix: { HOUSEHOLD: 0.50, GOVERNMENT: 0.08, CORPORATE: 0.42 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
    ],
  },
  RealEstateConstruction: {
    sector: 'Industrials',
    smeShareOfActivity: 0.78,
    financingProfile: { fixedRateTilt: 1.2, maxPayoutRatio: 0.75 },
    subUnits: [
      {
        // SVC: the largest single line in household consumption in every developed economy, and
        // the model had no market for it — rent was inside a consumption budget that only ever
        // bid for goods.
        unitId: 'housing_rental_services',
        householdUnitsPerCapitaAnnual: 12.0, corporateUnitsPerFirmAnnual: 4.0,
        recipeInputs: { repair_and_maintenance: 0.10, household_chemicals: 0.01, electricity: 0.05, professional_services: 0.03, facilities_and_logistics: 0.02 },
        label: "Housing & Rental Services",
        buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0.04, CORPORATE: 0.06 },
        deliveryMode: 'IN_PLACE',
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
      {
        unitId: 'residential_construction',
        householdUnitsPerCapitaAnnual: 0.05, corporateUnitsPerFirmAnnual: 0.4,
        recipeInputs: { specialty_metals: 0.16, industrial_chemicals: 0.10, home_furnishings: 0.05, heavy_equipment: 0.04, refined_products: 0.03, electricity: 0.02, professional_services: 0.06, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
        label: "Residential Construction",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0.05, CORPORATE: 0.05 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_construction',
        corporateUnitsPerFirmAnnual: 0.5,
        recipeInputs: { specialty_metals: 0.19, industrial_chemicals: 0.10, heavy_equipment: 0.05, industrial_automation: 0.03, refined_products: 0.03, electricity: 0.02, professional_services: 0.07, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
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

/**
 * CHAIN-D — every product's recipe, keyed by the DEMANDING SUB-UNIT.
 *
 * It was keyed by demanding INDUSTRY, which forced two approximations that are now gone: a
 * recipe had to describe a whole sector's products at once, and 04-input-output had to fan one
 * industry-wide cost pressure and fulfilment ratio back onto every sub-unit of that industry
 * regardless of which of them actually needed the scarce input. The key here is the same key
 * `reg.categoryDemand` uses, so "category" now means the same thing on both sides.
 */
export const VIEW_CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> =
  Object.fromEntries(allSubUnits.filter(su => su.recipeInputs).map(su => [su.unitId, { ...su.recipeInputs }]));

/**
 * A recipe may not name its own product. A self-loop would put a firm on both sides of its own
 * auction, and at industry granularity it was unavoidable — refining consumes crude and both are
 * Energy — which is a second reason the recipes had to stay shallow. GUARD's discipline: fail at
 * load, loudly, rather than produce a firm bidding against itself.
 */
allSubUnits.forEach((su) => {
  if (su.recipeInputs?.[su.unitId] !== undefined) defect(`recipe for ${su.unitId} names itself as an input`);
  Object.keys(su.recipeInputs ?? {}).forEach((input) => {
    if (!byId.has(input)) defect(`recipe for ${su.unitId} names unknown input ${input}`);
  });
});

/**
 * IND-R4/§7.122 step 4 — WHAT A FIRM BUYS WHEN IT SELLS NO PRODUCT.
 *
 * A recipe is a property of a PRODUCT (§7.117), and IND-R2 correctly gave financial firms no
 * product line — a bank does not SELL enterprise software. But those are the same field, so a
 * firm that sells nothing also BOUGHT nothing: a bank purchased none of the professional
 * services, facilities, software or power it obviously consumes, and its operating cost had
 * nowhere to come from except a stated margin.
 *
 * So a firm with no output declares its input basket against its own REVENUE instead, keyed by
 * the profile that describes what kind of firm it is. Same primitive as a BOM — dollars of input
 * per dollar of revenue — and the same rule-17 shape: data in the registry, behaviour in the
 * profile. A bank is staff, premises and technology; an asset manager is staff and technology
 * and almost nothing else, which is why its cost base is the lightest here.
 */
export const PROFILE_INPUT_BASKET: Record<string, Record<string, number>> = {
  BANK: { professional_services: 0.09, enterprise_software: 0.07, facilities_and_logistics: 0.04, repair_and_maintenance: 0.01, electricity: 0.01 },
  INSURER: { professional_services: 0.10, enterprise_software: 0.05, facilities_and_logistics: 0.03, repair_and_maintenance: 0.01, electricity: 0.01 },
  ASSET_MANAGER: { professional_services: 0.08, enterprise_software: 0.06, facilities_and_logistics: 0.02, electricity: 0.01 },
};

/**
 * The one accessor for "what does this firm consume per dollar it earns" — its products' BOMs
 * if it makes anything, its profile's basket if it does not. Stage 05 bids from it, stage 08
 * charges it, and `shared-helpers` builds supply relationships from it, so a firm cannot be a
 * buyer in one place and not in another (rule 3).
 */
export function firmInputIntensities(
  productLines: { subUnitId: string; revenueShare?: number }[] | undefined,
  profileKey: string
): Record<string, number> {
  const lines = productLines ?? [];
  if (lines.length > 0) {
    const out: Record<string, number> = {};
    lines.forEach((l) => {
      Object.entries(byId.get(l.subUnitId)?.recipeInputs ?? {}).forEach(([input, intensity]) => {
        out[input] = (out[input] ?? 0) + (l.revenueShare ?? 1) * intensity;
      });
    });
    return out;
  }
  return { ...(PROFILE_INPUT_BASKET[profileKey] ?? {}) };
}

/**
 * CHAIN-E — the input-output structure the BOMs now describe, and the two things it derives.
 *
 * `recipeInputs` is a real matrix once every product carries one (§7.117), and two numbers the
 * model previously STATED fall out of it directly. Both were stated beside it, and disagreed
 * with it, which is why §7.111 could measure three primitives "agreeing" at a level none of them
 * actually set.
 */

/** What one dollar of this product consumes in total — the product's own intermediate share. */
export function recipeIntensityOf(unitId: string): number {
  return Object.values(byId.get(unitId)?.recipeInputs ?? {}).reduce((a, b) => a + b, 0);
}

/**
 * Gross output per dollar of VALUE ADDED for this product, which is `1 / (1 - a)` and nothing
 * else: value added is what is left of a dollar of output after the inputs it consumed, so
 * `VA = X(1 - a)` and `X / VA = 1/(1 - a)`.
 *
 * This is the number `companyGenerator.ts` used to state as a seven-entry per-sector
 * `revPerEmployeeMultiple` table whose own comment said the multiples "follow the recipes, not
 * the other way round" while nothing derived them. Deriving it is what makes headcount equal
 * `value added / productivity` — so total employment is pinned to what the economy actually
 * produces, instead of to gross output through a multiple picked separately.
 */
export function grossOutputMultiplierOf(unitId: string): number {
  const a = recipeIntensityOf(unitId);
  if (!(a < 1)) defect(`recipe for ${unitId} consumes ${a.toFixed(3)} per dollar of output — a product cannot consume its own output entirely`);
  return 1 / (1 - a);
}

/**
 * The mean intensity of what an industry makes — the industry-level version of
 * `recipeIntensityOf`, for a producer known only by its industry (the private tier's seed, whose
 * firms have no product lines yet). Same derivation, one source, so a fix cannot land in one
 * generator and miss the other — which is exactly what happened between the two firm generators
 * before IND-R6 (§7.119).
 */
export function industryRecipeIntensity(industry: Industry): number {
  const subUnits = INDUSTRY_REGISTRY[industry].subUnits;
  if (subUnits.length === 0) return 0;
  return subUnits.reduce((a, su) => a + recipeIntensityOf(su.unitId), 0) / subUnits.length;
}

/**
 * Headcount for an SME pool: value added over output per worker — the SAME rule the two named
 * firm generators use. One function, three tiers, because a headcount rule stated in four places
 * is how they came to disagree (§7.119): the pool's was `totalEmployed x SME_TIER_EMPLOYMENT_SHARE`
 * in one file and `revenue / (named revenue-per-worker x (1 - discount))` in another, the second
 * silently overwriting the first after the carve.
 *
 * The SME productivity gap is not stated here and should not be: it is an OUTCOME of the pools'
 * own measured P&L (rule 13, and §5-SEG says so).
 */
export function smePoolEmployment(industry: Industry, annualRevenueUSD: number, productivityPerWorkerUSD: number): number {
  const valueAddedUSD = annualRevenueUSD * (1 - industryRecipeIntensity(industry));
  return Math.max(1, Math.round(valueAddedUSD / Math.max(1, productivityPerWorkerUSD)));
}

/**
 * CHAIN-E — total output implied by a vector of FINAL demand: the Leontief solve `X = F + A X`.
 *
 * The demand seed is `C + I + G` (see `macro/initialization.ts` and `03-category-demand.ts`),
 * which is a FINAL-demand identity: corporate demand there is investment only, and **intermediate
 * demand does not appear at all**. So gross output was pinned to final demand and the
 * gross-output-to-value-added ratio was ~1 by construction, whatever any recipe said — which is
 * why deepening every recipe 2.5x moved it by one part in a thousand (§7.117). Firms bid for
 * their real inputs in stage 05, but the demand LEVEL those bids landed in had no room for them.
 *
 * Solved by iteration rather than inversion: `A`'s column sums are each product's own intensity,
 * all well below 1, so the series converges geometrically and a fixed point exists. It is
 * asserted rather than assumed.
 */
export function totalOutputFromFinalDemand(finalDemandBySubUnit: Record<string, number>): Record<string, number> {
  const ids = allSubUnits.map(su => su.unitId);
  const X: Record<string, number> = {};
  ids.forEach(id => { X[id] = Math.max(0, finalDemandBySubUnit[id] ?? 0); });

  for (let iter = 0; iter < 200; iter++) {
    const next: Record<string, number> = {};
    ids.forEach(id => { next[id] = Math.max(0, finalDemandBySubUnit[id] ?? 0); });
    allSubUnits.forEach((producer) => {
      const output = X[producer.unitId];
      if (output <= 0) return;
      Object.entries(producer.recipeInputs ?? {}).forEach(([input, intensity]) => {
        next[input] += output * intensity;
      });
    });
    let maxRelChange = 0;
    ids.forEach(id => {
      const denom = Math.max(1, Math.abs(next[id]));
      maxRelChange = Math.max(maxRelChange, Math.abs(next[id] - X[id]) / denom);
      X[id] = next[id];
    });
    if (maxRelChange < 1e-10) return X;
  }
  defect('the input-output matrix did not converge — some product consumes more than a dollar per dollar of output');
}

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
/**
 * IND2 — the share of a firm's revenue that is CONTRACTED rather than sold by the unit,
 * weighted by its own product lines. A firm with no subscription line gets 0 and behaves exactly
 * as it always has.
 */
export function recurringRevenueShare(lines: { subUnitId: string; revenueShare: number }[]): number {
  let recurring = 0, total = 0;
  lines.forEach((l) => {
    const share = Math.max(0, l.revenueShare);
    total += share;
    if (byId.get(l.subUnitId)?.revenueMechanism === 'SUBSCRIPTION') recurring += share;
  });
  return total > 0 ? recurring / total : 0;
}

/**
 * IND2 — what share of a contracted base is lost per week. The one primitive the mechanism
 * needs: a subscription is defined by the fact that it ENDS unless renewed, and how fast it does
 * so is what separates a sticky enterprise contract from a month-to-month one. Stated once, at a
 * rate that implies a multi-year average contract life.
 */
export const SUBSCRIPTION_WEEKLY_CHURN = 0.006;

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
  allSubUnits.flatMap(su => Object.keys(su.recipeInputs ?? {}))
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

/**
 * What an SME pool consumes per dollar of output: the blend of its products' own recipes,
 * weighted by what the pool actually SELLS.
 *
 * CHAIN-D — a pool produces every sub-unit its industry does, and those now have genuinely
 * different bills of materials, so one industry recipe no longer describes the pool. The weights
 * are the pool's own measured per-sub-unit receipts (`salesDerivedAnnualRevenueUSDBySubUnit`),
 * which makes its input mix an OUTCOME of its real sales mix (rule 13); with no sales yet, at
 * the seed, it falls back to an equal split across what it can produce.
 */
export function smePoolRecipeInputs(
  industry: Industry,
  salesBySubUnitUSD?: Record<string, number>
): Record<string, number> {
  const subUnits = INDUSTRY_REGISTRY[industry].subUnits;
  const weights = subUnits.map(su => Math.max(0, salesBySubUnitUSD?.[su.unitId] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const blend: Record<string, number> = {};
  subUnits.forEach((su, i) => {
    const w = total > 0 ? weights[i] / total : 1 / subUnits.length;
    Object.entries(su.recipeInputs ?? {}).forEach(([input, intensity]) => {
      blend[input] = (blend[input] ?? 0) + w * intensity;
    });
  });
  return blend;
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


/** IND4 — the one accessor for an industry's funding and payout posture (rule 17). */
export function financingProfileOf(industry: Industry): { fixedRateTilt: number; maxPayoutRatio: number } {
  return INDUSTRY_REGISTRY[industry].financingProfile;
}
