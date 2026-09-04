/**
 * §3.13-READ B2 — WHAT INVALIDATES THE REGISTER'S COLUMN TABLE, and nothing else.
 *
 * This file used to hold `RegisterIndex` as well: a second compressed-sparse-row grouping of the
 * institutional register, built from the `itemizedHoldings` object arrays, carrying (holder,
 * row-in-holder) pairs grouped by instrument type. `HoldingsTable.buildFromRows` produces the
 * same grouping from the persistent row mirror without touching an object, and no reader outside
 * this file ever took the index — `buildRegisterIndex`, `typeSlice`, `REGISTER_TYPES` and the
 * `ctx.registerIndex` slot had no consumers at all. They are deleted; §2's "register-index.ts is
 * live" was true of `bumpRegister` only, and is corrected with them.
 *
 * **The table caches across stages and is INVALIDATED explicitly.** It holds positions, not object
 * references, so a stage that re-maps the entity list (several do, preserving order and length)
 * does not disturb it, and neither does a change to a row's quantity — those are read through.
 * What invalidates it is a change to WHICH ROWS EXIST: the weekly writers listed in
 * `bumpRegister`'s callers. Adding one without bumping is the failure mode to watch for, and it is
 * why the bump lives next to each write rather than in a scheduler.
 */

import { InstitutionalEntity } from '../../../types';
import { HoldingsTable } from '../../columns/holdings-table';

/**
 * The register as columns, cached on the week's context and rebuilt from the row mirror. The
 * object-graph builder is gone (B1): `ctx.v2` is a required field, so it was never reached.
 */
export function getHoldingsTable(
  ctx: {
    holdingsTable?: HoldingsTable;
    updatedInstitutionalEntities: InstitutionalEntity[];
    v2: import('../../../engine2/world').V2World;
  }
): HoldingsTable {
  if (!ctx.holdingsTable) {
    const t = new HoldingsTable();
    t.buildFromRows(ctx.v2, ctx.updatedInstitutionalEntities);
    ctx.holdingsTable = t;
  }
  return ctx.holdingsTable;
}

/** Drop the cached column table. Call beside every write that changes which rows exist. */
export function bumpRegister(ctx: { holdingsTable?: HoldingsTable }): void {
  ctx.holdingsTable = undefined;
}
