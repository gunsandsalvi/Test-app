/**
 * THE industry registry (BP1a) — rule 15's data half.
 *
 * One entry here is a product line: its label, who buys it, what it physically is, how its
 * capex and commodity linkages run, and — from day one, at today's implicit values — the dials
 * IND will turn (storability, carrying cost, production lead time, revenue mechanism). Adding a
 * good to the economy is adding ONE entry; no stage is edited, because stages never switch on an
 * industry — they ask this registry (rule 15).
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
 * How a cleared transaction becomes REVENUE on the seller's books. Stage 05 keeps clearing
 * the transaction; this decides what the seller may recognise from it, and when.
 *
 * `UNIT_SALE` — recognised on delivery, and what is not sold this week is not revenue this
 *   week. Every good in the model behaved this way, whatever it was.
 * `SUBSCRIPTION` — the sale buys a CONTRACT, not a unit. It keeps paying until it churns, so
 *   the seller carries a recurring base (`recurringRevenueBaseLocal`) that survives a quarter with
 *   no new sales, and a week it cannot ship does not cost it the contract. This is the whole
 *   difference between a software company and a steel mill, and the model could not express it.
 *
 * PROJECT (booked to backlog, recognised as delivered) and ROYALTY (a share of someone else's
 * volume) need a backlog STOCK to live on, which is IND10/IND11's; they land there rather than
 * here so the stock has one owner.
 */
type RevenueMechanism = 'UNIT_SALE' | 'SUBSCRIPTION';

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
  /**
   * §3.26-f-iv-b — YEARS a unit of this capital good serves before it is fully worn (a building's
   * forty, a server's five): the life its vintages depreciate over. Capital-goods categories
   * only, and its presence is what makes a good a CAPITAL GOOD (`purchaseKindOf`). A
   * technological primitive like the commissioning lead below (rule 2). It replaces
   * `capexBasketWeight`, "the share of ANY buyer's capex basket" — one basket for every buyer,
   * a steel mill's and a software firm's alike; what each industry's capital is made of is the
   * industry's own (`IndustrySpec.capitalMix`).
   */
  usefulLifeYears?: number;
  /**
   * Weeks from a capital good ARRIVING to it entering service.
   *
   * A machine on the loading dock is not plant: it is installed, commissioned, and only then
   * makes anything. IND1 already separated ordering from delivery; this is the second half, and
   * it is why PP&E and the capacity it adds arrive AFTER the demand that justified them — the
   * mechanism of every capacity cycle. Capital-goods categories only; a technological primitive
   * like the production lead above (rule 2).
   */
  commissioningLeadWeeks?: number;
  /**
   * SEASONALITY, as a phase and an amplitude rather than a table of 52 numbers.
   *
   * `production` is the physical one: a crop ripens once a year and the plant that harvests it
   * cannot choose otherwise, which is the whole reason commodity STORAGE exists and the whole
   * reason the classical inventory cycle has a period. `demand` is the behavioural one: coats in
   * winter, gifts in December, a summer building season.
   *
   * Two numbers each — how far output or demand swings around its own average, and the week it
   * peaks — so nothing here is a data series (rule 2 allows the primitive). Absent = flat, which
   * is most goods and what every good was before this.
   */
  seasonality?: {
    production?: { amplitude: number; peakWeek: number };
    demand?: { amplitude: number; peakWeek: number };
  };
  linkedCommodities?: { commodityId: string; intensityShare: number }[];
  // ---- IND's dials. Storability and carrying cost are DERIVED from the physics above
  // (see isStorable / annualCarryingCostRateOf) rather than stated twice; these two are not
  // derivable from anything and are stated. ----
  /**
   * How many weeks pass between starting a unit and having one to sell.
   *
   * The field existed with every value at 0 and no reader, so production was instantaneous for
   * a fab and a shipyard alike. It is a TECHNOLOGICAL primitive — a process takes as long as it
   * takes (rule 2 allows the primitive) — and it is what makes a supply response LATE, which is
   * the mechanism behind every capacity cycle: demand arrives, output does not, price moves
   * instead. 0 means made on demand (services, software, electricity).
   */
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
   * here is RELATIVE frequency, which is a real technological and behavioural primitive (rule 2
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
   * measured was a consequence of the granularity, not of the numbers:** at industry
   * level a real BOM is unwriteable. Refining buys crude, a fab buys process chemicals, a
   * building buys steel and cement, and none of those statements is about a sector.
   *
   * Each coefficient is a TECHNOLOGICAL primitive — what the process physically takes — in the
   * same sense as IND5's energy intensities (rule 2 allows the primitive; it forbids the
   * outcome). **The aggregate intermediate share is therefore an OUTCOME of these, never a
   * target to hit**, and no coefficient here was chosen to move it.
   *
   * A recipe may not name its own product: a self-loop would have a firm bidding against
   * itself for its own output. Asserted at load (see below).
   */
  recipeInputs?: Record<string, number>;
}

interface IndustrySpec {
  /** Which sector's companies produce this industry's goods (BP1b: line assignment reads this). */
  sector: ProducingSector;
  /**
   * SEG — the share of this industry's activity carried by firms too small to name: its SME
   * tier. A structural fact about how an industry is organised, and it differs enormously —
   * construction and professional services are SME-dominated because the efficient scale is a
   * crew or a practice, while semiconductors and aerospace are not because the efficient scale
   * is a fab or an assembly line. Stated per industry (rule 2 allows a real-world primitive;
   * it is not an equilibrium), and it is the ONLY size input the SME tier takes: a pool's
   * opening revenue is its industry's real demand times this, so the tier's composition is an
   * outcome of where demand actually is rather than five hardcoded GDP shares.
   */
  smeShareOfActivity: number;
  /**
   * How an industry FUNDS itself and what it pays out. Two structural facts, both
   * primitives in rule 2's sense (a relationship between an industry's assets and its balance
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
   * NOT here, deliberately: `cyclicalityBeta`, which originally listed. Beta is a
   * MEASUREMENT now — stating one per industry would restore exactly what IDX deleted.
   */
  /** `rndShareOfGrowthCapex`: the share of growth investment this industry books as
   *  R&D rather than plant (the tech industries; absent = none). */
  financingProfile: { fixedRateTilt: number; maxPayoutRatio: number; rndShareOfGrowthCapex?: number };
  /**
   * §3.26-f-iv-b — WHAT THIS INDUSTRY'S PLANT IS MADE OF: the share of its capital spend that
   * goes to each capital good (`purchaseKindOf` = CAPITAL_GOOD), stated per industry the way its
   * products' recipes are (rule 15: a registry holds structure). It was one basket for every
   * buyer (`capexBasketWeight`): a refinery and a software firm bought the same mix of heavy
   * equipment, buildings, fleet and software. Read by `capitalMixOf` for a firm (its lines'
   * industries, by revenue share), by the SME pools directly, by the seed's register and by the
   * weekly capex bids; normalised on read, so the shares need only be relative.
   */
  capitalMix: Record<string, number>;
  subUnits: SubUnitSpec[];
}

export const INDUSTRY_REGISTRY: Record<Industry, IndustrySpec> = {
  Energy: {
    sector: 'Energy',
    capitalMix: { heavy_equipment: 0.45, commercial_construction: 0.35, industrial_automation: 0.10, commercial_fleet: 0.05, enterprise_software: 0.05 },
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
        productionLeadWeeks: 2,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'refined_products',
        seasonality: { demand: { amplitude: 0.12, peakWeek: 30 } },
        householdUnitsPerCapitaAnnual: 6.0, corporateUnitsPerFirmAnnual: 60.0,
        recipeInputs: { upstream_extraction: 0.55, industrial_chemicals: 0.02, electricity: 0.03, professional_services: 0.02, facilities_and_logistics: 0.04, repair_and_maintenance: 0.04 },
        label: "Refined Products",
        buyerMix: { HOUSEHOLD: 0.35, GOVERNMENT: 0.1, CORPORATE: 0.55 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 800,
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 1,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        // IND5. Electricity is the one input every industry buys and the model had none, which
        // is part of why its recipes are so thin (: mean intensity 0.138 against a real
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
        seasonality: { demand: { amplitude: 0.15, peakWeek: 3 } },
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
    capitalMix: { heavy_equipment: 0.40, commercial_construction: 0.25, industrial_automation: 0.25, commercial_fleet: 0.05, enterprise_software: 0.05 },
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
        productionLeadWeeks: 1,
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
        productionLeadWeeks: 1,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'agricultural_chemicals',
        seasonality: { demand: { amplitude: 0.45, peakWeek: 14 } },
        corporateUnitsPerFirmAnnual: 12.0,
        recipeInputs: { industrial_chemicals: 0.25, upstream_extraction: 0.06, electricity: 0.08, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.04 },
        label: "Agricultural Chemicals",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 700,
        productionLeadWeeks: 1,
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
        productionLeadWeeks: 3,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'agricultural_commodities',
        // The sub-unit is a BASKET of crops, not one crop. A single harvest swings near-totally
        // (nothing, then everything, then storage); a basket of staggered plantings in one
        // hemisphere does not, and stating the single-crop amplitude here would be a claim about
        // a thing this unit is not.
        seasonality: { production: { amplitude: 0.45, peakWeek: 35 } },
        householdUnitsPerCapitaAnnual: 4.0, corporateUnitsPerFirmAnnual: 30.0,
        recipeInputs: { agricultural_chemicals: 0.14, refined_products: 0.05, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.05, repair_and_maintenance: 0.04 },
        label: "Agricultural Commodities",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 300,
        shelfLifeWeeks: 26,
        householdPriceTier: 'STAPLE',
        linkedCommodities: [{ commodityId: 'WHEAT', intensityShare: 0.04 }, { commodityId: 'CORN', intensityShare: 0.04 }, { commodityId: 'SOYBEANS', intensityShare: 0.03 }],
        productionLeadWeeks: 12,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  IndustrialsMachinery: {
    sector: 'Industrials',
    capitalMix: { industrial_automation: 0.35, heavy_equipment: 0.30, commercial_construction: 0.20, enterprise_software: 0.10, commercial_fleet: 0.05 },
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
        usefulLifeYears: 18,
        commissioningLeadWeeks: 6,
        productionLeadWeeks: 8,
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
        usefulLifeYears: 12,
        commissioningLeadWeeks: 10,
        productionLeadWeeks: 6,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AerospaceDefense: {
    sector: 'Industrials',
    capitalMix: { industrial_automation: 0.35, heavy_equipment: 0.25, commercial_construction: 0.20, enterprise_software: 0.15, commercial_fleet: 0.05 },
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
        productionLeadWeeks: 26,
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
        productionLeadWeeks: 40,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  AutomotiveTransport: {
    sector: 'Consumer',
    capitalMix: { industrial_automation: 0.40, heavy_equipment: 0.25, commercial_construction: 0.15, commercial_fleet: 0.10, enterprise_software: 0.10 },
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
        productionLeadWeeks: 3,
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
        usefulLifeYears: 10,
        commissioningLeadWeeks: 2,
        productionLeadWeeks: 6,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  TechHardwareSemis: {
    sector: 'Tech',
    capitalMix: { industrial_automation: 0.45, commercial_construction: 0.25, enterprise_software: 0.15, heavy_equipment: 0.10, commercial_fleet: 0.05 },
    smeShareOfActivity: 0.12,
    financingProfile: { fixedRateTilt: 0.9, maxPayoutRatio: 0.3, rndShareOfGrowthCapex: 0.4 },
    subUnits: [
      {
        unitId: 'semiconductors',
        corporateUnitsPerFirmAnnual: 20.0,
        recipeInputs: { industrial_chemicals: 0.12, specialty_metals: 0.05, industrial_automation: 0.04, enterprise_software: 0.03, electricity: 0.06, professional_services: 0.04, facilities_and_logistics: 0.03, repair_and_maintenance: 0.05 },
        label: "Semiconductors",
        buyerMix: { HOUSEHOLD: 0.1, GOVERNMENT: 0.05, CORPORATE: 0.85 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 500_000,
        productionLeadWeeks: 12,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'consumer_devices',
        seasonality: { demand: { amplitude: 0.30, peakWeek: 48 } },
        householdUnitsPerCapitaAnnual: 0.6, corporateUnitsPerFirmAnnual: 3.0,
        recipeInputs: { semiconductors: 0.28, specialty_metals: 0.06, industrial_chemicals: 0.04, consumer_software: 0.02, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.05, repair_and_maintenance: 0.02 },
        label: "Consumer Devices",
        buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0.02, CORPORATE: 0.13 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 150_000,
        productionLeadWeeks: 3,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  SoftwareDigitalServices: {
    sector: 'Tech',
    capitalMix: { enterprise_software: 0.55, commercial_construction: 0.25, industrial_automation: 0.15, commercial_fleet: 0.03, heavy_equipment: 0.02 },
    smeShareOfActivity: 0.35,
    financingProfile: { fixedRateTilt: 0.8, maxPayoutRatio: 0.2, rndShareOfGrowthCapex: 0.4 },
    subUnits: [
      {
        unitId: 'enterprise_software',
        corporateUnitsPerFirmAnnual: 8.0,
        recipeInputs: { network_infrastructure: 0.05, semiconductors: 0.01, electricity: 0.02, professional_services: 0.08, facilities_and_logistics: 0.02, repair_and_maintenance: 0.01 },
        label: "Enterprise Software & Cloud",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.1, CORPORATE: 0.9 },
        deliveryMode: 'DIGITAL',
        usefulLifeYears: 5,
        commissioningLeadWeeks: 4,
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
    capitalMix: { heavy_equipment: 0.30, commercial_construction: 0.30, enterprise_software: 0.20, industrial_automation: 0.15, commercial_fleet: 0.05 },
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
        productionLeadWeeks: 2,
        revenueMechanism: 'SUBSCRIPTION',
      },
    ],
  },
  HealthcarePharma: {
    sector: 'Consumer',
    capitalMix: { industrial_automation: 0.30, commercial_construction: 0.30, enterprise_software: 0.20, heavy_equipment: 0.15, commercial_fleet: 0.05 },
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
        productionLeadWeeks: 6,
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
        productionLeadWeeks: 4,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerStaples: {
    sector: 'Consumer',
    capitalMix: { industrial_automation: 0.30, commercial_construction: 0.25, heavy_equipment: 0.20, commercial_fleet: 0.15, enterprise_software: 0.10 },
    smeShareOfActivity: 0.28,
    financingProfile: { fixedRateTilt: 1.1, maxPayoutRatio: 0.65 },
    subUnits: [
      {
        unitId: 'food_beverage',
        seasonality: { demand: { amplitude: 0.08, peakWeek: 50 } },
        householdUnitsPerCapitaAnnual: 120.0, corporateUnitsPerFirmAnnual: 8.0,
        recipeInputs: { agricultural_commodities: 0.34, industrial_chemicals: 0.03, household_chemicals: 0.02, specialty_metals: 0.02, electricity: 0.03, professional_services: 0.02, facilities_and_logistics: 0.06, repair_and_maintenance: 0.03 },
        label: "Food & Beverage",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 2_500,
        shelfLifeWeeks: 8,
        householdPriceTier: 'STAPLE',
        productionLeadWeeks: 1,
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
        productionLeadWeeks: 1,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  ConsumerDiscretionaryRetail: {
    sector: 'Consumer',
    capitalMix: { commercial_construction: 0.40, enterprise_software: 0.20, commercial_fleet: 0.15, industrial_automation: 0.15, heavy_equipment: 0.10 },
    smeShareOfActivity: 0.52,
    financingProfile: { fixedRateTilt: 0.95, maxPayoutRatio: 0.4 },
    subUnits: [
      {
        unitId: 'apparel_retail',
        seasonality: { demand: { amplitude: 0.35, peakWeek: 48 } },
        householdUnitsPerCapitaAnnual: 10.0, corporateUnitsPerFirmAnnual: 1.0,
        recipeInputs: { household_essentials: 0.10, agricultural_commodities: 0.06, luxury_goods: 0.04, industrial_chemicals: 0.04, housing_rental_services: 0.05, electricity: 0.02, professional_services: 0.03, facilities_and_logistics: 0.09, repair_and_maintenance: 0.01 },
        label: "Apparel & General Retail",
        buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 20_000,
        productionLeadWeeks: 8,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'home_furnishings',
        seasonality: { demand: { amplitude: 0.18, peakWeek: 22 } },
        householdUnitsPerCapitaAnnual: 1.5, corporateUnitsPerFirmAnnual: 1.5,
        recipeInputs: { specialty_metals: 0.08, industrial_chemicals: 0.07, agricultural_commodities: 0.04, consumer_devices: 0.04, housing_rental_services: 0.04, electricity: 0.02, professional_services: 0.02, facilities_and_logistics: 0.08, repair_and_maintenance: 0.02 },
        label: "Home Furnishings",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0, CORPORATE: 0.1 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 4_000,
        productionLeadWeeks: 4,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  LuxuryGoods: {
    sector: 'Consumer',
    capitalMix: { commercial_construction: 0.40, industrial_automation: 0.25, enterprise_software: 0.20, heavy_equipment: 0.10, commercial_fleet: 0.05 },
    smeShareOfActivity: 0.2,
    financingProfile: { fixedRateTilt: 0.95, maxPayoutRatio: 0.5 },
    subUnits: [
      {
        unitId: 'luxury_goods',
        seasonality: { demand: { amplitude: 0.40, peakWeek: 49 } },
        householdUnitsPerCapitaAnnual: 0.5, corporateUnitsPerFirmAnnual: 0.2,
        recipeInputs: { specialty_metals: 0.16, apparel_retail: 0.04, household_chemicals: 0.02, housing_rental_services: 0.03, electricity: 0.01, professional_services: 0.05, facilities_and_logistics: 0.04, repair_and_maintenance: 0.01 },
        label: "Luxury Goods",
        buyerMix: { HOUSEHOLD: 1, GOVERNMENT: 0, CORPORATE: 0 },
        deliveryMode: 'PHYSICAL',
        baselineValueDensityUsdPerTonne: 200_000,
        householdPriceTier: 'LUXURY',
        productionLeadWeeks: 6,
        revenueMechanism: 'UNIT_SALE',
      },
    ],
  },
  MediaEntertainment: {
    sector: 'Consumer',
    capitalMix: { enterprise_software: 0.40, commercial_construction: 0.35, industrial_automation: 0.15, heavy_equipment: 0.05, commercial_fleet: 0.05 },
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
        productionLeadWeeks: 12,
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
    capitalMix: { commercial_construction: 0.45, enterprise_software: 0.20, commercial_fleet: 0.15, industrial_automation: 0.10, heavy_equipment: 0.10 },
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
    capitalMix: { enterprise_software: 0.40, commercial_construction: 0.30, commercial_fleet: 0.15, industrial_automation: 0.10, heavy_equipment: 0.05 },
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
        // NO HOUSEHOLD SHARE. A household does not buy distribution as a good — it pays
        // for it inside the price of everything else it buys, which is what a channel margin IS
        // (domain/distribution.ts). Leaving the 0.04 here as well would have sold this sector's
        // work to households twice, once in this book and once in every other one (rule 4), and
        // both numbers would have looked like real revenue with a real payer.
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.125, CORPORATE: 0.875 },
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
    capitalMix: { commercial_construction: 0.40, heavy_equipment: 0.35, commercial_fleet: 0.15, industrial_automation: 0.05, enterprise_software: 0.05 },
    smeShareOfActivity: 0.78,
    financingProfile: { fixedRateTilt: 1.2, maxPayoutRatio: 0.75 },
    subUnits: [
      {
        // COMMERCIAL SPACE, the rule-17 way: one registry entry and the machinery the
        // model already owns does the rest. Landlords are DEALT as ordinary producers of this
        // line (plus the industry's SME pool — the small-landlord tier, gap closed for
        // this profile); their buildings arrive as CAPEX through the commercial_construction
        // market; a LEASE is a SUBSCRIPTION (IND2's contracted base: it survives a week with no
        // new lettings and decays by churn — which is what a lease IS) struck through the same
        // contract machinery every supply relationship uses; VACANCY is this book's unsold
        // capacity, priced by the same auction; a landlord that cannot cover its unit cost
        // idles, mothballs and scraps — and its bank's CRE exposure is just
        // its facilities and bonds on named books, so the vacancy → landlord default → bank
        // capital channel is the existing estate machinery with nothing new to teach it.
        unitId: 'commercial_rental_services',
        // A firm's premises requirement (space per firm is TECHNOLOGY — the registry's class of
        // number). NOTE the market's VALUE scale is pinned by the demand-level identity (C+G,
        // ), so a 92%-corporate service seeds at its government slice — the same
        // structural under-sizing every corporate-heavy service rides (logistics at 0.08% of
        // GDP against a real 5-6% is the named specimen). That is level row, not this
        // entry's: the MECHANISM here is complete at whatever scale the level hands it.
        //
        // measured the OPEN-SHORT question and closed it: restating the intensity
        // (400 -> 280 was tried) moves BOTH sides — supply derives from the same level
        // identity — so the ~0.74 opening fill is INVARIANT to this number and belongs to
        // seed-level row (~86% uniform undersupply), not to this entry. The stated
        // premises requirement stands.
        householdUnitsPerCapitaAnnual: 0, corporateUnitsPerFirmAnnual: 400.0,
        recipeInputs: { repair_and_maintenance: 0.12, electricity: 0.05, professional_services: 0.05, facilities_and_logistics: 0.02 },
        label: "Commercial Property & Leasing",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.08, CORPORATE: 0.92 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 0,
        revenueMechanism: 'SUBSCRIPTION',
      },
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
        seasonality: { production: { amplitude: 0.25, peakWeek: 28 } },
        householdUnitsPerCapitaAnnual: 0.05, corporateUnitsPerFirmAnnual: 0.4,
        recipeInputs: { specialty_metals: 0.16, industrial_chemicals: 0.10, home_furnishings: 0.05, heavy_equipment: 0.04, refined_products: 0.03, electricity: 0.02, professional_services: 0.06, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
        label: "Residential Construction",
        buyerMix: { HOUSEHOLD: 0.9, GOVERNMENT: 0.05, CORPORATE: 0.05 },
        deliveryMode: 'IN_PLACE',
        productionLeadWeeks: 26,
        revenueMechanism: 'UNIT_SALE',
      },
      {
        unitId: 'commercial_construction',
        seasonality: { production: { amplitude: 0.20, peakWeek: 28 } },
        corporateUnitsPerFirmAnnual: 0.5,
        recipeInputs: { specialty_metals: 0.19, industrial_chemicals: 0.10, heavy_equipment: 0.05, industrial_automation: 0.03, refined_products: 0.03, electricity: 0.02, professional_services: 0.07, facilities_and_logistics: 0.05, repair_and_maintenance: 0.03 },
        label: "Commercial & Infrastructure Construction",
        buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.45, CORPORATE: 0.55 },
        deliveryMode: 'IN_PLACE',
        usefulLifeYears: 40,
        commissioningLeadWeeks: 13,
        productionLeadWeeks: 52,
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
 * IND-R4/step 4 — WHAT A FIRM BUYS WHEN IT SELLS NO PRODUCT.
 *
 * A recipe is a property of a PRODUCT, and IND-R2 correctly gave financial firms no
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
/**
 * A CARRIER'S BASKET IS THE LOGISTICS SUB-UNIT'S OWN RECIPE. It sells freight rather than units,
 * so it has no product line and got no basket at all — which meant the world fleet's fuel was
 * expensed straight off a physics formula in its profile while `refined_products` never saw the
 * demand and nobody was paid for it. Moving goods IS what `facilities_and_logistics` describes,
 * and the registry already states what a dollar of it consumes; taking that here keeps one
 * number for one activity rather than a second table for the same thing.
 */
function profileBasket(profileKey: string): Record<string, number> {
  if (profileKey === 'CARRIER') return byId.get('facilities_and_logistics')?.recipeInputs ?? {};
  return PROFILE_INPUT_BASKET[profileKey] ?? {};
}

const PROFILE_INPUT_BASKET: Record<string, Record<string, number>> = {
  BANK: { professional_services: 0.09, enterprise_software: 0.07, facilities_and_logistics: 0.04, repair_and_maintenance: 0.01, electricity: 0.01 },
  INSURER: { professional_services: 0.10, enterprise_software: 0.05, facilities_and_logistics: 0.03, repair_and_maintenance: 0.01, electricity: 0.01 },
  ASSET_MANAGER: { professional_services: 0.08, enterprise_software: 0.06, facilities_and_logistics: 0.02, electricity: 0.01 },
};

/**
 * The one accessor for "what does this firm consume per dollar it earns" — its products' BOMs
 * if it makes anything, its profile's basket if it does not. Stage 05 bids from it, stage 08
 * charges it, and `shared-helpers` builds supply relationships from it, so a firm cannot be a
 * buyer in one place and not in another (rule 4).
 */
/**
 * The basket is a pure function of the firm's product lines, and it was rebuilt from the
 * registry on every call — including once per firm per candidate input in stage 05, where the
 * caller then read a SINGLE key off the fresh object it had just paid to build.
 *
 * Keyed on the product-line ARRAY's identity, which is exactly the right cache lifetime: nothing
 * mutates a `revenueShare` in place (checked — every one is built in a fresh object literal), and
 * stage 08 rebuilds the array whenever the mix changes, so a stale entry cannot outlive its
 * inputs. **The returned object is shared, so callers must treat it as read-only** all five do
 * (`Object.values`, `Object.keys`, `Object.entries`, one key read).
 */
const inputIntensityByLines = new WeakMap<object, Record<string, number>>();
const inputIntensityByProfile = new Map<string, Record<string, number>>();

export function firmInputIntensities(
  productLines: { subUnitId: string; revenueShare?: number }[] | undefined,
  profileKey: string
): Record<string, number> {
  const lines = productLines ?? [];
  if (lines.length > 0) {
    const memo = inputIntensityByLines.get(lines as object);
    if (memo !== undefined) return memo;
    const out: Record<string, number> = {};
    lines.forEach((l) => {
      Object.entries(byId.get(l.subUnitId)?.recipeInputs ?? {}).forEach(([input, intensity]) => {
        out[input] = (out[input] ?? 0) + (l.revenueShare ?? 1) * intensity;
      });
    });
    inputIntensityByLines.set(lines as object, out);
    return out;
  }
  const memo = inputIntensityByProfile.get(profileKey);
  if (memo !== undefined) return memo;
  const out = { ...profileBasket(profileKey) };
  inputIntensityByProfile.set(profileKey, out);
  return out;
}

/**
 * CHAIN-E — the input-output structure the BOMs now describe, and the two things it derives.
 *
 * `recipeInputs` is a real matrix once every product carries one, and two numbers the
 * model previously STATED fall out of it directly. Both were stated beside it, and disagreed
 * with it, which is why could measure three primitives "agreeing" at a level none of them
 * actually set.
 */

/** What one dollar of this product consumes in total — the product's own intermediate share. */
const recipeIntensityById = new Map<string, number>();
export function recipeIntensityOf(unitId: string): number {
  // A fixed property of a fixed registry, and it was allocating an array and reducing it
  // on every call — including once per sub-unit inside the labour-share derivation and once per
  // product line in the headcount and input-output walks.
  const memo = recipeIntensityById.get(unitId);
  if (memo !== undefined) return memo;
  const out = Object.values(byId.get(unitId)?.recipeInputs ?? {}).reduce((a, b) => a + b, 0);
  recipeIntensityById.set(unitId, out);
  return out;
}

/**
 * The mean intensity of what an industry makes — the industry-level version of
 * `recipeIntensityOf`, for a producer known only by its industry (the private tier's seed, whose
 * firms have no product lines yet). Same derivation, one source, so a fix cannot land in one
 * generator and miss the other — which is exactly what happened between the two firm generators
 * before IND-R6.
 */
export function industryRecipeIntensity(industry: Industry): number {
  const subUnits = INDUSTRY_REGISTRY[industry].subUnits;
  if (subUnits.length === 0) return 0;
  return subUnits.reduce((a, su) => a + recipeIntensityOf(su.unitId), 0) / subUnits.length;
}

/**
 * Headcount for an SME pool: value added over output per worker — the SAME rule the two named
 * firm generators use. One function, three tiers, because a headcount rule stated in four places
 * is how they came to disagree: the pool's was `totalEmployed x SME_TIER_EMPLOYMENT_SHARE`
 * in one file and `revenue / (named revenue-per-worker x (1 - discount))` in another, the second
 * silently overwriting the first after the carve.
 *
 * The SME productivity gap is not stated here and should not be: it is an OUTCOME of the pools'
 * own measured P&L (rule 2, and says so).
 */
export function smePoolEmployment(industry: Industry, annualRevenueLocal: number, productivityPerWorkerLocal: number): number {
  const valueAddedLocal = annualRevenueLocal * (1 - industryRecipeIntensity(industry));
  return Math.max(1, Math.round(valueAddedLocal / Math.max(1, productivityPerWorkerLocal)));
}

/**
 * CHAIN-E — total output implied by a vector of FINAL demand: the Leontief solve `X = F + A X`.
 *
 * The demand seed is `C + I + G` (see `macro/initialization.ts` and `03-category-demand.ts`),
 * which is a FINAL-demand identity: corporate demand there is investment only, and **intermediate
 * demand does not appear at all**. So gross output was pinned to final demand and the
 * gross-output-to-value-added ratio was ~1 by construction, whatever any recipe said — which is
 * why deepening every recipe 2.5x moved it by one part in a thousand. Firms bid for
 * their real inputs in stage 05, but the demand LEVEL those bids landed in had no room for them.
 *
 * Solved by iteration rather than inversion: `A`'s column sums are each product's own intensity,
 * all well below 1, so the series converges geometrically and a fixed point exists. It is
 * asserted rather than assumed.
 */
/**
 * §3.13-READ D12 — C + I + G, SPLIT ACROSS THE SUB-UNITS, and the Leontief solve on top of it.
 * One statement of the seed's demand identity.
 *
 * It was written three times: a placeholder seed in `macro/initialization.ts`, the authoritative
 * seed in `simulation/initialization.ts` that OVERWRITES it, and the weekly rebuild in
 * `03-category-demand.ts`. The middle one is the one that survives, and it is the one the
 * intermediate-demand solve was missed on when the other two got it (§7.120) — the model ran on
 * FINAL demand only regardless, sizing every USA firm against a 1,481B market it then replaced
 * with 567B. The file's own comment named the cause: *"the reason the same fix has to be made
 * three times is itself the defect"*. Two of the three are this function now. The weekly rebuild
 * stays its own code — it reads each firm's REAL capex rather than a share of GDP, which is a
 * different input and not a copy of this.
 *
 * The two terms that are easy to get wrong, both stated once here: investment goes where capex is
 * ACTUALLY spent (the capital mix — §3.26-f-iv-b: the buyers' own industries', `capitalMixOfFirms`,
 * or the registry's average before any buyer exists) rather than spread over
 * every corporate-bought good; and a corporate purchase of a NON-capital good is INTERMEDIATE
 * demand, which the Leontief solve produces from the recipes, so putting it in final demand as
 * well counts it twice from the other side.
 */
export function seedDemandFromCIG(
  C: number, I: number, G: number,
  capitalMix: Record<string, number>
): {
  householdBySubUnit: Record<string, number>;
  /** The government's own procurement, per sub-unit — its budget is this over 52. */
  governmentBySubUnit: Record<string, number>;
  finalBySubUnit: Record<string, number>;
  totalOutputBySubUnit: Record<string, number>;
} {
  let totalHhWeight = 0, totalGovWeight = 0;
  Object.values(VIEW_INDUSTRY_SUBUNITS).forEach((subUnits) => subUnits.forEach((su) => {
    totalHhWeight += su.buyerMix.HOUSEHOLD;
    totalGovWeight += su.buyerMix.GOVERNMENT;
  }));
  const householdBySubUnit: Record<string, number> = {};
  const governmentBySubUnit: Record<string, number> = {};
  const finalBySubUnit: Record<string, number> = {};
  Object.values(VIEW_INDUSTRY_SUBUNITS).forEach((subUnits) => subUnits.forEach((su) => {
    const hh = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
    const gov = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
    householdBySubUnit[su.unitId] = hh;
    governmentBySubUnit[su.unitId] = gov;
    finalBySubUnit[su.unitId] = hh + gov + (capitalMix[su.unitId] ?? 0) * I;
  }));
  return { householdBySubUnit, governmentBySubUnit, finalBySubUnit,
    totalOutputBySubUnit: totalOutputFromFinalDemand(finalBySubUnit) };
}

export function totalOutputFromFinalDemand(finalDemandBySubUnit: Record<string, number>): Record<string, number> {
  const ids = allSubUnits.map(su => su.unitId);
  // A non-finite entry never converges either, and reporting that as a divergent matrix sends the
  // reader to the recipes — which are fine. The input is the caller's, so name it as the caller's.
  const bad = ids.filter(id => !isFinite(finalDemandBySubUnit[id] ?? 0));
  if (bad.length > 0) {
    defect(`final demand is not a finite number for: ${bad.slice(0, 6).join(', ')}`
      + `${bad.length > 6 ? ` (+${bad.length - 6} more)` : ''}`);
  }
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

/** §3.26-f-iv-b — the capital goods: every sub-unit with a life. A capital good that some recipe
 *  also consumes (`purchaseKindOf` gives the recipe precedence at the lot) is still bid for as
 *  capital by every buyer's mix — the two questions are different ones. */
export const VIEW_CAPITAL_GOOD_IDS: readonly string[] = allSubUnits.filter((su) => su.usefulLifeYears !== undefined).map((su) => su.unitId);
export const isCapitalGood = (unitId: string): boolean => byId.get(unitId)?.usefulLifeYears !== undefined;

/** The years a capital good serves — the life its vintages wear over. A good with none is not a
 *  capital good, and asking is a defect at the site. */
export function usefulLifeYearsOfGood(unitId: string): number {
  return byId.get(unitId)?.usefulLifeYears ?? defect(`${unitId} is no capital good: it has no useful life to wear over`);
}

const normalisedMix = (mix: Record<string, number>): Record<string, number> => {
  const total = Object.values(mix).reduce((a, w) => a + Math.max(0, w), 0);
  if (!(total > 0)) return {};
  return Object.fromEntries(Object.entries(mix).filter(([, w]) => w > 0).map(([k, w]) => [k, w / total]));
};

/** §3.26-f-iv-b — what a firm that makes nothing keeps as plant: premises and systems for a
 *  bank, an insurer or a manager; hulls, depots and systems for a carrier. The profile's own,
 *  beside its input basket (`PROFILE_INPUT_BASKET`). */
const PROFILE_CAPITAL_MIX: Record<string, Record<string, number>> = {
  BANK: { commercial_construction: 0.6, enterprise_software: 0.4 },
  INSURER: { commercial_construction: 0.55, enterprise_software: 0.45 },
  ASSET_MANAGER: { commercial_construction: 0.4, enterprise_software: 0.6 },
  CARRIER: { commercial_fleet: 0.85, commercial_construction: 0.1, enterprise_software: 0.05 },
};

const capitalMixByLines = new WeakMap<object, Record<string, number>>();

/**
 * §3.26-f-iv-b — THE ONE ACCESSOR for "what is this firm's capital made of": its lines'
 * industries' mixes by revenue share if it makes anything, its profile's if it does not — the
 * same shape as `firmInputIntensities`. Normalised: the shares sum to one. Stage 05 splits a
 * buyer's capex bid by it, stage 03 sizes the capital-goods industries by it, and the seed
 * builds the register in it.
 */
export function capitalMixOf(
  productLines: { subUnitId: string; revenueShare?: number }[] | undefined,
  profileKey: string
): Record<string, number> {
  const lines = productLines ?? [];
  if (lines.length > 0) {
    const memo = capitalMixByLines.get(lines as object);
    if (memo !== undefined) return memo;
    const out: Record<string, number> = {};
    lines.forEach((l) => {
      const industry = industryOfSubUnit(l.subUnitId);
      const mix = industry ? INDUSTRY_REGISTRY[industry].capitalMix : {};
      Object.entries(mix).forEach(([good, share]) => {
        out[good] = (out[good] ?? 0) + (l.revenueShare ?? 1) * share;
      });
    });
    const normalised = normalisedMix(out);
    capitalMixByLines.set(lines as object, normalised);
    return normalised;
  }
  return normalisedMix(PROFILE_CAPITAL_MIX[profileKey] ?? {});
}

/** A sector's industries' mixes, averaged — the seed's register for a firm whose lines are not
 *  yet dealt (the public seed deals them after the books are struck). */
export function sectorCapitalMix(sector: string): Record<string, number> {
  const out: Record<string, number> = {};
  (Object.values(INDUSTRY_REGISTRY) as IndustrySpec[]).filter((spec) => spec.sector === sector).forEach((spec) => {
    Object.entries(normalisedMix(spec.capitalMix)).forEach(([good, share]) => { out[good] = (out[good] ?? 0) + share; });
  });
  return normalisedMix(out);
}

/** The registry's own average over every industry — the placeholder seed's split of aggregate
 *  investment before any firm exists, and the last resort when a region has no capex to read. */
export function registryCapitalMix(): Record<string, number> {
  const out: Record<string, number> = {};
  (Object.values(INDUSTRY_REGISTRY) as IndustrySpec[]).forEach((spec) => {
    Object.entries(normalisedMix(spec.capitalMix)).forEach(([good, share]) => { out[good] = (out[good] ?? 0) + share; });
  });
  return normalisedMix(out);
}

/** What a set of firms' capital spend is made of: each firm's mix, weighted by its capex — the
 *  authoritative seed's split of the region's investment (`seedDemandFromCIG`). */
export function capitalMixOfFirms(
  firms: readonly { capex: number; productLines?: { subUnitId: string; revenueShare?: number }[]; profileKey: string }[]
): Record<string, number> {
  const out: Record<string, number> = {};
  firms.forEach((f) => {
    const w = Math.max(0, f.capex);
    if (!(w > 0)) return;
    Object.entries(capitalMixOf(f.productLines, f.profileKey)).forEach(([good, share]) => { out[good] = (out[good] ?? 0) + w * share; });
  });
  const mix = normalisedMix(out);
  return Object.keys(mix).length > 0 ? mix : registryCapitalMix();
}


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
// What a good physically is, on the holding side.

/**
 * What a year of warehouse costs per tonne held: rent, handling, insurance. The one stated
 * primitive here — a real-world cost, not a real-world outcome (rule 2) — and everything below
 * derives from it plus the physics each registry entry already carries.
 */
const WAREHOUSE_USD_PER_TONNE_YEAR = 40;

/**
 * Can this good be held at all? Only a separable physical object can sit in a warehouse. Software
 * and media are copied on demand; a building is made where it stands. Neither has an inventory to
 * carry, and both were carrying one — measured: enterprise software held 159 units worth 5.9M,
 * spoiling like steel.
 */
/**
 * What share of a contracted base is lost per week. The one primitive the mechanism
 * needs: a subscription is defined by the fact that it ENDS unless renewed, and how fast it does
 * so is what separates a sticky enterprise contract from a month-to-month one. Stated once, at a
 * rate that implies a multi-year average contract life.
 */
export const SUBSCRIPTION_WEEKLY_CHURN = 0.006;

export function isStorable(unitId: string): boolean {
  return (byId.get(unitId)?.deliveryMode ?? 'PHYSICAL') === 'PHYSICAL';
}

/** Weeks from starting a unit to having one to sell. 0 = made on demand. */
export function productionLeadWeeksOf(unitId: string): number {
  return byId.get(unitId)?.productionLeadWeeks ?? 0;
}

/**
 * This good's seasonal multiplier for a given week, on either side.
 *
 * One cosine: `1 + amplitude x cos(2*pi*(week - peakWeek)/52)`. It averages to exactly 1 over a
 * year, so seasonality REDISTRIBUTES output and demand across the year and never creates or
 * destroys any — which is what makes it seasonality rather than a growth term.
 */
export function seasonalFactor(unitId: string, week: number, side: 'production' | 'demand'): number {
  const prof = byId.get(unitId)?.seasonality?.[side];
  if (!prof) return 1;
  return 1 + prof.amplitude * Math.cos((2 * Math.PI * (week - prof.peakWeek)) / 52);
}

/** Weeks from a capital good arriving to it entering service. 0 = usable on delivery. */
export function commissioningLeadWeeksOf(unitId: string): number {
  return byId.get(unitId)?.commissioningLeadWeeks ?? 0;
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
/**
 * §3.13-INV-ii-b — THE FEE AND THE SPOILAGE ARE TWO THINGS. They were summed into one rate and
 * the week then applied that one number twice over: the stock's VALUE was written down by it and
 * the same amount was PAID in cash to the distribution sector. A storage fee is an expense with a
 * payee and must not shrink the asset; spoilage destroys UNITS (`goods.md` E4) and must not pay
 * anybody. Three reads now, each for the question that wants it.
 */
/** What a week of warehouse costs, as a share of the stock's value — a fee, paid to a channel. */
export function annualStorageFeeRateOf(unitId: string): number {
  const su = byId.get(unitId);
  if (!su || su.deliveryMode !== 'PHYSICAL') return 0;
  const density = su.baselineValueDensityUsdPerTonne;
  return density && density > 0 ? WAREHOUSE_USD_PER_TONNE_YEAR / density : 0;
}
/** What share of the stock PERISHES in a year: a good with a shelf life loses all of it over that
 *  life. Units, not value — the units are gone and the value follows them. */
export function annualSpoilageRateOf(unitId: string): number {
  const su = byId.get(unitId);
  if (!su || su.deliveryMode !== 'PHYSICAL') return 0;
  return su.shelfLifeWeeks && su.shelfLifeWeeks > 0 ? 52 / su.shelfLifeWeeks : 0;
}
/** WHAT HOLDING IT COSTS, both halves — what a distributor's margin has to cover to carry it. */
export function annualCostOfHoldingRateOf(unitId: string): number {
  return annualStorageFeeRateOf(unitId) + annualSpoilageRateOf(unitId);
}

/**
 * What a purchase of this good IS to the firm buying it — the question the model never asked.
 *
 * Every corporate purchase used to be written as an input LOT, but only recipe inputs are ever
 * drawn down (stage 08 consumes what an industry's recipe names). Capital goods and general
 * operating purchases therefore accumulated forever: ~12k dead lots a week, 1.05M by week 120,
 * counted into the buyer's inventory line and consumed by nobody. The fix is not to
 * expire them; it is to route each purchase to what it physically is.
 *
 *   RECIPE_INPUT  — material that will be consumed making something. Held as a lot, drawn FIFO.
 *   CAPITAL_GOOD  — a machine, a building, a fleet, a system. Not inventory: it becomes PP&E on
 *                   delivery and depreciates over its life.
 *   OPERATING     — everything else a business buys and uses. Expensed; its cost already lives
 *                   in the operating margin and its cash in settled purchases.
 *
 * §3.26-f-iv-b — THE QUESTION IS THE BUYER'S. It used to be asked of the good alone: "does ANY
 * recipe consume this?" — and four of the five capital goods are in somebody's recipe, so a
 * manufacturer's heavy equipment, a retailer's automation and every firm's software landed as
 * input LOTS that only a firm whose own recipe lists them ever drew (the rest sat for ever — the
 * dead-lot defect this function was written to end), and only construction ever became plant. A
 * purchase is an input if THIS buyer's own recipe (its lines' inputs, or its profile's basket)
 * consumes it; a capital good otherwise if it has a life; operating otherwise.
 */
type PurchaseKind = 'RECIPE_INPUT' | 'CAPITAL_GOOD' | 'OPERATING';

export function purchaseKindOf(
  unitId: string,
  buyerProductLines: { subUnitId: string; revenueShare?: number }[] | undefined,
  buyerProfileKey: string
): PurchaseKind {
  if (Object.hasOwn(firmInputIntensities(buyerProductLines, buyerProfileKey), unitId)) return 'RECIPE_INPUT';
  if (byId.get(unitId)?.usefulLifeYears !== undefined) return 'CAPITAL_GOOD';
  return 'OPERATING';
}

// ============================== SEG — the SME tier ==============================

/**
 * Every industry that has an SME tier: all of them, in registry order. This is the SEG tier's
 * whole roster — there is no second list to maintain, so an industry added to the registry has
 * a pool in every region the moment it exists (rule 15). It replaces `Industry`, five
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
 * which makes its input mix an OUTCOME of its real sales mix (rule 2); with no sales yet, at
 * the seed, it falls back to an equal split across what it can produce.
 */
export function smePoolRecipeInputs(
  industry: Industry,
  salesBySubUnitLocal?: Record<string, number>
): Record<string, number> {
  const subUnits = INDUSTRY_REGISTRY[industry].subUnits;
  const weights = subUnits.map(su => Math.max(0, salesBySubUnitLocal?.[su.unitId] ?? 0));
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


/** The one accessor for an industry's funding and payout posture (rule 15). */
export function financingProfileOf(industry: Industry): IndustrySpec['financingProfile'] {
  return INDUSTRY_REGISTRY[industry].financingProfile;
}

/**
 * THE LABOUR SHARE OF VALUE ADDED, DERIVED FROM THE TECHNOLOGY.
 *
 * A firm's value added splits into labour compensation and gross operating surplus, and the
 * surplus must cover what the capital costs: it wears out, and its owners require a return. So
 *
 *     labourShare = 1 − (depreciation rate + cost of capital) × (capital / value added)
 *
 * and every term is a primitive the registry or the seed already carries. **Capital per unit of
 * value added is not the same as capital per unit of REVENUE** `SECTOR_PPE_INTENSITY` is the
 * second, and value added is revenue net of what the recipe consumes, so the ratio is
 * `intensity / (1 − recipe intensity)`. Depreciation is one over the sector's own useful life.
 *
 * What this replaces is `LABOR_SHARE_OF_OUTPUT = 0.62`, a stated share that set every
 * occupation's base wage — the anchor under household income, the labour market, every payroll
 * and the freight market's crew cost. It is rule 2's clearest surviving case: a claim about the
 * answer, in the one place the answer is most load-bearing.
 *
 * The weighting across sectors is each sector's own share of the economy's OUTPUT, from the
 * registry's own sub-unit composition — not a chosen mix.
 */
/** The owning industry of each sub-unit, built once. The `Object.values(...).find(...)`
 *  this replaces ran INSIDE the per-sub-unit loop below, so one call to the derivation was
 *  quadratic in the registry — and the derivation is called per company per week. */
const sectorBySubUnitId: Map<string, string> = (() => {
  const m = new Map<string, string>();
  Object.values(INDUSTRY_REGISTRY).forEach((i) =>
    i.subUnits.forEach((su) => { if (!m.has(su.unitId)) m.set(su.unitId, i.sector); }));
  return m;
})();

/** The answer depends only on the registry and the cost of capital, both of which are
 *  fixed for a run. Memoised on the one argument that varies between callers. */
const labourShareByCostOfCapital = new Map<number, number>();

export function derivedLabourShareOfValueAdded(args: {
  ppeIntensityBySector: Record<string, number>;
  usefulLifeYearsBySector: Record<string, number>;
  costOfCapitalAnnual: number;
}): number {
  const memo = labourShareByCostOfCapital.get(args.costOfCapitalAnnual);
  if (memo !== undefined) return memo;
  let weighted = 0;
  let total = 0;
  allSubUnits.forEach((su) => {
    const sector = sectorBySubUnitId.get(su.unitId);
    if (!sector) return;
    const intensity = args.ppeIntensityBySector[sector];
    const life = args.usefulLifeYearsBySector[sector];
    if (!(intensity > 0) || !(life > 0)) return;
    const recipe = Math.min(0.95, Math.max(0, recipeIntensityOf(su.unitId)));
    const capitalPerValueAdded = intensity / (1 - recipe);
    const surplusShare = (1 / life + Math.max(0, args.costOfCapitalAnnual)) * capitalPerValueAdded;
    // A sub-unit whose capital charge exceeds its whole value added contributes a zero labour
    // share, not a negative one — that is a firm that cannot cover its capital, which is a real
    // state and CAP's mechanism, not an arithmetic to carry into an average.
    weighted += Math.max(0, 1 - surplusShare);
    total += 1;
  });
  const out = total > 0 ? weighted / total : 0;
  labourShareByCostOfCapital.set(args.costOfCapitalAnnual, out);
  return out;
}
