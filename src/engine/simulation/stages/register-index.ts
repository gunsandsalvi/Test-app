/**
 * SCALE wave 2, decision 3 — THE REGISTER AS COMPRESSED SPARSE ROWS.
 *
 * The institutional register is a bipartite graph: ~75 holders against ~10,000 instruments,
 * ~110,000 positions, and it is traversed in BOTH directions every week — "what does this holder
 * own" and "who holds this instrument". Held as nested arrays of objects, either direction is a
 * pointer chase over the whole thing: measured, one full sweep costs ~90 ms, or 0.84 µs a row,
 * for what is a map lookup and two field reads.
 *
 * Here it is two flat `Int32Array`s — the holder's position in the entities array, and the row's
 * position in that holder's book — grouped by instrument type by counting sort, with a start
 * offset per type. A consumer that wants one type walks only that type's slice; nothing is
 * allocated per row, and the arrays are the shape a worker could take over a `SharedArrayBuffer`
 * when the rest of wave 2 lands.
 *
 * **The index caches across stages and is INVALIDATED explicitly.** It holds positions, not
 * object references, so a stage that re-maps the entity list (several do, preserving order and
 * length) does not disturb it, and neither does a change to a row's quantity — those are read
 * through. What invalidates it is a change to WHICH ROWS EXIST: the five weekly writers listed in
 * `bumpRegister`'s callers. Adding a sixth without bumping is the failure mode to watch for, and
 * it is why the bump lives next to each write rather than in a scheduler.
 */

import { ItemizedHolding, InstitutionalEntity } from '../../../types';

/** The instrument types, in the order the index groups them. */
export const REGISTER_TYPES: ItemizedHolding['instrumentType'][] = [
  'EQUITY', 'CORP_BOND', 'LEVERAGED_LOAN', 'GOV_BOND', 'COMMERCIAL_PAPER',
  'PE_FUND_INTEREST', 'ETF_SHARE',
];
const TYPE_SLOT = new Map<string, number>(REGISTER_TYPES.map((t, i) => [t, i]));

export interface RegisterIndex {
  /** Position of the holder in the entities array, per row. */
  entAt: Int32Array;
  /** Position of the row inside that holder's own book. */
  rowAt: Int32Array;
  /** `start[t] … start[t + 1]` is type `t`'s slice of the two arrays above. */
  start: Int32Array;
  rows: number;
}

export function buildRegisterIndex(entities: InstitutionalEntity[]): RegisterIndex {
  const nTypes = REGISTER_TYPES.length;
  const counts = new Int32Array(nTypes + 1);
  let rows = 0;
  for (let e = 0; e < entities.length; e++) {
    const book = entities[e].itemizedHoldings;
    if (!book) continue;
    for (let r = 0; r < book.length; r++) {
      const slot = TYPE_SLOT.get(book[r].instrumentType);
      if (slot === undefined) continue;
      counts[slot]++;
      rows++;
    }
  }
  // Prefix sum gives each type its slice; a moving cursor fills it in register order, so within a
  // type the rows keep the order they had — which is what makes every consumer's accumulation
  // order the same as the nested walk it replaces.
  const start = new Int32Array(nTypes + 1);
  for (let t = 0; t < nTypes; t++) start[t + 1] = start[t] + counts[t];
  const cursor = Int32Array.from(start.subarray(0, nTypes));
  const entAt = new Int32Array(rows);
  const rowAt = new Int32Array(rows);
  for (let e = 0; e < entities.length; e++) {
    const book = entities[e].itemizedHoldings;
    if (!book) continue;
    for (let r = 0; r < book.length; r++) {
      const slot = TYPE_SLOT.get(book[r].instrumentType);
      if (slot === undefined) continue;
      const at = cursor[slot]++;
      entAt[at] = e;
      rowAt[at] = r;
    }
  }
  return { entAt, rowAt, start, rows };
}

/** The slice of the index carrying one instrument type. */
export function typeSlice(index: RegisterIndex, type: ItemizedHolding['instrumentType']): [number, number] {
  const slot = TYPE_SLOT.get(type);
  if (slot === undefined) return [0, 0];
  return [index.start[slot], index.start[slot + 1]];
}

/** Drop the cached index. Call beside every write that changes which rows exist. */
export function bumpRegister(ctx: { registerIndex?: RegisterIndex }): void {
  ctx.registerIndex = undefined;
}

/** The index for this moment, built if a writer has invalidated it. */
export function getRegisterIndex(
  ctx: { registerIndex?: RegisterIndex; updatedInstitutionalEntities: InstitutionalEntity[] }
): RegisterIndex {
  if (!ctx.registerIndex) ctx.registerIndex = buildRegisterIndex(ctx.updatedInstitutionalEntities);
  return ctx.registerIndex;
}
