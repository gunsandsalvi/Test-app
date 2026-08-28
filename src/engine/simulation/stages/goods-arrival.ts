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

import { GameState } from '../../../types';
import { InputLot } from '../../../domain/company';
import { WeeklyStepContext } from './context';

/** A consignment bought, paid for, and still on its way. */
export interface InTransitShipment {
  buyerTicker: string;
  sellerKey: string;
  subUnitId: string;
  units: number;
  /** What the buyer paid per unit, in its own money — price, freight and all. */
  landedCostPerUnit: number;
  arrivalWeek: number;
}

export function runGoodsArrivalStage(state: GameState, ctx: WeeklyStepContext): void {
  const inFlight = state.goodsInTransit ?? [];
  if (inFlight.length === 0) return;

  const stillMoving: InTransitShipment[] = [];
  let arrivedUnits = 0;
  const { companyUpdates } = ctx;

  // One index, not a scan per shipment. The `.find` this replaces walked ~2,000 firms for every
  // one of ~10,000 in-transit consignments — O(shipments x firms), the exact per-item-scan
  // anti-pattern §7.32 records three prior instances of, and it made a stage that hands boxes to
  // their owners cost 99ms a week. Public firms first so a duplicate ticker resolves the same
  // way the sequential find did (tickers are unique by construction; this is belt and braces).
  const firmByTicker = new Map<string, (typeof ctx.prevActiveFirms)[number]>();
  ctx.prevActivePrivateFirms.forEach(c => firmByTicker.set(c.ticker, c));
  ctx.prevActiveFirms.forEach(c => firmByTicker.set(c.ticker, c));

  inFlight.forEach(shipment => {
    if (shipment.arrivalWeek > state.currentWeek) { stillMoving.push(shipment); return; }
    if (!companyUpdates[shipment.buyerTicker]) companyUpdates[shipment.buyerTicker] = {};
    const update = companyUpdates[shipment.buyerTicker];
    if (!update.inputInventoryBySubUnit) update.inputInventoryBySubUnit = {};
    const buyer = firmByTicker.get(shipment.buyerTicker);
    // A buyer that no longer exists cannot take delivery; the consignment is written off rather
    // than landed on nobody, which would be inventory with no owner.
    if (!buyer) return;
    const existing: InputLot[] = update.inputInventoryBySubUnit[shipment.subUnitId]
      ?? [...(buyer.inputInventoryBySubUnit?.[shipment.subUnitId] ?? [])];
    update.inputInventoryBySubUnit[shipment.subUnitId] = [
      ...existing,
      {
        sellerId: shipment.sellerKey,
        unitsHeld: shipment.units,
        unitPriceUSD: shipment.landedCostPerUnit,
        acquiredWeek: state.currentWeek,
      },
    ];
    arrivedUnits += shipment.units;
  });

  state.goodsInTransit = stillMoving;
  ctx.goodsArrivedUnits = arrivedUnits;
}
