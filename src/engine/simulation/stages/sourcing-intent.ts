/**
 * Where a buyer intends to source, and the freight it books to get it there (XB3a-3).
 *
 * This is the first of the week's four passes, and it exists because landed cost and the freight
 * rate need each other: a buyer cannot compare sources without a rate, and the rate cannot clear
 * without knowing what wants to move. Real procurement resolves this the same way — you form a
 * sourcing plan against observed prices, you book the space, and the rate you are quoted is the
 * rate the booking clears at. Nothing iterates and nothing lags.
 *
 * What comes out is one thing used twice: the SPLIT of each region's need across the regions that
 * could supply it, and the LANE BOOKINGS that split implies. The split is not a rule with a
 * constant in it — it is a merit order on expected landed cost, cheapest first, up to what each
 * source can actually offer.
 *
 * The booking's reservation is the part that makes freight a market rather than a queue: a buyer
 * will pay, to move a tonne from a particular origin, exactly what that origin SAVES it over its
 * next-best alternative. Above that it switches source and the cargo is simply not there. Without
 * it, freight demand is perfectly inelastic against fixed capacity and the cleared rate would be
 * a bound rather than a price — the error §7.21 and §7.75 both record.
 */

import { GameState, Region, RegionId } from '../../../types';
import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { laneDistanceNm, REGION_IDS } from '../../../domain/geography';
import { deliveryModeOf } from '../../../domain/goods-physical';
import { laneKey, laneTransitWeeks } from '../../../domain/carrier';
import { WeeklyStepContext } from './context';
import { getFxToUsd } from './06-fx-and-trade';
import { collectCarriers, marginalRatesForAllLanes } from './freight-clearing';
import { convertLocal, FxToUsd } from '../../../domain/currency';

export const SOURCING_REGION_IDS = REGION_IDS;

/**
 * What a week of goods sitting in a pipeline costs its owner: the COST OF CAPITAL, because that
 * is what is tied up. The region's own policy rate is the model's real risk-free funding rate, so
 * the buyer's carry is that rate over a week — no constant, and it moves with policy, which is
 * one of the real channels by which tight money shortens supply chains.
 *
 * It is NOT the inventory carrying rate the goods market charges on output stock: that is 2% a
 * WEEK, a physical decay-and-storage figure, and using it here charged a five-week voyage nearly
 * ten percent of cargo value. That killed cross-border trade outright, took the carriers'
 * revenue with it, and defaulted the entire fleet by week twelve.
 */
function pipelineCarryCostRatePerWeek(annualPolicyRate: number): number {
  return Math.max(0, annualPolicyRate) / 52;
}

/** One region's intended purchase of one good from one origin, and the freight it needs. */
export interface LaneBooking {
  from: RegionId;
  to: RegionId;
  subUnitId: string;
  units: number;
  tonnes: number;
  /**
   * The most this cargo will pay per tonne on this lane, in the LANE's own money: what sourcing
   * from this origin saves the buyer against its next-best alternative. Zero-mass goods never
   * book. Named for its currency because mixing two of them silently is rule 8's whole point.
   */
  maxRatePerTonneLaneMoney: number;
}

/** How a region intends to split its need for one good across the regions that can supply it. */
export interface SourcingSplit {
  /** Units intended from each origin, including the buyer's own region. */
  unitsByOrigin: Record<string, number>;
  /** Expected landed cost per unit from each origin, at the rate the intent was formed against. */
  expectedLandedCostByOrigin: Record<string, number>;
}

interface SourcingIntent {
  bookings: LaneBooking[];
  /** key: `${buyerRegion}|${subUnitId}` */
  splitByRegionSubUnit: Map<string, SourcingSplit>;
}

/** What a good costs to move one unit on a lane, in the lane's own money, at a given rate. */
function freightPerUnitLocal(
  subUnitId: string,
  from: RegionId,
  to: RegionId,
  unitMassTonnes: number,
  rateUsdPerTonne: number
): number {
  if (deliveryModeOf(subUnitId) !== 'PHYSICAL') return 0;
  if (!(unitMassTonnes > 0)) return 0;
  return unitMassTonnes * rateUsdPerTonne;
}

/**
 * Can this good reach that buyer at all?
 *
 * A building is built where it stands, so no foreign origin can supply it — the only way a
 * foreign firm serves that market is by building there, which is direct investment and is a named
 * gap. A digital good reaches anywhere at no cost. Everything else is a question of price.
 */
function originIsPossible(subUnitId: string, from: RegionId, to: RegionId): boolean {
  return deliveryModeOf(subUnitId) !== 'IN_PLACE' || from === to;
}

export function computeSourcingIntent(args: {
  regions: Record<RegionId, Region>;
  subUnitIds: string[];
  unitMassTonnes: Record<string, number>;
  /** Last cleared freight, USD per tonne, by lane key. Empty at seed. */
  freightRatePerTonneLaneMoneyByLane: Partial<Record<string, number>>;
  /** What one tonne costs a carrier to move on a lane — the floor the rate falls to when the
   *  market is slack, used as the expectation before any rate has ever cleared. */
  marginalRatePerTonneLaneMoneyByLane: Partial<Record<string, number>>;
  /** XB3a-4 — the buyer's own weekly cost of capital, per region: what a week of goods sitting in
   *  a pipeline costs whoever has paid for it. */
  carryCostRatePerWeekByRegion: Record<string, number>;
  /** XB3b — USD per unit of each region's money, so a foreign quote can be compared with a
   *  domestic one. Without it the lowest-price-level region undercuts every other on every good
   *  and supplies the whole world, which is a missing conversion rather than competitiveness. */
  fxToUsd: FxToUsd;
  /** The week the intent is formed for — stamped on the record each buyer's marginal route leaves. */
  week: number;
}): SourcingIntent {
  const { regions, subUnitIds, unitMassTonnes, freightRatePerTonneLaneMoneyByLane, marginalRatePerTonneLaneMoneyByLane, fxToUsd, carryCostRatePerWeekByRegion, week } = args;
  const bookings: LaneBooking[] = [];
  const splitByRegionSubUnit = new Map<string, SourcingSplit>();

  const expectedRate = (from: RegionId, to: RegionId): number => {
    const key = laneKey(from, to);
    const cleared = freightRatePerTonneLaneMoneyByLane[key];
    if (typeof cleared === 'number' && cleared > 0 && isFinite(cleared)) return cleared;
    // Before a lane has ever cleared, the honest expectation is what it costs a carrier to do it.
    return marginalRatePerTonneLaneMoneyByLane[key] ?? 0;
  };

  subUnitIds.forEach(subUnitId => {
    const massTonnes = unitMassTonnes[subUnitId] ?? 0;

    // Every (buyer, origin) pair that is physically possible, with what it would land at.
    interface Pair { buyer: RegionId; origin: RegionId; exWorks: number; exWorksInBuyerMoney: number; landed: number }
    const pairs: Pair[] = [];
    const needRemaining: Partial<Record<string, number>> = {};
    const supplyRemaining: Partial<Record<string, number>> = {};

    SOURCING_REGION_IDS.forEach(buyer => {
      const buyerState = regions[buyer].categoryDemand[subUnitId];
      if (!buyerState) return;
      const needUnits = Number(buyerState.totalUnitsDemandedThisWeek);
      if (!(needUnits > 0)) return;
      needRemaining[buyer] = needUnits;

      SOURCING_REGION_IDS.forEach(origin => {
        if (!originIsPossible(subUnitId, origin, buyer)) return;
        const originState = regions[origin].categoryDemand[subUnitId];
        if (!originState) return;
        const exWorks = Number(originState.unitPriceLocal);
        if (!(exWorks > 0)) return;
        if (supplyRemaining[origin] === undefined) {
          supplyRemaining[origin] = Math.max(0, Number(originState.totalUnitsSuppliedThisWeek) || 0);
        }
        // Both legs converted into the BUYER's money, which is the only basis on which a
        // foreign quote and a domestic one are the same kind of number. A lane is quoted in its
        // ORIGIN's money, because that is where the carrier's fuel and crew are paid.
        const exWorksInBuyerMoney = convertLocal(exWorks, origin, buyer, fxToUsd);
        const freightOriginMoney = freightPerUnitLocal(subUnitId, origin, buyer, massTonnes, expectedRate(origin, buyer));
        const freightInBuyerMoney = convertLocal(freightOriginMoney, origin, buyer, fxToUsd);
        // XB3a-4: a distant source is dearer than its price and freight, because everything
        // ordered from it sits in a pipeline the buyer has paid for and cannot yet use. Five
        // weeks at sea is five weeks of carrying cost on every unit, and that is what makes a
        // nearer, dearer supplier worth having — the real reason procurement dual-sources rather
        // than simply buying the cheapest quote in the world.
        const transit = laneTransitWeeks(origin, buyer, laneDistanceNm(origin, buyer));
        const pipelineCost = exWorksInBuyerMoney * (carryCostRatePerWeekByRegion[buyer] ?? 0) * transit;
        pairs.push({
          buyer, origin, exWorks, exWorksInBuyerMoney,
          landed: exWorksInBuyerMoney + freightInBuyerMoney + pipelineCost,
        });
      });
    });
    if (pairs.length === 0) return;

    // One merit order over the WHOLE market, not one per buyer. An origin's output is a single
    // pool that every buyer is competing for — allocating it to each of them independently
    // promises the same tonne four times over, and sizes four times the ships to carry it.
    // Cheapest delivered goes first, which is both the fair allocation and the market's own.
    pairs.sort((a, b) => a.landed - b.landed);

    const allocated: { pair: Pair; units: number; alternativeLanded: number; alternativeOrigin?: RegionId }[] = [];
    pairs.forEach((pair, i) => {
      const need = needRemaining[pair.buyer] ?? 0;
      const supply = supplyRemaining[pair.origin] ?? 0;
      const take = Math.min(need, supply);
      if (!(take > 0)) return;

      // What this buyer would have done instead: the next origin still holding stock. NOT the
      // cheapest origin overall — that one is already sold out, which is precisely why we are
      // here. Getting this wrong made every origin but the world's cheapest show a negative
      // surplus, so no freight was ever booked for them and three of the four regions exported
      // nothing at all.
      let alternativeLanded = Infinity;
      let alternativeOrigin: RegionId | undefined;
      for (let j = i + 1; j < pairs.length; j++) {
        const next = pairs[j];
        if (next.buyer !== pair.buyer) continue;
        if ((supplyRemaining[next.origin] ?? 0) - (next.origin === pair.origin ? take : 0) <= 0) continue;
        alternativeLanded = next.landed;
        alternativeOrigin = next.origin;
        break;
      }
      if (!isFinite(alternativeLanded)) {
        const ownPrice = Number(regions[pair.buyer].categoryDemand[subUnitId]?.unitPriceLocal);
        alternativeLanded = ownPrice > 0 ? ownPrice : pair.landed;
      }

      needRemaining[pair.buyer] = need - take;
      supplyRemaining[pair.origin] = supply - take;
      allocated.push({ pair, units: take, alternativeLanded, alternativeOrigin });
    });

    allocated.forEach(({ pair, units, alternativeLanded, alternativeOrigin }) => {
      const key = `${pair.buyer}|${subUnitId}`;
      const split = splitByRegionSubUnit.get(key)
        ?? { unitsByOrigin: {}, expectedLandedCostByOrigin: {} };
      split.unitsByOrigin[pair.origin] = (split.unitsByOrigin[pair.origin] ?? 0) + units;
      split.expectedLandedCostByOrigin[pair.origin] = pair.landed;
      splitByRegionSubUnit.set(key, split);
      // §3.27-iii-c-ii: the marginal route this buyer left with stock. Merit order runs cheapest
      // first, so the buyer's LAST allocation leaves the record; a buyer with no such route this
      // week leaves none, and the audit (X2) holds the landed price paid to what is left.
      const buyerState = regions[pair.buyer].categoryDemand[subUnitId];
      if (buyerState) {
        regions[pair.buyer].categoryDemand[subUnitId] = { ...buyerState, cheapestAlternativeLandedLocal: alternativeOrigin !== undefined ? { week, origin: alternativeOrigin, landedLocal: alternativeLanded } : undefined };
      }

      if (!(massTonnes > 0)) return; // digital and in-place goods book no freight
      // The surplus is computed in the buyer's money, then quoted back into the lane's own
      // currency so it can be compared with what a carrier there will accept.
      const maxFreightPerUnitBuyerMoney = alternativeLanded - pair.exWorksInBuyerMoney;
      if (!(maxFreightPerUnitBuyerMoney > 0)) return; // not worth reaching at any freight
      const maxFreightPerUnitLaneMoney = convertLocal(maxFreightPerUnitBuyerMoney, pair.buyer, pair.origin, fxToUsd);
      bookings.push({
        from: pair.origin,
        to: pair.buyer,
        subUnitId,
        units,
        tonnes: units * massTonnes,
        maxRatePerTonneLaneMoney: maxFreightPerUnitLaneMoney / massTonnes,
      });
    });
  });

  return { bookings, splitByRegionSubUnit };
}

/**
 * The week's first pass: every region decides where it intends to buy, and books the freight that
 * implies. Runs before the freight market, which clears against these bookings, and before the
 * goods auction, which sources at the rate that clears.
 */
/** Each region's weekly cost of capital, from its own real policy rate. */
export function carryRatesByRegion(regions: Record<RegionId, Region>): Record<string, number> {
  const rates: Record<string, number> = {};
  SOURCING_REGION_IDS.forEach(r => {
    rates[r] = pipelineCarryCostRatePerWeek(regions[r].policyRate);
  });
  return rates;
}

export function runSourcingIntentStage(state: GameState, ctx: WeeklyStepContext): void {
  const fxToUsd = (regionId: RegionId) => getFxToUsd(state.fxPairs, regionId);
  const marginal = marginalRatesForAllLanes(collectCarriers(state), ctx.updatedRegions, state.unitMassTonnes, fxToUsd, ctx.nextWeek);
  const intent = computeSourcingIntent({
    regions: ctx.updatedRegions,
    subUnitIds: Object.values(INDUSTRY_SUBUNITS).flat().map(su => su.unitId),
    unitMassTonnes: state.unitMassTonnes,
    freightRatePerTonneLaneMoneyByLane: state.freightRatePerTonneLaneMoneyByLane,
    marginalRatePerTonneLaneMoneyByLane: marginal,
    fxToUsd,
    carryCostRatePerWeekByRegion: carryRatesByRegion(ctx.updatedRegions),
    week: ctx.nextWeek,
  });
  ctx.sourcingSplitByRegionSubUnit = intent.splitByRegionSubUnit;
  ctx.laneBookings = intent.bookings;
}
