/**
 * The week's holdings, held once (SCALE — columnar state, milestone C1).
 *
 * Five clearing books used to do the same physical work five times over: sweep every
 * institutional entity's entire `itemizedHoldings` array (all asset classes, all regions) once
 * per region per book — twenty full sweeps of ~70k rows a week — partition it into "mine" and
 * "everything else", rebuild the whole array on apply, and re-map the whole entity list with a
 * fresh object spread per region per book. None of that work is economics; it is the object
 * graph being carried from stage to stage on foot.
 *
 * This store does the sweep ONCE, before the first book. Rows are grouped by instrument type at
 * build time (original order preserved within each group), and each book then walks only its own
 * class's rows, claims the ones its auction prices, and appends the rows its fills produce. The
 * write-back after the last book recomposes each entity's array as
 *
 *     [every row no auction claimed, in original order] ++ [appended rows, in append order]
 *
 * which is provably the exact array the old partition-and-rebuild chain produced: each book
 * removed its matches from wherever they sat (preserving the relative order of the rest) and
 * appended its fills, so the composition over books-in-stage-order collapses to precisely the
 * form above. Same rows, same order, same floating-point accumulation order in every book's
 * extract — the world hashes byte-identical; only the walking is gone.
 *
 * Entities are copied ONCE into working objects at build time (the old chain spread every
 * non-ETF entity twenty times a week); the books mutate cash on the working copy in place, in
 * the same sequence as before, and the write-back pins the recomposed rows on. Between build and
 * finalize the working copies' `itemizedHoldings` still point at the WEEK-START arrays — the
 * books must read positions through this store, never off the entity.
 */

import { InstitutionalEntity, ItemizedHolding } from '../../../types';
import { WeeklyStepContext } from './context';

/** The instrument types the clearing books price — the only groups the store indexes. */
const BOOK_TYPES: ItemizedHolding['instrumentType'][] = [
  'CORP_BOND', 'GOV_BOND', 'LEVERAGED_LOAN', 'EQUITY',
];

interface EntitySlot {
  entity: InstitutionalEntity;
  /** Week-start rows. Never mutated; the write-back builds a new array. */
  rows: ItemizedHolding[];
  /** 0 = unclaimed; otherwise the epoch (region-pass) that claimed the row. */
  claimed: Uint16Array;
  /** Row indices per book-priced instrument type, in original array order. */
  byType: Map<string, number[]>;
  appended: ItemizedHolding[];
}

export class HoldingsStore {
  private slots = new Map<string, EntitySlot>();
  /** The current region-pass. In the old chain an entity's array only changed at each region
   * pass's APPLY, so a read taken mid-pass still sees the rows that pass has already claimed;
   * a new epoch (bumped at the top of every region pass) is what retires the previous pass's
   * claims from view. */
  private epoch = 1;

  constructor(entities: InstitutionalEntity[]) {
    entities.forEach((source) => {
      const entity: InstitutionalEntity = { ...source };
      const rows = entity.itemizedHoldings || [];
      const byType = new Map<string, number[]>();
      rows.forEach((h, i) => {
        if (!BOOK_TYPES.includes(h.instrumentType)) return;
        const list = byType.get(h.instrumentType);
        if (list) list.push(i); else byType.set(h.instrumentType, [i]);
      });
      this.slots.set(entity.id, {
        entity, rows, byType,
        claimed: new Uint16Array(rows.length),
        appended: [],
      });
    });
  }

  /** The working copies, in the entities' original order — installed into ctx at build. */
  workingEntities(): InstitutionalEntity[] {
    return Array.from(this.slots.values(), (s) => s.entity);
  }

  /**
   * Walk the still-unclaimed rows of one type for one entity, in original array order. The
   * visitor's return value decides whether the row is claimed (true = this auction prices it and
   * the write-back must drop it in favour of the auction's own fills).
   */
  scan(
    entityId: string,
    type: ItemizedHolding['instrumentType'],
    visit: (h: ItemizedHolding) => boolean
  ): void {
    const slot = this.slots.get(entityId);
    if (!slot) return;
    const indices = slot.byType.get(type);
    if (!indices) return;
    for (const i of indices) {
      if (slot.claimed[i]) continue;
      if (visit(slot.rows[i])) slot.claimed[i] = this.epoch;
    }
  }

  /** Start a new region pass — the previous pass's claims stop being visible to reads. Every
   * book calls this at the top of each region iteration, mirroring where the old chain's
   * per-region apply used to commit. */
  nextEpoch(): void {
    this.epoch++;
  }

  /**
   * The entity's total holdings value as the old mid-week `itemizedHoldings.reduce` saw it:
   * every row not yet claimed by a COMMITTED pass (current-pass claims still count — the old
   * array did not change until that pass applied), in original order, plus every appended fill
   * row so far, in append order. Same rows, same floating-point accumulation order.
   */
  currentHoldingsUSD(entityId: string): number {
    const slot = this.slots.get(entityId);
    if (!slot) return 0;
    let sum = 0;
    for (let i = 0; i < slot.rows.length; i++) {
      const c = slot.claimed[i];
      if (c === 0 || c === this.epoch) sum += slot.rows[i].quantityOrNotionalUSD ?? 0;
    }
    for (const r of slot.appended) sum += r.quantityOrNotionalUSD ?? 0;
    return sum;
  }

  /** Append this auction's fill rows; they land after every unclaimed row at write-back. */
  append(entityId: string, rows: ItemizedHolding[]): void {
    const slot = this.slots.get(entityId);
    if (!slot || rows.length === 0) return;
    for (const r of rows) slot.appended.push(r);
  }

  /** Recompose every entity's `itemizedHoldings`; the working copies stay in place. */
  finalize(): void {
    this.slots.forEach((slot) => {
      const out: ItemizedHolding[] = [];
      for (let i = 0; i < slot.rows.length; i++) {
        if (!slot.claimed[i]) out.push(slot.rows[i]);
      }
      for (const r of slot.appended) out.push(r);
      slot.entity.itemizedHoldings = out;
    });
  }
}

/** Build the store from this week's entity state and install the working copies. */
export function buildHoldingsStore(ctx: WeeklyStepContext): void {
  const store = new HoldingsStore(ctx.updatedInstitutionalEntities);
  ctx.holdingsStore = store;
  ctx.updatedInstitutionalEntities = store.workingEntities();
}

export function finalizeHoldingsStore(ctx: WeeklyStepContext): void {
  ctx.holdingsStore?.finalize();
  ctx.holdingsStore = undefined;
}
