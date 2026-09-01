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
}

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
  };
}

function growHoldings(H: HoldingStore): void {
  const cap = H.cap * 2;
  const gF = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
  const gI = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old); return a; };
  H.typeRef = gI(H.typeRef); H.instrRef = gI(H.instrRef); H.regionRef = gI(H.regionRef);
  H.qtyUSD = gF(H.qtyUSD); H.shares = gF(H.shares);
  const next = new Int32Array(cap).fill(-1); next.set(H.next); H.next = next;
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
  const H = v2.holdings;
  H.synced.add(entityId);
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

/** The entity's book as row indices, in book order. */
export function bookRowsOf(v2: V2World, entityId: string): number[] {
  const H = v2.holdings;
  const entRow = v2.rowById.get(entityId);
  const rows: number[] = [];
  if (entRow === undefined || entRow >= H.head.length) return rows;
  for (let r = H.head[entRow]; r >= 0; r = H.next[r]) rows.push(r);
  return rows;
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
  const H = v2.holdings;
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
