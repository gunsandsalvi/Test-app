/**
 * §3.13-BOOK d4c — THE CONTRACT STORE: every bilateral obligation as rows, beside the register.
 *
 * A contract is two named parties, a money, a size, a price it was struck at and the weeks it
 * runs — whatever its class. Six object arrays held them (the derivatives book, the repo book, the
 * stock-loan book, the prime-brokerage book, the trade invoices, a fund's commitments), each
 * cloned, walked and audited on its own. This is the one store they join, one KIND at a time
 * behind the door `engine/ledger/contract-ledger.ts` already is: the derivatives first (d4c-i),
 * the others in their order. Rows are chained per kind in insertion order, which is the order
 * every reader of the object book relied on; a row that leaves is unlinked and its slot reused.
 *
 * The per-class facts a derivative carries — its reference, its term, its units, the mark it has
 * settled to — are columns here; the class's BEHAVIOUR stays in `domain/derivatives/classes/`, and
 * a reader that wants the object the profiles price (`DerivativeContract`) materializes it from
 * the row (`materializeDerivative`), the way a ladder row materializes a `DebtTranche`.
 */
import type { V2World } from './world';
import { internType, typeOf, internRegion, regionOf, internPartyKey, partyKeyOf, CURRENCY_ID, currencyOfId } from './world';
import { ABSENT_REF, newRefColumn, type RefColumn, type TypeRef, type RegionRef, type PartyKeyRef } from './refs';
import type { DerivativeContract, DerivativeReference, DerivativeParty } from '../domain/derivatives/contract';
import { partyFromKey, partyKey } from '../engine/ledger/party';
import { defect } from '../domain/defect';
import type { RegionId } from '../domain/geography';
import { asEntityId } from '../domain/ids';

export interface ObligationStore {
  cap: number;
  used: number;
  freeHead: number;
  /** What kind of obligation the row is: 'DERIVATIVE' (d4c-i); the other five kinds join in order. */
  kindRef: RefColumn<TypeRef>;
  /** The kind's own class — a derivative's `DerivativeClassId`. */
  classRef: RefColumn<TypeRef>;
  regionRef: RefColumn<RegionRef>;
  /** The money the contract settles in, as an index into CURRENCY_CODES. */
  currencyId: Int8Array;
  /** The two parties, as interned party keys (`ledger/party.ts:partyKey`). */
  aRef: RefColumn<PartyKeyRef>;
  bRef: RefColumn<PartyKeyRef>;
  notional: Float64Array;
  strike: Float64Array;
  /** Physical size for the unit-quoted classes; NaN = unset. */
  units: Float64Array;
  /** The mark already settled as variation margin, cumulative to A; NaN = the class never marks. */
  settledMark: Float64Array;
  struckWeek: Int32Array;
  maturityWeek: Int32Array;
  /** The reference, typed by class: 0 RATE, 1 ISSUER, 2 COMMODITY, 3 REGION; and what it names. */
  refKind: Int8Array;
  refText: (string | undefined)[];
  /** The term bucket its market quotes (`'s5'`, `'3M'`, `''`). */
  termKey: string[];
  /** The contract's own id — the string every reader and the UI address it by. */
  id: string[];
  next: Int32Array;
  /** Live chain per kind ref, in insertion order. */
  headByKind: Map<TypeRef, number>;
  tailByKind: Map<TypeRef, number>;
  /** The live row of an id — one per contract; freed with the row. */
  rowById: Map<string, number>;
}

/** THE STORE IS SEALED: outside `src/engine/ledger/` every column is read-only. */
export type ReadonlyObligationStore = {
  readonly [K in keyof ObligationStore]:
    ObligationStore[K] extends RefColumn<infer B> ? RefColumn<B>
    : ObligationStore[K] extends Float64Array ? Readonly<Float64Array>
    : ObligationStore[K] extends Int32Array ? Readonly<Int32Array>
    : ObligationStore[K] extends Int8Array ? Readonly<Int8Array>
    : ObligationStore[K] extends Map<infer MK, infer MV> ? ReadonlyMap<MK, MV>
    : ObligationStore[K] extends (infer T)[] ? readonly T[]
    : ObligationStore[K];
};

/** The contract ledger's own handle. Nothing else may hold one. */
export const mutableObligations = (v2: V2World): ObligationStore => v2.obligations as unknown as ObligationStore;

export function newObligationStore(): ObligationStore {
  const cap = 1 << 12;
  return {
    cap, used: 0, freeHead: -1,
    kindRef: newRefColumn<TypeRef>(cap, -1), classRef: newRefColumn<TypeRef>(cap, -1), regionRef: newRefColumn<RegionRef>(cap, -1),
    currencyId: new Int8Array(cap).fill(-1),
    aRef: newRefColumn<PartyKeyRef>(cap, -1), bRef: newRefColumn<PartyKeyRef>(cap, -1),
    notional: new Float64Array(cap), strike: new Float64Array(cap), units: new Float64Array(cap).fill(Number.NaN), settledMark: new Float64Array(cap).fill(Number.NaN),
    struckWeek: new Int32Array(cap), maturityWeek: new Int32Array(cap),
    refKind: new Int8Array(cap), refText: new Array(cap), termKey: new Array(cap), id: new Array(cap),
    next: new Int32Array(cap).fill(-1),
    headByKind: new Map(), tailByKind: new Map(), rowById: new Map(),
  };
}

function grow(S: ObligationStore): void {
  const cap = S.cap * 2;
  const gF = (old: Float64Array, fill = 0) => { const a = new Float64Array(cap).fill(fill); a.set(old); return a; };
  const gI = (old: Int32Array, fill = 0) => { const a = new Int32Array(cap).fill(fill); a.set(old); return a; };
  const gR = <B extends number>(old: RefColumn<B>): RefColumn<B> => { const a = newRefColumn<B>(cap, -1); a.set(old); return a; };
  S.kindRef = gR(S.kindRef); S.classRef = gR(S.classRef); S.regionRef = gR(S.regionRef);
  const cur = new Int8Array(cap).fill(-1); cur.set(S.currencyId); S.currencyId = cur;
  S.aRef = gR(S.aRef); S.bRef = gR(S.bRef);
  S.notional = gF(S.notional); S.strike = gF(S.strike); S.units = gF(S.units, Number.NaN); S.settledMark = gF(S.settledMark, Number.NaN);
  S.struckWeek = gI(S.struckWeek); S.maturityWeek = gI(S.maturityWeek);
  const rk = new Int8Array(cap); rk.set(S.refKind); S.refKind = rk;
  S.refText.length = cap; S.termKey.length = cap; S.id.length = cap;
  S.next = gI(S.next, -1);
  S.cap = cap;
}

function allocRow(S: ObligationStore): number {
  if (S.freeHead >= 0) { const r = S.freeHead; S.freeHead = S.next[r]; S.next[r] = -1; return r; }
  if (S.used >= S.cap) grow(S);
  return S.used++;
}

function appendToKind(S: ObligationStore, kindRef: TypeRef, r: number): void {
  S.next[r] = -1;
  const tail = S.tailByKind.get(kindRef);
  if (tail === undefined) { S.headByKind.set(kindRef, r); S.tailByKind.set(kindRef, r); }
  else { S.next[tail] = r; S.tailByKind.set(kindRef, r); }
}

/** Every live row of one kind, in insertion order. */
export function rowsOfKind(v2: V2World, kind: string): number[] {
  const S = v2.obligations;
  const kindRef = v2.refs.types.idByString.get(kind);
  const out: number[] = [];
  if (kindRef === undefined) return out;
  for (let r = S.headByKind.get(kindRef as TypeRef) ?? -1; r >= 0; r = S.next[r]) out.push(r);
  return out;
}

/** Relink one kind's chain to exactly `kept` (in order), freeing every other live row of it. */
export function relinkKind(v2: V2World, kind: string, kept: readonly number[]): void {
  const S = mutableObligations(v2);
  const kindRef = internType(v2, kind);
  const keep = new Set(kept);
  for (let r = S.headByKind.get(kindRef) ?? -1; r >= 0; ) {
    const nxt = S.next[r];
    if (!keep.has(r)) freeRow(S, r);
    r = nxt;
  }
  S.headByKind.delete(kindRef); S.tailByKind.delete(kindRef);
  for (const r of kept) appendToKind(S, kindRef, r);
}

function freeRow(S: ObligationStore, r: number): void {
  if (S.rowById.get(S.id[r]) === r) S.rowById.delete(S.id[r]);
  S.kindRef[r] = ABSENT_REF; S.classRef[r] = ABSENT_REF; S.aRef[r] = ABSENT_REF; S.bRef[r] = ABSENT_REF;
  S.notional[r] = 0; S.strike[r] = 0; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = '';
  S.next[r] = S.freeHead; S.freeHead = r;
}

const REF_KINDS = ['RATE', 'ISSUER', 'COMMODITY', 'REGION'] as const;
const refKindIdOf = (r: DerivativeReference): number => REF_KINDS.indexOf(r.kind);
const refTextOf = (r: DerivativeReference): string | undefined =>
  r.kind === 'ISSUER' ? r.issuerId : r.kind === 'COMMODITY' ? r.commodityId : r.kind === 'REGION' ? r.regionId : undefined;
function referenceAt(S: ReadonlyObligationStore, r: number): DerivativeReference {
  const kind = REF_KINDS[S.refKind[r]];
  const text = S.refText[r] ?? '';
  return kind === 'ISSUER' ? { kind, issuerId: asEntityId(text) }
    : kind === 'COMMODITY' ? { kind, commodityId: text }
      : kind === 'REGION' ? { kind, regionId: text as RegionId }
        : { kind: 'RATE' };
}

/** Write one derivative as a row of the store (ledger-internal). Returns the row. */
export function writeDerivativeRow(v2: V2World, c: DerivativeContract): number {
  const S = mutableObligations(v2);
  if (S.rowById.has(c.id)) return defect(`derivative ${c.id} struck twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'DERIVATIVE');
  S.kindRef[r] = kindRef; S.classRef[r] = internType(v2, c.classId); S.regionRef[r] = internRegion(v2, c.regionId);
  S.currencyId[r] = CURRENCY_ID[c.currency];
  S.aRef[r] = internPartyKey(v2, partyKey(c.a)); S.bRef[r] = internPartyKey(v2, partyKey(c.b));
  S.notional[r] = c.notional; S.strike[r] = c.strike; S.units[r] = c.units === undefined ? Number.NaN : c.units;
  S.settledMark[r] = c.settledMarkLocal === undefined ? Number.NaN : c.settledMarkLocal;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  S.refKind[r] = refKindIdOf(c.reference); S.refText[r] = refTextOf(c.reference);
  S.termKey[r] = c.termKey; S.id[r] = c.id;
  S.rowById.set(c.id, r);
  appendToKind(S, kindRef, r);
  return r;
}

/** The settled mark moves as variation margin passes (ledger-internal). */
export function writeSettledMark(v2: V2World, r: number, markLocal: number | undefined): void {
  mutableObligations(v2).settledMark[r] = markLocal === undefined ? Number.NaN : markLocal;
}

/** A novation re-points a row's party (ledger-internal). */
export function writeDerivativeParties(v2: V2World, r: number, a: DerivativeParty, b: DerivativeParty): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(a)); S.bRef[r] = internPartyKey(v2, partyKey(b));
}

/** One row materialized back to the object the class profiles price. */
export function materializeDerivative(v2: V2World, r: number): DerivativeContract {
  const S = v2.obligations;
  const a = partyFromKey(partyKeyOf(v2, S.aRef[r])) as DerivativeParty | undefined;
  const b = partyFromKey(partyKeyOf(v2, S.bRef[r])) as DerivativeParty | undefined;
  if (a === undefined || b === undefined) return defect(`derivative row ${r} (${S.id[r]}) names a party the key table cannot read`);
  const c: DerivativeContract = {
    id: S.id[r], classId: typeOf(v2, S.classRef[r]) as DerivativeContract['classId'], regionId: regionOf(v2, S.regionRef[r]) as RegionId,
    currency: currencyOfId(S.currencyId[r]), a, b, notional: S.notional[r], strike: S.strike[r],
    reference: referenceAt(S, r), termKey: S.termKey[r], struckWeek: S.struckWeek[r], maturityWeek: S.maturityWeek[r],
  };
  if (!Number.isNaN(S.units[r])) c.units = S.units[r];
  if (!Number.isNaN(S.settledMark[r])) c.settledMarkLocal = S.settledMark[r];
  return c;
}

/** The live row of a contract id, or undefined. */
export const derivativeRowOf = (v2: V2World, id: string): number | undefined => v2.obligations.rowById.get(id);
