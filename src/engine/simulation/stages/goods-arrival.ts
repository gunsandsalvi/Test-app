/**
 * Goods land (XB3a-4).
 *
 * A purchase used to arrive the week it cleared, from anywhere, which quietly made distance free
 * in the one dimension freight does not price: TIME. A consignment crossing the Pacific is five
 * weeks of a buyer's capital sitting on a ship, and five weeks in which whatever it was ordered
 * for has to run on stock that is already in the yard.
 *
 * That is what makes dual sourcing rational rather than a preference. A nearer, dearer supplier
 * is worth having precisely because it answers quickly, and no coefficient has to say so — the
 * sourcing intent already charges every origin the carrying cost of its own lead time, and a firm
 * whose inputs have not arrived is constrained by the machinery stage 08 already has.
 */

import { profileKeyOf } from './profiles';
import { arrivePlant } from '../../ledger/plant-ledger';
import { GameState } from '../../../types';
import { asTicker } from '../../../domain/ids';
import { companyParty, companyPartyOf } from '../../../domain/party';
import { WeeklyStepContext } from './context';
import { ensureV2 } from '../../../engine2/world';
import { deliverGoods, receiveInputLot, scrapGoods, consumeGoods } from '../../ledger/goods-ledger';
import { RegionId } from '../../../types';
import { PartyRef } from '../../ledger/party';
import { purchaseKindOf, commissioningLeadWeeksOf } from '../../../domain/industry-registry';
import type { Ticker, EntityId } from '../../../domain/ids';

/** A consignment bought, paid for, and still on its way. */
export interface InTransitShipment {
  buyerId: EntityId;
  sellerKey: string;
  subUnitId: string;
  units: number;
  /** What the buyer paid per unit, in its own money — price, freight and all. */
  landedCostPerUnit: number;
  arrivalWeek: number;
  /** Who holds the consignment while it moves — a named carrier, or the origin
   *  region's transport pool (no ticker) on a lane no named fleet serves. */
  carrierId?: EntityId;
  carrierRegion?: RegionId;
}

/**
 * BOTH ENDS OF A SHIPMENT FOLLOW THE BOOKS. A firm that is absorbed — by a merger, or by the
 * resolution of a bank into the one that assumes it — hands over its deliveries with everything
 * else it owns: what was on its way TO it is now owed to the successor, and what was on its way
 * FROM it is now shipped by the successor. Left un-keyed, the consignment names a firm that no
 * longer exists and stays on the water against nobody for the rest of the run.
 */
export function reassignConsignments(
  state: GameState,
  from: { ticker: Ticker; id: EntityId },
  to: { ticker: Ticker; id: EntityId }
): void {
  (state.goodsInTransit ?? []).forEach((sh) => {
    if (sh.buyerId === from.id) sh.buyerId = to.id;
    const seller = String(sh.sellerKey ?? '');
    const sellerId = seller.replace(/^.*:/, '');
    if (sellerId !== from.id && sellerId !== from.ticker) return;
    sh.sellerKey = seller.slice(0, seller.length - sellerId.length)
      + (sellerId === from.id ? to.id : to.ticker);
  });
}

export function runGoodsArrivalStage(state: GameState, ctx: WeeklyStepContext): void {
  const inFlight = state.goodsInTransit ?? [];
  if (inFlight.length === 0) return;
  const v2 = ensureV2(state);

  const stillMoving: InTransitShipment[] = [];
  let arrivedUnits = 0;
  const { companyUpdates } = ctx;

  // One index, not a scan per shipment. The `.find` this replaces walked ~2,000 firms for every
  // one of ~10,000 in-transit consignments — O(shipments x firms), the exact per-item-scan
  // anti-pattern, and it made a stage that hands boxes to
  // their owners cost 99ms a week. Public firms first so a duplicate ticker resolves the same
  // way the sequential find did (tickers are unique by construction; this is belt and braces).
  const firmById = new Map<EntityId, (typeof ctx.prevActiveFirms)[number]>();
  ctx.prevActivePrivateFirms.forEach(c => firmById.set(c.id, c));
  ctx.prevActiveFirms.forEach(c => firmById.set(c.id, c));
  // A dead buyer with an OPEN estate still takes delivery — the receiver
  // liquidates what arrives (the workout sells input lots to peers as it sells finished stock).
  const openEstateIds = new Set((ctx.estates ?? []).filter((e) => e.closedWeek === undefined).map((e) => e.companyId));
  const estateById = new Map<EntityId, (typeof ctx.updatedCompanies)[number]>();
  ctx.updatedCompanies.forEach((c) => { if (c.isDefaulted && openEstateIds.has(c.id)) estateById.set(c.id, c); });

  inFlight.forEach(shipment => {
    if (shipment.arrivalWeek > state.currentWeek) { stillMoving.push(shipment); return; }
    const buyer = firmById.get(shipment.buyerId) ?? estateById.get(shipment.buyerId);
    const toEstate = buyer !== undefined && !firmById.has(shipment.buyerId);
    // `companyUpdates` is keyed by TICKER (its own field, its own commit); a shipment names its
    // buyer by entity id, so the buyer is resolved first and its ticker used for that channel.
    const buyerTicker = buyer?.ticker ?? asTicker(shipment.buyerId);
    if (!companyUpdates[buyerTicker]) companyUpdates[buyerTicker] = {};
    const update = companyUpdates[buyerTicker];
    const carrier: PartyRef = shipment.carrierId
      ? companyPartyOf(shipment.carrierId)
      : { kind: 'SEGMENT', region: shipment.carrierRegion ?? (buyer?.region ?? 'USA'), industry: 'AutomotiveTransport' };
    // A buyer that no longer exists cannot take delivery; the consignment is written off rather
    // than landed on nobody, which would be inventory with no owner — the carrier scraps it.
    if (!buyer) {
      // A named carrier held it (it was stock, in the carrier's region) and now writes it off; one
      // the transport pool carried passed through a sink at dispatch and was never stock.
      if (shipment.carrierId && shipment.carrierRegion) scrapGoods(shipment.carrierRegion, shipment.subUnitId, shipment.units);
      return;
    }
    // The consignment leaves the carrier's hands for the buyer's, by wire.
    const wireNo = deliverGoods(carrier, companyParty(buyer), shipment.subUnitId, shipment.units, shipment.landedCostPerUnit, 'consignment delivered');
    // Copy once on first touch, append in place after — same list, none of the per-shipment
    // whole-array rebuilds (the GC was 10% of the weekly step before this pass).
    // What arrives is routed by what it IS — a machine crossing an ocean becomes PP&E the
    // week it lands, not a lot nobody consumes.
    // §3.26-f-iv-b: what the purchase IS is the buyer's question — its own recipe, or a capital good.
    const kind = purchaseKindOf(shipment.subUnitId, buyer.productLines, profileKeyOf(buyer));
    if (toEstate && kind !== 'RECIPE_INPUT') {
      // A machine or an operating purchase landing at a receivership has no plant to enter and
      // no week to be used in: scrapped by wire on landing (the estate's own account paid for it).
      scrapGoods(buyer!.region, shipment.subUnitId, shipment.units);
      return;
    }
    if (kind !== 'RECIPE_INPUT') {
      if (kind === 'CAPITAL_GOOD') {
        // Landing is not entering service. An imported machine is commissioned on the
        // same lead a domestic one is; the ocean crossing was the other half of the wait.
        if (!update.capexUnderConstruction) update.capexUnderConstruction = [];
        update.capexUnderConstruction.push({
          valueLocal: shipment.units * shipment.landedCostPerUnit,
          entersServiceWeek: ctx.nextWeek + commissioningLeadWeeksOf(shipment.subUnitId),
          kind: shipment.subUnitId, // §3.26-f-iv-a: the vintage will know what it is
        });
        arrivePlant(buyer.id, shipment.units * shipment.landedCostPerUnit); // §3.26-f-iii: W6's queue leg
      }
      arrivedUnits += shipment.units;
      // A machine becomes plant and an operating purchase is used on landing —
      // consumed on receipt, never stock.
      consumeGoods(buyer.region, shipment.subUnitId, shipment.units);
      return;
    }
    // The consignment lands on the persistent lot table.
    receiveInputLot(v2, buyer.id, buyer.region, shipment.subUnitId, shipment.sellerKey,
      shipment.units, shipment.landedCostPerUnit, state.currentWeek, wireNo);
    arrivedUnits += shipment.units;
  });

  state.goodsInTransit = stillMoving;
  ctx.goodsArrivedUnits = arrivedUnits;
}
