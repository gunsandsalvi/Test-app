/**
 * ENGINE V2 — THE INSTITUTIONAL REGISTER AS PERSISTENT ROWS (the §7.307 holdings flip, staged
 * per §7.311/§7.313's proven method).
 *
 * Stage 1: a SYNCED MIRROR — `entity.itemizedHoldings` stays authoritative and every writer
 * mirrors the books it touched (`syncBookRows`); `HOLDINGS_SYNC_CHECK=1` compares canonical
 * projections at each week end and throws on the first mismatch, so a missed writer is found
 * empirically (§7.221), exactly how the tranche mirror's check found the birth path and the
 * clone-aliasing bug. Readers then flip file by file, writers go row-native last, and the
 * arrays become a week-end materialized view.
 *
 * ~75 holders, ~110k rows (§7.232: the register triples to steady state) — the same plain-data
 * rules as the lot/contract/tranche stores: typed arrays, interned strings, per-entity chains
 * in book order, `structuredClone`-safe.
 */

import { ItemizedHolding } from '../domain/banking';
import { V2World, rowOf, internString } from './world';

export interface HoldingStore {
  cap: number;
  typeRef: Int32Array;    // interned instrumentType
  instrRef: Int32Array;   // interned instrumentId
  regionRef: Int32Array;  // interned issuerRegion
  qtyUSD: Float64Array;
  shares: Float64Array;   // NaN = absent (quantityShares)
  next: Int32Array;
  freeHead: number;
  used: number;
  /** Per entity row (world.ts rowOf on the ENTITY id): chain head/tail, -1 = empty. */
  head: Int32Array;
  tail: Int32Array;
  /** Entities whose book has ever been synced — the week-start catch-up spots newcomers. */
  synced: Set<string>;
  /** Scratch per-row mark for relink's keep test — an epoch stamp, never a Set (§7.315). */
  mark: Int32Array;
  markEpoch: number;
  /** Books a writer touched since the last materialization — the week-end view rebuilds only
   *  these (a missed mark is caught by HOLDINGS_SYNC_CHECK comparing EVERY book to its rows). */
  dirty: Set<string>;
}

/**
 * §5-WIRES W2 — THE STORE IS SEALED. Everything outside `src/engine/ledger/` sees the register
 * through this view: every column is read-only, so a stage that writes a holding column does
 * not compile. The ledger (`ledger/holdings-ledger.ts`) is the one place a row moves, and every
 * move it makes is a numbered wire. The functions below are the ledger's implementation and are
 * importable only from it (`check-hygiene.sh` enforces the import boundary).
 */
export type ReadonlyHoldingStore = {
  readonly [K in keyof HoldingStore]:
    HoldingStore[K] extends Float64Array ? Readonly<Float64Array>
    : HoldingStore[K] extends Int32Array ? Readonly<Int32Array>
    : HoldingStore[K] extends Set<string> ? ReadonlySet<string>
    : HoldingStore[K];
};
/** The ledger's own handle on the store. Nothing else may hold one. */
export const mutableHoldings = (v2: V2World): HoldingStore => v2.holdings as unknown as HoldingStore;

export function newHoldingStore(): HoldingStore {
  const cap = 1 << 17;
  return {
    cap,
    typeRef: new Int32Array(cap),
    instrRef: new Int32Array(cap),
    regionRef: new Int32Array(cap),
    qtyUSD: new Float64Array(cap),
    shares: new Float64Array(cap),
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
  const gI = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old); return a; };
  H.typeRef = gI(H.typeRef); H.instrRef = gI(H.instrRef); H.regionRef = gI(H.regionRef);
  H.qtyUSD = gF(H.qtyUSD); H.shares = gF(H.shares);
  const next = new Int32Array(cap).fill(-1); next.set(H.next); H.next = next;
  const mark = new Int32Array(cap); mark.set(H.mark); H.mark = mark;
  H.cap = cap;
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

/** Mirror one entity's whole book into rows, replacing whatever the chain held. */
export function syncBookRows(v2: V2World, entityId: string, book: ItemizedHolding[] | undefined): void {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const entRow = rowOf(v2, entityId);
  const slot = slotFor(H, entRow);
  for (let r = H.head[slot]; r >= 0; ) {
    const nxt = H.next[r];
    H.next[r] = H.freeHead;
    H.freeHead = r;
    r = nxt;
  }
  H.head[slot] = -1;
  H.tail[slot] = -1;
  if (!book || book.length === 0) return;
  let prev = -1;
  for (let i = 0; i < book.length; i++) {
    const h = book[i];
    const r = allocRow(H);
    H.typeRef[r] = internString(v2, h.instrumentType);
    H.instrRef[r] = internString(v2, h.instrumentId);
    H.regionRef[r] = internString(v2, h.issuerRegion);
    H.qtyUSD[r] = h.quantityOrNotionalUSD ?? 0;
    H.shares[r] = h.quantityShares === undefined ? Number.NaN : h.quantityShares;
    H.next[r] = -1;
    if (prev >= 0) H.next[prev] = r; else H.head[slot] = r;
    prev = r;
  }
  H.tail[slot] = prev;
}

/** Head row of the entity's mirrored book, -1 when it has none — for direct chain walks
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

/** Append one holding as a row at the tail of the entity's chain; returns the row. */
export function pushBookRow(v2: V2World, entityId: string, h: ItemizedHolding): number {
  const H = mutableHoldings(v2);
  H.synced.add(entityId);
  H.dirty.add(entityId);
  const slot = slotFor(H, rowOf(v2, entityId));
  const r = allocRow(H);
  H.typeRef[r] = internString(v2, h.instrumentType);
  H.instrRef[r] = internString(v2, h.instrumentId);
  H.regionRef[r] = internString(v2, h.issuerRegion);
  H.qtyUSD[r] = h.quantityOrNotionalUSD ?? 0;
  H.shares[r] = h.quantityShares === undefined ? Number.NaN : h.quantityShares;
  H.next[r] = -1;
  if (H.tail[slot] >= 0) H.next[H.tail[slot]] = r; else H.head[slot] = r;
  H.tail[slot] = r;
  return r;
}

/**
 * Re-chain the entity's book to exactly `rows`, in order; every current row NOT in the list is
 * freed. The §7.313 write-back pattern: a writer edits a local row list, then relinks once.
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
      if (H.mark[r] !== epoch) { H.next[r] = H.freeHead; H.freeHead = r; }
      r = nxt;
    }
    for (let i = 0; i < rows.length; i++) H.next[rows[i]] = i + 1 < rows.length ? rows[i + 1] : -1;
    H.head[slot] = rows[0];
    H.tail[slot] = rows[rows.length - 1];
  } else {
    for (let r = H.head[slot]; r >= 0; ) {
      const nxt = H.next[r];
      H.next[r] = H.freeHead;
      H.freeHead = r;
      r = nxt;
    }
    H.head[slot] = -1;
    H.tail[slot] = -1;
  }
}

/** Allocate and fill a row WITHOUT touching any chain — for writers that assemble a whole
 *  chain themselves and install it with `setBookChain` (the clearing write-back). */
export function newBookRow(v2: V2World, h: ItemizedHolding): number {
  const H = mutableHoldings(v2);
  const r = allocRow(H);
  H.typeRef[r] = internString(v2, h.instrumentType);
  H.instrRef[r] = internString(v2, h.instrumentId);
  H.regionRef[r] = internString(v2, h.issuerRegion);
  H.qtyUSD[r] = h.quantityOrNotionalUSD ?? 0;
  H.shares[r] = h.quantityShares === undefined ? Number.NaN : h.quantityShares;
  H.next[r] = -1;
  return r;
}

/** Return one row to the free list. The caller owns the invariant that nothing links to it. */
export function freeBookRow(v2: V2World, r: number): void {
  const H = mutableHoldings(v2);
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
 *  re-materialize the book; a missed call is caught by HOLDINGS_SYNC_CHECK. */
export function markBookDirty(v2: V2World, entityId: string): void {
  mutableHoldings(v2).dirty.add(entityId);
}

/** The entity's book as objects — the WEEK-END VIEW once rows are the authority (§7.313's
 *  pattern: one linear pass at the close replaces every per-writer sync). */
export function materializeBook(v2: V2World, entityId: string): ItemizedHolding[] {
  const H = mutableHoldings(v2);
  const out: ItemizedHolding[] = [];
  for (let r = bookHeadOf(v2, entityId); r >= 0; r = H.next[r]) {
    const sh = H.shares[r];
    const h: ItemizedHolding = {
      instrumentId: v2.internedStrings[H.instrRef[r]],
      instrumentType: v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'],
      issuerRegion: v2.internedStrings[H.regionRef[r]] as ItemizedHolding['issuerRegion'],
      quantityOrNotionalUSD: H.qtyUSD[r],
    };
    if (!Number.isNaN(sh)) h.quantityShares = sh;
    out.push(h);
  }
  return out;
}

/** Idempotent catch-up (seed and any unhooked creation path). */
export function ensureBooksSynced(v2: V2World, entities: { id: string; itemizedHoldings?: ItemizedHolding[] }[]): void {
  for (const e of entities) {
    if (!v2.holdings.synced.has(e.id)) syncBookRows(v2, e.id, e.itemizedHoldings);
  }
}

function canonical(h: ItemizedHolding): string {
  return `${h.instrumentType}|${h.instrumentId}|${h.issuerRegion}|${h.quantityOrNotionalUSD ?? 0}|${h.quantityShares ?? 'x'}`;
}

function canonicalRow(v2: V2World, r: number): string {
  const H = mutableHoldings(v2);
  const sh = H.shares[r];
  return `${v2.internedStrings[H.typeRef[r]]}|${v2.internedStrings[H.instrRef[r]]}|${v2.internedStrings[H.regionRef[r]]}|${H.qtyUSD[r]}|${Number.isNaN(sh) ? 'x' : sh}`;
}

/** HOLDINGS_SYNC_CHECK=1 — throw on the first entity whose rows disagree with its book. */
export function assertBooksInSync(v2: V2World, entities: { id: string; entityType?: string; itemizedHoldings?: ItemizedHolding[] }[]): void {
  for (const e of entities) {
    const book = e.itemizedHoldings ?? [];
    const rows = bookRowsOf(v2, e.id);
    if (rows.length !== book.length) {
      throw new Error(`HOLDINGS SYNC: ${e.id} (${e.entityType ?? '?'}) has ${book.length} book rows but ${rows.length} mirrored — a writer is not syncing`);
    }
    for (let i = 0; i < book.length; i++) {
      const a = canonical(book[i]);
      const b = canonicalRow(v2, rows[i]);
      if (a !== b) {
        throw new Error(`HOLDINGS SYNC: ${e.id}[${i}] diverges\n  obj: ${a}\n  row: ${b}`);
      }
    }
  }
}

/** Week end: every book has been materialized; the dirty set starts empty. Ledger-internal. */
export function clearDirtyBooks(v2: V2World): void { mutableHoldings(v2).dirty.clear(); }
/** Unlink the rows that hold nothing. Ledger-internal (the ledger's debit relinks itself). */
export function pruneEmptyRows(v2: V2World, entityId: string): void {
  const H = mutableHoldings(v2); const kept: number[] = [];
  for (let r = bookHeadOf(v2, entityId); r >= 0; r = H.next[r]) if (H.qtyUSD[r] > 1) kept.push(r);
  relinkBook(v2, entityId, kept);
}
