/**
 * The week's holdings, held once.
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
import { bookHeadOf, newBookRow, freeBookRow, setBookChain, relinkBook, markBookDirty } from '../../../engine2/holdings';
import { V2World } from '../../../engine2/world';
import { bumpRegister } from './register-index';
import { WeeklyStepContext } from './context';
import { clearedBookDelta, BookEntry } from '../../ledger/holdings-ledger';
import { mutableHoldings } from '../../../engine2/holdings';
import { RegionId } from '../../../domain/geography';
import { defect } from '../../../domain/defect';

/** The instrument types the clearing books price — the only groups the store indexes. */
const BOOK_TYPES: ItemizedHolding['instrumentType'][] = [
  'CORP_BOND', 'GOV_BOND', 'LEVERAGED_LOAN', 'EQUITY', 'COMMERCIAL_PAPER',
];

interface EntitySlot {
  entity: InstitutionalEntity;
  /** Week-start rows, plus any delivered outside an auction (see `addShares`). */
  rows: ItemizedHolding[];
  /** each row's backing row in the persistent store, parallel to `rows`;
   *  -1 = created mid-window (a real row is allocated for it at the write-back). */
  rowIds: number[];
  /** 0 = unclaimed; otherwise the epoch (region-pass) that claimed the row. */
  claimed: Uint16Array;
  /** Row indices per book-priced instrument type, in original array order. */
  byType: Map<string, number[]>;
  appended: ItemizedHolding[];
}

export class HoldingsStore {
  private slots = new Map<string, EntitySlot>();
  private v2: V2World;
  /** The current region-pass. In the old chain an entity's array only changed at each region
   * pass's APPLY, so a read taken mid-pass still sees the rows that pass has already claimed;
   * a new epoch (bumped at the top of every region pass) is what retires the previous pass's
   * claims from view. */
  private epoch = 1;

  constructor(entities: InstitutionalEntity[], v2: V2World) {
    this.v2 = v2;
    const H = v2.holdings;
    entities.forEach((source) => {
      const entity: InstitutionalEntity = { ...source };
      const rows = entity.itemizedHoldings || [];
      // The objects are last close's materialized view and the chain holds the same book in the
      // same order, so pairing index-for-row is one linear walk — and the pairing is only safe
      // while the two agree. `finalize` KEEPS rowIds[i] for an unclaimed i and FREES it for a
      // claimed one, so a one-row desync keeps and frees the wrong register rows and rewrites
      // ownership in silence. Checked here, where it is still cheap to name.
      const rowIds: number[] = [];
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) rowIds.push(r);
      if (rowIds.length !== rows.length) {
        defect(`${entity.id} has ${rows.length} book objects against ${rowIds.length} register rows`
          + ' — the store pairs them by position and cannot tell which row is which');
      }
      for (let i = 0; i < rows.length; i++) {
        const iRef = v2.internedIdByString.get(rows[i].instrumentId);
        if (iRef !== undefined && H.instrRef[rowIds[i]] !== iRef) {
          defect(`${entity.id}[${i}] pairs ${rows[i].instrumentId} with register row`
            + ` ${v2.internedStrings[H.instrRef[rowIds[i]]]} — the book and the chain have diverged`);
        }
      }
      const byType = new Map<string, number[]>();
      rows.forEach((h, i) => {
        if (!BOOK_TYPES.includes(h.instrumentType)) return;
        const list = byType.get(h.instrumentType);
        if (list) list.push(i); else byType.set(h.instrumentType, [i]);
      });
      this.slots.set(entity.id, {
        entity, rows, rowIds, byType,
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
  currentHoldingsLocal(entityId: string): number {
    const slot = this.slots.get(entityId);
    if (!slot) return 0;
    let sum = 0;
    for (let i = 0; i < slot.rows.length; i++) {
      const c = slot.claimed[i];
      if (c === 0 || c === this.epoch) sum += slot.rows[i].quantityOrNotionalLocal ?? 0;
    }
    for (const r of slot.appended) sum += r.quantityOrNotionalLocal ?? 0;
    return sum;
  }

  /**
   * Move SHARES of one instrument onto an entity's book outside any auction (HF: a stock loan's
   * delivery leg). The books read positions by scanning `rows`, so a transfer has to land there
   * rather than in `appended`, which `scan` never walks: an existing unclaimed row is adjusted in
   * place, and a party with no position yet gets a real row indexed like any other. Pass a
   * negative `shares` for the delivering side.
   */
  addShares(
    entityId: string,
    type: ItemizedHolding['instrumentType'],
    instrumentId: string,
    issuerRegion: ItemizedHolding['issuerRegion'],
    shares: number,
    pricePerShare: number
  ): void {
    const slot = this.slots.get(entityId);
    if (!slot || !(Math.abs(shares) > 0)) return;
    const indices = slot.byType.get(type);
    // ONE definition of what is left over, and it measures FLOAT NOISE, not a quantity. The
    // caller's delivery is itself a sum of row quantities differenced against another sum, and
    // the residue of such a chain scales with the largest magnitude in it — so the scale is the
    // delivery or the biggest row it touches, whichever is larger, at a relative size far above
    // double precision and far below any share count the model trades.
    // The scale is the whole position the walk draws from, because that is the sum the
    // caller's own view of it was accumulated over.
    let positionShares = 0;
    const isDust = (x: number): boolean =>
      Math.abs(x) <= 1e-9 * Math.max(1, Math.abs(shares), positionShares);
    let remaining = shares;
    if (indices) {
      for (const i of indices) {
        if (slot.claimed[i]) continue;
        const row = slot.rows[i];
        if (row.instrumentId !== instrumentId) continue;
        const held = row.quantityShares ?? 0;
        positionShares += Math.abs(held);
        // A position can be split across rows, so a withdrawal draws from each in turn and never
        // takes a row negative; a deposit lands whole on the first one.
        const take = remaining < 0 ? -Math.min(held, -remaining) : remaining;
        const next = held + take;
        row.quantityShares = next;
        row.quantityOrNotionalLocal = next * pricePerShare;
        row.units = next;
        // The persistent row is the authority; the delivery lands on it too.
        const rid = slot.rowIds[i];
        if (rid >= 0) {
          const H = mutableHoldings(this.v2);
          H.shares[rid] = next;
          H.qtyLocal[rid] = next * pricePerShare;
          // A share-counted row's units ARE its shares (`holdings-ledger.ts:unitsOf`).
          H.units[rid] = next;
          markBookDirty(this.v2, entityId);
        }
        remaining -= take;
        if (isDust(remaining)) return;
      }
    }
    if (remaining < 0 && !isDust(remaining)) {
      // The receiving leg is a separate call, so dropping what could not be delivered lands
      // shares on one book that never left the other.
      defect(`${entityId} cannot deliver ${-shares} shares of ${instrumentId}: it holds`
        + ` ${positionShares} unclaimed and is ${-remaining} short — the receiving leg is already written`);
    }
    if (remaining < 0) return;
    shares = remaining;
    const row: ItemizedHolding = {
      instrumentId,
      instrumentType: type,
      issuerRegion,
      quantityShares: shares,
      quantityOrNotionalLocal: shares * pricePerShare, units: shares,
    };
    slot.rows = [...slot.rows, row];
    slot.rowIds.push(-1); // a real row is allocated for it at the write-back
    const grown = new Uint16Array(slot.rows.length);
    grown.set(slot.claimed);
    slot.claimed = grown;
    const list = slot.byType.get(type);
    if (list) list.push(slot.rows.length - 1);
    else slot.byType.set(type, [slot.rows.length - 1]);
  }

  /** Append this auction's fill rows; they land after every unclaimed row at write-back. */
  append(entityId: string, rows: ItemizedHolding[]): void {
    const slot = this.slots.get(entityId);
    if (!slot || rows.length === 0) return;
    for (const r of rows) slot.appended.push(r);
  }

  /**
   * The write-back RELINKS the persistent chains instead of recomposing objects:
   * [every unclaimed row, original order] ++ [appended fills, append order], exactly the
   * composition the recompose produced, but only NEW rows (fills, mid-window deliveries) pay an
   * intern; the standing register is a pointer relink. `entity.itemizedHoldings` is refreshed at
   * the week end by the one materialization pass in core.ts.
   */
  finalize(): void {
    const v2 = this.v2;
    // The week's MARK per share instrument is what this epoch's
    // books wrote on any appended row (shares × the cleared print) — one price for every wire
    // of that instrument, the seller's included, so the house nets in value as it does in shares.
    const markById = new Map<string, number>();
    this.slots.forEach((slot) => {
      for (const h of slot.appended) {
        if (h.quantityShares !== undefined && h.quantityShares > 0 && !markById.has(`${h.instrumentType}|${h.issuerRegion}|${h.instrumentId}`)) {
          markById.set(`${h.instrumentType}|${h.issuerRegion}|${h.instrumentId}`, (h.quantityOrNotionalLocal ?? 0) / h.quantityShares);
        }
      }
    });
    this.slots.forEach((slot) => {
      const untouched = slot.appended.length === 0
        && !slot.rowIds.includes(-1)
        && slot.claimed.every((c) => c === 0);
      if (untouched) return;
      // THE FILLS ARE WIRES. What the auctions claimed off this book against what
      // they appended is the holder's net trade per instrument, wired against the clearing
      // house of the instrument's region — bought or sold, one number each.
      {
        const group = (rows: ItemizedHolding[], pick: (i: number) => boolean) => {
          const byBook = new Map<string, Map<string, BookEntry>>();
          rows.forEach((h, i) => {
            if (!pick(i)) return;
            const key = `${h.instrumentType}|${h.issuerRegion}`;
            let m = byBook.get(key); if (!m) { m = new Map(); byBook.set(key, m); }
            const cur = m.get(h.instrumentId) ?? { valueLocal: 0, shares: undefined, units: 0 };
            cur.valueLocal += h.quantityOrNotionalLocal ?? 0;
            if (h.quantityShares !== undefined) cur.shares = (cur.shares ?? 0) + h.quantityShares;
            // §9.13-CREDIT row 5 — the QUANTITY, which is what the two sides have in common. The
            // rows claimed off the book carry last week's mark and the rows appended are written
            // in par space, so a delta taken on the money is the revaluation plus the trade.
            cur.units = (cur.units ?? 0) + h.units;
            m.set(h.instrumentId, cur);
          });
          return byBook;
        };
        const before = group(slot.rows, (i) => slot.claimed[i] !== 0);
        const after = group(slot.appended, () => true);
        const keys = new Set([...before.keys(), ...after.keys()]);
        keys.forEach((key) => {
          const [type, region] = key.split('|');
          const b = before.get(key) ?? new Map(), a = after.get(key) ?? new Map();
          // A share book's wire is priced at THIS week's mark (the
          // appended row's), never at the value delta — the delta carries the revaluation of the
          // shares the holder kept, which is a mark, not a move (measured: USA EQUITY −66.7B at
          // the house in one week from exactly that).
          const priceOf = (id: string): number | undefined => {
            const mark = markById.get(`${key}|${id}`);
            if (mark !== undefined) return mark;
            const x = a.get(id), y = b.get(id);
            if (x?.shares && x.shares > 0) return x.valueLocal / x.shares;
            if (y?.shares && y.shares > 0) return y.valueLocal / y.shares;
            return undefined;
          };
          clearedBookDelta(
            { kind: 'INSTITUTION', id: slot.entity.id }, region as RegionId, type as ItemizedHolding['instrumentType'],
            b, a, priceOf, `${type.toLowerCase().replace('_', ' ')} clearing fill`
          );
        });
      }
      // Fate of every row is already known, so the chain is rebuilt directly: allocations first
      // (they may reuse earlier frees, never this entity's — its frees come after), then the
      // claimed rows to the free list, then one link pass. No Set anywhere.
      const ids: number[] = [];
      for (let i = 0; i < slot.rows.length; i++) {
        if (slot.claimed[i]) continue;
        ids.push(slot.rowIds[i] >= 0 ? slot.rowIds[i] : newBookRow(v2, slot.rows[i]));
      }
      for (const r of slot.appended) ids.push(newBookRow(v2, r));
      for (let i = 0; i < slot.rows.length; i++) {
        if (slot.claimed[i] && slot.rowIds[i] >= 0) freeBookRow(v2, slot.rowIds[i]);
      }
      setBookChain(v2, slot.entity.id, ids);
    });
  }
}

/** Build the store from this week's entity state and install the working copies. */
export function buildHoldingsStore(ctx: WeeklyStepContext): void {
  const store = new HoldingsStore(ctx.updatedInstitutionalEntities, ctx.v2);
  ctx.holdingsStore = store;
  ctx.updatedInstitutionalEntities = store.workingEntities();
}

export function finalizeHoldingsStore(ctx: WeeklyStepContext): void {
  ctx.holdingsStore?.finalize();
  bumpRegister(ctx);
  ctx.holdingsStore = undefined;
}

/**
 * ONE ROW PER POSITION.
 *
 * A fill appends a row; it does not merge into the position the holder already has. So the
 * register fragments: measured at week 15, **122,164 rows carrying 103,633 distinct
 * `(holder, instrument)` positions — 15% of every row walked is a duplicate of another row**, and
 * the share was still climbing. Twenty-eight sweeps a week walk this register outside the
 * clearing store, so a duplicate row is paid for twenty-eight times.
 *
 * Merging them is LOSSLESS: two rows in the same instrument on the same book are one position,
 * which is what a position is. Dollars and shares add; nothing else in a row distinguishes them.
 * Run at the CLOSE of the week, not at the books' write-back: the late stages — ETF creations,
 * securities lending, primary settlement, the estates — append rows of their own after the books
 * are done, and folding before them left 9,734 duplicates standing at week 15 out of the 18,531
 * there were. Folding at the close means every sweep of the NEXT week walks one row per position.
 */
/** consolidate's persistent dup-scan marks, per world (batteries clone states). */
const CONSOLIDATE_SEEN = new WeakMap<object, { epoch: number; byKey: Map<number, number> }>();

export function consolidateRegister(ctx: WeeklyStepContext): void {
  // Dup-scan and merge on the rows: a (type, instrument) pair is one integer
  // key, the surviving row is the FIRST (the register keeps its order), dollars and shares add
  // in row order — the same accumulation the object merge produced.
  const v2 = ctx.v2;
  const H = v2.holdings;
  const pairKey = (r: number): number => H.typeRef[r] * 0x400000 + H.instrRef[r];
  // The dup-scan's `seen` Set was allocated per BOOK (~3k a week) and hashed every
  // row into it; one persistent epoch-stamped map does the same test with zero allocation
  // an epoch stamp at (type, instrument)-key grain instead — a new epoch per book.
  let seenEpoch = CONSOLIDATE_SEEN.get(v2);
  if (!seenEpoch) { seenEpoch = { epoch: 0, byKey: new Map<number, number>() }; CONSOLIDATE_SEEN.set(v2, seenEpoch); }
  const seenByKey = seenEpoch.byKey;
  ctx.updatedInstitutionalEntities.forEach((entity) => {
    // First pass is a scan, not an allocation: the overwhelming majority of books have nothing
    // to merge in a given week and must not pay for a map they do not need.
    let hasDuplicate = false;
    {
      const epoch = ++seenEpoch!.epoch;
      for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
        const k = pairKey(r);
        if (seenByKey.get(k) === epoch) { hasDuplicate = true; break; }
        seenByKey.set(k, epoch);
      }
    }
    if (!hasDuplicate) return;
    const firstByKey = new Map<number, number>();
    const kept: number[] = [];
    const Hm = mutableHoldings(v2);
    for (let r = bookHeadOf(v2, entity.id); r >= 0; r = H.next[r]) {
      const k = pairKey(r);
      const first = firstByKey.get(k);
      if (first === undefined) { firstByKey.set(k, r); kept.push(r); continue; }
      Hm.qtyLocal[first] = H.qtyLocal[first] + H.qtyLocal[r];
      const sh = H.shares[r];
      if (!Number.isNaN(sh)) {
        const cur = H.shares[first];
        Hm.shares[first] = (Number.isNaN(cur) ? 0 : cur) + sh;
      }
      // §9.13-CREDIT row 5 — and the QUANTITY merges with the value. Two rows of one instrument
      // hold one position; folding only the money left the survivor reporting one row's face
      // against both rows' value.
      const uKeep = Number.isNaN(H.units[first]) ? H.qtyLocal[first] : H.units[first];
      const uDrop = Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r];
      Hm.units[first] = uKeep + uDrop;
    }
    relinkBook(v2, entity.id, kept);
    bumpRegister(ctx);
  });
}
