/**
 * Carriers: the firms that actually move the goods (XB3a-2).
 *
 * Freight was the missing half of every sourcing decision in this model. A buyer compared prices
 * and nothing else, because goods teleported: a purchase settled the week it cleared, from any
 * seller, at no transport cost, over no distance. That is not a small omission — it is the reason
 * a tradability parameter had to exist at all, standing in for a cost the model refused to carry.
 *
 * A carrier here is a `Company` like any other, with the balance sheet, debt, employees, rating
 * and default that implies, and a `CARRIER` financial-statement profile in the same way banks,
 * insurers and REITs already have their own. **No parallel type** rule, because a second
 * firm type is two representations of one real thing.
 *
 * What makes freight rates behave the way they do is entirely in the physics below: capacity is a
 * physical stock that takes years to build, a vessel committed to one lane is unavailable on
 * another, and demand swings weekly. That is why freight is one of the most violently cyclical
 * prices in the world, and none of it needs a coefficient.
 */

import { RegionId } from './geography';

/**
 * How a consignment moves. The two modes are not a taxonomy — they are two genuinely different
 * physical technologies, and the gap between them is why distance costs what it costs.
 *
 * A bulk carrier moves a tonne a nautical mile for a rounding error; a truck moves the same tonne
 * for roughly an order of magnitude more fuel and, decisively, for thousands of times more crew.
 * That gap is why ocean trade is cheap and inland haulage is not.
 */
type FreightMode = 'SEA' | 'ROAD';

/**
 * One physical freight asset — a ship or a truck fleet unit. Everything here is a measured
 * property of real equipment, not a preference.
 */
export interface FreightAsset {
  id: string;
  mode: FreightMode;
  /** What it can carry in one voyage. */
  capacityTonnes: number;
  /** Service speed, in knots. Sets transit time, and therefore lead time. */
  speedKnots: number;
  /** Tonnes of fuel burned per nautical mile travelled, laden. A property of the hull or engine. */
  fuelTonnesPerNm: number;
  /** People required to operate it, whatever it is carrying. */
  crewCount: number;
  /** The lane it is currently committed to. A vessel on one route is not available on another. */
  laneFrom: RegionId;
  laneTo: RegionId;
  builtWeek: number;
}

/**
 * The physical specification of each mode, from real equipment.
 *
 * SEA is a Panamax-class bulk carrier: ~70,000 deadweight tonnes, 14 knots service speed, burning
 * about 30 tonnes of fuel a day, crewed by around twenty.
 *
 * ROAD is a heavy articulated truck: ~25 tonnes payload, ~50 knots (58 mph) highway speed,
 * roughly 35 litres per 100 km, one driver.
 *
 * The consequences are arithmetic rather than assumed: per tonne-nautical-mile the truck burns
 * about seventeen times the fuel and carries about three thousand times the crew. Those two
 * ratios are the whole reason an ocean crossing can be cheaper than an inland haul a fraction of
 * its length.
 */
export const FREIGHT_ASSET_SPEC: Record<FreightMode, {
  capacityTonnes: number;
  speedKnots: number;
  fuelTonnesPerNm: number;
  crewCount: number;
  /** What one costs to build, in USD. Real equipment prices. */
  capitalCostLocal: number;
  /** Years of service before it is scrapped. */
  usefulLifeYears: number;
}> = {
  SEA: {
    capacityTonnes: 70_000,
    speedKnots: 14,
    // 30 t/day over 14 knots x 24 h = 336 nm/day.
    fuelTonnesPerNm: 30 / (14 * 24),
    crewCount: 20,
    capitalCostLocal: 35_000_000,
    usefulLifeYears: 25,
  },
  ROAD: {
    capacityTonnes: 25,
    speedKnots: 50,
    // 35 L/100 km, diesel ~0.84 t/m3, and 100 km = 54 nm.
    fuelTonnesPerNm: (35 * 0.00084) / 54,
    crewCount: 1,
    capitalCostLocal: 150_000,
    usefulLifeYears: 10,
  },
};

/**
 * Which technology serves a lane. Crossing an ocean is a sea voyage; moving goods inside a region
 * is a road haul. This is geography, not a choice — there is no road from Japan to Europe.
 */
export function freightModeForLane(from: RegionId, to: RegionId): FreightMode {
  return from === to ? 'ROAD' : 'SEA';
}

/** One-way transit, in weeks. Distance over speed — this is also the lead time a buyer waits. */
function transitWeeks(distanceNm: number, speedKnots: number): number {
  if (!(speedKnots > 0)) return 0;
  return distanceNm / (speedKnots * 24 * 7);
}

/**
 * How much one asset can carry per week on its lane: its capacity divided by how long a round
 * trip takes, because it has to come back before it can carry anything again. This is the whole
 * reason freight capacity is short in the run that matters — a vessel on an eleven-thousand-mile
 * run delivers its hold about once a month.
 */
export function weeklyCapacityTonnes(asset: FreightAsset, distanceNm: number): number {
  const roundTrip = 2 * transitWeeks(distanceNm, asset.speedKnots);
  if (!(roundTrip > 0)) return asset.capacityTonnes;
  return asset.capacityTonnes / roundTrip;
}

/**
 * What it costs the carrier to move one tonne one nautical mile — the level below which it will
 * not offer, because it would be paying to carry the cargo.
 *
 * SHORT-RUN ONLY: fuel and crew, no capital. The vessel's own cost (`capitalCostLocal` over
 * `usefulLifeYears`) is booked as PP&E and depreciated on the carrier's P&L, but it is not in
 * this floor — so in a balanced market freight clears at a level that never returns the fleet's
 * capital and no carrier can rationally replace a ship. Correct as a marginal cost; wrong as the
 * only floor a carrier posts. Owner: CAP, which gives firms a real production decision.
 *
 * Fuel is a real purchase of refined product at that market's own cleared price, and crew is real
 * labour at the region's real wage. Both are costs the carrier actually books; neither is a
 * parameter. Note the asymmetry the specs above produce: for a ship, fuel dominates and crew is
 * negligible per tonne; for a truck it is the reverse. That is why a fuel spike reprices ocean
 * freight and a wage rise reprices haulage.
 */
export function marginalCostPerTonneNmLocal(args: {
  asset: FreightAsset;
  fuelPriceUsdPerTonne: number;
  annualCrewWageLocal: number;
  distanceNm: number;
  /** CAP — this asset's share of its owner's weekly capital charge (cost of capital on net
   *  PP&E). Absent = the old fuel-and-crew floor, which cannot replace a ship. */
  weeklyCapitalChargeLocal?: number;
}): number {
  const { asset, fuelPriceUsdPerTonne, annualCrewWageLocal, distanceNm } = args;
  const fuelPerTonneNm = (asset.fuelTonnesPerNm * fuelPriceUsdPerTonne) / Math.max(1, asset.capacityTonnes);

  // Crew is paid by the week whatever the ship does, so its cost per tonne-mile is the weekly
  // wage bill spread over the tonne-miles a week of that voyage actually delivers.
  const weeklyTonnes = weeklyCapacityTonnes(asset, distanceNm);
  const weeklyTonneNm = weeklyTonnes * distanceNm;
  const weeklyCrewCostLocal = (asset.crewCount * annualCrewWageLocal) / 52;
  const crewPerTonneNm = weeklyTonneNm > 0 ? weeklyCrewCostLocal / weeklyTonneNm : 0;

  // CAP — AND THE CAPITAL THAT DOES THE WORK. Fuel and crew alone are what a ship costs to SAIL,
  // not what it costs to HAVE: a floor built from them clears a balanced freight market at a
  // price where no carrier can ever replace a hull, so the fleet is consumed and the market never
  // says so. The charge is the same arithmetic LAB already runs on labour — the return the
  // capital requires — spread over the tonne-miles that capital delivers.
  const capitalPerTonneNm = weeklyTonneNm > 0
    ? (args.weeklyCapitalChargeLocal ?? 0) / weeklyTonneNm : 0;

  return fuelPerTonneNm + crewPerTonneNm + capitalPerTonneNm;
}

/** A carrier's fleet, carried on the Company that owns it. */
export interface CarrierFleet {
  assets: FreightAsset[];
  /** Fuel the carrier holds, in tonnes — bought as real refined product in the goods auction. */
  fuelInventoryTonnes: number;
  /** Tonne-miles actually carried last week, and what it was paid for them. */
  lastWeekTonneNm: number;
  lastWeekFreightRevenueLocal: number;
  /** Tonnes of bunker the fleet physically burned last week, at its own utilisation. The fleet's
   *  real demand for refined product — measured here, and the number a bunker bid should
   *  eventually be sized from rather than from a share of revenue. */
  lastWeekFuelBurnedTonnes?: number;
}

/** A directed lane key, e.g. "USA>EUR". Directed because a head-haul and a back-haul are not the
 *  same market — the imbalance between them is a real feature of freight pricing. */
export function laneKey(from: RegionId, to: RegionId): string {
  return `${from}>${to}`;
}

export function parseLaneKey(key: string): { from: RegionId; to: RegionId } {
  const [from, to] = key.split('>') as [RegionId, RegionId];
  return { from, to };
}

/**
 * How long a consignment is on the water (or the road) on a lane, in weeks — distance over the
 * service speed of whatever technology serves it. This is the LEAD TIME a buyer waits, and it is
 * the reason a cheaper distant supplier is not automatically the better one: everything ordered
 * from it is capital tied up in transit, and everything it fails to deliver is production the
 * buyer cannot run.
 */
export function laneTransitWeeks(from: RegionId, to: RegionId, distanceNm: number): number {
  const spec = FREIGHT_ASSET_SPEC[freightModeForLane(from, to)];
  return transitWeeks(distanceNm, spec.speedKnots);
}
