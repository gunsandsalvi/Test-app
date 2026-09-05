/**
 * §3.13-BOOK f3 — THE GOODS LOTS ARE THE REGISTER'S LOTS.
 *
 * A firm's input inventory used to be its own table (`v2.lots`: parallel columns, a chain per
 * (firm row, sub-unit) slot, a free list, the first-touch order of a record it replaced). It is
 * the position book now: a firm's holding of one good is a row of kind GOOD on its own book,
 * the sub-unit its instrument, and the row's lots are the register's lots — the same columns a
 * bond's or a share's lots live in (`holdings.ts:lotUnits/lotPriceLocal/lotWeek/lotNext`), plus
 * who delivered each (`lotSeller`). A fungible asset sums its lots; the goods, identified, are
 * drawn first-in-first-out by the week they arrived.
 *
 * FIDELITY (the §7.237/§7.303 float rules, kept exactly):
 * - The draw is `consumeFifoOnViews` as it was: chains almost always arrive week-sorted (one
 *   linear check); an out-of-order chain is stably re-sorted by week BEFORE the draw — and
 *   stays sorted. `availableUnits` sums in sorted chain order; per-lot costs are reported in
 *   consumption order for the caller to fold. The dust thresholds are the old ones verbatim.
 * - Per-firm iteration (the balance-sheet total) runs in the firm's BOOK order, which is the
 *   first-touch order the old `touchedSubs` kept: a GOOD row opens the first time a good lands.
 *
 * THE KERNELS' VIEW. The production core (JS, its C port, and the worker shards) addresses a
 * firm's chain by `(firm row × NSUB + sub-unit)` and always has; nothing in it changes. A pass
 * OPENS a view — the register's lot columns, and per-slot head/tail arrays materialised from the
 * GOOD rows — runs, and CLOSES it: heads back onto the rows, units and value re-summed from what
 * is left, freed lots recycled. The same view is what a single row-addressed draw uses.
 */

import { InputLot } from '../domain/company';
import { V2World, rowOf, internPartyKey, partyKeyOf, typeRefOf } from './world';
import { SUBUNITS, SUBUNIT_INDEX, NSUB } from './state';
import { mutableHoldings, bookHeadOf, appendLot, openKindRow, recycleLots, instrumentIdAt, relinkBook, markBookDirty } from './holdings';
import type { HoldingStore } from './holdings';
import type { RegionId } from '../domain/geography';

/** The register kind of a firm's input inventory. */
export const GOOD_KIND = 'GOOD';

/** The firm's register row for one good, -1 when it holds none. */
export function goodRowOf(v2: V2World, companyId: string, subUnitId: string): number {
  const H = v2.holdings;
  const goodRef = typeRefOf(v2, GOOD_KIND);
  if (goodRef < 0) return -1;
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === goodRef && instrumentIdAt(v2, r) === subUnitId) return r;
  }
  return -1;
}

/** Every GOOD row of the firm, in book order — the first-touch order of the old record. */
function goodRowsOf(v2: V2World, companyId: string): number[] {
  const H = v2.holdings;
  const goodRef = typeRefOf(v2, GOOD_KIND);
  const out: number[] = [];
  if (goodRef < 0) return out;
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) if (H.typeRef[r] === goodRef) out.push(r);
  return out;
}

/** Append one real purchase lot to the firm's holding (FIFO tail). */
export function pushLot(
  v2: V2World, companyId: string, region: RegionId, subUnitId: string,
  sellerKey: string, unitsHeld: number, unitPriceLocal: number, acquiredWeek: number,
  /** §5-WIRES W4: the wire that delivered the lot — a lot with no wire does not compile. */
  wireNo: number
): void {
  void wireNo;
  if (SUBUNIT_INDEX.get(subUnitId) === undefined) throw new Error(`ENGINE DEFECT: unknown sub-unit ${subUnitId} pushed as an input lot`);
  const H = mutableHoldings(v2);
  let r = goodRowOf(v2, companyId, subUnitId);
  if (r < 0) r = openKindRow(v2, companyId, GOOD_KIND, subUnitId, region);
  appendLot(v2, r, unitsHeld, unitPriceLocal, acquiredWeek, internPartyKey(v2, sellerKey));
  H.units[r] += unitsHeld;
  H.qtyLocal[r] += unitsHeld * unitPriceLocal;
  markBookDirty(v2, companyId);
}

/** The columns a FIFO draw touches — the register's lot columns behind slot-addressed heads. */
export interface LotViews {
  units: Float64Array;
  priceLocal: Float64Array;
  acquiredWeek: Int32Array;
  next: Int32Array;
  head: Int32Array;
  tail: Int32Array;
}

/** Where a draw on the serial path returns a consumed lot: the register's own free list. */
export interface LotFreeList { next: Int32Array; freeHead: number }

/**
 * A pass over the goods: every firm's chains addressed by `(firm row × NSUB + sub)`, the way the
 * kernels always addressed them, with the heads and tails read off the GOOD rows. Open before a
 * production pass, close after it.
 */
export interface GoodsPass {
  views: LotViews;
  free: LotFreeList;
  /** Per slot: the GOOD row behind it, -1 for a slot no firm holds. */
  rowOfSlot: Int32Array;
  nSlots: number;
}

export function openGoodsPass(v2: V2World): GoodsPass {
  const H = mutableHoldings(v2);
  const nSlots = Math.max(1, v2.nRows) * NSUB;
  const head = new Int32Array(nSlots).fill(-1);
  const tail = new Int32Array(nSlots).fill(-1);
  const rowOfSlot = new Int32Array(nSlots).fill(-1);
  const goodRef = typeRefOf(v2, GOOD_KIND);
  if (goodRef >= 0) {
    const nBooks = Math.min(v2.nRows, H.head.length);
    for (let e = 0; e < nBooks; e++) {
      for (let r = H.head[e]; r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== goodRef) continue;
        const si = SUBUNIT_INDEX.get(instrumentIdAt(v2, r));
        if (si === undefined) continue;
        const slot = e * NSUB + si;
        head[slot] = H.lotHead[r]; tail[slot] = H.lotTail[r]; rowOfSlot[slot] = r;
      }
    }
  }
  return {
    views: { units: H.lotUnits, priceLocal: H.lotPriceLocal, acquiredWeek: H.lotWeek, next: H.lotNext, head, tail },
    free: { next: H.lotNext, freeHead: H.lotFreeHead },
    rowOfSlot, nSlots,
  };
}

/** The pass is over: the heads go back onto the rows, a row's units and value are what its lots
 *  now hold, the freed lots are recycled, and an emptied row leaves its book. */
export function closeGoodsPass(v2: V2World, P: GoodsPass, dead?: readonly (readonly number[])[]): void {
  const H = mutableHoldings(v2);
  H.lotFreeHead = P.free.freeHead;
  if (dead) for (const list of dead) recycleLots(v2, list);
  const emptied = new Set<number>();
  for (let slot = 0; slot < P.nSlots; slot++) {
    const r = P.rowOfSlot[slot];
    if (r < 0) continue;
    H.lotHead[r] = P.views.head[slot]; H.lotTail[r] = P.views.tail[slot];
    let units = 0, value = 0;
    for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) { units += H.lotUnits[l]; value += H.lotUnits[l] * H.lotPriceLocal[l]; }
    H.units[r] = units; H.qtyLocal[r] = value;
    if (H.lotHead[r] < 0) emptied.add(r);
  }
  if (emptied.size === 0) return;
  // An emptied GOOD row leaves its firm's book — one relink per book that lost one.
  const books = new Map<number, string>();
  emptied.forEach((r) => { void r; });
  for (let e = 0; e < Math.min(v2.nRows, H.head.length); e++) {
    let touched = false;
    for (let r = H.head[e]; r >= 0; r = H.next[r]) if (emptied.has(r)) { touched = true; break; }
    if (touched) books.set(e, '');
  }
  if (books.size === 0) return;
  const idOfRow = new Map<number, string>();
  v2.rowById.forEach((row, id) => { if (books.has(row)) idOfRow.set(row, id); });
  books.forEach((_v, e) => {
    const id = idOfRow.get(e);
    if (id === undefined) return;
    const kept: number[] = [];
    for (let r = H.head[e]; r >= 0; r = H.next[r]) if (!emptied.has(r)) kept.push(r);
    relinkBook(v2, id, kept);
  });
}

function chainOfSlotViews(L: LotViews, firmRow: number, subIdx: number): { slot: number; rows: number[] } {
  const slot = firmRow * NSUB + subIdx;
  if (firmRow < 0 || slot >= L.head.length) return { slot: -1, rows: [] };
  const rows: number[] = [];
  for (let r = L.head[slot]; r >= 0; r = L.next[r]) rows.push(r);
  return { slot, rows };
}

/**
 * FIFO draw — `consumeLotsFifo` on the chain, in place. Reports what the caller folds:
 * available units (summed in sorted order) and the per-lot costs in consumption order.
 * The row-addressed form: one firm, one good, off the register directly.
 */
export function consumeFifo(
  v2: V2World, companyId: string, subUnitId: string, unitsWanted: number
): { availableUnits: number; costsLocal: number[] } {
  const r = goodRowOf(v2, companyId, subUnitId);
  if (r < 0) return { availableUnits: 0, costsLocal: [] };
  const H = mutableHoldings(v2);
  const views: LotViews = { units: H.lotUnits, priceLocal: H.lotPriceLocal, acquiredWeek: H.lotWeek, next: H.lotNext, head: Int32Array.of(H.lotHead[r]), tail: Int32Array.of(H.lotTail[r]) };
  const free: LotFreeList = { next: H.lotNext, freeHead: H.lotFreeHead };
  const drawn = consumeFifoOnViews(views, 0, 0, unitsWanted, free);
  H.lotFreeHead = free.freeHead;
  H.lotHead[r] = views.head[0]; H.lotTail[r] = views.tail[0];
  let cost = 0; for (const c of drawn.costsLocal) cost += c;
  H.units[r] -= drawn.takenUnits;
  H.qtyLocal[r] -= cost;
  if (H.lotHead[r] < 0) {
    H.units[r] = 0; H.qtyLocal[r] = 0;
    const kept: number[] = [];
    for (let k = bookHeadOf(v2, companyId); k >= 0; k = H.next[k]) if (k !== r) kept.push(k);
    relinkBook(v2, companyId, kept);
  } else {
    markBookDirty(v2, companyId);
  }
  return { availableUnits: drawn.availableUnits, costsLocal: drawn.costsLocal };
}

export function consumeFifoOnViews(
  LV: LotViews, firmRow: number, subIdx: number, unitsWanted: number,
  freeInto: LotFreeList | null, deadSink?: number[]
): { availableUnits: number; takenUnits: number; costsLocal: number[] } {
  const L = LV;
  const { slot, rows } = chainOfSlotViews(L, firmRow, subIdx);
  if (rows.length === 0) return { availableUnits: 0, takenUnits: 0, costsLocal: [] };

  // Sorted almost always (lots append in week order); an out-of-order chain — a delayed
  // cross-border consignment landing behind a later domestic buy — is stably re-sorted by
  // week and STAYS sorted, exactly as the old sorted `remaining` array did.
  let isSorted = true;
  for (let i = 1; i < rows.length; i++) {
    if (L.acquiredWeek[rows[i]] < L.acquiredWeek[rows[i - 1]]) { isSorted = false; break; }
  }
  if (!isSorted) {
    const order = rows.map((r, i) => i);
    order.sort((a, b) => (L.acquiredWeek[rows[a]] - L.acquiredWeek[rows[b]]) || (a - b));
    const sorted = order.map((i) => rows[i]);
    for (let i = 0; i < sorted.length; i++) L.next[sorted[i]] = i + 1 < sorted.length ? sorted[i + 1] : -1;
    L.head[slot] = sorted[0];
    L.tail[slot] = sorted[sorted.length - 1];
    rows.length = 0;
    rows.push(...sorted);
  }

  let availableUnits = 0;
  for (const r of rows) availableUnits += L.units[r];

  let left = Math.min(availableUnits, Math.max(0, unitsWanted));
  const costsLocal: number[] = [];
  let takenUnits = 0;
  let firstKept = -1;
  let i = 0;
  for (; i < rows.length; i++) {
    const r = rows[i];
    if (left <= 0.0001) { firstKept = r; break; }
    const take = Math.min(L.units[r], left);
    left -= take;
    costsLocal.push(take * L.priceLocal[r]);
    const unitsLeftInLot = L.units[r] - take;
    // §5-WIRES W4: a residue too small to keep goes with the draw — the units taken are what
    // the lot store actually lost, so the consumption record is exact.
    takenUnits += unitsLeftInLot > 0.0001 ? take : L.units[r];
    if (unitsLeftInLot > 0.0001) {
      L.units[r] = unitsLeftInLot;
      firstKept = r;
      break;
    }
    // Fully consumed (or dust): recycle the row — directly on the serial path, via the
    // shard-safe sink when a worker owns only a row range of the store.
    if (freeInto) {
      L.units[r] = 0;
      L.next[r] = freeInto.freeHead;
      freeInto.freeHead = r;
    } else {
      L.units[r] = 0;
      L.next[r] = -1;
      deadSink!.push(r);
    }
  }
  if (firstKept < 0) {
    L.head[slot] = -1;
    L.tail[slot] = -1;
  } else {
    L.head[slot] = firstKept;
  }
  return { availableUnits, takenUnits, costsLocal };
}

/** The firm's whole input-inventory value — each good's lots at what they cost, in book order. */
export function totalInputValueLocal(v2: V2World, companyId: string): number {
  const H = v2.holdings;
  let total = 0;
  for (const r of goodRowsOf(v2, companyId)) {
    let v = 0;
    for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) v += H.lotUnits[l] * H.lotPriceLocal[l];
    total += v;
  }
  return total;
}

/** The firm's input units, one sub-unit or all, in the same iteration order. */
export function inputUnitsHeld(v2: V2World, companyId: string, subUnitId?: string): number {
  const H = v2.holdings;
  const sum = (r: number): number => { let u = 0; for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) u += H.lotUnits[l]; return u; };
  if (subUnitId !== undefined) {
    const r = goodRowOf(v2, companyId, subUnitId);
    return r < 0 ? 0 : sum(r);
  }
  let total = 0;
  for (const r of goodRowsOf(v2, companyId)) total += sum(r);
  return total;
}

/** Every good the firm holds, with its units — for the reads that walk a firm's inventory. */
export function goodsHeldBy(v2: V2World, companyId: string): { subUnitId: string; units: number }[] {
  const H = v2.holdings;
  return goodRowsOf(v2, companyId).map((r) => {
    let u = 0; for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) u += H.lotUnits[l];
    return { subUnitId: instrumentIdAt(v2, r) as string, units: u };
  });
}

/** Every firm's units of one good, summed over the register (a trace's read). */
export function goodsUnitsOfSub(v2: V2World, subIdx: number): number {
  const H = v2.holdings;
  const goodRef = typeRefOf(v2, GOOD_KIND);
  if (goodRef < 0) return 0;
  const sub = SUBUNITS[subIdx];
  let total = 0;
  for (let e = 0; e < Math.min(v2.nRows, H.head.length); e++) {
    for (let r = H.head[e]; r >= 0; r = H.next[r]) {
      if (H.typeRef[r] !== goodRef || instrumentIdAt(v2, r) !== sub) continue;
      for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) total += H.lotUnits[l];
    }
  }
  return total;
}

/** The old record shape, materialised on demand (the UI's read; not a weekly path). */
export function materializeInputInventory(v2: V2World, companyId: string): Record<string, InputLot[]> {
  const H = v2.holdings as unknown as HoldingStore;
  const out: Record<string, InputLot[]> = {};
  for (const r of goodRowsOf(v2, companyId)) {
    const lots: InputLot[] = [];
    for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) {
      lots.push({
        sellerId: H.lotSeller[l] >= 0 ? partyKeyOf(v2, H.lotSeller[l]) : '',
        unitsHeld: H.lotUnits[l],
        unitPriceLocal: H.lotPriceLocal[l],
        acquiredWeek: H.lotWeek[l],
      });
    }
    out[instrumentIdAt(v2, r) as string] = lots;
  }
  return out;
}

export { rowOf };
