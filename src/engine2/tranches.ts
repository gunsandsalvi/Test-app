/**
 * ENGINE V2 — THE DEBT LADDER AS PERSISTENT ROWS (the §7.307 tranche authority flip, staged).
 *
 * Stage 1 of the flip (§7.310): the store is a SYNCED MIRROR — `comp.debtTranches` stays
 * authoritative, and every writer that rebuilds or appends to a ladder calls `syncLadderRows`
 * so the rows are always fresh. Readers then move onto rows file by file (each FP-gated), and
 * only when every reader is on rows do the writers convert to row operations and the object
 * arrays die. `TRANCHE_SYNC_CHECK=1` compares the canonical projection of every firm's rows
 * against its object ladder at each week end and throws on the first mismatch — a missed
 * writer is found empirically, not by audit (§7.221).
 *
 * Same plain-data rules as the lot and contract tables (world.ts): typed arrays + one side
 * array of plain objects, `structuredClone`-safe, chains per firm row in ladder order.
 * Optional numerics use NaN sentinels; optional booleans live in the flags byte.
 */

import { DebtTranche } from '../domain/company';
import { V2World, rowOf, internString } from './world';

export const TR_FLOATING = 1;
export const TR_CP = 2;
export const TR_FACILITY = 4;
export const TR_SUBORDINATED = 8;
export const TR_REFI_INITIATED = 16;

export interface TrancheStore {
  cap: number;
  principalUSD: Float64Array;
  couponRate: Float64Array;        // NaN = absent
  floatingMarginBps: Float64Array; // NaN = absent
  paymentsPerYear: Float64Array;   // NaN = absent
  paymentAnchorWeek: Float64Array; // NaN = absent
  originationWeek: Int32Array;
  maturityWeek: Int32Array;
  flags: Uint8Array;
  idRef: Int32Array;               // interned tranche id
  bankRef: Int32Array;             // interned facilityBankTicker; -1 = absent
  /** §5-FINALIZATION step 10: the issuer's company id on the row — a lender's book is one scan. */
  issuerRef: Int32Array;           // -1 = a freed row
  /** §5-WIRES W3: the wire that created the row (-1 for a seeded or born ladder — B's gap). */
  wireRef: Int32Array;
  /** Call protection rides as the plain object it is — one per row, undefined when absent. */
  callProt: (DebtTranche['callProtection'] | undefined)[];
  next: Int32Array;
  freeHead: number;
  used: number;
  /** Per firm row: chain head/tail, -1 = empty (grown as firm rows appear). */
  head: Int32Array;
  tail: Int32Array;
  /** Firms whose ladder has ever been synced — the week-start catch-up uses it to spot births. */
  synced: Set<string>;
}

/**
 * §5-WIRES W3 — THE LADDER IS SEALED. Outside `src/engine/ledger/` the store is a read-only view:
 * a stage writing a tranche column does not compile. `engine/ledger/tranche-ledger.ts` is the one
 * place a row's principal moves, and every move is a numbered wire; the functions below are its
 * implementation (hygiene rule 5 guards the import boundary).
 */
export type ReadonlyTrancheStore = {
  readonly [K in keyof TrancheStore]:
    TrancheStore[K] extends Float64Array ? Readonly<Float64Array>
    : TrancheStore[K] extends Int32Array ? Readonly<Int32Array>
    : TrancheStore[K] extends Uint8Array ? Readonly<Uint8Array>
    : TrancheStore[K] extends Set<string> ? ReadonlySet<string>
    : TrancheStore[K] extends (infer E)[] ? readonly E[]
    : TrancheStore[K];
};
/** The ledger's own handle on the store. Nothing else may hold one. */
export const mutableTranches = (v2: V2World): TrancheStore => v2.tranches as unknown as TrancheStore;

export function newTrancheStore(): TrancheStore {
  const cap = 1 << 13;
  return {
    cap,
    principalUSD: new Float64Array(cap),
    couponRate: new Float64Array(cap),
    floatingMarginBps: new Float64Array(cap),
    paymentsPerYear: new Float64Array(cap),
    paymentAnchorWeek: new Float64Array(cap),
    originationWeek: new Int32Array(cap),
    maturityWeek: new Int32Array(cap),
    flags: new Uint8Array(cap),
    idRef: new Int32Array(cap),
    bankRef: new Int32Array(cap),
    issuerRef: new Int32Array(cap).fill(-1),
    wireRef: new Int32Array(cap).fill(-1),
    callProt: new Array(cap),
    next: new Int32Array(cap).fill(-1),
    freeHead: -1,
    used: 0,
    head: new Int32Array(0),
    tail: new Int32Array(0),
    synced: new Set<string>(),
  };
}

function growTranches(S: TrancheStore): void {
  const cap = S.cap * 2;
  const gF = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old); return a; };
  const gI = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old); return a; };
  S.principalUSD = gF(S.principalUSD); S.couponRate = gF(S.couponRate);
  S.floatingMarginBps = gF(S.floatingMarginBps); S.paymentsPerYear = gF(S.paymentsPerYear);
  S.paymentAnchorWeek = gF(S.paymentAnchorWeek);
  S.originationWeek = gI(S.originationWeek); S.maturityWeek = gI(S.maturityWeek);
  const flags = new Uint8Array(cap); flags.set(S.flags); S.flags = flags;
  S.idRef = gI(S.idRef); S.bankRef = gI(S.bankRef);
  const issuerRef = new Int32Array(cap).fill(-1); issuerRef.set(S.issuerRef); S.issuerRef = issuerRef;
  const wireRef = new Int32Array(cap).fill(-1); wireRef.set(S.wireRef); S.wireRef = wireRef;
  S.callProt.length = cap;
  const next = new Int32Array(cap).fill(-1); next.set(S.next); S.next = next;
  S.cap = cap;
}

/** A freed row carries nothing a scan could mistake for a live tranche. */
function freeRow(S: TrancheStore, r: number): void {
  S.callProt[r] = undefined; S.flags[r] = 0; S.bankRef[r] = -1; S.issuerRef[r] = -1; S.principalUSD[r] = 0;
  S.next[r] = S.freeHead; S.freeHead = r;
}

function allocRow(S: TrancheStore): number {
  if (S.freeHead >= 0) {
    const r = S.freeHead;
    S.freeHead = S.next[r];
    S.next[r] = -1;
    return r;
  }
  if (S.used >= S.cap) growTranches(S);
  return S.used++;
}

function slotFor(S: TrancheStore, firmRow: number): number {
  if (S.head.length <= firmRow) {
    const cap = Math.max(firmRow + 1, S.head.length * 2, 4096);
    const head = new Int32Array(cap).fill(-1); head.set(S.head); S.head = head;
    const tail = new Int32Array(cap).fill(-1); tail.set(S.tail); S.tail = tail;
  }
  return firmRow;
}

function writeRow(S: TrancheStore, r: number, v2: V2World, t: DebtTranche): void {
  S.principalUSD[r] = t.principalUSD;
  S.couponRate[r] = t.couponRate === undefined ? Number.NaN : t.couponRate;
  S.floatingMarginBps[r] = t.floatingMarginBps === undefined ? Number.NaN : t.floatingMarginBps;
  S.paymentsPerYear[r] = t.paymentsPerYear === undefined ? Number.NaN : t.paymentsPerYear;
  S.paymentAnchorWeek[r] = t.paymentAnchorWeek === undefined ? Number.NaN : t.paymentAnchorWeek;
  S.originationWeek[r] = t.originationWeek | 0;
  S.maturityWeek[r] = t.maturityWeek | 0;
  S.flags[r] = (t.rateType === 'FLOATING' ? TR_FLOATING : 0)
    | (t.isCommercialPaper ? TR_CP : 0)
    | (t.isBankFacility ? TR_FACILITY : 0)
    | (t.seniority === 'SUBORDINATED' ? TR_SUBORDINATED : 0)
    | (t._refinanceInitiated ? TR_REFI_INITIATED : 0);
  S.idRef[r] = internString(v2, t.id);
  S.bankRef[r] = t.facilityBankTicker === undefined ? -1 : internString(v2, t.facilityBankTicker);
  S.callProt[r] = t.callProtection;
}

/**
 * Mirror one firm's ladder into rows, replacing whatever the chain held. Called by every
 * writer after it rebuilds or appends to `comp.debtTranches`; O(ladder) with row recycling.
 */
export function syncLadderRows(v2: V2World, companyId: string, ladder: DebtTranche[] | undefined): void {
  const S = mutableTranches(v2);
  S.synced.add(companyId);
  const firmRow = rowOf(v2, companyId);
  const slot = slotFor(S, firmRow);
  // free the old chain
  for (let r = S.head[slot]; r >= 0; ) {
    const nxt = S.next[r];
    freeRow(S, r);
    r = nxt;
  }
  S.head[slot] = -1;
  S.tail[slot] = -1;
  if (!ladder || ladder.length === 0) return;
  let prev = -1;
  for (let i = 0; i < ladder.length; i++) {
    const r = allocRow(S);
    writeRow(S, r, v2, ladder[i]);
    S.issuerRef[r] = internString(v2, companyId);
    S.wireRef[r] = -1;
    S.next[r] = -1;
    if (prev >= 0) S.next[prev] = r; else S.head[slot] = r;
    prev = r;
  }
  S.tail[slot] = prev;
}

/** The canonical projection both representations reduce to for the sync check. */
function canonical(t: DebtTranche): string {
  return [
    t.principalUSD, t.rateType === 'FLOATING' ? 1 : 0,
    t.couponRate ?? 'x', t.floatingMarginBps ?? 'x',
    t.originationWeek, t.maturityWeek,
    t.seniority === 'SUBORDINATED' ? 1 : 0,
    t.isCommercialPaper ? 1 : 0, t.isBankFacility ? 1 : 0,
    t.facilityBankTicker ?? 'x', t.id,
    t.paymentsPerYear ?? 'x', t.paymentAnchorWeek ?? 'x',
    t._refinanceInitiated ? 1 : 0,
    t.callProtection ? JSON.stringify(t.callProtection) : 'x',
  ].join('|');
}

function canonicalRow(S: TrancheStore, v2: V2World, r: number): string {
  const f = S.flags[r];
  return [
    S.principalUSD[r], f & TR_FLOATING ? 1 : 0,
    Number.isNaN(S.couponRate[r]) ? 'x' : S.couponRate[r],
    Number.isNaN(S.floatingMarginBps[r]) ? 'x' : S.floatingMarginBps[r],
    S.originationWeek[r], S.maturityWeek[r],
    f & TR_SUBORDINATED ? 1 : 0,
    f & TR_CP ? 1 : 0, f & TR_FACILITY ? 1 : 0,
    S.bankRef[r] < 0 ? 'x' : v2.internedStrings[S.bankRef[r]], v2.internedStrings[S.idRef[r]],
    Number.isNaN(S.paymentsPerYear[r]) ? 'x' : S.paymentsPerYear[r],
    Number.isNaN(S.paymentAnchorWeek[r]) ? 'x' : S.paymentAnchorWeek[r],
    f & TR_REFI_INITIATED ? 1 : 0,
    S.callProt[r] ? JSON.stringify(S.callProt[r]) : 'x',
  ].join('|');
}

/** TRANCHE_SYNC_CHECK=1 — throw on the first firm whose rows disagree with its object ladder. */
export function assertLaddersInSync(v2: V2World, companies: { id: string; ticker: string; debtTranches?: DebtTranche[] }[]): void {
  const S = mutableTranches(v2);
  for (const comp of companies) {
    const ladder = comp.debtTranches ?? [];
    const firmRow = v2.rowById.get(comp.id);
    const rows: number[] = [];
    if (firmRow !== undefined && firmRow < S.head.length) {
      for (let r = S.head[firmRow]; r >= 0; r = S.next[r]) rows.push(r);
    }
    if (rows.length !== ladder.length) {
      throw new Error(`TRANCHE SYNC: ${comp.ticker} has ${ladder.length} object tranches but ${rows.length} rows — a writer is not syncing`);
    }
    for (let i = 0; i < ladder.length; i++) {
      const a = canonical(ladder[i]);
      const b = canonicalRow(S, v2, rows[i]);
      if (a !== b) {
        throw new Error(`TRANCHE SYNC: ${comp.ticker}[${i}] diverges\n  obj: ${a}\n  row: ${b}`);
      }
    }
  }
}

/** The firm's ladder as row indices, in ladder order; empty when the firm has no rows. */
export function ladderRowsOf(v2: V2World, companyId: string): number[] {
  const S = mutableTranches(v2);
  const firmRow = v2.rowById.get(companyId);
  const rows: number[] = [];
  if (firmRow === undefined || firmRow >= S.head.length) return rows;
  for (let r = S.head[firmRow]; r >= 0; r = S.next[r]) rows.push(r);
  return rows;
}

/** Idempotent catch-up for entry points that can run OUTSIDE the weekly step (UI/harness reads):
 *  mirrors any firm not yet synced. The weekly step's own catch-up makes this a no-op in-week. */
export function ensureLaddersSynced(v2: V2World, companies: { id: string; debtTranches?: DebtTranche[] }[]): void {
  for (const c of companies) {
    if (!v2.tranches.synced.has(c.id)) syncLadderRows(v2, c.id, c.debtTranches);
  }
}

// ---- §7.311 writer-flip API: rows become the authority; these are the only mutators. ----

/** Append one tranche to the firm's ladder (FIFO tail), returning its row. §5-WIRES W3: the row
 *  carries the wire that created it — a ladder row with no wire number does not compile. */
export function pushLadderRow(v2: V2World, companyId: string, t: DebtTranche, wireNo: number): number {
  const S = mutableTranches(v2);
  S.synced.add(companyId);
  const firmRow = rowOf(v2, companyId);
  const slot = slotFor(S, firmRow);
  const r = allocRow(S);
  writeRow(S, r, v2, t);
  S.issuerRef[r] = internString(v2, companyId);
  S.wireRef[r] = wireNo;
  S.next[r] = -1;
  if (S.tail[slot] >= 0) { S.next[S.tail[slot]] = r; S.tail[slot] = r; }
  else { S.head[slot] = r; S.tail[slot] = r; }
  return r;
}

/** Rebuild the firm's chain to exactly `keptRows` (in order), freeing every other current row. */
export function relinkLadder(v2: V2World, companyId: string, keptRows: number[]): void {
  const S = mutableTranches(v2);
  const firmRow = v2.rowById.get(companyId);
  if (firmRow === undefined || firmRow >= S.head.length) return;
  const keep = new Set(keptRows);
  for (let r = S.head[firmRow]; r >= 0; ) {
    const nxt = S.next[r];
    if (!keep.has(r)) freeRow(S, r);
    r = nxt;
  }
  let prev = -1;
  for (const r of keptRows) {
    S.next[r] = -1;
    if (prev >= 0) S.next[prev] = r; else S.head[firmRow] = r;
    prev = r;
  }
  S.head[firmRow] = keptRows.length ? S.head[firmRow] : -1;
  if (keptRows.length === 0) S.head[firmRow] = -1;
  S.tail[firmRow] = prev;
}

/** One row materialized back to the canonical object shape (absent = the NaN/-1 sentinels). */
export function materializeTranche(v2: V2World, r: number): DebtTranche {
  const S = mutableTranches(v2);
  const f = S.flags[r];
  const t: DebtTranche = {
    id: v2.internedStrings[S.idRef[r]],
    principalUSD: S.principalUSD[r],
    rateType: f & TR_FLOATING ? 'FLOATING' : 'FIXED',
    originationWeek: S.originationWeek[r],
    maturityWeek: S.maturityWeek[r],
    seniority: f & TR_SUBORDINATED ? 'SUBORDINATED' : 'SENIOR',
  };
  if (!Number.isNaN(S.couponRate[r])) t.couponRate = S.couponRate[r];
  if (!Number.isNaN(S.floatingMarginBps[r])) t.floatingMarginBps = S.floatingMarginBps[r];
  if (f & TR_CP) t.isCommercialPaper = true;
  if (f & TR_FACILITY) t.isBankFacility = true;
  if (S.bankRef[r] >= 0) t.facilityBankTicker = v2.internedStrings[S.bankRef[r]];
  if (S.callProt[r]) t.callProtection = S.callProt[r];
  if (!Number.isNaN(S.paymentsPerYear[r])) t.paymentsPerYear = S.paymentsPerYear[r];
  if (!Number.isNaN(S.paymentAnchorWeek[r])) t.paymentAnchorWeek = S.paymentAnchorWeek[r];
  if (f & TR_REFI_INITIATED) t._refinanceInitiated = true;
  return t;
}

/** The firm's whole ladder materialized (the week-end view write for dumps and the UI). */
export function materializeLadder(v2: V2World, companyId: string): DebtTranche[] {
  return ladderRowsOf(v2, companyId).map((r) => materializeTranche(v2, r));
}

/** The wire that created a ladder row (-1: seeded or born without one). */
export const trancheWireOf = (v2: V2World, r: number): number => v2.tranches.wireRef[r];

/** §5-FINALIZATION step 10 — A LENDER'S FACILITY BOOK IS A READ OF THE BORROWERS' LADDERS. The
 *  bank used to carry one loan row per facility tranche, synced weekly and drifting between
 *  syncs (O4 lived on that drift). The facility row on the ladder IS the loan, seen from the
 *  lender: one scan of the store, in row order. */
export interface FacilityRow {
  row: number; borrowerId: string; bankTicker: string; trancheId: string; principalUSD: number;
  /** The tranche's floating margin; a facility with none stated rides the 350bp the mirror used. */
  marginBps: number; originationWeek: number; maturityWeek: number;
}
function facilityRowOf(v2: V2World, r: number): FacilityRow {
  const S = v2.tranches;
  return {
    row: r, borrowerId: v2.internedStrings[S.issuerRef[r]], bankTicker: v2.internedStrings[S.bankRef[r]],
    trancheId: v2.internedStrings[S.idRef[r]], principalUSD: S.principalUSD[r],
    marginBps: Number.isNaN(S.floatingMarginBps[r]) ? 350 : S.floatingMarginBps[r],
    originationWeek: S.originationWeek[r], maturityWeek: S.maturityWeek[r],
  };
}
/** Every live facility a bank has lent, across every borrower's ladder. */
export function facilityRowsOf(v2: V2World, bankTicker: string): FacilityRow[] {
  const S = v2.tranches;
  const ref = v2.internedIdByString.get(bankTicker);
  const out: FacilityRow[] = [];
  if (ref === undefined) return out;
  for (let r = 0; r < S.used; r++) {
    if ((S.flags[r] & TR_FACILITY) && S.bankRef[r] === ref && S.issuerRef[r] >= 0 && S.principalUSD[r] > 0.01) out.push(facilityRowOf(v2, r));
  }
  return out;
}
/** The bank's facility book: Σ face of every facility it has lent. */
export function facilityBookOf(v2: V2World, bankTicker: string): number {
  const S = v2.tranches;
  const ref = v2.internedIdByString.get(bankTicker);
  if (ref === undefined) return 0;
  let usd = 0;
  for (let r = 0; r < S.used; r++) if ((S.flags[r] & TR_FACILITY) && S.bankRef[r] === ref && S.issuerRef[r] >= 0) usd += S.principalUSD[r];
  return usd;
}
/** The facilities on one borrower's ladder — the same rows seen from the borrower. */
export function facilitiesOfBorrower(v2: V2World, companyId: string): FacilityRow[] {
  const S = v2.tranches;
  return ladderRowsOf(v2, companyId).filter((r) => (S.flags[r] & TR_FACILITY) && S.bankRef[r] >= 0 && S.principalUSD[r] > 0.01).map((r) => facilityRowOf(v2, r));
}

/** §5-WIRES D: the ladder's face on the live rows — total debt as a read. */
export function ladderTotalUSD(v2: V2World, companyId: string): number {
  const S = v2.tranches;
  let total = 0;
  for (const r of ladderRowsOf(v2, companyId)) total += S.principalUSD[r];
  return total;
}
