/**
 * ENGINE V2 — THE INPUT-LOT TABLE: every firm's real purchase lots as columns, FIFO by
 * acquisition week, persistent across weeks.
 *
 * What this replaces (§7.304's next item, measured): `Company.inputInventoryBySubUnit`, a
 * Record of per-sub-unit lot-object arrays whose weekly life was copy-on-first-touch in stage
 * 05 and goods-arrival (the single hottest allocation line in the world at ~55k lots and
 * growing), a merge-and-realias pass in stage 08's front, a sorted `.slice()` fallback in the
 * FIFO draw, and a full write-back — all of it garbage by the next week. Here a lot is a row
 * in parallel typed arrays; a (firm, sub-unit) holding is a singly-linked chain in append
 * order; consumption advances the chain head in place and recycles rows through a free list.
 *
 * FIDELITY (the §7.237/§7.303 float rules, kept exactly):
 * - The draw replicates `consumeLotsFifo`: chains almost always arrive week-sorted (one linear
 *   check); an out-of-order chain is stably re-sorted by week BEFORE the draw — and stays
 *   sorted, exactly as the sorted `remaining` array used to be what got stored.
 * - `availableUnits` sums in sorted chain order; per-lot costs are reported in consumption
 *   order for the caller to fold (float addition is not associative).
 * - The dust thresholds are the old ones verbatim: a draw stops when less than 0.0001 units
 *   are wanted; a lot left with 0.0001 units or fewer is dropped.
 * - Per-firm iteration (the balance-sheet total) runs in FIRST-TOUCH sub-unit order, which is
 *   exactly the key-insertion order `Object.values` walked on the record it replaces.
 *
 * Plain data only (typed arrays, number[]s) — `structuredClone` on the host state deep-copies
 * the table, which is what makes battery replays isolated by construction (world.ts).
 */

import { InputLot } from '../domain/company';
import { V2World, rowOf, internString } from './world';
import { SUBUNITS, SUBUNIT_INDEX, NSUB } from './state';

export interface LotStore {
  /** Lot rows (parallel columns); `next` chains a (firm, sub-unit) holding in FIFO order. */
  cap: number;
  units: Float64Array;
  priceUSD: Float64Array;
  acquiredWeek: Int32Array;
  sellerId: Int32Array;
  next: Int32Array;
  freeHead: number;
  /** How many rows have ever been handed out (free-listed rows stay inside this bound). */
  used: number;
  /** Per (firmRow * NSUB + subIdx): chain head/tail, -1 = empty. Grown as firm rows appear. */
  head: Int32Array;
  tail: Int32Array;
  /** Per firm row: sub-unit indexes in FIRST-TOUCH order (the record's key order, kept). */
  touchedSubs: number[][];
}

export function newLotStore(): LotStore {
  const cap = 1 << 12;
  return {
    cap,
    units: new Float64Array(cap),
    priceUSD: new Float64Array(cap),
    acquiredWeek: new Int32Array(cap),
    sellerId: new Int32Array(cap),
    next: new Int32Array(cap).fill(-1),
    freeHead: -1,
    used: 0,
    head: new Int32Array(0),
    tail: new Int32Array(0),
    touchedSubs: [],
  };
}

function growLots(L: LotStore): void {
  const cap = L.cap * 2;
  const g = <T extends Float64Array | Int32Array>(old: T, make: (n: number) => T): T => {
    const a = make(cap);
    a.set(old as never);
    return a;
  };
  L.units = g(L.units, (n) => new Float64Array(n));
  L.priceUSD = g(L.priceUSD, (n) => new Float64Array(n));
  L.acquiredWeek = g(L.acquiredWeek, (n) => new Int32Array(n));
  L.sellerId = g(L.sellerId, (n) => new Int32Array(n));
  const next = new Int32Array(cap).fill(-1);
  next.set(L.next);
  L.next = next;
  L.cap = cap;
}

function allocRow(L: LotStore): number {
  if (L.freeHead >= 0) {
    const r = L.freeHead;
    L.freeHead = L.next[r];
    L.next[r] = -1;
    return r;
  }
  if (L.used >= L.cap) growLots(L);
  return L.used++;
}

/** Slot index for (firm row, sub-unit index), growing the slot tables to cover the row. */
function slotOf(L: LotStore, firmRow: number, subIdx: number): number {
  const needed = (firmRow + 1) * NSUB;
  if (L.head.length < needed) {
    const cap = Math.max(needed, L.head.length * 2, NSUB * 64);
    const head = new Int32Array(cap).fill(-1);
    head.set(L.head);
    const tail = new Int32Array(cap).fill(-1);
    tail.set(L.tail);
    L.head = head;
    L.tail = tail;
  }
  return firmRow * NSUB + subIdx;
}

/** Append one real purchase lot to the firm's holding (FIFO tail). */
export function pushLot(
  v2: V2World, companyId: string, subUnitId: string,
  sellerKey: string, unitsHeld: number, unitPriceUSD: number, acquiredWeek: number
): void {
  const L = v2.lots;
  const firmRow = rowOf(v2, companyId);
  const subIdx = SUBUNIT_INDEX.get(subUnitId);
  if (subIdx === undefined) throw new Error(`ENGINE DEFECT: unknown sub-unit ${subUnitId} pushed as an input lot`);
  const slot = slotOf(L, firmRow, subIdx);
  const r = allocRow(L);
  L.units[r] = unitsHeld;
  L.priceUSD[r] = unitPriceUSD;
  L.acquiredWeek[r] = acquiredWeek | 0;
  L.sellerId[r] = internString(v2, sellerKey);
  L.next[r] = -1;
  if (L.tail[slot] >= 0) {
    L.next[L.tail[slot]] = r;
    L.tail[slot] = r;
  } else {
    L.head[slot] = r;
    L.tail[slot] = r;
    let touched = L.touchedSubs[firmRow];
    if (!touched) { touched = []; L.touchedSubs[firmRow] = touched; }
    if (!touched.includes(subIdx)) touched.push(subIdx);
  }
}

/** The chain as row indexes; empty when the firm has no row or the slot was never touched. */
function chainOf(L: LotStore, v2: V2World, companyId: string, subUnitId: string): { slot: number; rows: number[] } {
  const firmRow = v2.rowById.get(companyId);
  if (firmRow === undefined) return { slot: -1, rows: [] };
  const subIdx = SUBUNIT_INDEX.get(subUnitId);
  if (subIdx === undefined) return { slot: -1, rows: [] };
  return chainOfSlot(L, firmRow, subIdx);
}

function chainOfSlot(L: LotStore, firmRow: number, subIdx: number): { slot: number; rows: number[] } {
  return chainOfSlotViews(L, firmRow, subIdx);
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
 */
export function consumeFifo(
  v2: V2World, companyId: string, subUnitId: string, unitsWanted: number
): { availableUnits: number; costsUSD: number[] } {
  const firmRow = v2.rowById.get(companyId);
  const subIdx = SUBUNIT_INDEX.get(subUnitId);
  if (firmRow === undefined || subIdx === undefined) return { availableUnits: 0, costsUSD: [] };
  return consumeFifoByRow(v2, firmRow, subIdx, unitsWanted);
}

/** The columns a FIFO draw touches — the store itself, or a worker's shared mirror of it. */
export interface LotViews {
  units: Float64Array;
  priceUSD: Float64Array;
  acquiredWeek: Int32Array;
  next: Int32Array;
  head: Int32Array;
  tail: Int32Array;
}

/** ENGINE V2 (§7.305) — the row-addressed draw the numeric core calls: no strings anywhere.
 *  With a `deadSink` the fully-consumed rows are handed back instead of touching the shared
 *  free list — the shard-safe form a worker uses; the main thread merges sinks afterwards. */
export function consumeFifoByRow(
  v2: V2World, firmRow: number, subIdx: number, unitsWanted: number, deadSink?: number[]
): { availableUnits: number; costsUSD: number[] } {
  return consumeFifoOnViews(v2.lots, firmRow, subIdx, unitsWanted, deadSink === undefined ? v2.lots : null, deadSink);
}

export function consumeFifoOnViews(
  LV: LotViews, firmRow: number, subIdx: number, unitsWanted: number,
  freeInto: LotStore | null, deadSink?: number[]
): { availableUnits: number; costsUSD: number[] } {
  const L = LV;
  const { slot, rows } = chainOfSlotViews(L, firmRow, subIdx);
  if (rows.length === 0) return { availableUnits: 0, costsUSD: [] };

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
  const costsUSD: number[] = [];
  let firstKept = -1;
  let i = 0;
  for (; i < rows.length; i++) {
    const r = rows[i];
    if (left <= 0.0001) { firstKept = r; break; }
    const take = Math.min(L.units[r], left);
    left -= take;
    costsUSD.push(take * L.priceUSD[r]);
    const unitsLeftInLot = L.units[r] - take;
    if (unitsLeftInLot > 0.0001) {
      L.units[r] = unitsLeftInLot;
      firstKept = r;
      break;
    }
    // Fully consumed (or dust): recycle the row — directly on the serial path, via the
    // shard-safe sink when a worker owns only a row range of the store.
    if (freeInto) {
      L.next[r] = freeInto.freeHead;
      freeInto.freeHead = r;
    } else {
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
  return { availableUnits, costsUSD };
}

/** Per-lot value sum for one holding, in chain order (§7.237's float-order rule). */
export function slotValueUSD(v2: V2World, companyId: string, subUnitId: string): number {
  const L = v2.lots;
  const { rows } = chainOf(L, v2, companyId, subUnitId);
  let v = 0;
  for (const r of rows) v += L.units[r] * L.priceUSD[r];
  return v;
}

/** The firm's whole input-inventory value, iterated in first-touch sub-unit order. */
export function totalInputValueUSD(v2: V2World, companyId: string): number {
  const L = v2.lots;
  const firmRow = v2.rowById.get(companyId);
  if (firmRow === undefined) return 0;
  const touched = L.touchedSubs[firmRow];
  if (!touched) return 0;
  let total = 0;
  for (const subIdx of touched) {
    const slot = firmRow * NSUB + subIdx;
    let v = 0;
    for (let r = L.head[slot]; r >= 0; r = L.next[r]) v += L.units[r] * L.priceUSD[r];
    total += v;
  }
  return total;
}

/** The firm's input units, one sub-unit or all, in the same iteration order. */
export function inputUnitsHeld(v2: V2World, companyId: string, subUnitId?: string): number {
  const L = v2.lots;
  if (subUnitId !== undefined) {
    const { rows } = chainOf(L, v2, companyId, subUnitId);
    let u = 0;
    for (const r of rows) u += L.units[r];
    return u;
  }
  const firmRow = v2.rowById.get(companyId);
  if (firmRow === undefined) return 0;
  const touched = L.touchedSubs[firmRow];
  if (!touched) return 0;
  let total = 0;
  for (const subIdx of touched) {
    const slot = firmRow * NSUB + subIdx;
    let u = 0;
    for (let r = L.head[slot]; r >= 0; r = L.next[r]) u += L.units[r];
    total += u;
  }
  return total;
}

/** The old record shape, materialised on demand (the UI's read; not a weekly path). */
export function materializeInputInventory(v2: V2World, companyId: string): Record<string, InputLot[]> {
  const L = v2.lots;
  const out: Record<string, InputLot[]> = {};
  const firmRow = v2.rowById.get(companyId);
  if (firmRow === undefined) return out;
  const touched = L.touchedSubs[firmRow];
  if (!touched) return out;
  for (const subIdx of touched) {
    const slot = firmRow * NSUB + subIdx;
    const lots: InputLot[] = [];
    for (let r = L.head[slot]; r >= 0; r = L.next[r]) {
      lots.push({
        sellerId: v2.internedStrings[L.sellerId[r]],
        unitsHeld: L.units[r],
        unitPriceUSD: L.priceUSD[r],
        acquiredWeek: L.acquiredWeek[r],
      });
    }
    out[SUBUNITS[subIdx]] = lots;
  }
  return out;
}

/** Merge worker dead-row sinks back onto the free list (main thread, after a sharded pass). */
export function freeLotRows(v2: V2World, rows: number[]): void {
  const L = v2.lots;
  for (const r of rows) {
    L.next[r] = L.freeHead;
    L.freeHead = r;
  }
}
