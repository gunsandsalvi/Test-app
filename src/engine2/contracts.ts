/**
 * ENGINE V2 — THE SUPPLY-CONTRACT TABLE: the bilateral contract book as columns, persistent
 * across weeks, chained per (region, sub-unit) in exactly the order the object book carried.
 *
 * WHY THIS TABLE IS THE BIG ONE, measured (§7.304's probe): the live book GROWS ~3k contracts a
 * week with a ~45-week mean tenor — ~12k live at week 4, ~55k by week 21, heading for ~150k at
 * the 60-week horizon — and `settleContracts` walks every one of them weekly with two firm
 * lookups, string-keyed map probes and up to four payment legs each. The object book is why
 * stage 05's cost RISES with horizon; the whole point of the 100 ms/week bar is the long run,
 * so this is the scaling defect, not just an allocation one.
 *
 * ORDER IS ECONOMICS HERE, so the chains replicate the object flow exactly:
 * - Within a (region, sub-unit) bucket: iteration order = the array order the grouped book had;
 *   survivors keep their position (dead rows unlink), formations append at the tail.
 * - Across buckets (the 09-concentration walk, the harness conservation checks): a region's
 *   buckets iterate in FIRST-OCCURRENCE order, an emptied bucket drops out at week end and a
 *   re-formed one re-appends — which is precisely what rebuilding the group map from the
 *   reassembled array did every week.
 *
 * Refs stay the strings the world uses (tickers on every current path, ids tolerated) — interned
 * once (world.ts), resolved per unique ref per WEEK rather than per contract. Plain data only:
 * `structuredClone(state)` carries the book into battery replays by value.
 */

import { V2World, internPartyKey, partyKeyOf } from './world';
import { SUBUNIT_INDEX, SUBUNITS, NSUB } from './state';
import { newRefColumn, type RefColumn, type PartyKeyRef } from './refs';

/**
 * §3.13-BOOK — a READ view of the supply-contract book, and its module's own handle. Same wall the
 * register and the ladder already had; this table simply never got one.
 */
export type ReadonlyContractTable = {
  readonly [K in keyof ContractTable]:
    ContractTable[K] extends RefColumn<infer B> ? RefColumn<B>
    : ContractTable[K] extends Float64Array ? Readonly<Float64Array>
    : ContractTable[K] extends Int32Array ? Readonly<Int32Array>
    : ContractTable[K] extends Uint8Array ? Readonly<Uint8Array>
    : ContractTable[K];
};

/** The contract book's own handle. Nothing else may hold one. */
const mutableContracts = (v2: V2World): ContractTable => v2.contracts as ContractTable;

interface ContractTable {
  cap: number;
  used: number;
  freeHead: number;
  supplierRef: RefColumn<PartyKeyRef>;
  customerRef: RefColumn<PartyKeyRef>;
  subIdx: Int32Array;
  priceLocal: Float64Array;
  qtyPerWeek: Float64Array;
  weeksRemaining: Int32Array;
  backlogUnits: Float64Array;
  shortWeeks: Int32Array;
  prepaidLocal: Float64Array;
  /** 0 = a fixed-price contract (the old field's absent case). */
  escalationBaseLocal: Float64Array;
  next: Int32Array;
  /** Per region key: chain head/tail per sub-unit index, and the bucket order (see header). */
  /** Per region, created the first time the region is asked for — SPARSE until then. */
  headByRegion: Partial<Record<string, Int32Array>>;
  tailByRegion: Record<string, Int32Array>;
  suOrderByRegion: Partial<Record<string, number[]>>;
}

export function newContractTable(): ContractTable {
  const cap = 1 << 12;
  return {
    cap,
    used: 0,
    freeHead: -1,
    supplierRef: newRefColumn<PartyKeyRef>(cap),
    customerRef: newRefColumn<PartyKeyRef>(cap),
    subIdx: new Int32Array(cap),
    priceLocal: new Float64Array(cap),
    qtyPerWeek: new Float64Array(cap),
    weeksRemaining: new Int32Array(cap),
    backlogUnits: new Float64Array(cap),
    shortWeeks: new Int32Array(cap),
    prepaidLocal: new Float64Array(cap),
    escalationBaseLocal: new Float64Array(cap),
    next: new Int32Array(cap).fill(-1),
    headByRegion: {},
    tailByRegion: {},
    suOrderByRegion: {},
  };
}

function grow(T: ContractTable): void {
  const cap = T.cap * 2;
  const gf = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
  const gi = (old: Int32Array, fill = 0) => { const a = new Int32Array(cap).fill(fill); a.set(old); return a; };
  const gR = <B extends number>(old: RefColumn<B>): RefColumn<B> => { const a = newRefColumn<B>(cap); a.set(old); return a; };
  T.supplierRef = gR(T.supplierRef);
  T.customerRef = gR(T.customerRef);
  T.subIdx = gi(T.subIdx);
  T.priceLocal = gf(T.priceLocal);
  T.qtyPerWeek = gf(T.qtyPerWeek);
  T.weeksRemaining = gi(T.weeksRemaining);
  T.backlogUnits = gf(T.backlogUnits);
  T.shortWeeks = gi(T.shortWeeks);
  T.prepaidLocal = gf(T.prepaidLocal);
  T.escalationBaseLocal = gf(T.escalationBaseLocal);
  T.next = gi(T.next, -1);
  T.cap = cap;
}

function regionTables(T: ContractTable, region: string): { head: Int32Array; tail: Int32Array; suOrder: number[] } {
  let head = T.headByRegion[region];
  let suOrder = T.suOrderByRegion[region];
  if (!head || !suOrder) {
    head = new Int32Array(NSUB).fill(-1);
    T.headByRegion[region] = head;
    T.tailByRegion[region] = new Int32Array(NSUB).fill(-1);
    suOrder = [];
    T.suOrderByRegion[region] = suOrder;
  }
  return { head, tail: T.tailByRegion[region], suOrder };
}

/** Append a newly-formed contract at the tail of its (region, sub-unit) chain. */
export function formContractRow(
  v2: V2World, region: string, subUnitId: string,
  supplierKey: string, customerKey: string,
  priceLocal: number, qtyPerWeek: number, weeksRemaining: number, escalationBaseLocal: number
): void {
  const T = mutableContracts(v2);
  const subIdx = SUBUNIT_INDEX.get(subUnitId);
  if (subIdx === undefined) throw new Error(`ENGINE DEFECT: unknown sub-unit ${subUnitId} on a contract`);
  let r: number;
  if (T.freeHead >= 0) { r = T.freeHead; T.freeHead = T.next[r]; }
  else { if (T.used >= T.cap) grow(T); r = T.used++; }
  T.supplierRef[r] = internPartyKey(v2, supplierKey);
  T.customerRef[r] = internPartyKey(v2, customerKey);
  T.subIdx[r] = subIdx;
  T.priceLocal[r] = priceLocal;
  T.qtyPerWeek[r] = qtyPerWeek;
  T.weeksRemaining[r] = weeksRemaining | 0;
  T.backlogUnits[r] = 0;
  T.shortWeeks[r] = 0;
  T.prepaidLocal[r] = 0;
  T.escalationBaseLocal[r] = escalationBaseLocal;
  T.next[r] = -1;
  const { head, tail, suOrder } = regionTables(T, region);
  if (tail[subIdx] >= 0) {
    T.next[tail[subIdx]] = r;
    tail[subIdx] = r;
  } else {
    head[subIdx] = r;
    tail[subIdx] = r;
    // A bucket that comes alive appends to the region's bucket order (the group map's
    // new-key append); an emptied one is dropped by endOfWeekCompact below.
    if (!suOrder.includes(subIdx)) suOrder.push(subIdx);
  }
}

/**
 * §3.13-BOOK d0 — THE SETTLE KERNEL'S WRITES, AS OPERATIONS OF THE STORE. `05-unit-bidding`'s
 * settlement core used to hold `mutableContracts` and write five columns itself — the one stage
 * that wrote a store it did not own. These are those five writes, named, so the kernel reads the
 * book through the world's read view and asks here to move it. Each is exactly the statement it
 * replaced, in the same order, so the arithmetic is byte-identical.
 */

/** A week passes on the contract; returns the weeks left (negative = it expired this week). */
export function ageContractWeek(v2: V2World, r: number): number {
  const T = mutableContracts(v2);
  return (T.weeksRemaining[r] -= 1);
}

/** An escalation clause re-strikes the price against the market and rebases the escalator. */
export function restrikeContract(v2: V2World, r: number, priceLocal: number, escalationBaseLocal: number): void {
  const T = mutableContracts(v2);
  T.priceLocal[r] = priceLocal;
  T.escalationBaseLocal[r] = escalationBaseLocal;
}

/** What the supplier still owes after this week's delivery. */
export function setContractBacklog(v2: V2World, r: number, units: number): void {
  mutableContracts(v2).backlogUnits[r] = units;
}

/** The progress deposit: what this week's delivery drew from it, then what topped it back up. */
export function applyContractDeposit(v2: V2World, r: number, appliedLocal: number, topUpLocal: number): void {
  const T = mutableContracts(v2);
  T.prepaidLocal[r] = T.prepaidLocal[r] - appliedLocal;
  T.prepaidLocal[r] += topUpLocal;
}

/** The running count of weeks the supplier fell short. */
export function setContractShortWeeks(v2: V2World, r: number, weeks: number): void {
  mutableContracts(v2).shortWeeks[r] = weeks;
}

/** §5-FINALIZATION step 9 — a merger NOVATES the target's contracts to the acquirer: every row
 *  naming the target (by either key the table stores, ticker or id) names the acquirer now. */
export function novateContracts(v2: V2World, fromKeys: string[], toKey: string): number {
  const T = v2.contracts;
  const from = new Set(fromKeys.map((k) => internPartyKey(v2, k)));
  const to = internPartyKey(v2, toKey);
  let n = 0;
  for (let r = 0; r < T.used; r++) {
    if (from.has(T.supplierRef[r])) { T.supplierRef[r] = to; n++; }
    if (from.has(T.customerRef[r])) { T.customerRef[r] = to; n++; }
  }
  return n;
}

/** The (region, sub-unit) chain as row indexes, in bucket order. */
export function contractRows(v2: V2World, region: string, subUnitId: string): number[] {
  const T = v2.contracts;
  const head = T.headByRegion[region];
  const subIdx = SUBUNIT_INDEX.get(subUnitId);
  if (!head || subIdx === undefined) return [];
  const rows: number[] = [];
  for (let r = head[subIdx]; r >= 0; r = T.next[r]) rows.push(r);
  return rows;
}

/**
 * Rewrite one (region, sub-unit) chain to exactly `survivors` (a subsequence of the walked
 * rows, in order) and recycle `dead`. The settle kernel decides who lives; this just relinks.
 */
export function relinkChain(v2: V2World, region: string, subUnitId: string, survivors: number[], dead: number[]): void {
  const T = mutableContracts(v2);
  const subIdx = SUBUNIT_INDEX.get(subUnitId)!;
  const { head, tail } = regionTables(T, region);
  if (survivors.length === 0) {
    head[subIdx] = -1;
    tail[subIdx] = -1;
  } else {
    for (let i = 0; i < survivors.length; i++) {
      T.next[survivors[i]] = i + 1 < survivors.length ? survivors[i + 1] : -1;
    }
    head[subIdx] = survivors[0];
    tail[subIdx] = survivors[survivors.length - 1];
  }
  for (const r of dead) {
    T.next[r] = T.freeHead;
    T.freeHead = r;
  }
}

/** Week end: drop emptied buckets from each region's bucket order (see header). */
export function endOfWeekCompact(v2: V2World): void {
  const T = v2.contracts;
  for (const region of Object.keys(T.suOrderByRegion)) {
    const head = T.headByRegion[region];
    const order = T.suOrderByRegion[region];
    if (!head || !order) continue; // a region's three tables are created together (`regionTables`)
    T.suOrderByRegion[region] = order.filter((su) => head[su] >= 0);
  }
}

/** Walk every live contract of one region in bucket order — the 09/harness/UI read. */
export function forEachContract(
  v2: V2World, region: string,
  fn: (row: number, supplierKey: string, customerKey: string, subUnitId: string) => void
): void {
  const T = v2.contracts;
  const head = T.headByRegion[region];
  const order = T.suOrderByRegion[region];
  if (!head || !order) return;
  for (const su of order) {
    for (let r = head[su]; r >= 0; r = T.next[r]) {
      fn(r, partyKeyOf(v2, T.supplierRef[r]), partyKeyOf(v2, T.customerRef[r]), SUBUNITS[su]);
    }
  }
}
