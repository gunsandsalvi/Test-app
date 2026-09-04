/**
 * THE GOODS LEDGER. Every move of goods between two parties is a numbered wire
 * (kind GOOD, the sub-unit as the asset, units as the quantity, the unit price the move was
 * struck at); what is not a move — production, consumption in a recipe, scrappage — is a
 * TRANSFORMATION recorded on the same journal, so the week's stock identity closes per region
 * and sub-unit: Δ(output stock + input lots + in transit) = produced − consumed − scrapped +
 * wires in − wires out. A carrier HOLDS a consignment while it is in transit (seller → carrier at
 * dispatch, carrier → buyer at arrival); a household or a treasury is a sink (what it buys is
 * consumed), a segment pool sells from no stock.
 *
 * The lot store (a firm's input inventory) is sealed: `pushLot` demands the wire that delivered
 * the lot, and only the ledger (and the kernels' FIFO draw, which records what it consumed) may
 * write it. The output stock stays the company's own record, written here only.
 */
import { V2World } from '../../engine2/world';
import { pushLot, consumeFifo } from '../../engine2/lots';
import { isStorable } from '../../domain/industry-registry';
import { RegionId } from '../../domain/geography';
import { PartyRef, partyId } from './party';
import { wire, activeWireJournal } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { defect } from '../../domain/defect';

export interface GoodsFlow { producedUnits: number; consumedUnits: number; scrappedUnits: number }

function flowOf(region: RegionId, subUnitId: string): GoodsFlow {
  const j = activeWireJournal();
  const key = `${region}|${subUnitId}`;
  let f = j.goodsFlows[key];
  if (!f) { f = { producedUnits: 0, consumedUnits: 0, scrappedUnits: 0 }; j.goodsFlows[key] = f; }
  return f;
}

/** A move that stays inside one party (a firm taking its own output into its own lots): no wire. */
export const INTERNAL_MOVE = 0;

/** Goods move from one party to another. Returns the wire number (`INTERNAL_MOVE` when the two
 *  parties are one — a firm supplying itself moves nothing between parties). */
export function deliverGoods(from: PartyRef, to: PartyRef, subUnitId: string, units: number, unitPriceLocal: number, reason: string): number {
  if (!(units > 0)) return -1;
  if (partyId(from) === partyId(to)) return INTERNAL_MOVE;
  // A negative unit price arriving here is an arithmetic error at the caller. Floored, it became
  // a free delivery and defeated the wire ledger's own write-site guard.
  if (unitPriceLocal < 0) defect(`${subUnitId} delivered at ${unitPriceLocal} per unit (${reason})`);
  return wire({ from, to, kind: 'GOOD', asset: subUnitId, quantity: units, priceLocal: unitPriceLocal, reason }, internReason);
}

/** A delivered consignment lands on the buyer's input lots, with the wire that delivered it. */
export function receiveInputLot(
  v2: V2World, buyerId: string, subUnitId: string, sellerKey: string, units: number, unitPriceLocal: number, week: number, wireNo: number
): void {
  if (!(units > 0.0001)) return;
  if (wireNo < 0) defect(`input lot of ${units} ${subUnitId} for ${buyerId} lands with no wire`);
  if (typeof process !== 'undefined' && process.env?.GOODS_TRACE === '1') {
    const j = activeWireJournal() as unknown as { lotReceipts?: Record<string, number> };
    const key = `${buyerId}|${subUnitId}`;
    (j.lotReceipts ??= {})[key] = (j.lotReceipts[key] ?? 0) + units;
  }
  pushLot(v2, buyerId, subUnitId, sellerKey, units, unitPriceLocal, week, wireNo);
}

/** Units finished this week (a transformation, not a move). */
export function produceGoods(region: RegionId, subUnitId: string, units: number): void {
  if (units > 0) flowOf(region, subUnitId).producedUnits += units;
}
/** Units drawn into a recipe (a transformation, not a move). */
export function consumeGoods(region: RegionId, subUnitId: string, units: number): void {
  if (units > 0) flowOf(region, subUnitId).consumedUnits += units;
}
/** Units that perished or were abandoned (a transformation, not a move). */
export function scrapGoods(region: RegionId, subUnitId: string, units: number): void {
  if (units > 0) flowOf(region, subUnitId).scrappedUnits += units;
}

/**
 * The seller's finished-goods stock after the week's sales: what it held, plus what the
 * pipeline finished, less what it delivered (every delivery is a wire written by the caller).
 * A good that cannot be held is never held — its unsold capacity was unused, not produced.
 */
export function settleOutputInventory(
  update: { outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueLocal: number }> },
  region: RegionId, subUnitId: string,
  initialUnits: number, arrivedUnits: number, contractUnits: number, marketUnits: number, unitPriceLocal: number
): void {
  const storable = isStorable(subUnitId);
  const deliveredUnits = contractUnits + marketUnits;
  if (typeof process !== 'undefined' && process.env?.GOODS_TRACE === '1') {
    const j = activeWireJournal(); const key = `${region}|${subUnitId}`;
    (j.goodsDelivered ??= {})[key] = (j.goodsDelivered[key] ?? 0) + deliveredUnits;
  }
  if (storable) {
    produceGoods(region, subUnitId, arrivedUnits);
    // In this association order — the stage's own — so the stock is bit-identical to what it was.
    const held = initialUnits + arrivedUnits - contractUnits - marketUnits;
    // A STOCK CANNOT BE NEGATIVE, AND NO SALE MAY MAKE IT ONE. The wires have already said the
    // goods left; writing the balance as zero would mint the difference, so the sale that
    // oversold the stock is the defect and it is named here. Below the noise of summing
    // thousands of lots the balance is simply zero.
    const dustUnits = 1e-9 * Math.max(1, initialUnits + arrivedUnits);
    if (held < -dustUnits) {
      defect(`${region} ${subUnitId} sold ${(-held).toFixed(4)} units it never held`
        + ` — ${initialUnits.toFixed(2)} in stock and ${arrivedUnits.toFixed(2)} arrived against`
        + ` ${contractUnits.toFixed(2)} on contract and ${marketUnits.toFixed(2)} at auction`);
    }
    const heldUnits = held < 0 ? 0 : held;
    if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
    update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: heldUnits, valueLocal: heldUnits * unitPriceLocal };
  } else {
    produceGoods(region, subUnitId, deliveredUnits);
    if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
    update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: 0, valueLocal: 0 };
  }
}

/** A running stock write with no production behind it — the contract deliveries' balance
 *  within the week; every unit that left did so by a wire at the delivery. */
export function setOutputStock(
  update: { outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueLocal: number }> },
  subUnitId: string, unitsHeld: number, unitPriceLocal: number
): void {
  const held = isStorable(subUnitId) ? unitsHeld : 0;
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: held, valueLocal: held * unitPriceLocal };
}

type StockHolder = { ticker: string; region: RegionId; outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueLocal: number }> };

/** Finished stock moves from one firm to another (an estate's sale to a peer): a wire, the rows follow. */
export function moveOutputUnits(from: StockHolder, to: StockHolder, subUnitId: string, units: number, valueLocal: number, reason: string): number {
  if (!(units > 1e-9)) return -1;
  const src = from.outputInventoryBySubUnit?.[subUnitId];
  if (!src || src.unitsHeld + 1e-9 < units) return defect(`${from.ticker} moves ${units} ${subUnitId} it does not hold`);
  const n = deliverGoods({ kind: 'COMPANY', ticker: from.ticker }, { kind: 'COMPANY', ticker: to.ticker }, subUnitId, units, valueLocal / units, reason);
  src.unitsHeld -= units; src.valueLocal -= valueLocal;
  const inv = to.outputInventoryBySubUnit ?? (to.outputInventoryBySubUnit = {});
  const dst = inv[subUnitId] ?? (inv[subUnitId] = { unitsHeld: 0, valueLocal: 0 });
  dst.unitsHeld += units; dst.valueLocal += valueLocal;
  return n;
}

/** Input lots move from one firm to another (an estate's sale to a
 *  peer): a wire; the units leave the seller's chain FIFO and land as one lot on the buyer at
 *  the cost they left at. Returns the wire number, or -1 when nothing moved. */
export function moveInputUnits(v2: V2World, from: { id: string; ticker: string }, to: { id: string; ticker: string }, subUnitId: string, units: number, week: number, reason: string): number {
  if (!(units > 1e-9)) return -1;
  const drawn = consumeFifo(v2, from.id, subUnitId, units);
  const moved = Math.min(units, drawn.availableUnits);
  if (!(moved > 1e-9)) return -1;
  let costLocal = 0; for (const c of drawn.costsLocal) costLocal += c;
  const n = deliverGoods({ kind: 'COMPANY', ticker: from.ticker }, { kind: 'COMPANY', ticker: to.ticker }, subUnitId, moved, costLocal / moved, reason);
  pushLot(v2, to.id, subUnitId, `ESTATE:${from.ticker}`, moved, costLocal / moved, week, n);
  return n;
}

/** Input lots perish or are abandoned: the units leave the chain FIFO and are scrapped. */
export function scrapInputUnits(v2: V2World, from: { id: string; region: RegionId }, subUnitId: string, units: number): void {
  if (!(units > 1e-9)) return;
  const drawn = consumeFifo(v2, from.id, subUnitId, units);
  const lost = Math.min(units, drawn.availableUnits);
  if (lost > 1e-9) scrapGoods(from.region, subUnitId, lost);
}

/** Finished stock perishes or is abandoned down to a stated level: the difference is scrapped. */
export function scrapOutputUnitsTo(comp: StockHolder, subUnitId: string, unitsAfter: number, valueAfterLocal: number): void {
  const row = comp.outputInventoryBySubUnit?.[subUnitId];
  if (!row) return;
  const lost = row.unitsHeld - unitsAfter;
  if (lost > 1e-9) scrapGoods(comp.region, subUnitId, lost);
  row.unitsHeld = unitsAfter; row.valueLocal = valueAfterLocal;
}
