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

import { LotStore, newLotStore } from './lots';
import { ContractTable, newContractTable } from './contracts';
import { TrancheStore, newTrancheStore } from './tranches';
import { HoldingStore, newHoldingStore } from './holdings';

export interface V2World {
  /** Company id -> table row. Rows are addressing only — order carries no economics. */
  rowById: Map<string, number>;
  nRows: number;
  /** Interned string table for lot seller keys. */
  internedStrings: string[];
  internedIdByString: Map<string, number>;
  /** IND1/1$-is-1$ — every firm's real input lots, FIFO by acquisition week. */
  lots: LotStore;
  /** IND11 — the bilateral supply-contract book (§7.304's measured scaling monster). */
  contracts: ContractTable;
  /** §7.307/§7.310 — the debt ladder as rows (rows are the authority since §7.313). */
  tranches: TrancheStore;
  /** §7.307 — the institutional register as rows (stage 1: a synced mirror of itemizedHoldings). */
  holdings: HoldingStore;
  /** §4.C II.5 — revenue history as a 13-slot ring per firm row (the object field is DELETED:
   *  the weekly `[...slice(-12), x]` allocated a fresh array per firm per week, and the §7.320
   *  mid-loop-append trap lived in the aliasing; a ring has neither). Plain arrays, not SAB —
   *  batteries deep-clone v2 with structuredClone, and SAB-backed lanes would SHARE memory
   *  across clones (noted §1.24 deviation: clone-safety wins; workers get mirrors, §7.306). */
  revRing: { slots: Float64Array; len: Uint8Array; start: Uint8Array; cap: number };
}

/** The host: any object graph that carries a v2 world (GameState, structurally). */
export interface V2Host { v2?: V2World }

export function ensureV2(state: V2Host): V2World {
  if (state.v2) return state.v2;
  const v2: V2World = {
    rowById: new Map(),
    nRows: 0,
    internedStrings: [],
    internedIdByString: new Map(),
    lots: newLotStore(),
    contracts: newContractTable(),
    tranches: newTrancheStore(),
    holdings: newHoldingStore(),
    revRing: { slots: new Float64Array(13 << 12), len: new Uint8Array(1 << 12), start: new Uint8Array(1 << 12), cap: 1 << 12 },
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

export function internString(v2: V2World, s: string): number {
  let id = v2.internedIdByString.get(s);
  if (id === undefined) {
    id = v2.internedStrings.length;
    v2.internedStrings.push(s);
    v2.internedIdByString.set(s, id);
  }
  return id;
}

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
