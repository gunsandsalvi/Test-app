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

export interface V2World {
  /** Company id -> table row. Rows are addressing only — order carries no economics. */
  rowById: Map<string, number>;
  nRows: number;
  /** Interned string table for lot seller keys. */
  internedStrings: string[];
  internedIdByString: Map<string, number>;
  /** IND1/1$-is-1$ — every firm's real input lots, FIFO by acquisition week. */
  lots: LotStore;
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
