/**
 * §5-WIRES W4 — THE GOODS LEDGER. Every move of goods between two parties is a numbered wire
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
import { pushLot } from '../../engine2/lots';
import { isStorable } from '../../domain/industry-registry';
import { RegionId } from '../../domain/geography';
import { PartyRef, partyId } from './party';
import { wire, activeWireJournal } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { defect } from '../../domain/defect';

export interface GoodsFlow { producedUnits: number; consumedUnits: number; scrappedUnits: number; mintedUnits: number }

function flowOf(region: RegionId, subUnitId: string): GoodsFlow {
  const j = activeWireJournal();
  const key = `${region}|${subUnitId}`;
  let f = j.goodsFlows[key];
  if (!f) { f = { producedUnits: 0, consumedUnits: 0, scrappedUnits: 0, mintedUnits: 0 }; j.goodsFlows[key] = f; }
  return f;
}

/** A move that stays inside one party (a firm taking its own output into its own lots): no wire. */
export const INTERNAL_MOVE = 0;

/** Goods move from one party to another. Returns the wire number (`INTERNAL_MOVE` when the two
 *  parties are one — a firm supplying itself moves nothing between parties). */
export function deliverGoods(from: PartyRef, to: PartyRef, subUnitId: string, units: number, unitPriceUSD: number, reason: string): number {
  if (!(units > 0)) return -1;
  if (partyId(from) === partyId(to)) return INTERNAL_MOVE;
  return wire({ from, to, kind: 'GOOD', asset: subUnitId, quantity: units, priceUSD: Math.max(0, unitPriceUSD), reason }, internReason);
}

/** A delivered consignment lands on the buyer's input lots, with the wire that delivered it. */
export function receiveInputLot(
  v2: V2World, buyerId: string, subUnitId: string, sellerKey: string, units: number, unitPriceUSD: number, week: number, wireNo: number
): void {
  if (!(units > 0.0001)) return;
  if (wireNo < 0) defect(`input lot of ${units} ${subUnitId} for ${buyerId} lands with no wire`);
  if (typeof process !== 'undefined' && process.env?.GOODS_TRACE === '1') {
    const j = activeWireJournal() as unknown as { lotReceipts?: Record<string, number> };
    const key = `${buyerId}|${subUnitId}`;
    (j.lotReceipts ??= {})[key] = (j.lotReceipts[key] ?? 0) + units;
  }
  pushLot(v2, buyerId, subUnitId, sellerKey, units, unitPriceUSD, week, wireNo);
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
  update: { outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueUSD: number }> },
  region: RegionId, subUnitId: string,
  initialUnits: number, arrivedUnits: number, contractUnits: number, marketUnits: number, unitPriceUSD: number
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
    if (held < -0.01) {
      // Sold more than existed: the wires say the goods left, the stock says they were never
      // there — the clamp below MINTS them. Recorded as minted, so the identity still closes
      // and the audit names the mint as its own line (W4's "no unit sold that did not exist").
      flowOf(region, subUnitId).mintedUnits += -held;
    }
    if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
    update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: Math.max(0, held), valueUSD: Math.max(0, held) * unitPriceUSD };
  } else {
    produceGoods(region, subUnitId, deliveredUnits);
    if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
    update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: 0, valueUSD: 0 };
  }
}

/** A running stock write with no production behind it — the contract deliveries' balance
 *  within the week; every unit that left did so by a wire at the delivery. */
export function setOutputStock(
  update: { outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueUSD: number }> },
  subUnitId: string, unitsHeld: number, unitPriceUSD: number
): void {
  const held = isStorable(subUnitId) ? unitsHeld : 0;
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: held, valueUSD: held * unitPriceUSD };
}

type StockHolder = { ticker: string; region: RegionId; outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueUSD: number }> };

/** Finished stock moves from one firm to another (an estate's sale to a peer): a wire, the rows follow. */
export function moveOutputUnits(from: StockHolder, to: StockHolder, subUnitId: string, units: number, valueUSD: number, reason: string): number {
  if (!(units > 1e-9)) return -1;
  const src = from.outputInventoryBySubUnit?.[subUnitId];
  if (!src || src.unitsHeld + 1e-9 < units) return defect(`${from.ticker} moves ${units} ${subUnitId} it does not hold`);
  const n = deliverGoods({ kind: 'COMPANY', ticker: from.ticker }, { kind: 'COMPANY', ticker: to.ticker }, subUnitId, units, valueUSD / units, reason);
  src.unitsHeld -= units; src.valueUSD -= valueUSD;
  const inv = to.outputInventoryBySubUnit ?? (to.outputInventoryBySubUnit = {});
  const dst = inv[subUnitId] ?? (inv[subUnitId] = { unitsHeld: 0, valueUSD: 0 });
  dst.unitsHeld += units; dst.valueUSD += valueUSD;
  return n;
}

/** Finished stock perishes or is abandoned down to a stated level: the difference is scrapped. */
export function scrapOutputUnitsTo(comp: StockHolder, subUnitId: string, unitsAfter: number, valueAfterUSD: number): void {
  const row = comp.outputInventoryBySubUnit?.[subUnitId];
  if (!row) return;
  const lost = row.unitsHeld - unitsAfter;
  if (lost > 1e-9) scrapGoods(comp.region, subUnitId, lost);
  row.unitsHeld = unitsAfter; row.valueUSD = valueAfterUSD;
}
