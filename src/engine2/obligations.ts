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
import { internType, typeOf, internRegion, regionOf, internPartyKey, partyKeyOf, internInstrument, instrumentOf, CURRENCY_ID, currencyOfId } from './world';
import { ABSENT_REF, newRefColumn, type RefColumn, type TypeRef, type RegionRef, type PartyKeyRef, type InstrRef } from './refs';
import type { DerivativeContract, DerivativeReference, DerivativeParty } from '../domain/derivatives/contract';
import type { InterbankLoan } from '../domain/interbank';
import type { RepoContract, RepoPledge, RepoParty } from '../domain/repo';
import type { SecurityLoan } from '../domain/securities-lending';
import type { PrimeBrokerageLine } from '../domain/prime-brokerage';
import type { TradeInvoice } from '../domain/trade-invoice';
import type { LpCommitment } from '../domain/commitment';
import type { CurrencyCode } from '../domain/geography';
import { bankPartyOf } from '../domain/party';
import { currencyOf } from '../domain/geography';
import type { CcpFundContribution } from '../domain/clearing-house';
import { ccpParty } from '../domain/party';
import { partyFromKey, partyKey } from '../engine/ledger/party';
import { defect } from '../domain/defect';
import type { RegionId } from '../domain/geography';
import { asEntityId, asInstrumentId } from '../domain/ids';

interface ObligationStore {
  cap: number;
  used: number;
  freeHead: number;
  /** What kind of obligation the row is: 'DERIVATIVE' (d4c-i), 'REPO' (d4c-ii), 'STOCK_LOAN' (d4c-iii),
   *  'PRIME_BROKERAGE' (d4c-iv), 'TRADE_INVOICE' (d4c-v), 'COMMITMENT' (d4c-vi), 'CCP_FUND' (§3.17-iv-c-i). */
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
  /** The reference, typed by class: 0 RATE, 1 ISSUER, 2 COMMODITY, 3 REGION, 4 SUB_UNIT (the goods a
   *  trade invoice is for); and what it names. */
  refKind: Int8Array;
  refText: (string | undefined)[];
  /** The term bucket its market quotes (`'s5'`, `'3M'`, `''`). */
  termKey: string[];
  /** The contract's own id — the string every reader and the UI address it by. */
  id: string[];
  /** §3.13-BOOK d4c-ii — a repo's pledges: which bond, how much face; undefined for every other kind. */
  pledges: (RepoPledge[] | undefined)[];
  /** §3.13-BOOK d4c-iii — the instrument a stock loan is in; ABSENT_REF for every other kind. */
  instrRef: RefColumn<InstrRef>;
  /** d4c-iii — the lender's whole position in the name at strike (a recall is a fall below it); NaN elsewhere. */
  positionAtStrike: Float64Array;
  /** d4c-iii — the week the lender sold out from under the loan; -1 = not recalled. */
  recalledWeek: Int32Array;
  /** §3.13-BOOK d4c-iv — the share of a prime-brokerage client's collateral the broker will not lend
   *  against this week; NaN for every other kind. */
  haircut: Float64Array;
  /** §3.13-BOOK d4c-v — the region an obligation is paid INTO where it differs from `regionRef`: a
   *  trade invoice's buyer region (its seller's is the row's region); ABSENT_REF for every other kind. */
  toRegionRef: RefColumn<RegionRef>;
  /** §3.13-BOOK d4c-vi — what a capital commitment has DRAWN so far, against `notional` committed;
   *  NaN for every other kind. */
  drawn: Float64Array;
  /** §3.17-i — a derivative's initial margin as POSTED at strike; NaN for every other kind. */
  initialMargin: Float64Array;
  /** Bumped by every write, so a materialized view can tell whether it is current. */
  epoch: number;
  /** d4c-v — the same, per kind: a memo of one kind's rows need not rebuild when another kind moved. */
  kindEpoch: Map<TypeRef, number>;
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
const mutableObligations = (v2: V2World): ObligationStore => v2.obligations as unknown as ObligationStore;

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
    pledges: new Array(cap), epoch: 0,
    instrRef: newRefColumn<InstrRef>(cap, -1), positionAtStrike: new Float64Array(cap).fill(Number.NaN), recalledWeek: new Int32Array(cap).fill(-1),
    haircut: new Float64Array(cap).fill(Number.NaN), toRegionRef: newRefColumn<RegionRef>(cap, -1), drawn: new Float64Array(cap).fill(Number.NaN), kindEpoch: new Map(),
    initialMargin: new Float64Array(cap).fill(Number.NaN),
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
  S.refText.length = cap; S.termKey.length = cap; S.id.length = cap; S.pledges.length = cap;
  S.instrRef = gR(S.instrRef); S.positionAtStrike = gF(S.positionAtStrike, Number.NaN); S.recalledWeek = gI(S.recalledWeek, -1);
  S.haircut = gF(S.haircut, Number.NaN); S.toRegionRef = gR(S.toRegionRef); S.drawn = gF(S.drawn, Number.NaN);
  S.initialMargin = gF(S.initialMargin, Number.NaN);
  S.next = gI(S.next, -1);
  S.cap = cap;
}

function allocRow(S: ObligationStore): number {
  if (S.freeHead >= 0) { const r = S.freeHead; S.freeHead = S.next[r]; S.next[r] = -1; return r; }
  if (S.used >= S.cap) grow(S);
  return S.used++;
}

/** Every write bumps the store's epoch and the written kind's own. */
function bump(S: ObligationStore, kindRef: TypeRef): void {
  S.epoch++;
  S.kindEpoch.set(kindRef, (S.kindEpoch.get(kindRef) ?? 0) + 1);
}

/** One kind's write count — what a memo of that kind's rows keys on. */
export function kindEpochOf(v2: V2World, kind: string): number {
  const kindRef = v2.refs.types.idByString.get(kind);
  return kindRef === undefined ? 0 : (v2.obligations.kindEpoch.get(kindRef as TypeRef) ?? 0);
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
  bump(S, kindRef);
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
  S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = ''; S.pledges[r] = undefined;
  S.instrRef[r] = ABSENT_REF; S.positionAtStrike[r] = Number.NaN; S.recalledWeek[r] = -1;
  S.haircut[r] = Number.NaN; S.toRegionRef[r] = ABSENT_REF; S.drawn[r] = Number.NaN; S.initialMargin[r] = Number.NaN;
  S.next[r] = S.freeHead; S.freeHead = r;
}

const REF_KINDS = ['RATE', 'ISSUER', 'COMMODITY', 'REGION', 'SHARES', 'INDEX', 'BASKET', 'SOVEREIGN'] as const;
const refKindIdOf = (r: DerivativeReference): number => REF_KINDS.indexOf(r.kind);
const refTextOf = (r: DerivativeReference): string | undefined =>
  r.kind === 'ISSUER' || r.kind === 'SHARES' ? r.issuerId : r.kind === 'COMMODITY' ? r.commodityId : r.kind === 'REGION' || r.kind === 'INDEX' ? r.regionId : r.kind === 'BASKET' ? r.seriesId : r.kind === 'SOVEREIGN' ? r.bondId : undefined;
/** §3.17d-i: a basket's region is the contract's own (the row's region), so only the series is text. */
function referenceAt(v2: V2World, S: ReadonlyObligationStore, r: number): DerivativeReference {
  const kind = REF_KINDS[S.refKind[r]];
  const text = S.refText[r] ?? '';
  return kind === 'ISSUER' || kind === 'SHARES' ? { kind, issuerId: asEntityId(text) }
    : kind === 'COMMODITY' ? { kind, commodityId: text }
      : kind === 'REGION' || kind === 'INDEX' ? { kind, regionId: text as RegionId }
        : kind === 'BASKET' ? { kind, regionId: regionOf(v2, S.regionRef[r]) as RegionId, seriesId: text }
          : kind === 'SOVEREIGN' ? { kind, regionId: regionOf(v2, S.regionRef[r]) as RegionId, bondId: asInstrumentId(text) }
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
  S.initialMargin[r] = c.initialMarginLocal;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  S.refKind[r] = refKindIdOf(c.reference); S.refText[r] = refTextOf(c.reference);
  S.termKey[r] = c.termKey; S.id[r] = c.id;
  S.rowById.set(c.id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** The settled mark moves as variation margin passes (ledger-internal). */
export function writeSettledMark(v2: V2World, r: number, markLocal: number | undefined): void {
  const S = mutableObligations(v2);
  S.settledMark[r] = markLocal === undefined ? Number.NaN : markLocal;
  bump(S, S.kindRef[r]);
}

/** §3.17e-iv: a contract's size — notional, units and the margin it carries — after a slice of it
 *  was netted at the house (ledger-internal). */
export function writeDerivativeSize(v2: V2World, r: number, notional: number, units: number | undefined, initialMarginLocal: number): void {
  const S = mutableObligations(v2);
  S.notional[r] = notional; S.units[r] = units === undefined ? Number.NaN : units; S.initialMargin[r] = initialMarginLocal;
  bump(S, S.kindRef[r]);
}

/** §3.17d-i: a contract's settled count of its series' events moves as they settle (ledger-internal). */
export function writeDerivativeUnits(v2: V2World, r: number, units: number | undefined): void {
  const S = mutableObligations(v2);
  S.units[r] = units === undefined ? Number.NaN : units;
  bump(S, S.kindRef[r]);
}

/** A novation re-points a row's party (ledger-internal). */
export function writeDerivativeParties(v2: V2World, r: number, a: DerivativeParty, b: DerivativeParty): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(a)); S.bRef[r] = internPartyKey(v2, partyKey(b));
  bump(S, S.kindRef[r]);
}

// ---- §3.13-BOOK d4c-ii — THE REPO BOOK: lender as A, borrower (a bank) as B, principal as the
// size, the rate as the strike, and the pledges as the row's own list. ----

/** Every live row of one kind in one region, in insertion order. */
export function rowsOfKindInRegion(v2: V2World, kind: string, regionId: string): number[] {
  const regionRef = v2.refs.regions.idByString.get(regionId);
  if (regionRef === undefined) return [];
  return rowsOfKind(v2, kind).filter((r) => v2.obligations.regionRef[r] === regionRef);
}

/** Write a repo contract as a new row (ledger-internal). Returns the row. */
export function writeRepoRow(v2: V2World, c: RepoContract): number {
  const S = mutableObligations(v2);
  if (S.rowById.has(c.id)) return defect(`repo ${c.id} struck twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'REPO');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, c.regionId);
  S.currencyId[r] = CURRENCY_ID[currencyOf(c.regionId)];
  S.aRef[r] = internPartyKey(v2, partyKey(c.lender)); S.bRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.borrowerId)));
  S.notional[r] = c.principalLocal; S.strike[r] = c.rateAnnual; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = c.id;
  S.pledges[r] = c.collateral.map((p) => ({ bondId: p.bondId, faceLocal: p.faceLocal }));
  S.rowById.set(c.id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A live repo row takes the contract's current terms — a call shrank it, a pledge was released,
 *  a novation renamed a party (ledger-internal). */
export function writeRepoTerms(v2: V2World, r: number, c: RepoContract): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(c.lender)); S.bRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.borrowerId)));
  S.notional[r] = c.principalLocal; S.strike[r] = c.rateAnnual;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  S.pledges[r] = c.collateral.map((p) => ({ bondId: p.bondId, faceLocal: p.faceLocal }));
  bump(S, S.kindRef[r]);
}

/** One repo row materialized back to the contract the stages and the domain helpers read. */
export function materializeRepo(v2: V2World, r: number): RepoContract {
  const S = v2.obligations;
  const lender = partyFromKey(partyKeyOf(v2, S.aRef[r])) as RepoParty | undefined;
  const borrower = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (lender === undefined || borrower === undefined || borrower.kind !== 'BANK') return defect(`repo row ${r} (${S.id[r]}) names a party the key table cannot read`);
  return {
    id: S.id[r], regionId: regionOf(v2, S.regionRef[r]) as RegionId, lender, borrowerId: borrower.id,
    principalLocal: S.notional[r], rateAnnual: S.strike[r], struckWeek: S.struckWeek[r], maturityWeek: S.maturityWeek[r],
    collateral: (S.pledges[r] ?? []).map((p) => ({ bondId: p.bondId, faceLocal: p.faceLocal })),
  };
}

// ---- §3.20b — THE INTERBANK BOOK: lender as A, borrower as B (both banks), principal as the
// size, the rate as the strike. Unsecured: no pledges. ----

/** Write an interbank loan as a new row (ledger-internal). Returns the row. */
export function writeInterbankRow(v2: V2World, c: InterbankLoan): number {
  const S = mutableObligations(v2);
  if (S.rowById.has(c.id)) return defect(`interbank loan ${c.id} struck twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'INTERBANK');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, c.regionId);
  S.currencyId[r] = CURRENCY_ID[currencyOf(c.regionId)];
  S.aRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.lenderId))); S.bRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.borrowerId)));
  S.notional[r] = c.principalLocal; S.strike[r] = c.rateAnnual; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = c.id;
  S.pledges[r] = [];
  S.rowById.set(c.id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A live interbank row takes the loan's current terms (ledger-internal). */
export function writeInterbankTerms(v2: V2World, r: number, c: InterbankLoan): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.lenderId))); S.bRef[r] = internPartyKey(v2, partyKey(bankPartyOf(c.borrowerId)));
  S.notional[r] = c.principalLocal; S.strike[r] = c.rateAnnual;
  S.struckWeek[r] = c.struckWeek | 0; S.maturityWeek[r] = c.maturityWeek | 0;
  bump(S, S.kindRef[r]);
}

/** One interbank row materialized back to the loan the stages read. */
export function materializeInterbank(v2: V2World, r: number): InterbankLoan {
  const S = v2.obligations;
  const lender = partyFromKey(partyKeyOf(v2, S.aRef[r]));
  const borrower = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (lender === undefined || borrower === undefined || lender.kind !== 'BANK' || borrower.kind !== 'BANK') return defect(`interbank row ${r} (${S.id[r]}) names a party the key table cannot read`);
  return {
    id: S.id[r], regionId: regionOf(v2, S.regionRef[r]) as RegionId, lenderId: lender.id, borrowerId: borrower.id,
    principalLocal: S.notional[r], rateAnnual: S.strike[r], struckWeek: S.struckWeek[r], maturityWeek: S.maturityWeek[r],
  };
}

// ---- §3.13-BOOK d4c-iii — THE STOCK-LOAN BOOK: lender as A, borrower as B, the collateral as the
// size, the fee as the strike, the shares as the units, the name as the instrument. ----

/** Write a stock loan as a new row (ledger-internal). Returns the row. */
export function writeLoanRow(v2: V2World, l: SecurityLoan): number {
  const S = mutableObligations(v2);
  if (S.rowById.has(l.id)) return defect(`stock loan ${l.id} struck twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'STOCK_LOAN');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, l.regionId);
  S.currencyId[r] = CURRENCY_ID[l.currency];
  S.aRef[r] = internPartyKey(v2, partyKey(l.lender)); S.bRef[r] = internPartyKey(v2, partyKey(l.borrower));
  S.notional[r] = l.collateralLocal; S.strike[r] = l.feeBps; S.units[r] = l.shares; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = l.struckWeek | 0; S.maturityWeek[r] = 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = l.id;
  S.instrRef[r] = internInstrument(v2, l.instrumentId); S.positionAtStrike[r] = l.lenderPositionAtStrike;
  S.recalledWeek[r] = l.recalledWeek === undefined ? -1 : l.recalledWeek | 0;
  S.rowById.set(l.id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A live loan row takes the loan's current terms (ledger-internal). */
export function writeLoanTerms(v2: V2World, r: number, l: SecurityLoan): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(l.lender)); S.bRef[r] = internPartyKey(v2, partyKey(l.borrower));
  S.notional[r] = l.collateralLocal; S.strike[r] = l.feeBps; S.units[r] = l.shares;
  S.positionAtStrike[r] = l.lenderPositionAtStrike; S.recalledWeek[r] = l.recalledWeek === undefined ? -1 : l.recalledWeek | 0;
  bump(S, S.kindRef[r]);
}

/** One loan row materialized back to the loan the stage and the settlement read. */
export function materializeLoan(v2: V2World, r: number): SecurityLoan {
  const S = v2.obligations;
  const lender = partyFromKey(partyKeyOf(v2, S.aRef[r]));
  const borrower = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (lender?.kind !== 'INSTITUTION' || borrower?.kind !== 'INSTITUTION') return defect(`stock loan row ${r} (${S.id[r]}) names a party that is no institution`);
  const l: SecurityLoan = {
    id: S.id[r], regionId: regionOf(v2, S.regionRef[r]) as RegionId, instrumentId: instrumentOf(v2, S.instrRef[r]),
    lender, borrower, shares: S.units[r], feeBps: S.strike[r], currency: currencyOfId(S.currencyId[r]),
    collateralLocal: S.notional[r], lenderPositionAtStrike: S.positionAtStrike[r], struckWeek: S.struckWeek[r],
  };
  if (S.recalledWeek[r] >= 0) l.recalledWeek = S.recalledWeek[r];
  return l;
}

// ---- §3.13-BOOK d4c-iv — THE PRIME-BROKERAGE BOOK: the broker as A, the fund as B, the drawn
// balance as the size, the financing rate as the strike, the haircut as the kind's own column. ----

/** Write a prime-brokerage line as a new row (ledger-internal). Returns the row. */
export function writePrimeBrokerageRow(v2: V2World, l: PrimeBrokerageLine): number {
  const S = mutableObligations(v2);
  if (S.rowById.has(l.id)) return defect(`prime brokerage line ${l.id} struck twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'PRIME_BROKERAGE');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, l.regionId);
  S.currencyId[r] = CURRENCY_ID[currencyOf(l.regionId)];
  S.aRef[r] = internPartyKey(v2, partyKey(bankPartyOf(l.brokerId))); S.bRef[r] = internPartyKey(v2, partyKey({ kind: 'INSTITUTION', id: l.fundId }));
  S.notional[r] = l.drawnLocal; S.strike[r] = l.rateAnnual; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = l.struckWeek | 0; S.maturityWeek[r] = 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = l.id;
  S.instrRef[r] = ABSENT_REF as InstrRef; S.positionAtStrike[r] = Number.NaN; S.recalledWeek[r] = -1;
  S.haircut[r] = l.haircutRate;
  S.rowById.set(l.id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A live line takes its current terms — the balance the sweep moved, the rate a penalty raised,
 *  the broker a resolution renamed (ledger-internal). */
export function writePrimeBrokerageTerms(v2: V2World, r: number, l: PrimeBrokerageLine): void {
  const S = mutableObligations(v2);
  S.aRef[r] = internPartyKey(v2, partyKey(bankPartyOf(l.brokerId))); S.bRef[r] = internPartyKey(v2, partyKey({ kind: 'INSTITUTION', id: l.fundId }));
  S.notional[r] = l.drawnLocal; S.strike[r] = l.rateAnnual; S.struckWeek[r] = l.struckWeek | 0; S.haircut[r] = l.haircutRate;
  bump(S, S.kindRef[r]);
}

/** One line row materialized back to the line the sessions and the sweeps read. */
export function materializePrimeBrokerageLine(v2: V2World, r: number): PrimeBrokerageLine {
  const S = v2.obligations;
  const broker = partyFromKey(partyKeyOf(v2, S.aRef[r]));
  const fund = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (broker?.kind !== 'BANK' || fund?.kind !== 'INSTITUTION') return defect(`prime brokerage row ${r} (${S.id[r]}) names no bank and fund`);
  return {
    id: S.id[r], regionId: regionOf(v2, S.regionRef[r]) as RegionId, brokerId: broker.id, fundId: fund.id,
    drawnLocal: S.notional[r], haircutRate: S.haircut[r], rateAnnual: S.strike[r], struckWeek: S.struckWeek[r],
  };
}

// ---- §3.13-BOOK d4c-v — THE TRADE INVOICES: the seller as A, the buyer as B, the face in the
// invoice currency as the size, the booked rate as the strike, the goods as the reference, the
// buyer's region as the row's second region. An invoice has no id of its own: a reader that hands
// one back names its row (the ledger's tag), never a string. ----

/** Write an invoice as a new row (ledger-internal). Returns the row. */
export function writeInvoiceRow(v2: V2World, inv: TradeInvoice): number {
  const S = mutableObligations(v2);
  const currencyId = CURRENCY_ID[inv.currency as CurrencyCode];
  if (currencyId === undefined) return defect(`trade invoice ${inv.sellerId}>${inv.buyerId} is in ${inv.currency}, which is no currency`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'TRADE_INVOICE');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, inv.sellerRegion);
  S.toRegionRef[r] = internRegion(v2, inv.buyerRegion);
  S.currencyId[r] = currencyId;
  S.aRef[r] = internPartyKey(v2, partyKey({ kind: 'COMPANY', id: inv.sellerId })); S.bRef[r] = internPartyKey(v2, partyKey({ kind: 'COMPANY', id: inv.buyerId }));
  S.notional[r] = inv.amountCurrency; S.strike[r] = inv.bookedUsdPerCurrency; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = inv.weekBooked | 0; S.maturityWeek[r] = inv.weekDue | 0;
  S.refKind[r] = 4; S.refText[r] = inv.subUnitId; S.termKey[r] = ''; S.id[r] = '';
  S.instrRef[r] = ABSENT_REF as InstrRef; S.positionAtStrike[r] = Number.NaN; S.recalledWeek[r] = -1; S.haircut[r] = Number.NaN;
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** One invoice row materialized back to the invoice the settlement and the exposures read. */
export function materializeInvoice(v2: V2World, r: number): TradeInvoice {
  const S = v2.obligations;
  const seller = partyFromKey(partyKeyOf(v2, S.aRef[r]));
  const buyer = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (seller?.kind !== 'COMPANY' || buyer?.kind !== 'COMPANY') return defect(`trade invoice row ${r} names a party that is no firm`);
  return {
    sellerId: seller.id, sellerRegion: regionOf(v2, S.regionRef[r]) as RegionId,
    buyerId: buyer.id, buyerRegion: regionOf(v2, S.toRegionRef[r]) as RegionId,
    subUnitId: S.refText[r] ?? '', currency: currencyOfId(S.currencyId[r]),
    amountCurrency: S.notional[r], bookedUsdPerCurrency: S.strike[r],
    weekBooked: S.struckWeek[r], weekDue: S.maturityWeek[r],
  };
}

// ---- §3.13-BOOK d4c-vi — THE CAPITAL COMMITMENTS: the fund as A, the limited partner as B, the
// commitment as the size, what it has drawn as the kind's own column, in the fund's money. ----

/** The one row a fund and an LP have between them. */
export const commitmentIdOf = (fundId: string, lpId: string): string => `COMMIT:${fundId}:${lpId}`;

/** Write a commitment as a new row (ledger-internal). Returns the row. */
export function writeCommitmentRow(v2: V2World, c: LpCommitment): number {
  const S = mutableObligations(v2);
  const id = commitmentIdOf(c.fundId, c.lpEntityId);
  if (S.rowById.has(id)) return defect(`commitment ${id} written twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'COMMITMENT');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, c.regionId);
  S.currencyId[r] = CURRENCY_ID[currencyOf(c.regionId)];
  S.aRef[r] = internPartyKey(v2, partyKey({ kind: 'INSTITUTION', id: c.fundId })); S.bRef[r] = internPartyKey(v2, partyKey({ kind: 'INSTITUTION', id: c.lpEntityId }));
  S.notional[r] = c.committedLocal; S.strike[r] = 0; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = 0; S.maturityWeek[r] = 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = id;
  S.instrRef[r] = ABSENT_REF as InstrRef; S.positionAtStrike[r] = Number.NaN; S.recalledWeek[r] = -1; S.haircut[r] = Number.NaN;
  S.toRegionRef[r] = ABSENT_REF as RegionRef; S.drawn[r] = c.drawnLocal;
  S.rowById.set(id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A call or a distribution moves what the commitment has drawn (ledger-internal). */
export function writeDrawn(v2: V2World, r: number, drawnLocal: number): void {
  const S = mutableObligations(v2);
  S.drawn[r] = drawnLocal;
  bump(S, S.kindRef[r]);
}

/** One commitment row materialized back to the commitment the lifecycle reads. */
export function materializeCommitment(v2: V2World, r: number): LpCommitment {
  const S = v2.obligations;
  const fund = partyFromKey(partyKeyOf(v2, S.aRef[r]));
  const lp = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (fund?.kind !== 'INSTITUTION' || lp?.kind !== 'INSTITUTION') return defect(`commitment row ${r} (${S.id[r]}) names a party that is no institution`);
  return { fundId: fund.id, lpEntityId: lp.id, regionId: regionOf(v2, S.regionRef[r]) as RegionId, committedLocal: S.notional[r], drawnLocal: S.drawn[r] };
}

// ---- §3.17-iv-c-i — THE DEFAULT FUND: the clearing house as A, the member as B, the member's
// contribution as the size, in the house's money. One row per member per house. ----

/** The one row a house and a member have between them. */
export const ccpFundIdOf = (regionId: string, memberKey: string): string => `CCPFUND:${regionId}:${memberKey}`;

/** Write a contribution as a new row (ledger-internal). Returns the row. */
export function writeCcpFundRow(v2: V2World, c: CcpFundContribution): number {
  const S = mutableObligations(v2);
  const memberKey = partyKey(c.member);
  const id = ccpFundIdOf(c.regionId, memberKey);
  if (S.rowById.has(id)) return defect(`default-fund contribution ${id} written twice`);
  const r = allocRow(S);
  const kindRef = internType(v2, 'CCP_FUND');
  S.kindRef[r] = kindRef; S.classRef[r] = kindRef; S.regionRef[r] = internRegion(v2, c.regionId);
  S.currencyId[r] = CURRENCY_ID[currencyOf(c.regionId)];
  S.aRef[r] = internPartyKey(v2, partyKey(ccpParty(c.regionId))); S.bRef[r] = internPartyKey(v2, memberKey);
  S.notional[r] = c.amountLocal; S.strike[r] = 0; S.units[r] = Number.NaN; S.settledMark[r] = Number.NaN;
  S.struckWeek[r] = 0; S.maturityWeek[r] = 0;
  S.refKind[r] = 0; S.refText[r] = undefined; S.termKey[r] = ''; S.id[r] = id;
  S.instrRef[r] = ABSENT_REF as InstrRef; S.positionAtStrike[r] = Number.NaN; S.recalledWeek[r] = -1; S.haircut[r] = Number.NaN;
  S.toRegionRef[r] = ABSENT_REF as RegionRef; S.drawn[r] = Number.NaN;
  S.rowById.set(id, r);
  appendToKind(S, kindRef, r);
  bump(S, kindRef);
  return r;
}

/** A true-up or a write-down moves what a member has in the fund (ledger-internal). */
export function writeCcpFundAmount(v2: V2World, r: number, amountLocal: number): void {
  const S = mutableObligations(v2);
  S.notional[r] = amountLocal;
  bump(S, S.kindRef[r]);
}

/** One contribution row materialized back to the contribution the house's readers see. */
export function materializeCcpFund(v2: V2World, r: number): CcpFundContribution {
  const S = v2.obligations;
  const member = partyFromKey(partyKeyOf(v2, S.bRef[r]));
  if (member?.kind !== 'COMPANY' && member?.kind !== 'BANK' && member?.kind !== 'INSTITUTION') return defect(`default-fund row ${r} (${S.id[r]}) names a party that is no member`);
  return { regionId: regionOf(v2, S.regionRef[r]) as RegionId, member, amountLocal: S.notional[r] };
}

/** §3.13-BOOK d4c-vi — every live row of every kind, as the two parties and the size: what one
 *  liveness check over the whole store reads. */
export function liveObligationsOf(v2: V2World): { kind: string; id: string; a: string; b: string; notional: number }[] {
  const S = v2.obligations;
  const out: { kind: string; id: string; a: string; b: string; notional: number }[] = [];
  S.headByKind.forEach((head, kindRef) => {
    const kind = typeOf(v2, kindRef);
    for (let r = head; r >= 0; r = S.next[r]) out.push({ kind, id: S.id[r], a: partyKeyOf(v2, S.aRef[r]), b: partyKeyOf(v2, S.bRef[r]), notional: S.notional[r] });
  });
  return out;
}

/** Relink one kind's chain so that, within `regionId`, exactly `kept` (in order) survive; rows of
 *  other regions keep their order and precede them. */
export function relinkKindInRegion(v2: V2World, kind: string, regionId: string, kept: readonly number[]): void {
  const S = mutableObligations(v2);
  const kindRef = internType(v2, kind);
  const regionRef = internRegion(v2, regionId);
  const keep = new Set(kept);
  const others: number[] = [];
  for (let r = S.headByKind.get(kindRef) ?? -1; r >= 0; ) {
    const nxt = S.next[r];
    if (S.regionRef[r] !== regionRef) others.push(r);
    else if (!keep.has(r)) freeRow(S, r);
    r = nxt;
  }
  S.headByKind.delete(kindRef); S.tailByKind.delete(kindRef);
  for (const r of others) appendToKind(S, kindRef, r);
  for (const r of kept) appendToKind(S, kindRef, r);
  bump(S, kindRef);
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
    reference: referenceAt(v2, S, r), termKey: S.termKey[r], struckWeek: S.struckWeek[r], maturityWeek: S.maturityWeek[r],
    initialMarginLocal: Number.isNaN(S.initialMargin[r]) ? 0 : S.initialMargin[r],
  };
  if (!Number.isNaN(S.units[r])) c.units = S.units[r];
  if (!Number.isNaN(S.settledMark[r])) c.settledMarkLocal = S.settledMark[r];
  return c;
}

/** The live row of a contract id, or undefined. */
export const derivativeRowOf = (v2: V2World, id: string): number | undefined => v2.obligations.rowById.get(id);
