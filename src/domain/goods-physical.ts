/**
 * What a good physically IS (XB3a-1).
 *
 * This table exists because `CATEGORY_TRADABILITY` did not deserve to. That table gave each
 * category an observed trade share, which is a real-world EQUILIBRIUM — a result of a history
 * this simulation does not have — so anything built on it could never say what gets traded or
 * why (rule 4's sharper half). Software is not traded *because* it is tradable. It is traded
 * because moving a dollar of it costs nothing and takes no time, while a dollar of gravel costs
 * more than the gravel. **Tradability is an outcome; what belongs in a table is the physics.**
 *
 * The primitive here is **value density** — dollars per tonne — which is a technological fact
 * about a material, not a market outcome: a tonne of crude is worth a few hundred dollars and a
 * tonne of semiconductors is worth half a million, and that was true before any of these regions
 * traded with each other. Mass per unit is DERIVED from it (see `unitMassTonnes`), and the value
 * density a good actually carries in any given week then moves with its own cleared price, which
 * is what makes an expensive good worth shipping further.
 *
 * **This is BP1's table.** The industry registry is specified to own exactly these properties —
 * "storability, carrying cost, revenue mechanism and cost shape… properties of what is being
 * made, not of the firm making it". It lives here only until BP1 absorbs it, and nothing may add
 * a second copy of any of it in the meantime (§7.5, §7.9).
 */

/**
 * How a good reaches a buyer at all. A physical classification, not a preference:
 *
 * - `PHYSICAL` — a separable object that must be carried. Costs mass x distance to move.
 * - `DIGITAL`  — weightless and delivered on the wire. No freight, no transit.
 * - `IN_PLACE` — built or performed where it is consumed and never moved. A foreign firm cannot
 *   deliver a building across a border; it can only build there, which is direct investment and
 *   is NOT modelled (named gap, §5-XB3a).
 */
export type DeliveryMode = 'PHYSICAL' | 'DIGITAL' | 'IN_PLACE';

export interface SubUnitPhysical {
  deliveryMode: DeliveryMode;
  /**
   * USD per tonne of the material, at the good's own baseline price. A technological fact about
   * what the thing is made of and how much work goes into it. Undefined for DIGITAL and IN_PLACE
   * goods, which have no shipping mass at all.
   */
  baselineValueDensityUsdPerTonne?: number;
  /**
   * Weeks before the good is no longer sellable. Physical spoilage, which is what makes a long
   * lead time infeasible for some goods however cheap the freight. Undefined = does not spoil on
   * any horizon this simulation runs.
   */
  shelfLifeWeeks?: number;
}

/**
 * Every sub-unit's physics. Value densities are order-of-magnitude facts about the materials —
 * bulk commodities in the hundreds, engineered goods in the tens of thousands, and the
 * information-dense goods in the hundreds of thousands.
 *
 * **These were NOT chosen to reproduce the trade shares the deleted table asserted.** Where the
 * ordering they produce disagrees with that table, the disagreement is the finding.
 */
export const SUBUNIT_PHYSICAL: Record<string, SubUnitPhysical> = {
  // Bulk extraction and refining: heavy, cheap, and the reason these move by sea at all.
  upstream_extraction: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 400 },
  refined_products: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 800 },
  industrial_chemicals: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 1_500 },
  agricultural_chemicals: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 700 },
  agricultural_commodities: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 300, shelfLifeWeeks: 26 },
  specialty_metals: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 5_000 },

  // Engineered goods: the value is in the fabrication, so a tonne is worth far more.
  heavy_equipment: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 12_000 },
  industrial_automation: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 40_000 },
  commercial_fleet: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 15_000 },
  passenger_vehicles: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 25_000 },
  defense_systems: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 150_000 },
  commercial_aerospace: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 800_000 },
  network_infrastructure: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 60_000 },

  // Information-dense manufactures: light enough that freight is a rounding error on the price,
  // which is the physical reason their supply chains span the world.
  semiconductors: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 500_000 },
  consumer_devices: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 150_000 },
  pharmaceuticals: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 400_000, shelfLifeWeeks: 104 },
  medtech_devices: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 200_000 },
  luxury_goods: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 200_000 },

  // Consumer goods: bulky relative to their value, which is why so much of this is made near
  // where it is sold — an outcome the old table asserted and this has to produce.
  food_beverage: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 2_500, shelfLifeWeeks: 8 },
  household_chemicals: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 3_000, shelfLifeWeeks: 104 },
  household_essentials: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 4_000 },
  home_furnishings: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 4_000 },
  apparel_retail: { deliveryMode: 'PHYSICAL', baselineValueDensityUsdPerTonne: 20_000 },

  // Weightless.
  enterprise_software: { deliveryMode: 'DIGITAL' },
  consumer_software: { deliveryMode: 'DIGITAL' },
  media_content: { deliveryMode: 'DIGITAL' },

  // Built where it stands.
  residential_construction: { deliveryMode: 'IN_PLACE' },
  commercial_construction: { deliveryMode: 'IN_PLACE' },
};

export function deliveryModeOf(subUnitId: string): DeliveryMode {
  return SUBUNIT_PHYSICAL[subUnitId]?.deliveryMode ?? 'PHYSICAL';
}

export function shelfLifeWeeksOf(subUnitId: string): number | undefined {
  return SUBUNIT_PHYSICAL[subUnitId]?.shelfLifeWeeks;
}

/**
 * The physical mass of one unit, derived once from the good's own baseline price and its real
 * value density.
 *
 * Mass is derived rather than stated because this model's "unit" is an ABSTRACT BUNDLE — the
 * bootstrap prices every sub-unit at roughly the same order of magnitude, so a unit is not a loaf
 * of bread or a car but about seventy thousand dollars of something. What a bundle of that value
 * physically weighs is exactly its value divided by the material's value density, and that is the
 * quantity freight is charged on.
 *
 * It is pinned at the BASELINE price and never moves afterwards, because mass is physical: when
 * steel doubles in price the same tonne is worth twice as much, it does not become half a tonne.
 */
export function unitMassTonnes(subUnitId: string, baselineUnitPriceUSD: number): number {
  const physical = SUBUNIT_PHYSICAL[subUnitId];
  if (!physical || physical.deliveryMode !== 'PHYSICAL') return 0;
  const density = physical.baselineValueDensityUsdPerTonne;
  if (!density || !(density > 0) || !(baselineUnitPriceUSD > 0)) return 0;
  return baselineUnitPriceUSD / density;
}
