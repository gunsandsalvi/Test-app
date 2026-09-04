/**
 * ENGINE V2 — THE PERSISTENT COLUMNAR WORLD, attached to the GameState it describes.
 *
 * This is the strangler's authoritative store (see state.ts's header for the campaign scope):
 * tables land here as their owning mechanisms port, and they live WEEK TO WEEK — no rebuild, no
 * copy-on-first-touch, no replacement arrays. The container is deliberately plain data — POJOs,
 * typed arrays, Maps and number[]s, never class instances or functions — because the harness
 * batteries isolate replays with `structuredClone(state)`: a clone carries its own deep copy of
 * every table, which is what retires §7.303's load-bearing replacement-semantics convention for
 * everything stored here.
 *
 * Addressing: a firm is a ROW (assigned on first touch, stable for the run, keyed by company
 * id); a good is the registry's sub-unit index (state.ts's SUBUNIT_INDEX — the registry is
 * static within a run). Strings die at this boundary (interned seller keys).
 */

import { newLotStore, ReadonlyLotStore } from './lots';
import { ReadonlyContractTable, newContractTable } from './contracts';
import { newTrancheStore, ReadonlyTrancheStore } from './tranches';
import { newHoldingStore, ReadonlyHoldingStore } from './holdings';
import { newPriceStore, ReadonlyPriceStore } from './prices';
import { CurrencyCode, CURRENCY_CODES } from '../domain/geography';
import { FxTable, PARITY_FX } from '../domain/currency';
import { asInstrumentId, type InstrumentId } from '../domain/ids';
import { newRefColumn, NO_REF, type RefColumn, type InstrRef, type EntityRef, type RegionRef, type TypeRef, type TickerRef, type AccountRef, type PartyKeyRef } from './refs';

export interface V2World {
  /** Company id -> table row. Rows are addressing only — order carries no economics. */
  rowById: Map<string, number>;
  nRows: number;
  /**
   * §3.13-BOOK slice (b) — ONE INTERN TABLE PER ID SPACE.
   *
   * These were a single `internedStrings` array shared by every ref column, so an instrument ref,
   * a region ref and a type ref were the same kind of integer and only the columns' names kept
   * them apart. They are seven numberings now, and a ref from one names nothing in another.
   *
   * What that buys beyond the type check: `refs.instruments.strings` IS the list of every
   * instrument the world has ever named. Under one table that question had no answer — ~15 type
   * tags and 5 region codes sat mixed among thousands of ids — and it is the question slice (d)'s
   * instrument index is built to ask.
   */
  refs: RefTables;
  /** IND1/1$-is-1$ — every firm's real input lots, FIFO by acquisition week. */
  lots: ReadonlyLotStore;
  /** IND11 — the bilateral supply-contract book (§7.304's measured scaling monster). */
  contracts: ReadonlyContractTable;
  /** §7.307/§7.310 — the debt ladder as rows (rows are the authority since §7.313). */
  tranches: ReadonlyTrancheStore;
  /** §7.307 — the institutional register as rows (stage 1: a synced mirror of itemizedHoldings). */
  holdings: ReadonlyHoldingStore;
  /** §3.13 — WHAT ONE UNIT OF AN INSTRUMENT LAST CLEARED AT (engine2/prices.ts). A position is
   *  (asset, units) and its value is units × this; a market writes only what it cleared, and an
   *  instrument no market printed has no entry rather than a par. */
  prices: ReadonlyPriceStore;
  /** §4.C II.5 — revenue history as a 13-slot ring per firm row (the object field is DELETED:
   *  the weekly `[...slice(-12), x]` allocated a fresh array per firm per week, and the §7.320
   *  mid-loop-append trap lived in the aliasing; a ring has neither). Plain arrays, not SAB —
   *  batteries deep-clone v2 with structuredClone, and SAB-backed lanes would SHARE memory
   *  across clones (noted §1.18 deviation: clone-safety wins; workers get mirrors, §7.306). */
  revRing: { slots: Float64Array; len: Uint8Array; start: Uint8Array; cap: number };
  /** §4.C II.5 — the other Company history rings (same clone-safety note as revRing). */
  priceRing: F64Ring;
  ratingRing: F64Ring;
  /** §5-WIRES A3 — THE PERSISTENT ACCOUNTS (engine/ledger/accounts.ts owns every read and
   *  write): one balance per party key interned in this world's string table, living week to
   *  week. Companies first (§7.384); the other kinds join per A3's list. Plain typed arrays and
   *  a Map, clone-safe like every table here. */
  accounts: ReadonlyAccounts;
  /** §3.13c — THE RATE IN FORCE THIS WEEK: what a unit of each currency is worth in the
   *  numéraire. It lives on the world rather than on the week's context because a balance cannot
   *  be read, converted or settled without it and reads happen everywhere — the audits, the UI
   *  and the harness hold no context — and it does NOT move inside a week, so every read of one
   *  balance agrees with every other. */
  fx: Record<CurrencyCode, number>;
  /** What the FX auction cleared, which takes effect at the NEXT week's open. A rate that moved
   *  mid-week made two honest reads of the same balance disagree: a resolution valued a failed
   *  bank's book at the post-auction rate while settlement paid it away at the pre-auction one,
   *  and the 134.8M difference — a revaluation — was reported as money left on the shell. */
  fxNext: Record<CurrencyCode, number>;
}

/**
 * §3.13c — AN ACCOUNT IS (PARTY, CURRENCY). A party used to have exactly one balance, whose
 * currency was implied by its region and read by nobody: a cross-border payment subtracted euros
 * from one row and added dollars to another, and the ledger balanced because it was summing two
 * things that are not the same kind of thing. A row now carries the money it is denominated in,
 * a party holds as many rows as it holds currencies, and a payment that crosses converts at the
 * cleared rate on the way.
 */
export interface PersistentAccounts {
  n: number;
  /** The account's key (`KIND:name|CUR`, party.ts + the currency) as an interned string id. */
  keyRef: RefColumn<AccountRef>;
  /** The row's balance, IN THE ROW'S OWN CURRENCY. */
  balance: Float64Array;
  /** Which money this row holds, as an index into CURRENCY_CODES. */
  currencyId: Int8Array;
  rowByKeyRef: Map<AccountRef, number>;
  /** Every row of one party, across the currencies it holds: party key id → rows. */
  rowsByPartyRef: Map<PartyKeyRef, number[]>;
  /** THE MONEY A PARTY KEEPS ITS BOOKS IN, as a currency id: the money its FIRST account was
   *  opened in, which is by construction the one the seed gave it. Everything a party holds in
   *  another money is worth what it converts to at this one — a firm does not re-denominate
   *  because it was paid in yen. */
  homeByPartyRef: Map<PartyKeyRef, number>;
  /** A3.3 — a sector party's rows, one per (bank, currency): party key id → `TICKER|CUR` → row. */
  bankRowsByParty: Map<PartyKeyRef, Map<string, number>>;
}

/**
 * §3.13-BOOK — THE MONEY STORE'S READ VIEW.
 *
 * `v2.holdings`, `v2.tranches` and `v2.lots` have had one of these; the ACCOUNT store did not, so
 * any file in the model could write `v2.accounts.balance[r] = x` and no gate would notice. That is
 * the exact inversion of what money is supposed to be here — a balance moves only through `pay()`,
 * and money is the example the rest of the model is being made to look like. It was the one store
 * whose wall was a naming convention.
 *
 * `Readonly<Float64Array>` genuinely refuses element assignment (TS2542), which is what makes this
 * a wall rather than a label; the mutable handle is `accounts.ts:mutableAccounts`.
 */
export type ReadonlyAccounts = {
  readonly [K in keyof PersistentAccounts]:
    PersistentAccounts[K] extends RefColumn<infer B> ? RefColumn<B>
    : PersistentAccounts[K] extends Float64Array ? Readonly<Float64Array>
    : PersistentAccounts[K] extends Int8Array ? Readonly<Int8Array>
    : PersistentAccounts[K] extends Map<infer MK, infer MV> ? ReadonlyMap<MK, MV>
    : PersistentAccounts[K];
};

export function newPersistentAccounts(): PersistentAccounts {
  const cap = 1 << 12;
  return {
    n: 0, keyRef: newRefColumn<AccountRef>(cap), balance: new Float64Array(cap), currencyId: new Int8Array(cap),
    rowByKeyRef: new Map<AccountRef, number>(), rowsByPartyRef: new Map<PartyKeyRef, number[]>(), homeByPartyRef: new Map<PartyKeyRef, number>(), bankRowsByParty: new Map<PartyKeyRef, Map<string, number>>(),
  };
}

/** The index CURRENCY_CODES holds each currency at — how a row stores its money in one byte. */
export const CURRENCY_ID: Readonly<Record<CurrencyCode, number>> =
  CURRENCY_CODES.reduce((m, c, i) => { m[c] = i; return m; }, {} as Record<CurrencyCode, number>);
export const currencyOfId = (id: number): CurrencyCode => CURRENCY_CODES[id];

/** The world's rates, as the immutable table every conversion takes. */
export const fxOf = (v2: V2World): FxTable => v2.fx;

/** The week opens on what the last auction cleared. Called once, before any stage runs. */
export function openFxWeek(v2: V2World): void {
  CURRENCY_CODES.forEach((c) => { v2.fx[c] = v2.fxNext[c]; });
}

/** A per-row fixed-capacity ring of f64 slots. `len` is the actual entry count (these rings'
 *  object fields had no unset-vs-empty distinction to preserve — revRing's does, and keeps
 *  its own encoding). */
export interface F64Ring { slots: Float64Array; len: Uint8Array; start: Uint8Array; capRows: number; slotCap: number }

/** The host: any object graph that carries a v2 world (GameState, structurally). */
export interface V2Host { v2?: V2World }

export function ensureV2(state: V2Host): V2World {
  if (state.v2) return state.v2;
  const v2: V2World = {
    rowById: new Map(),
    nRows: 0,
    refs: newRefTables(),
    lots: newLotStore(),
    contracts: newContractTable(),
    tranches: newTrancheStore(),
    holdings: newHoldingStore(),
    prices: newPriceStore(),
    revRing: { slots: new Float64Array(13 << 12), len: new Uint8Array(1 << 12), start: new Uint8Array(1 << 12), cap: 1 << 12 },
    priceRing: makeF64Ring(52, 1 << 12),
    ratingRing: makeF64Ring(16, 1 << 12),
    accounts: newPersistentAccounts(),
    // Parity until the FX auction clears once — the only honest opening value, and one every
    // read must survive, since the audits and the UI can be asked about week 0.
    fx: { ...PARITY_FX },
    fxNext: { ...PARITY_FX },
  };
  state.v2 = v2;
  return v2;
}

/** The firm's stable row, assigned on first touch. */
export function rowOf(v2: V2World, companyId: string): number {
  let r = v2.rowById.get(companyId);
  if (r === undefined) {
    r = v2.nRows++;
    v2.rowById.set(companyId, r);
  }
  return r;
}

/** One id space's strings, and the reverse index onto them. Append-only for a run's life. */
export interface InternTable {
  strings: string[];
  idByString: Map<string, number>;
}

/** The seven spaces `engine2/refs.ts` names, one table each. */
export interface RefTables {
  instruments: InternTable;
  entities: InternTable;
  regions: InternTable;
  types: InternTable;
  tickers: InternTable;
  accountKeys: InternTable;
  partyKeys: InternTable;
}

const newInternTable = (): InternTable => ({ strings: [], idByString: new Map() });

const newRefTables = (): RefTables => ({
  instruments: newInternTable(),
  entities: newInternTable(),
  regions: newInternTable(),
  types: newInternTable(),
  tickers: newInternTable(),
  accountKeys: newInternTable(),
  partyKeys: newInternTable(),
});

/**
 * INTERNING MUTATES, AND THAT IS WHY THE READ BELOW IS A SEPARATE FUNCTION.
 *
 * A lookup that missed and appended would shift every id assigned after it, and ids are ADDRESSING
 * for lots, holdings and accounts — rows already hold the old numbers. A read path that interns is
 * a read path that changes the world, measured once: `pendingSettlement` asking a party's currency
 * moved the central bank's identity by 0.43B in week 4, purely by renumbering. Splitting the table
 * does not soften that; it narrows the blast radius to one space.
 */
const intern = (t: InternTable, s: string): number => {
  let id = t.idByString.get(s);
  if (id === undefined) {
    id = t.strings.length;
    t.strings.push(s);
    t.idByString.set(s, id);
  }
  return id;
};

/** A READ. Never appends — see `intern` above for what an appending read costs. */
const look = (t: InternTable, s: string): number => t.idByString.get(s) ?? NO_REF;

/**
 * §3.13-BOOK slice (b) — THE PER-SPACE DOORS ONTO THE INTERN TABLE (`engine2/refs.ts`).
 *
 * Each reads and writes ITS OWN table (`RefTables` above), so a ref is meaningless outside the
 * space that minted it — the "by construction" half of what the types already say. Nothing outside
 * this file touches a table directly; that is what made the split a change to these fifteen
 * functions rather than to the 78 sites that used to reach past them (§5: the sites were routed
 * through the doors first, while the numbering was still shared and nothing could move).
 */

/** Intern an instrument id. */
export const internInstrument = (v2: V2World, id: InstrumentId): InstrRef => intern(v2.refs.instruments, id) as InstrRef;
/** Intern an entity id — anything that can hold, issue or be paid. */
export const internEntity = (v2: V2World, id: string): EntityRef => intern(v2.refs.entities, id) as EntityRef;
/** Intern a region code. */
export const internRegion = (v2: V2World, id: string): RegionRef => intern(v2.refs.regions, id) as RegionRef;
/** Intern an instrument KIND tag. */
export const internType = (v2: V2World, tag: string): TypeRef => intern(v2.refs.types, tag) as TypeRef;
/** Intern a company ticker — its party address, not its id. */
export const internTicker = (v2: V2World, ticker: string): TickerRef => intern(v2.refs.tickers, ticker) as TickerRef;
/** Intern an account key (`accounts.ts:accountKey` — a party and a currency). */
export const internAccount = (v2: V2World, key: string): AccountRef => intern(v2.refs.accountKeys, key) as AccountRef;
/** Intern a party key (`party.ts:partyKey` — the ledger's address, not the entity id). */
export const internPartyKey = (v2: V2World, key: string): PartyKeyRef => intern(v2.refs.partyKeys, key) as PartyKeyRef;

/**
 * A READ, per space: the ref this string already has, or `NO_REF`. Interning on a read path
 * MUTATES — see `intern` above for the 0.43B that cost — so the reads are separate functions and
 * every one of them can miss.
 */
export const instrumentRefOf = (v2: V2World, id: InstrumentId): InstrRef => look(v2.refs.instruments, id) as InstrRef;
export const entityRefOf = (v2: V2World, id: string): EntityRef => look(v2.refs.entities, id) as EntityRef;
export const regionRefOf = (v2: V2World, id: string): RegionRef => look(v2.refs.regions, id) as RegionRef;
export const typeRefOf = (v2: V2World, tag: string): TypeRef => look(v2.refs.types, tag) as TypeRef;
export const tickerRefOf = (v2: V2World, ticker: string): TickerRef => look(v2.refs.tickers, ticker) as TickerRef;
export const accountRefOf = (v2: V2World, key: string): AccountRef => look(v2.refs.accountKeys, key) as AccountRef;
export const partyKeyRefOf = (v2: V2World, key: string): PartyKeyRef => look(v2.refs.partyKeys, key) as PartyKeyRef;

/** Decode, per space. Each is where a ref becomes a string again, and the only place that claim
 *  is made — `instrumentOf` is the one that also crosses into the branded id space. */
export const instrumentOf = (v2: V2World, ref: InstrRef): InstrumentId => asInstrumentId(v2.refs.instruments.strings[ref]);
export const entityOf = (v2: V2World, ref: EntityRef): string => v2.refs.entities.strings[ref];
export const regionOf = (v2: V2World, ref: RegionRef): string => v2.refs.regions.strings[ref];
export const typeOf = (v2: V2World, ref: TypeRef): string => v2.refs.types.strings[ref];
export const tickerOf = (v2: V2World, ref: TickerRef): string => v2.refs.tickers.strings[ref];
export const partyKeyOf = (v2: V2World, ref: PartyKeyRef): string => v2.refs.partyKeys.strings[ref];
export const accountKeyOf = (v2: V2World, ref: AccountRef): string => v2.refs.accountKeys.strings[ref];

const REV_CAP = 13;

function ensureRevRow(v2: V2World, row: number): void {
  const R = v2.revRing;
  if (row < R.cap) return;
  const cap = Math.max(row + 1, R.cap * 2);
  const slots = new Float64Array(cap * REV_CAP); slots.set(R.slots);
  const len = new Uint8Array(cap); len.set(R.len);
  const start = new Uint8Array(cap); start.set(R.start);
  v2.revRing = { slots, len, start, cap };
}

// `len` stores ACTUAL+1 with 0 = "never set": the object field distinguished undefined from an
// explicitly-empty history ([] is truthy under `||`), and the seed writes both forms.

/** The exact write `comp.revenueHistory = [...(hist || [v]).slice(-12), v]` made: an absent
 *  history becomes [v, v]; an empty one becomes [v]; a full ring drops its oldest. */
export function revHistPush(v2: V2World, row: number, v: number): void {
  ensureRevRow(v2, row);
  const R = v2.revRing;
  if (R.len[row] === 0) {
    R.slots[row * REV_CAP] = v; R.slots[row * REV_CAP + 1] = v;
    R.len[row] = 3; R.start[row] = 0; // [v, v]
    return;
  }
  const actual = R.len[row] - 1;
  if (actual < REV_CAP) {
    R.slots[row * REV_CAP + ((R.start[row] + actual) % REV_CAP)] = v;
    R.len[row]++;
  } else {
    R.slots[row * REV_CAP + R.start[row]] = v;
    R.start[row] = (R.start[row] + 1) % REV_CAP;
  }
}

/** Seed with exactly one value (the merger spin's `[annualRevenue]`, the seed's insurers). */
export function revHistSeed(v2: V2World, row: number, v: number): void {
  ensureRevRow(v2, row);
  const R = v2.revRing;
  R.slots[row * REV_CAP] = v; R.len[row] = 2; R.start[row] = 0;
}

/** Seed as explicitly EMPTY (the seed's `c.revenueHistory = []` — set, but no entries). */
export function revHistSeedEmpty(v2: V2World, row: number): void {
  ensureRevRow(v2, row);
  v2.revRing.len[row] = 1; v2.revRing.start[row] = 0;
}

export function revHistLen(v2: V2World, row: number): number {
  const raw = row < v2.revRing.cap ? v2.revRing.len[row] : 0;
  return raw === 0 ? 0 : raw - 1;
}

/** i = 0 is the OLDEST entry — array index order, exactly. */
export function revHistAt(v2: V2World, row: number, i: number): number {
  const R = v2.revRing;
  return R.slots[row * REV_CAP + ((R.start[row] + i) % REV_CAP)];
}

/** Fill a REUSED scratch array with the history in array order (no per-call allocation). */
export function revHistFill(v2: V2World, row: number, out: number[]): number[] {
  const n = revHistLen(v2, row);
  out.length = n;
  for (let i = 0; i < n; i++) out[i] = revHistAt(v2, row, i);
  return out;
}

// §4.C II.5 — seed-time revenue histories: creation code runs before any GameState exists, so
// seeds stash here and `drainSeedRevenueHistories` lands them on the ring once the world does.
const seedRevHistStash = new WeakMap<object, number[]>();
export function stashSeedRevenueHistory(comp: object, values: number[]): void {
  seedRevHistStash.set(comp, values);
}
export function drainSeedRevenueHistories(state: V2Host & { companies: { id: string }[] }): number {
  const v2 = ensureV2(state);
  let n = 0;
  for (const c of state.companies) {
    const stash = seedRevHistStash.get(c);
    if (!stash) continue;
    const row = rowOf(v2, c.id);
    if (stash.length === 0) revHistSeedEmpty(v2, row);
    else revHistSeed(v2, row, stash[0]);
    seedRevHistStash.delete(c);
    n++;
  }
  return n;
}

export function makeF64Ring(slotCap: number, rows: number): F64Ring {
  return { slots: new Float64Array(rows * slotCap), len: new Uint8Array(rows), start: new Uint8Array(rows), capRows: rows, slotCap };
}

function ensureRingRow(r: F64Ring, row: number): F64Ring {
  if (row < r.capRows) return r;
  const capRows = Math.max(row + 1, r.capRows * 2);
  const g = makeF64Ring(r.slotCap, capRows);
  g.slots.set(r.slots); g.len.set(r.len); g.start.set(r.start);
  return g;
}

/** The exact `[...arr.slice(-(cap-1)), v]` write: append, dropping the oldest at capacity. */
export function ringPush(r: F64Ring, row: number, v: number): F64Ring {
  r = ensureRingRow(r, row);
  const c = r.slotCap;
  if (r.len[row] < c) { r.slots[row * c + ((r.start[row] + r.len[row]) % c)] = v; r.len[row]++; }
  else { r.slots[row * c + r.start[row]] = v; r.start[row] = (r.start[row] + 1) % c; }
  return r;
}

export const ringLen = (r: F64Ring, row: number): number => (row < r.capRows ? r.len[row] : 0);
/** i = 0 is the OLDEST entry (array index order). */
export const ringAt = (r: F64Ring, row: number, i: number): number =>
  r.slots[row * r.slotCap + ((r.start[row] + i) % r.slotCap)];

export function ringSeed(r: F64Ring, row: number, values: number[]): F64Ring {
  r = ensureRingRow(r, row);
  const c = r.slotCap;
  const n = Math.min(values.length, c);
  for (let i = 0; i < n; i++) r.slots[row * c + i] = values[values.length - n + i];
  r.len[row] = n; r.start[row] = 0;
  return r;
}

export function ringCopyRow(r: F64Ring, from: number, to: number): F64Ring {
  r = ensureRingRow(r, Math.max(from, to));
  const c = r.slotCap;
  for (let i = 0; i < c; i++) r.slots[to * c + i] = r.slots[from * c + i];
  r.len[to] = r.len[from]; r.start[to] = r.start[from];
  return r;
}

/** Fill a REUSED scratch with the ring's entries in array order. */
export function ringFill(r: F64Ring, row: number, out: number[]): number[] {
  const n = ringLen(r, row);
  out.length = n;
  for (let i = 0; i < n; i++) out[i] = ringAt(r, row, i);
  return out;
}

// Credit ratings are a small closed set — interned to codes for the rating ring.
const RATING_CODES: string[] = [];
const RATING_CODE_BY_TEXT = new Map<string, number>();
export function ratingCodeOf(rating: string): number {
  let c = RATING_CODE_BY_TEXT.get(rating);
  if (c === undefined) { c = RATING_CODES.length; RATING_CODES.push(rating); RATING_CODE_BY_TEXT.set(rating, c); }
  return c;
}
export const ratingTextOf = (code: number): string => RATING_CODES[code];

// §4.C II.5 — generalized seed stash: creation code runs before any GameState exists.
const seedRingStash = new WeakMap<object, { price?: number[]; rating?: string[] }>();
export function stashSeedRing(comp: object, kind: 'price' | 'rating', values: number[] | string[]): void {
  const e = seedRingStash.get(comp) ?? {};
  if (kind === 'rating') e.rating = values as string[];
  else e.price = values as number[];
  seedRingStash.set(comp, e);
}
export function peekSeedRing(comp: object, kind: 'price'): number[] | undefined {
  return seedRingStash.get(comp)?.[kind];
}

export function drainSeedRings(state: V2Host & { companies: { id: string }[] }): void {
  const v2 = ensureV2(state);
  for (const c of state.companies) {
    const e = seedRingStash.get(c);
    if (!e) continue;
    const row = rowOf(v2, c.id);
    if (e.price) v2.priceRing = ringSeed(v2.priceRing, row, e.price);
    if (e.rating) v2.ratingRing = ringSeed(v2.ratingRing, row, e.rating.map(ratingCodeOf));
    seedRingStash.delete(c);
  }
}
