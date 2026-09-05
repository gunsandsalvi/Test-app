/**
 * THE INSTITUTIONAL REGISTER AS PERSISTENT ROWS.
 *
 * The rows ARE the register. Every position an institution holds is a row on its chain here, put
 * there by a wire through `engine/ledger/holdings-ledger.ts` — the seed's opening books included
 * (`seedBook`), so a book is the replay of its wires from week 0. `entity.itemizedHoldings` is a
 * VIEW: `core.ts` materialises the books a writer touched once at the week end, for the UI, the
 * state dump and the seed-time readers, and nothing in a week reads or writes it. §3.13-BOOK d1
 * deleted the mirror this file used to be (`syncBookRows`, `ensureBooksSynced`,
 * `HOLDINGS_SYNC_CHECK`): there is no second representation left to keep in step.
 *
 * ~75 holders, ~110k rows at steady state — the same plain-data
 * rules as the lot/contract/tranche stores: typed arrays, interned strings, per-entity chains
 * in book order, `structuredClone`-safe.
 */

import { ItemizedHolding } from '../domain/banking';
import { asInstrumentId, type InstrumentId } from '../domain/ids';
import { typeRefOf, V2World, rowOf, internType, internInstrument, internRegion, instrumentOf, regionOf, typeOf } from './world';
import { newRefColumn, ABSENT_REF, type RefColumn, type InstrRef, type TypeRef, type RegionRef, type PartyKeyRef } from './refs';

export interface HoldingStore {
  cap: number;
  typeRef: RefColumn<TypeRef>;      // the instrument KIND tag
  instrRef: RefColumn<InstrRef>;    // the instrument this row holds
  regionRef: RefColumn<RegionRef>;  // the issuer's region
  qtyLocal: Float64Array;
  shares: Float64Array;   // NaN = absent (quantityShares)
  /**
   * HOW MANY UNITS THE ROW HOLDS, in the instrument's own unit (`countedIn`): par dollars for
   * credit, shares for equity and fund shares. NaN only while a writer has not been migrated.
   *
   * This is the quantity. `qtyLocal` is `units × price` — a derived view — and the reason the two
   * are separate columns is that the size of a book must not depend on the price the book is
   * supposed to set. Where this model stored only the product, the price was lost and the
   * position could never be re-marked.
   */
  units: Float64Array;
  /**
   * §3.13-BOOK d5a — THE UNITS OF THIS ROW UNDER A LIEN: pledged in repo (the repo book writes it
   * through `holdings-ledger.ts:setLien` every time it is published). They can be neither SOLD
   * (a transfer that would leave the row below its lien defects) nor COUNTED FREE (every
   * unencumbered read subtracts it). 0 = free. A retirement — the paper ceased — shrinks the lien
   * to what is left, and the repo book's collateral call follows.
   */
  lienUnits: Float64Array;
  /**
   * §3.13-BOOK f4a — WHAT THIS ROW HAS EARNED AND NOT BEEN PAID: the interest accrued on the
   * position since its last coupon date, in the instrument's money — a receivable beside the
   * lots it accrues on. The weekly accrual walk adds to it, a coupon date pays it and clears it,
   * a transfer moves it pro rata with the units, and a row that is sold or redeemed to nothing
   * stays on its book while it is still owed. Corporate paper (f4a); the sovereign twin is f4b.
   */
  accruedLocal: Float64Array;
  // ---- §3.13-BOOK f1 — THE LOTS UNDER A ROW. A position is what it is made of: every credit
  // that landed on the row is a LOT with the units it brought, the price a unit cost and the week
  // it arrived; a debit consumes them first-in-first-out; a desk's short is a lot with a negative
  // sign. The row's `units` is the chain's sum (`O14` checks it), and the chain is what a basis, a
  // realised gain and a holding period are read from — WRITERS FIRST: every writer keeps the chain
  // here, and the readers take it in (f2). ----
  /** Per row: the head and tail of its lot chain, -1 = none. */
  lotHead: Int32Array;
  lotTail: Int32Array;
  lotCap: number;
  lotUsed: number;
  lotFreeHead: number;
  /** Per lot: signed units, the price a unit cost (in the instrument's money), the week it arrived. */
  lotUnits: Float64Array;
  lotPriceLocal: Float64Array;
  lotWeek: Int32Array;
  lotNext: Int32Array;
  /** §3.13-BOOK f3 — who delivered the lot, for a GOOD row's lots (the goods ledger's `sellerKey`);
   *  ABSENT_REF on a security's lot, whose wire says the same thing. */
  lotSeller: RefColumn<PartyKeyRef>;
  /** §3.13-BOOK f2b — WHAT EACH BOOK HAS REALISED, cumulative, per money: `bookId|CUR` → the
   *  proceeds of every debit less the cost of the lots it consumed. The register's own P&L
   *  record — the capital-gains base and the realised half of a holder's result read here. */
  realised: Map<string, number>;
  next: Int32Array;
  freeHead: number;
  used: number;
  /** Per entity row (world.ts rowOf on the ENTITY id): chain head/tail, -1 = empty. */
  head: Int32Array;
  tail: Int32Array;
  /** Entities whose book has been OPENED — by the seed's wires, or by the week-start catch-up
   *  that opens a newborn's book the same way. The catch-up spots newcomers by their absence. */
  synced: Set<string>;
  /** Scratch per-row mark for relink's keep test — an epoch stamp, never a Set. */
  mark: Int32Array;
  markEpoch: number;
  /** Books a writer touched since the last materialization — the week-end view rebuilds only
   *  these. Every writer is a ledger operation and every ledger operation marks, so a missed mark
   *  is a ledger bug, not a stage's. */
  dirty: Set<string>;
}

/**
 * THE STORE IS SEALED. Everything outside `src/engine/ledger/` sees the register
 * through this view: every column is read-only, so a stage that writes a holding column does
 * not compile. The ledger (`ledger/holdings-ledger.ts`) is the one place a row moves, and every
 * move it makes is a numbered wire. The functions below are the ledger's implementation and are
 * importable only from it (`check-hygiene.sh` enforces the import boundary).
 */
export type ReadonlyHoldingStore = {
  readonly [K in keyof HoldingStore]:
    // §3.13-BOOK slice (b): a ref column keeps its SPACE through the readonly view. This branch
    // must come first — `RefColumn<B>` is assignable to `Int32Array` (its elements are numbers),
    // so the branch below would silently demote every ref back to a bare integer and undo the
    // whole point of the column type on every read path that goes through the view.
    HoldingStore[K] extends RefColumn<infer B> ? RefColumn<B>
    : HoldingStore[K] extends Float64Array ? Readonly<Float64Array>
    : HoldingStore[K] extends Int32Array ? Readonly<Int32Array>
    : HoldingStore[K] extends Set<string> ? ReadonlySet<string>
    : HoldingStore[K] extends Map<string, number> ? ReadonlyMap<string, number>
    : HoldingStore[K];
};
/** The ledger's own handle on the store. Nothing else may hold one. */
export const mutableHoldings = (v2: V2World): HoldingStore => v2.holdings as unknown as HoldingStore;

export function newHoldingStore(): HoldingStore {
  const cap = 1 << 17;
  return {
    cap,
    typeRef: newRefColumn<TypeRef>(cap),
    instrRef: newRefColumn<InstrRef>(cap),
    regionRef: newRefColumn<RegionRef>(cap),
    qtyLocal: new Float64Array(cap),
    shares: new Float64Array(cap),
    units: new Float64Array(cap),
    lienUnits: new Float64Array(cap),
    accruedLocal: new Float64Array(cap),
    lotHead: new Int32Array(cap).fill(-1), lotTail: new Int32Array(cap).fill(-1),
    lotCap: cap, lotUsed: 0, lotFreeHead: -1,
    lotUnits: new Float64Array(cap), lotPriceLocal: new Float64Array(cap), lotWeek: new Int32Array(cap), lotNext: new Int32Array(cap).fill(-1),
    lotSeller: newRefColumn<PartyKeyRef>(cap, -1),
    realised: new Map<string, number>(),
    next: new Int32Array(cap).fill(-1),
    freeHead: -1,
    used: 0,
    head: new Int32Array(0),
    tail: new Int32Array(0),
    synced: new Set<string>(),
    mark: new Int32Array(cap),
    markEpoch: 0,
    dirty: new Set<string>(),
  };
}

function growHoldings(H: HoldingStore): void {
  const cap = H.cap * 2;
  const gF = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
  /** §3.13-BOOK slice (b): growth keeps the column's space — the cast is the allocation's, not
   *  a site's, which is why it lives here and nowhere else. */
  const gR = <B extends number>(old: RefColumn<B>): RefColumn<B> => {
    const a = newRefColumn<B>(cap); a.set(old); return a;
  };
  H.typeRef = gR(H.typeRef); H.instrRef = gR(H.instrRef); H.regionRef = gR(H.regionRef);
  H.qtyLocal = gF(H.qtyLocal); H.shares = gF(H.shares); H.units = gF(H.units); H.lienUnits = gF(H.lienUnits); H.accruedLocal = gF(H.accruedLocal);
  const next = new Int32Array(cap).fill(-1); next.set(H.next); H.next = next;
  const mark = new Int32Array(cap); mark.set(H.mark); H.mark = mark;
  const lh = new Int32Array(cap).fill(-1); lh.set(H.lotHead); H.lotHead = lh;
  const lt = new Int32Array(cap).fill(-1); lt.set(H.lotTail); H.lotTail = lt;
  H.cap = cap;
}

function growLots(H: HoldingStore): void {
  const cap = H.lotCap * 2;
  const gF = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
  H.lotUnits = gF(H.lotUnits); H.lotPriceLocal = gF(H.lotPriceLocal);
  const w = new Int32Array(cap); w.set(H.lotWeek); H.lotWeek = w;
  const n = new Int32Array(cap).fill(-1); n.set(H.lotNext); H.lotNext = n;
  const sl = newRefColumn<PartyKeyRef>(cap, -1); sl.set(H.lotSeller); H.lotSeller = sl;
  H.lotCap = cap;
}

function allocLot(H: HoldingStore): number {
  if (H.lotFreeHead >= 0) { const l = H.lotFreeHead; H.lotFreeHead = H.lotNext[l]; H.lotNext[l] = -1; return l; }
  if (H.lotUsed >= H.lotCap) growLots(H);
  return H.lotUsed++;
}

function freeLot(H: HoldingStore, l: number): void {
  H.lotUnits[l] = 0; H.lotPriceLocal[l] = 0; H.lotWeek[l] = 0; H.lotSeller[l] = ABSENT_REF;
  H.lotNext[l] = H.lotFreeHead; H.lotFreeHead = l;
}

/** A row's whole chain to the free list. */
function freeLots(H: HoldingStore, r: number): void {
  for (let l = H.lotHead[r]; l >= 0; ) { const nxt = H.lotNext[l]; freeLot(H, l); l = nxt; }
  H.lotHead[r] = -1; H.lotTail[r] = -1;
}

/** §3.13-BOOK f1 — a lot lands at the tail of the row's chain (ledger-internal). */
export function appendLot(v2: V2World, r: number, units: number, priceLocal: number, week: number, seller: PartyKeyRef = ABSENT_REF as PartyKeyRef): void {
  if (!(Math.abs(units) > 0) || !Number.isFinite(units)) return;
  const H = mutableHoldings(v2);
  const l = allocLot(H);
  H.lotUnits[l] = units; H.lotPriceLocal[l] = Number.isFinite(priceLocal) ? priceLocal : 0; H.lotWeek[l] = week | 0; H.lotNext[l] = -1;
  H.lotSeller[l] = seller;
  if (H.lotTail[r] >= 0) H.lotNext[H.lotTail[r]] = l; else H.lotHead[r] = l;
  H.lotTail[r] = l;
}

/**
 * §3.13-BOOK f1 — the row's units move by `dUnits`: what opposes the lots already there is taken
 * from them first-in-first-out (a sale out of a long, a cover out of a short), and what is left
 * over is a new lot at `priceLocal` (ledger-internal). Dust below the row's own float noise is
 * dropped rather than kept as a lot of nothing.
 */
export function adjustLots(v2: V2World, r: number, dUnits: number, priceLocal: number, week: number): { consumedUnits: number; consumedBasisLocal: number } {
  const consumed = { consumedUnits: 0, consumedBasisLocal: 0 };
  if (!(Math.abs(dUnits) > 0) || !Number.isFinite(dUnits)) return consumed;
  const H = mutableHoldings(v2);
  let left = dUnits;
  for (let l = H.lotHead[r]; l >= 0 && left !== 0; ) {
    const lu = H.lotUnits[l];
    if (lu === 0 || (lu > 0) === (left > 0)) break;
    const take = Math.min(Math.abs(lu), Math.abs(left));
    // §3.13-BOOK f2b: what the consumed units COST — the lot's price on them — is the basis a
    // realised gain is measured against.
    consumed.consumedUnits += take; consumed.consumedBasisLocal += take * H.lotPriceLocal[l];
    const remaining = lu + Math.sign(left) * take;
    left -= Math.sign(left) * take;
    if (Math.abs(remaining) <= 1e-12 * Math.max(1, Math.abs(lu))) {
      const nxt = H.lotNext[l];
      freeLot(H, l);
      H.lotHead[r] = nxt; if (nxt < 0) H.lotTail[r] = -1;
      l = nxt;
    } else {
      H.lotUnits[l] = remaining;
    }
  }
  if (Math.abs(left) > 1e-9 * Math.max(1, Math.abs(dUnits))) appendLot(v2, r, left, priceLocal, week);
  return consumed;
}

/** §3.13-BOOK f4a — the row's receivable moves (ledger-internal): an accrual, a payout, a carry. */
export function addAccrued(v2: V2World, r: number, usd: number): void {
  if (!(Math.abs(usd) > 0) || !Number.isFinite(usd)) return;
  mutableHoldings(v2).accruedLocal[r] += usd;
}

/** The book's row of one instrument, for the accrual that lands on it; -1 when it holds none. */
export function accruedRowOf(v2: V2World, bookId: string, kind: string, instrumentId: string): number {
  const H = v2.holdings;
  const tRef = typeRefOf(v2, kind);
  if (tRef < 0) return -1;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === tRef && instrumentIdAt(v2, r) === instrumentId) return r;
  }
  return -1;
}

/** What a whole book is owed and has not been paid, across its rows. */
export function bookAccruedLocal(v2: V2World, bookId: string): number {
  const H = v2.holdings;
  let total = 0;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) total += H.accruedLocal[r];
  return total;
}

/** §3.13-BOOK f3 — lots a kernel consumed off a shared view go back to the free list (the
 *  kernels' dead sinks; the serial path frees through `LotFreeList` directly). */
export function recycleLots(v2: V2World, lots: readonly number[]): void {
  const H = mutableHoldings(v2);
  for (const l of lots) freeLot(H, l);
}

/** §3.13-BOOK f3 — open a row of `kind` on a book with nothing on it yet: the goods ledger's row
 *  for a firm's input lots (a GOOD row opens empty and its lots arrive one delivery at a time). */
export function openKindRow(v2: V2World, entityId: string, kind: string, instrumentId: string, region: string): number {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const slot = slotFor(H, rowOf(v2, entityId));
  const r = allocRow(H);
  H.typeRef[r] = internType(v2, kind);
  H.instrRef[r] = internInstrument(v2, asInstrumentId(instrumentId));
  H.regionRef[r] = internRegion(v2, region);
  H.qtyLocal[r] = 0; H.shares[r] = Number.NaN; H.units[r] = 0;
  H.next[r] = -1;
  if (H.tail[slot] >= 0) H.next[H.tail[slot]] = r; else H.head[slot] = r;
  H.tail[slot] = r;
  return r;
}

/** §3.13-BOOK f1 — `from`'s chain joins the tail of `to`'s, in order (a rebuild, a fold). */
export function moveLotsTo(v2: V2World, from: number, to: number): void {
  const H = mutableHoldings(v2);
  if (from === to || H.lotHead[from] < 0) return;
  if (H.lotTail[to] >= 0) H.lotNext[H.lotTail[to]] = H.lotHead[from]; else H.lotHead[to] = H.lotHead[from];
  H.lotTail[to] = H.lotTail[from];
  H.lotHead[from] = -1; H.lotTail[from] = -1;
}

/** The chain's units, summed in lot order — what the row's `units` must equal. */
export function rowLotUnits(v2: V2World, r: number): number {
  const H = v2.holdings;
  let sum = 0;
  for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) sum += H.lotUnits[l];
  return sum;
}

/** §3.13-BOOK f2b — WHAT THE ROW COST: its lots' units at the prices they arrived at, in the
 *  instrument's money. The mark less this is the unrealised result. */
export function rowBasisLocal(v2: V2World, r: number): number {
  const H = v2.holdings;
  let basis = 0;
  for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) basis += H.lotUnits[l] * H.lotPriceLocal[l];
  return basis;
}

/** The earliest week any lot of the row arrived — how long the position has been held. */
export function rowHeldSinceWeek(v2: V2World, r: number): number | undefined {
  const H = v2.holdings;
  const l = H.lotHead[r];
  return l >= 0 ? H.lotWeek[l] : undefined;
}

/** A whole book's cost, summed over its rows (each in its instrument's money). */
export function bookBasisLocal(v2: V2World, bookId: string): number {
  const H = v2.holdings;
  let basis = 0;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) basis += rowBasisLocal(v2, r);
  return basis;
}

/** A whole book's unrealised result: what its rows are marked at, less what they cost. */
export function bookUnrealisedLocal(v2: V2World, bookId: string): number {
  const H = v2.holdings;
  let gain = 0;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) gain += H.qtyLocal[r] - rowBasisLocal(v2, r);
  return gain;
}

const realisedKey = (bookId: string, currency: string): string => `${bookId}|${currency}`;

/** The ledger records a debit's realised result on the book (ledger-internal). */
export function addRealised(v2: V2World, bookId: string, currency: string, usd: number): void {
  if (!(Math.abs(usd) > 0) || !Number.isFinite(usd)) return;
  const H = mutableHoldings(v2);
  const k = realisedKey(bookId, currency);
  H.realised.set(k, (H.realised.get(k) ?? 0) + usd);
}

/** What a book has realised since the world began, in each money it realised it in. */
export function bookRealisedOf(v2: V2World, bookId: string): Map<string, number> {
  const out = new Map<string, number>();
  const prefix = `${bookId}|`;
  v2.holdings.realised.forEach((usd, k) => { if (k.startsWith(prefix)) out.set(k.slice(prefix.length), usd); });
  return out;
}

/** The row's lots as objects, in order — for a test or a view; the engine reads the columns. */
export function rowLotsOf(v2: V2World, r: number): { units: number; priceLocal: number; week: number }[] {
  const H = v2.holdings;
  const out: { units: number; priceLocal: number; week: number }[] = [];
  for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) out.push({ units: H.lotUnits[l], priceLocal: H.lotPriceLocal[l], week: H.lotWeek[l] });
  return out;
}

function allocRow(H: HoldingStore): number {
  if (H.freeHead >= 0) {
    const r = H.freeHead;
    H.freeHead = H.next[r];
    H.next[r] = -1;
    return r;
  }
  if (H.used >= H.cap) growHoldings(H);
  return H.used++;
}

function slotFor(H: HoldingStore, entRow: number): number {
  if (H.head.length <= entRow) {
    const cap = Math.max(entRow + 1, H.head.length * 2, 1024);
    const head = new Int32Array(cap).fill(-1); head.set(H.head); H.head = head;
    const tail = new Int32Array(cap).fill(-1); tail.set(H.tail); H.tail = tail;
  }
  return entRow;
}

/** Head row of the entity's book, -1 when it has none — for direct chain walks
 *  (`for (let r = bookHeadOf(...); r >= 0; r = H.next[r])`) that allocate nothing. */
export function bookHeadOf(v2: V2World, entityId: string): number {
  const H = mutableHoldings(v2);
  const entRow = v2.rowById.get(entityId);
  return entRow === undefined || entRow >= H.head.length ? -1 : H.head[entRow];
}

/** The entity's book as row indices, in book order. */
export function bookRowsOf(v2: V2World, entityId: string): number[] {
  const H = mutableHoldings(v2);
  const entRow = v2.rowById.get(entityId);
  const rows: number[] = [];
  if (entRow === undefined || entRow >= H.head.length) return rows;
  for (let r = H.head[entRow]; r >= 0; r = H.next[r]) rows.push(r);
  return rows;
}

/** Append one holding as a row at the tail of the entity's chain; returns the row. §3.13-BOOK f1:
 *  the row opens with one lot — its units at the price its value implies, in `week`. */
export function pushBookRow(v2: V2World, entityId: string, h: ItemizedHolding, week = 0): number {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const slot = slotFor(H, rowOf(v2, entityId));
  const r = allocRow(H);
  H.typeRef[r] = internType(v2, h.instrumentType);
  H.instrRef[r] = internInstrument(v2, h.instrumentId);
  H.regionRef[r] = internRegion(v2, h.issuerRegion);
  H.qtyLocal[r] = h.quantityOrNotionalLocal;
  H.shares[r] = h.quantityShares === undefined ? Number.NaN : h.quantityShares;
  H.units[r] = h.units;
  H.next[r] = -1;
  if (H.tail[slot] >= 0) H.next[H.tail[slot]] = r; else H.head[slot] = r;
  H.tail[slot] = r;
  openingLot(v2, r, h, week);
  return r;
}

/** The one lot a row built from an object starts with: its units at the price its value implies. */
function openingLot(v2: V2World, r: number, h: ItemizedHolding, week: number): void {
  const units = rowUnits(mutableHoldings(v2), r);
  if (!(Math.abs(units) > 0)) return;
  appendLot(v2, r, units, h.quantityOrNotionalLocal / units, week);
}

/**
 * Re-chain the entity's book to exactly `rows`, in order; every current row NOT in the list is
 * freed: a writer edits a local row list, then relinks once.
 */
export function relinkBook(v2: V2World, entityId: string, rows: number[]): void {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const slot = slotFor(H, rowOf(v2, entityId));
  if (rows.length > 0) {
    // The keep test is an epoch stamp on a typed column, not a Set — no hashing, no allocation.
    const epoch = ++H.markEpoch;
    for (let i = 0; i < rows.length; i++) H.mark[rows[i]] = epoch;
    for (let r = H.head[slot]; r >= 0; ) {
      const nxt = H.next[r];
      if (H.mark[r] !== epoch) freeRow(H, r);
      r = nxt;
    }
    for (let i = 0; i < rows.length; i++) H.next[rows[i]] = i + 1 < rows.length ? rows[i + 1] : -1;
    H.head[slot] = rows[0];
    H.tail[slot] = rows[rows.length - 1];
  } else {
    for (let r = H.head[slot]; r >= 0; ) {
      const nxt = H.next[r];
      freeRow(H, r);
      r = nxt;
    }
    H.head[slot] = -1;
    H.tail[slot] = -1;
  }
}

/** Allocate and fill a row WITHOUT touching any chain — for writers that assemble a whole
 *  chain themselves and install it with `setBookChain` (the clearing write-back). */
export function newBookRow(v2: V2World, h: ItemizedHolding, week = 0, withLot = true): number {
  const H = mutableHoldings(v2);
  const r = allocRow(H);
  H.typeRef[r] = internType(v2, h.instrumentType);
  H.instrRef[r] = internInstrument(v2, h.instrumentId);
  H.regionRef[r] = internRegion(v2, h.issuerRegion);
  H.qtyLocal[r] = h.quantityOrNotionalLocal;
  H.shares[r] = h.quantityShares === undefined ? Number.NaN : h.quantityShares;
  // §9.13-CREDIT row 5 — THE QUANTITY, WHICH THIS DID NOT COPY. `pushBookRow` carries `units`
  // across; this one dropped it, and it is the row builder THE CLEARING
  // WRITE-BACK USES — so every fill every book has ever written lost its face here. What the row
  // then reported depended on where the row came from: a recycled row kept `freeRow`'s NaN and
  // materialised as the VALUE, a fresh one kept the lane's zero and materialised as ZERO. One
  // book, two answers, decided by the free list. That is why the face could never diverge from
  // the value: it was never stored.
  H.units[r] = h.units;
  H.next[r] = -1;
  // §3.13-BOOK f1: the write-back carries a rebuilt position's lots across itself and says so.
  if (withLot) openingLot(v2, r, h, week);
  return r;
}

/** Return one row to the free list. The caller owns the invariant that nothing links to it. */
export function freeBookRow(v2: V2World, r: number): void {
  freeRow(mutableHoldings(v2), r);
}

/**
 * A freed row carries nothing. Left with its quantity, shares and instrument intact, a dead row
 * reads as a live position to any scan of `0..used` — the tranche store's own free path clears
 * its row for the same reason.
 */
function freeRow(H: HoldingStore, r: number): void {
  freeLots(H, r);
  H.qtyLocal[r] = 0;
  H.shares[r] = Number.NaN;
  H.units[r] = Number.NaN;
  H.lienUnits[r] = 0;
  H.accruedLocal[r] = 0;
  H.instrRef[r] = ABSENT_REF;
  H.typeRef[r] = ABSENT_REF;
  H.next[r] = H.freeHead;
  H.freeHead = r;
}

/** Install `ids` as the entity's whole chain, in order. Rows dropped from the old chain must
 *  already have been freed by the caller (freeBookRow) — this only links what it is given. */
export function setBookChain(v2: V2World, entityId: string, ids: number[]): void {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const slot = slotFor(H, rowOf(v2, entityId));
  let prev = -1;
  for (let i = 0; i < ids.length; i++) {
    const r = ids[i];
    if (prev >= 0) H.next[prev] = r; else H.head[slot] = r;
    prev = r;
  }
  if (prev >= 0) H.next[prev] = -1; else H.head[slot] = -1;
  H.tail[slot] = prev;
}

/** Direct column writers (in-place qty/shares scaling) call this so the week-end view knows to
 *  re-materialize the book. */
export function markBookDirty(v2: V2World, entityId: string): void {
  mutableHoldings(v2).dirty.add(entityId);
}

/**
 * §3.13-BOOK d0 — THE TWO WRITES THE CLEARING STORE USED TO MAKE THROUGH THE HANDLE.
 * `holdings-store.ts` held `mutableHoldings` for exactly these: a delivery landing on an existing
 * row (a stock-loan leg, `addShares`), and the week-end merge of two rows of one instrument on
 * one book. Both are operations of this store now, so the handle stays inside it.
 */

/** A share-counted row's whole position, set: shares, the units they are, and the value. */
export function setRowShares(v2: V2World, entityId: string, r: number, shares: number, pricePerShare: number, week = 0): void {
  const H = mutableHoldings(v2);
  // §3.13-BOOK f1: what arrived is a lot at this price; what left came off the oldest lots.
  adjustLots(v2, r, shares - (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]), pricePerShare, week);
  H.shares[r] = shares;
  H.qtyLocal[r] = shares * pricePerShare;
  // A share-counted row's units ARE its shares (`holdings-ledger.ts:unitsOf`).
  H.units[r] = shares;
  H.dirty.add(entityId);
}

/** §3.17e-iii-b — the same for a row counted in UNITS (a bond's face): what arrived is a lot at
 *  this price, what left came off the oldest lots; the value is units × price; shares untouched. */
export function setRowUnits(v2: V2World, entityId: string, r: number, units: number, pricePerUnit: number, week = 0): void {
  const H = mutableHoldings(v2);
  adjustLots(v2, r, units - rowUnits(H, r), pricePerUnit, week);
  H.units[r] = units;
  H.qtyLocal[r] = units * pricePerUnit;
  H.dirty.add(entityId);
}

/** Fold row `drop` into row `keep` — value, shares and units — leaving `drop` for the relink to
 *  free. Two rows of one instrument on one book hold one position (§9.13-CREDIT row 5). */
export function foldRowInto(v2: V2World, keep: number, drop: number): void {
  const H = mutableHoldings(v2);
  H.qtyLocal[keep] = H.qtyLocal[keep] + H.qtyLocal[drop];
  const sh = H.shares[drop];
  if (!Number.isNaN(sh)) {
    const cur = H.shares[keep];
    H.shares[keep] = (Number.isNaN(cur) ? 0 : cur) + sh;
  }
  H.units[keep] = rowUnits(H, keep) + rowUnits(H, drop);
  // §3.13-BOOK d5a: a lien binds the position, and the position is the two rows together.
  H.lienUnits[keep] += H.lienUnits[drop];
  // §3.13-BOOK f1: and so are its lots, the dropped row's after the kept row's.
  moveLotsTo(v2, drop, keep);
  // §3.13-BOOK f4a: and what the two have earned.
  H.accruedLocal[keep] += H.accruedLocal[drop]; H.accruedLocal[drop] = 0;
}

/**
 * §3.13-BOOK slice (a) — THE ONE PLACE A REGISTER ROW BECOMES AN INSTRUMENT ID.
 *
 * `instrRef` is an index into the shared intern table, which holds entity names, instrument keys,
 * region codes and type tags in the same array. Twenty-seven sites read a row's instrument out of
 * it by hand, each one an unstated claim that this particular ref names an instrument. This is
 * that claim, made once: every one of those sites now calls this, so the claim has a single
 * location, and slice (b) — which splits the intern table into per-space tables — has exactly one
 * function to make TRUE rather than twenty-seven to find.
 */
export function instrumentIdAt(v2: V2World, r: number): InstrumentId {
  return instrumentOf(v2, mutableHoldings(v2).instrRef[r]);
}

/** The entity's book as objects — the WEEK-END VIEW once rows are the authority: one linear
 *  pass at the close replaces every per-writer sync. */
/**
 * §3.13-READ A6 — HOW MANY UNITS THIS ROW HOLDS, and the only place that decides it.
 *
 * The `units` column is NaN on a row nothing ever wrote it on: `freeRow` clears it, and a book
 * synced from an `ItemizedHolding` that predates the field leaves it unset. Eighteen sites fell
 * back from that NaN, and they did not agree. The store's own materializer fell back through
 * `shares` first and only then to the money; the other seventeen went straight to the money. For
 * an EQUITY row those are not near each other — `shares` is a count and `qtyLocal` is a market
 * value — so one row read two ways gave a share count at the store and a dollar figure at every
 * stage, and whichever the caller happened to use is what the merger swap, the estate residue and
 * the ETF creation basket then moved.
 *
 * The store's chain is the correct one and this is it: a stored count, else the share count beside
 * it, else the value (which par pricing made equal to the count for the credit rows this was
 * written for). Nothing may spell it again.
 */
export function rowUnits(
  H: { units: { readonly [i: number]: number }; shares: { readonly [i: number]: number };
       qtyLocal: { readonly [i: number]: number } },
  r: number
): number {
  const u = H.units[r];
  if (!Number.isNaN(u)) return u;
  const sh = H.shares[r];
  return Number.isNaN(sh) ? H.qtyLocal[r] : sh;
}

export function materializeBook(v2: V2World, entityId: string): ItemizedHolding[] {
  const H = mutableHoldings(v2);
  const out: ItemizedHolding[] = [];
  for (let r = bookHeadOf(v2, entityId); r >= 0; r = H.next[r]) {
    const sh = H.shares[r];
    const h: ItemizedHolding = {
      // §3.13-BOOK slice (a): the row's ref becomes an INSTRUMENT id here — the admission that
      // `instrRef` names an instrument, which slice (b) makes true by splitting the intern table.
      instrumentId: instrumentIdAt(v2, r),
      instrumentType: typeOf(v2, H.typeRef[r]) as ItemizedHolding['instrumentType'],
      issuerRegion: regionOf(v2, H.regionRef[r]) as ItemizedHolding['issuerRegion'],
      quantityOrNotionalLocal: H.qtyLocal[r],
      units: rowUnits(H, r),
    };
    if (!Number.isNaN(sh)) h.quantityShares = sh;
    out.push(h);
  }
  return out;
}

/** Week end: every book has been materialized; the dirty set starts empty. Ledger-internal. */
export function clearDirtyBooks(v2: V2World): void { mutableHoldings(v2).dirty.clear(); }
/**
 * Unlink the rows that hold nothing — NOTHING, in either unit. Ledger-internal (the ledger's
 * debit relinks itself). Tested on dollars alone this destroyed shares: an equity row whose mark
 * had fallen under a dollar, or any row read mid-week before its re-mark, was unlinked with its
 * share count intact and the holder's position ceased to exist.
 */
export function pruneEmptyRows(v2: V2World, entityId: string): void {
  const H = mutableHoldings(v2); const kept: number[] = [];
  for (let r = bookHeadOf(v2, entityId); r >= 0; r = H.next[r]) {
    if (H.qtyLocal[r] !== 0 || (!Number.isNaN(H.shares[r]) && H.shares[r] !== 0) || H.lienUnits[r] > 0 || H.accruedLocal[r] !== 0) kept.push(r);
  }
  relinkBook(v2, entityId, kept);
}
