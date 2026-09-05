/**
 * ENGINE V2 — THE WORLD AS COLUMNS (SCALE campaign; the user's chosen scope, 2026-09-01:
 * FULL FIDELITY — every mechanism keeps existing, only the representation changes; numeric
 * drift from the rewrite is accepted, mechanism removal is not).
 *
 * One contiguous arena of typed arrays. No objects in the weekly path, no string keys, no
 * per-week allocation. Snapshot/restore is a memcpy — the battery-isolation lesson (§7.303)
 * designed in rather than leaned on.
 *
 * This file GROWS table-by-table as stages port (the strangler over columns): a table lands
 * here when its owning stage's columnar port needs it, with the full mechanism's detail —
 * FIFO lots stay lots, contracts stay contracts, the ladder stays a ladder. The unported
 * remainder of the week keeps reading the object world through sync seams until its turn.
 */

import { INDUSTRY_SUBUNITS } from '../domain/industry';

/** Every sub-unit the registry knows, in one fixed order — the goods axis. */
export const SUBUNITS: string[] = Object.values(INDUSTRY_SUBUNITS).flat().map((s) => s.unitId);
export const SUBUNIT_INDEX = new Map(SUBUNITS.map((u, i) => [u, i]));
export const NSUB = SUBUNITS.length;
