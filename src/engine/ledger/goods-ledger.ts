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
import { V2World, typeRefOf } from '../../engine2/world';
import { mutableHoldings, bookHeadOf, openKindRow, appendLot, adjustLots, instrumentIdAt, rowUnits, markBookDirty, relinkBook } from '../../engine2/holdings';
import type { EntityId } from '../../domain/ids';
import { companyParty } from '../../domain/party';
import { pushLot, consumeFifo } from '../../engine2/lots';
import { isStorable } from '../../domain/industry-registry';
import { RegionId } from '../../domain/geography';
import { PartyRef, partyId } from './party';
import { wire, activeWireJournal } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { defect } from '../../domain/defect';
import type { Ticker } from '../../domain/ids';

interface GoodsFlow { producedUnits: number; consumedUnits: number; scrappedUnits: number }

function flowOf(region: RegionId, subUnitId: string): GoodsFlow {
  const j = activeWireJournal();
  const key = `${region}|${subUnitId}`;
  let f = j.goodsFlows[key];
  if (!f) { f = { producedUnits: 0, consumedUnits: 0, scrappedUnits: 0 }; j.goodsFlows[key] = f; }
  return f;
}

/** A move that stays inside one party (a firm taking its own output into its own lots): no wire. */
const INTERNAL_MOVE = 0;

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
  v2: V2World, buyerId: string, buyerRegion: RegionId, subUnitId: string, sellerKey: string, units: number, unitPriceLocal: number, week: number, wireNo: number
): void {
  if (!(units > 0.0001)) return;
  if (wireNo < 0) defect(`input lot of ${units} ${subUnitId} for ${buyerId} lands with no wire`);
  if (typeof process !== 'undefined' && process.env.GOODS_TRACE === '1') {
    const j = activeWireJournal() as unknown as { lotReceipts?: Record<string, number> };
    const key = `${buyerId}|${subUnitId}`;
    (j.lotReceipts ??= {})[key] = (j.lotReceipts[key] ?? 0) + units;
  }
  pushLot(v2, buyerId, buyerRegion, subUnitId, sellerKey, units, unitPriceLocal, week, wireNo);
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
  update: { outputInventoryBySubUnit?: Partial<Record<string, { unitsHeld: number; valueLocal: number }>> },
  region: RegionId, subUnitId: string,
  initialUnits: number, arrivedUnits: number, contractUnits: number, marketUnits: number, unitPriceLocal: number
): void {
  const storable = isStorable(subUnitId);
  const deliveredUnits = contractUnits + marketUnits;
  if (typeof process !== 'undefined' && process.env.GOODS_TRACE === '1') {
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
  update: { outputInventoryBySubUnit?: Partial<Record<string, { unitsHeld: number; valueLocal: number }>> },
  /**
   * §3.13-INV-ii — THE ROW THE FIRM CAME INTO THE WEEK WITH. A running balance CARRIES the value
   * per unit it already had; it does not value anything. This took a PRICE and re-marked the row
   * at it, which made the mid-week balance a SECOND valuation of the same stock in the same week —
   * struck at last week's published LANDED price, against the ex-works price this week's auction
   * clears the row at in step 8 of the same pass. Which of the two survived depended on whether
   * the supplier had a supply plan at all: one that sells only on contract kept the stale landed
   * mark all the way to stage 08 and filed it.
   */
  prior: { unitsHeld: number; valueLocal: number } | undefined,
  subUnitId: string, unitsHeld: number
): void {
  const held = isStorable(subUnitId) ? unitsHeld : 0;
  const perUnitLocal = prior && prior.unitsHeld > 0 ? prior.valueLocal / prior.unitsHeld : 0;
  if (!update.outputInventoryBySubUnit) update.outputInventoryBySubUnit = {};
  update.outputInventoryBySubUnit[subUnitId] = { unitsHeld: held, valueLocal: held * perUnitLocal };
}

type StockHolder = { id: EntityId; ticker: Ticker; region: RegionId; outputInventoryBySubUnit?: Partial<Record<string, { unitsHeld: number; valueLocal: number }>> };

/** Finished stock moves from one firm to another (an estate's sale to a peer): a wire, the rows follow. */
export function moveOutputUnits(from: StockHolder, to: StockHolder, subUnitId: string, units: number, valueLocal: number, reason: string): number {
  if (!(units > 1e-9)) return -1;
  const src = from.outputInventoryBySubUnit?.[subUnitId];
  if (!src || src.unitsHeld + 1e-9 < units) return defect(`${from.ticker} moves ${units} ${subUnitId} it does not hold`);
  const n = deliverGoods(companyParty(from), companyParty(to), subUnitId, units, valueLocal / units, reason);
  src.unitsHeld -= units; src.valueLocal -= valueLocal;
  const inv = to.outputInventoryBySubUnit ?? (to.outputInventoryBySubUnit = {});
  const dst = inv[subUnitId] ?? (inv[subUnitId] = { unitsHeld: 0, valueLocal: 0 });
  dst.unitsHeld += units; dst.valueLocal += valueLocal;
  return n;
}

/** Input lots move from one firm to another (an estate's sale to a
 *  peer): a wire; the units leave the seller's chain FIFO and land as one lot on the buyer at
 *  the cost they left at. Returns the wire number, or -1 when nothing moved. */
export function moveInputUnits(v2: V2World, from: { id: EntityId; ticker: string }, to: { id: EntityId; ticker: string; region: RegionId }, subUnitId: string, units: number, week: number, reason: string): number {
  if (!(units > 1e-9)) return -1;
  const drawn = consumeFifo(v2, from.id, subUnitId, units);
  const moved = Math.min(units, drawn.availableUnits);
  if (!(moved > 1e-9)) return -1;
  let costLocal = 0; for (const c of drawn.costsLocal) costLocal += c;
  const n = deliverGoods(companyParty(from), companyParty(to), subUnitId, moved, costLocal / moved, reason);
  pushLot(v2, to.id, to.region, subUnitId, `ESTATE:${from.ticker}`, moved, costLocal / moved, week, n);
  return n;
}

/**
 * §3.20-i-b — AN ESTATE'S INPUT LOTS BECOME STOCK FOR SALE. A receiver does not run the plant,
 * so what the dead firm bought to consume is now goods it holds to sell: the lots leave the
 * input chain FIFO and land on the firm's own finished-stock row of the same good, at the cost
 * they were carried at. Same holder, same good, same units — a reclassification, not a wire —
 * and the goods auction then offers the row like any seller's. Returns the units moved.
 */
export function reclassifyInputLotsAsStock(v2: V2World, comp: StockHolder, subUnitId: string): number {
  const drawn = consumeFifo(v2, comp.id, subUnitId, Number.POSITIVE_INFINITY);
  const units = drawn.availableUnits;
  if (!(units > 1e-9)) return 0;
  let costLocal = 0; for (const c of drawn.costsLocal) costLocal += c;
  const inv = comp.outputInventoryBySubUnit ?? (comp.outputInventoryBySubUnit = {});
  const row = inv[subUnitId] ?? (inv[subUnitId] = { unitsHeld: 0, valueLocal: 0 });
  row.unitsHeld += units; row.valueLocal += costLocal;
  return units;
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


/**
 * §3.13-INV-ii-b — A WEEK OF SPOILAGE ON A FIRM'S FINISHED STOCK, and `goods.md` E4's missing
 * writer. What perishes is UNITS: the value follows them at the row's own basis per unit, which is
 * what makes this a loss of stock rather than a re-mark of it. Recorded as a transformation on the
 * week's journal, like production and scrappage, so W4 still closes — units that vanish with
 * nothing saying so are exactly what that identity exists to catch.
 *
 * It runs where the week's stock is FINALLY decided (`stage08-back`'s one merged record, §3.13-INV-ii),
 * because anything applied earlier is overwritten by whatever stage 05 settled — which is how the
 * carrying-cost write-down this replaces came to be dead for every good that traded.
 */
export function spoilOutputStock(
  record: Partial<Record<string, { unitsHeld: number; valueLocal: number }>>,
  region: RegionId,
  weeklySpoilShareOf: (subUnitId: string) => number,
): Partial<Record<string, { unitsHeld: number; valueLocal: number }>> {
  let touched = false;
  const out: Partial<Record<string, { unitsHeld: number; valueLocal: number }>> = {};
  for (const [subUnitId, inv] of Object.entries(record)) {
    if (!inv) continue;
    const share = Math.max(0, Math.min(1, weeklySpoilShareOf(subUnitId)));
    const spoiledUnits = inv.unitsHeld > 0 ? inv.unitsHeld * share : 0;
    if (!(spoiledUnits > 0)) { out[subUnitId] = inv; continue; }
    touched = true;
    scrapGoods(region, subUnitId, spoiledUnits);
    const survivingUnits = inv.unitsHeld - spoiledUnits;
    // The basis per unit is untouched: a good that perishes takes its own cost with it.
    const perUnitLocal = inv.valueLocal / inv.unitsHeld;
    out[subUnitId] = { unitsHeld: survivingUnits, valueLocal: survivingUnits * perUnitLocal };
  }
  return touched ? out : record;
}

// ---- §3.13-INV-v — THE FINISHED STOCK IS LOTS AT WHAT IT COST TO MAKE ----
//
// A firm's finished goods are a row of kind FINISHED_GOOD on its own register book, the sub-unit
// its instrument, and the row's lots are the BATCHES: the units a week's production finished, at
// what that week's line cost to make them (§3.13-INV-iv). A delivery draws them first-in-first-out
// and hands back what those units COST, which is the COGS the model has never had — the input
// draw is expensed in the week it is drawn, whatever was made or sold (`goods.md` F5).
//
// Not a GOOD row: that kind is the INPUT side, the register permits one GOOD row per (firm,
// sub-unit), and the production pass addresses those chains by `firmRow × NSUB + sub`
// (`engine2/lots.ts`), so a second chain of the same kind is silently orphaned and a merged one
// would feed a firm its own output back as a recipe input. A distinct kind is invisible to both,
// and to `register-marking`, which prices tranches, sovereigns and equity and nothing else — so a
// cost basis parked here cannot be quietly marked to market, which a field on the firm could.
//
// WRITERS FIRST (§3.13-BOOK f1's discipline): the rows are kept in step with the record's units
// while the record is still what everything reads, and `O17` fails the week they disagree.

export const FINISHED_KIND = 'FINISHED_GOOD';

/** The firm's finished-stock row for one good, -1 when it holds none. */
export function finishedRowOf(v2: V2World, companyId: string, subUnitId: string): number {
  const H = v2.holdings;
  const ref = typeRefOf(v2, FINISHED_KIND);
  if (ref < 0) return -1;
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === ref && instrumentIdAt(v2, r) === subUnitId) return r;
  }
  return -1;
}

/** What a firm holds of one finished good, in units — the row's own quantity. */
export function finishedUnitsOf(v2: V2World, companyId: string, subUnitId: string): number {
  const r = finishedRowOf(v2, companyId, subUnitId);
  return r < 0 ? 0 : rowUnits(v2.holdings, r);
}

/** Every finished good a firm holds, in book order (the record's own first-touch order). */
export function finishedStockOf(v2: V2World, companyId: string): { subUnitId: string; units: number; costLocal: number }[] {
  const H = v2.holdings;
  const ref = typeRefOf(v2, FINISHED_KIND);
  if (ref < 0) return [];
  const out: { subUnitId: string; units: number; costLocal: number }[] = [];
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === ref) out.push({ subUnitId: instrumentIdAt(v2, r), units: rowUnits(H, r), costLocal: H.qtyLocal[r] });
  }
  return out;
}

/** A week's production lands as one lot, at what that week's line cost to make it. */
export function produceFinishedLot(
  v2: V2World, companyId: string, region: RegionId, subUnitId: string,
  units: number, costLocal: number, week: number,
): void {
  if (!(units > 0)) return;
  const H = mutableHoldings(v2);
  let r = finishedRowOf(v2, companyId, subUnitId);
  if (r < 0) r = openKindRow(v2, companyId, FINISHED_KIND, subUnitId, region);
  appendLot(v2, r, units, costLocal / units, week);
  H.units[r] += units;
  H.qtyLocal[r] += costLocal;
  markBookDirty(v2, companyId);
}

/**
 * Units leave the firm — sold, delivered, scrapped or perished. The oldest batch goes first and
 * the return is WHAT THOSE UNITS COST, which is the cost of goods sold. Returns 0 for a firm that
 * holds no row (a seller drawing on stock the register has not opened yet is the caller's defect
 * to name, not this one's — the record is still the authority until §3.13-INV-vii).
 */
export function drawFinishedFifo(
  v2: V2World, companyId: string, subUnitId: string, units: number, week: number,
): number {
  if (!(units > 0)) return 0;
  const r = finishedRowOf(v2, companyId, subUnitId);
  if (r < 0) return 0;
  const H = mutableHoldings(v2);
  const taken = Math.min(units, Math.max(0, rowUnits(H, r)));
  if (!(taken > 0)) return 0;
  const consumed = adjustLots(v2, r, -taken, 0, week);
  H.units[r] -= taken;
  H.qtyLocal[r] = Math.max(0, H.qtyLocal[r] - consumed.consumedBasisLocal);
  // Drawn to nothing, the row leaves the book — the same rule the input lots follow
  // (`lots.ts:consumeFifo`), so a firm's book is what it holds and not what it once held.
  if (H.lotHead[r] < 0) {
    H.units[r] = 0; H.qtyLocal[r] = 0;
    const kept: number[] = [];
    for (let k = bookHeadOf(v2, companyId); k >= 0; k = H.next[k]) if (k !== r) kept.push(k);
    relinkBook(v2, companyId, kept);
  }
  markBookDirty(v2, companyId);
  return consumed.consumedBasisLocal;
}

/** The row is emptied outright (an estate's stock perishing, a merger's hand-over). */
export function clearFinishedRow(v2: V2World, companyId: string, subUnitId: string, week: number): number {
  const r = finishedRowOf(v2, companyId, subUnitId);
  return r < 0 ? 0 : drawFinishedFifo(v2, companyId, subUnitId, rowUnits(v2.holdings, r), week);
}

/**
 * §3.13-INV-v — THE WEEK'S FINISHED ROWS, written once, where the stock is finally decided.
 *
 * Gross first, then true up. The week's production lands as a lot at what it cost; what was
 * delivered draws the oldest lots and the return is its COST — the cost of goods sold, which this
 * model has never had. Then the row is trued to the record's own units, because the record is
 * still the authority until §3.13-INV-vii and the two must not drift: a firm that lost units to
 * something outside the goods flow (an estate perishing its stock, a merger handing it over)
 * shows up here as a difference, and it is taken off the oldest lots like any other departure.
 *
 * WRITERS FIRST: nothing reads the basis yet. `O17` fails the week a row and its record disagree,
 * which is the check `13-INV-vi` and `-vii` stand on.
 */
export function writeFinishedRows(
  v2: V2World,
  companyId: string,
  region: RegionId,
  record: Partial<Record<string, { unitsHeld: number; valueLocal: number }>>,
  flow: Record<string, { arrivedUnits: number; arrivedCostLocal: number; deliveredUnits: number }> | undefined,
  week: number,
): { cogsLocal: number } {
  let cogsLocal = 0;
  for (const [subUnitId, f] of Object.entries(flow ?? {})) {
    produceFinishedLot(v2, companyId, region, subUnitId, f.arrivedUnits, f.arrivedCostLocal, week);
    cogsLocal += drawFinishedFifo(v2, companyId, subUnitId, f.deliveredUnits, week);
  }
  // True up against the record, in its own key order, and close any row it no longer carries.
  for (const [subUnitId, inv] of Object.entries(record)) {
    const held = inv?.unitsHeld ?? 0;
    const onRow = finishedUnitsOf(v2, companyId, subUnitId);
    if (onRow > held) drawFinishedFifo(v2, companyId, subUnitId, onRow - held, week);
    else if (held > onRow) {
      // Units the goods flow did not bring: an estate's reclassified input lots, a merger's
      // assumed stock. They arrive at the record's own value per unit, which is what those two
      // writers already carry (a FIFO cost and the seller's mark respectively).
      const perUnitLocal = (inv?.valueLocal ?? 0) / Math.max(1e-9, held);
      produceFinishedLot(v2, companyId, region, subUnitId, held - onRow, (held - onRow) * perUnitLocal, week);
    }
  }
  for (const row of finishedStockOf(v2, companyId)) {
    if (record[row.subUnitId] === undefined && row.units > 0) drawFinishedFifo(v2, companyId, row.subUnitId, row.units, week);
  }
  return { cogsLocal };
}
