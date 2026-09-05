/**
 * The freight market (XB3a-2).
 *
 * Carriers offer the capacity they physically have, at what it actually costs them to sail; the
 * cargo bids what each route saves the buyer who wants it moved. The rate is what clears between
 * them, per LANE, because a vessel committed to one route is not available on another and that is
 * why rates differ by route rather than by a coefficient.
 *
 * Everything that makes freight the violently cyclical price it is in reality is already in the
 * physics: capacity is a stock that takes years to build and cannot be conjured in a week, a
 * long-haul vessel delivers its hold about once a month, and demand moves weekly. Rates collapse
 * toward marginal cost when the fleet is idle and multiply when it is not, and neither end of that
 * needs a cap — a slack market clears at what the last carrier will accept, and a tight one at
 * what the last shipper will pay.
 *
 * Fuel is a real purchase of refined product at that market's own cleared price, and crew is real
 * labour at the region's real going wage. Neither is a parameter, and both feed straight through
 * to the rate.
 */

import { GameState, Region, RegionId, Company } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { laneDistanceNm } from '../../../domain/geography';
import { FreightAsset, laneKey, marginalCostPerTonneNmLocal, weeklyCapacityTonnes } from '../../../domain/carrier';
import { getBaseAnnualWageLocal } from '../../bootstrap/labor-and-wages';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import { convertLocal, FxToUsd } from '../../../domain/currency';
import { LaneBooking, SOURCING_REGION_IDS } from './sourcing-intent';
import { WeeklyStepContext } from './context';
import { getFxToUsd } from './06-fx-and-trade';
import { clearDoubleAuction, AuctionBid, AuctionOffer } from './double-auction';
import type { EntityId } from '../../../domain/ids';
import { asTicker } from '../../../domain/ids';

/** The good a ship burns. Its cleared price per tonne IS the bunker price. */
const FUEL_SUBUNIT_ID = 'refined_products';

export interface FreightClearing {
  /** What a tonne cost to move on each lane this week, in the LANE'S OWN money (its origin's). */
  ratePerTonneLaneMoneyByLane: Record<string, number>;
  /** The floor each lane would clear at if the fleet were idle — what it costs a carrier to sail,
   *  in the lane's own money. */
  marginalRatePerTonneLaneMoneyByLane: Record<string, number>;
  /** Tonnes each carrier actually carried, what it earned, and the fuel that took. */
  carrierTonnesCarried: Map<string, number>;
  carrierRevenueLocal: Map<string, number>;
  carrierFuelBurnedTonnes: Map<string, number>;
  /** Of the tonnage booked on a lane, the share that found space. */
  laneFillRatio: Record<string, number>;
  /** Per lane, the share of each good's booked cargo that shipped. */
  shippedShareByLaneSubUnit: Map<string, number>;
  /** Each carrier's share of a lane's cleared tonnage, so what actually ships can be paid to
   *  the operators that carried it: lane key -> ticker -> share. */
  /** §3.13-BOOK slice (c2c): lane key → CARRIER TICKER → share of that lane's freight. */
  /** §3.13-BOOK (c-then-3b): the carriers that took a lane's tonnage, by ENTITY id — the
   *  goods auction pays them as parties, and a party is an entity id. */
  carrierShareByLane: Map<string, Map<EntityId, number>>;
  /** Capacity offered and taken, for the diagnostics a freight market is judged on. */
  laneCapacityTonnes: Record<string, number>;
  laneBookedTonnes: Record<string, number>;
}

function emptyFreightClearing(): FreightClearing {
  return {
    ratePerTonneLaneMoneyByLane: {},
    marginalRatePerTonneLaneMoneyByLane: {},
    carrierTonnesCarried: new Map(),
    carrierRevenueLocal: new Map(),
    carrierFuelBurnedTonnes: new Map(),
    laneFillRatio: {},
    shippedShareByLaneSubUnit: new Map(),
    carrierShareByLane: new Map(),
    laneCapacityTonnes: {},
    laneBookedTonnes: {},
  };
}

/** What a tonne of bunker costs where this carrier fuels: the refined-product market's own price
 *  per tonne, which is its cleared unit price over the physical mass of a unit. */
export function fuelPriceUsdPerTonne(region: Region, unitMassTonnes: Record<string, number>): number {
  const mass = unitMassTonnes[FUEL_SUBUNIT_ID] ?? 0;
  const unitPrice = Number(region.categoryDemand[FUEL_SUBUNIT_ID]?.unitPriceLocal);
  if (!(mass > 0) || !(unitPrice > 0)) return 0;
  return unitPrice / mass;
}

/** A carrier's crew wage: the region's real going rate for the trades that operate equipment. */
export function crewAnnualWageLocal(region: Region, regionId: RegionId): number {
  const base = getBaseAnnualWageLocal(regionId).SKILLED_TRADES;
  const index = region.occupationPools?.SKILLED_TRADES?.wageIndex;
  return base * (typeof index === 'number' && index > 0 ? index : 1);
}

export function isCarrier(c: Company): boolean {
  return c.financialStatementProfile === 'CARRIER' && !!c.carrierFleet;
}

/**
 * What each carrier will offer, and at what price, on every lane it has equipment on.
 *
 * The reservation is its own marginal cost — fuel plus crew for that voyage. Below it the carrier
 * is paying to carry the cargo, and above it every dollar is a contribution to the capital it has
 * already sunk in the ship. That is exactly why freight rates can sit under total cost for years
 * without the fleet disappearing.
 */
function buildCarrierOffers(
  carriers: Company[],
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>,
  fxToUsd: FxToUsd
): { offersByLane: Map<string, AuctionOffer[]>; marginalByLane: Record<string, number>; capacityByLane: Record<string, number> } {
  const offersByLane = new Map<string, AuctionOffer[]>();
  const marginalByLane: Record<string, number> = {};
  const capacityByLane: Record<string, number> = {};

  carriers.forEach(carrier => {
    const home = carrier.region as RegionId;
    const fuelUsdPerTonne = fuelPriceUsdPerTonne(regions[home], unitMassTonnes);
    const wage = crewAnnualWageLocal(regions[home], home);

    // CAP — the carrier's own weekly capital charge, spread across its fleet by capacity. The
    // return its hulls require is a real cost of offering the capacity, and a floor without it
    // prices freight where the fleet cannot be replaced.
    const netPpeLocal = Math.max(0, (carrier.grossPPELocal ?? 0) - (carrier.accumulatedDepreciationLocal ?? 0));
    const costOfCapital = Math.max(0,
      (regions[home]?.zeroRates?.tenor10Y ?? regions[home]?.policyRate ?? 0) + (carrier.beta ?? 1) * EQUITY_RISK_PREMIUM);
    const fleetCapacityTonnes = (carrier.carrierFleet?.assets ?? []).reduce((a, x: FreightAsset) => {
      const d = laneDistanceNm(x.laneFrom, x.laneTo);
      return a + (d > 0 ? weeklyCapacityTonnes(x, d) : 0);
    }, 0);
    const carrierWeeklyCapitalChargeLocal = (netPpeLocal * costOfCapital) / 52;

    // One offer per lane, not per hull: several identical vessels on a route are one block of
    // capacity at one cost.
    const byLane = new Map<string, { capacityTonnes: number; minPrice: number }>();
    (carrier.carrierFleet?.assets ?? []).forEach((asset: FreightAsset) => {
      const key = laneKey(asset.laneFrom, asset.laneTo);
      const distanceNm = laneDistanceNm(asset.laneFrom, asset.laneTo);
      if (!(distanceNm > 0)) return;
      const capacity = weeklyCapacityTonnes(asset, distanceNm);
      // A carrier's fuel and crew are paid in its OWN money; a lane is quoted in its origin's.
      // A Japanese operator on a European route competes at the euro equivalent of its yen costs,
      // which is the channel by which a weak home currency makes an operator cheap abroad.
      const costInCarrierMoney = marginalCostPerTonneNmLocal({
        asset, fuelPriceUsdPerTonne: fuelUsdPerTonne, annualCrewWageLocal: wage, distanceNm,
        weeklyCapitalChargeLocal: fleetCapacityTonnes > 0
          ? carrierWeeklyCapitalChargeLocal * (capacity / fleetCapacityTonnes) : 0,
      }) * distanceNm;
      const minPrice = convertLocal(costInCarrierMoney, home, asset.laneFrom, fxToUsd);
      const existing = byLane.get(key);
      if (existing) {
        existing.capacityTonnes += capacity;
        existing.minPrice = Math.min(existing.minPrice, minPrice);
      } else {
        byLane.set(key, { capacityTonnes: capacity, minPrice });
      }
    });

    byLane.forEach((block, key) => {
      if (!(block.capacityTonnes > 0)) return;
      const bucket = offersByLane.get(key) ?? [];
      bucket.push({ key: carrier.ticker, quantity: block.capacityTonnes, minPrice: block.minPrice });
      offersByLane.set(key, bucket);
      capacityByLane[key] = (capacityByLane[key] ?? 0) + block.capacityTonnes;
      const cheapest = marginalByLane[key];
      marginalByLane[key] = cheapest === undefined ? block.minPrice : Math.min(cheapest, block.minPrice);
    });
  });

  return { offersByLane, marginalByLane, capacityByLane };
}

/**
 * The rate a lane would clear at with an idle fleet, for every lane whether or not a carrier
 * currently serves it. The sourcing intent needs this before any rate has ever printed, and a
 * lane nobody serves still has to be evaluable — otherwise a route simply never opens.
 */
export function marginalRatesForAllLanes(
  carriers: Company[],
  regions: Record<RegionId, Region>,
  unitMassTonnes: Record<string, number>,
  fxToUsd: FxToUsd
): Record<string, number> {
  return buildCarrierOffers(carriers, regions, unitMassTonnes, fxToUsd).marginalByLane;
}

export function runFreightClearing(args: {
  carriers: Company[];
  regions: Record<RegionId, Region>;
  unitMassTonnes: Record<string, number>;
  bookings: LaneBooking[];
  fxToUsd: FxToUsd;
}): FreightClearing {
  const { carriers, regions, unitMassTonnes, bookings, fxToUsd } = args;
  const result = emptyFreightClearing();

  const { offersByLane, marginalByLane, capacityByLane } = buildCarrierOffers(carriers, regions, unitMassTonnes, fxToUsd);
  const carrierByTicker = new Map(carriers.map((c) => [c.ticker, c]));
  result.marginalRatePerTonneLaneMoneyByLane = marginalByLane;
  result.laneCapacityTonnes = capacityByLane;
  // FREIGHT_TRACE=1 — the same print for the SEED's clearing and every live week, because the
  // §7.260 question is exactly their disagreement: the seed pays the fleet ~6x what the live
  // week does on the same flows.
  const FREIGHT_TRACE = process.env.FREIGHT_TRACE === '1';

  // Bookings grouped by lane, and within a lane by good — a lane's demand curve is the several
  // cargoes on it, each with its own reservation, which is what gives it a slope.
  const bookingsByLane = new Map<string, LaneBooking[]>();
  bookings.forEach(b => {
    if (!(b.tonnes > 0) || !(b.maxRatePerTonneLaneMoney > 0)) return;
    const key = laneKey(b.from, b.to);
    const bucket = bookingsByLane.get(key) ?? [];
    bucket.push(b);
    bookingsByLane.set(key, bucket);
    result.laneBookedTonnes[key] = (result.laneBookedTonnes[key] ?? 0) + b.tonnes;
  });

  bookingsByLane.forEach((laneBookings, key) => {
    const offers = offersByLane.get(key) ?? [];
    const anchor = marginalByLane[key] ?? 0;
    if (offers.length === 0) {
      // Nobody serves this lane. The cargo does not move, and that is a real answer — a route
      // with no ships on it is how a trade link fails to exist.
      result.ratePerTonneLaneMoneyByLane[key] = anchor;
      result.laneFillRatio[key] = 0;
      return;
    }

    const bids: AuctionBid[] = laneBookings.map(b => ({
      key: b.subUnitId, quantity: b.tonnes, maxPrice: b.maxRatePerTonneLaneMoney,
    }));
    const cleared = clearDoubleAuction(bids, offers, anchor);

    result.ratePerTonneLaneMoneyByLane[key] = cleared.clearedPrice;
    const booked = result.laneBookedTonnes[key] ?? 0;
    result.laneFillRatio[key] = booked > 0 ? cleared.clearedQuantity / booked : 0;

    // What each good actually got space for, so the goods auction sources only what can arrive.
    const bookedBySubUnit = new Map<string, number>();
    laneBookings.forEach(b => bookedBySubUnit.set(b.subUnitId, (bookedBySubUnit.get(b.subUnitId) ?? 0) + b.tonnes));
    bookedBySubUnit.forEach((tonnes, subUnitId) => {
      const shipped = cleared.purchases.get(subUnitId)?.quantity ?? 0;
      result.shippedShareByLaneSubUnit.set(`${key}|${subUnitId}`, tonnes > 0 ? shipped / tonnes : 0);
    });

    // What each carrier carried, earned, and burned doing it.
    const distanceNm = laneDistanceNm(...(key.split('>') as [RegionId, RegionId]));
    if (cleared.clearedQuantity > 0) {
      const shares = new Map<EntityId, number>();
      cleared.sales.forEach((fill, ticker) => {
        const id = carrierByTicker.get(asTicker(ticker))?.id;
        if (id !== undefined) shares.set(id, fill.quantity / cleared.clearedQuantity);
      });
      result.carrierShareByLane.set(key, shares);
    }
    if (FREIGHT_TRACE) {
      let laneRevenueLocal = 0;
      cleared.sales.forEach((fill) => { laneRevenueLocal += fill.amount; });
      console.log(`  [frt] ${key} booked ${(booked / 1e3).toFixed(0)}kt cap ${((capacityByLane[key] ?? 0) / 1e3).toFixed(0)}kt`
        + ` rate ${cleared.clearedPrice.toFixed(2)} anchor ${anchor.toFixed(2)} fill ${(result.laneFillRatio[key] ?? 0).toFixed(2)}`
        + ` rev ${(laneRevenueLocal / 1e6).toFixed(1)}M bids ${bids.length} maxBid ${Math.max(...bids.map((b) => b.maxPrice)).toFixed(2)}`);
    }
    cleared.sales.forEach((fill, ticker) => {
      result.carrierTonnesCarried.set(ticker, (result.carrierTonnesCarried.get(ticker) ?? 0) + fill.quantity);
      result.carrierRevenueLocal.set(ticker, (result.carrierRevenueLocal.get(ticker) ?? 0) + fill.amount);
      const carrier = carrierByTicker.get(asTicker(ticker)); // §3.13-BOOK (c-then-3b): a lookup, not a scan per fill
      const asset = carrier?.carrierFleet?.assets.find((a: FreightAsset) => laneKey(a.laneFrom, a.laneTo) === key);
      if (asset && asset.capacityTonnes > 0) {
        // Fuel burned is the voyages this tonnage actually required, at the hull's real burn rate.
        const voyages = fill.quantity / asset.capacityTonnes;
        const burned = voyages * asset.fuelTonnesPerNm * distanceNm;
        result.carrierFuelBurnedTonnes.set(ticker, (result.carrierFuelBurnedTonnes.get(ticker) ?? 0) + burned);
      }
    });
  });

  return result;
}

/** Every active carrier in the world. */
export function collectCarriers(state: GameState): Company[] {
  return state.companies.filter(c => isActiveCompany(c) && isCarrier(c));
}

export { SOURCING_REGION_IDS };

/**
 * The week's second pass: the freight market clears against the bookings the sourcing intent just
 * placed. The rate it prints is what the goods auction then charges every buyer for distance.
 */
export function runFreightClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const fxToUsd = (regionId: RegionId) => getFxToUsd(state.fxPairs, regionId);
  const carriers = collectCarriers(state);
  const clearing = runFreightClearing({
    carriers,
    regions: ctx.updatedRegions,
    unitMassTonnes: state.unitMassTonnes,
    bookings: ctx.laneBookings,
    fxToUsd,
  });
  // A lane nobody currently serves still needs a price, or a route can never open: what it would
  // cost to sail is the honest answer until somebody does.
  ctx.freightRatePerTonneLaneMoneyByLane = {
    ...clearing.marginalRatePerTonneLaneMoneyByLane,
    ...clearing.ratePerTonneLaneMoneyByLane,
  };
  state.freightRatePerTonneLaneMoneyByLane = ctx.freightRatePerTonneLaneMoneyByLane;
  ctx.freightClearing = clearing;
}
