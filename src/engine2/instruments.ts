/**
 * §3.13-BOOK (dI) — THE INSTRUMENT INDEX: one row per instrument the world has ISSUED.
 *
 * `refs.instruments.strings` names every id the world has ever interned — including ids that were
 * only ever priced, wired against or looked up, and ids that name nothing (`issuerIdOf` used to
 * hand such an id back AS its own issuer, which is a lie a caller could not detect). The index is
 * the statement of which of those ids are instruments: what KIND each is, WHO issued it and in
 * which MONEY it is denominated. Nothing else: the terms stay in the class store (a tranche's
 * principal and coupon on `v2.tranches`, a company's shares on the company), so the index copies
 * no quantity and cannot drift from the store that owns one.
 *
 * Rows are addressed BY `InstrRef`, the intern table's own numbering, so a row is one typed-array
 * read from any id the world has named; a ref outside the index, or one whose kind is absent, is
 * an id nothing issued. The ledger (`engine/ledger/instrument-ledger.ts`) is the one writer, and a
 * declaration is idempotent: the same instrument may be declared twice only if the two
 * declarations agree, as `stated.ts` already demands of a stated number.
 */
import type { V2World } from './world';
import { instrumentRefOf, entityOf, typeOf, currencyOfId } from './world';
import { ABSENT_REF, newRefColumn, type InstrRef, type EntityRef, type TypeRef, type RefColumn } from './refs';
import type { InstrumentId, EntityId } from '../domain/ids';
import type { CurrencyCode } from '../domain/geography';
import { equityInstrumentId, etfShareId } from '../domain/instrument-keys';
import { marketCapOf } from '../domain/company';

export interface InstrumentIndex {
  /** Rows are indexed by `InstrRef`; `cap` is how many refs the columns cover. */
  cap: number;
  /** The instrument's KIND — the register's type tag. ABSENT_REF = this ref names no issued instrument. */
  kindRef: RefColumn<TypeRef>;
  /** Who issued it. ABSENT_REF = nobody: a book or a pair that is traded but owed by no one. */
  issuerRef: RefColumn<EntityRef>;
  /** The money it is denominated in, as an index into CURRENCY_CODES; -1 = absent. */
  currencyId: Int8Array;
  /** §3.13-BOOK dIV — THE ISSUED AMOUNT, in the instrument's own unit, for the kinds whose count
   *  no class store keeps: a company's shares, a fund's shares. NaN = the class store owns it (a
   *  tranche's face is its row's principal) or nobody has stated it. */
  issuedUnits: Float64Array;
}

/** THE INDEX IS SEALED: outside `src/engine/ledger/` every column is read-only. */
export type ReadonlyInstrumentIndex = {
  readonly [K in keyof InstrumentIndex]:
    InstrumentIndex[K] extends RefColumn<infer B> ? RefColumn<B>
    : InstrumentIndex[K] extends Int8Array ? Readonly<Int8Array>
    : InstrumentIndex[K] extends Float64Array ? Readonly<Float64Array>
    : InstrumentIndex[K];
};

/** The ledger's own handle. Nothing else may hold one. */
export const mutableInstrumentIndex = (v2: V2World): InstrumentIndex => v2.instruments as unknown as InstrumentIndex;

export function newInstrumentIndex(): InstrumentIndex {
  const cap = 1 << 14;
  return {
    cap,
    kindRef: newRefColumn<TypeRef>(cap, -1),
    issuerRef: newRefColumn<EntityRef>(cap, -1),
    currencyId: new Int8Array(cap).fill(-1),
    issuedUnits: new Float64Array(cap).fill(Number.NaN),
  };
}

function ensureCap(I: InstrumentIndex, ref: number): void {
  if (ref < I.cap) return;
  let cap = I.cap;
  while (cap <= ref) cap *= 2;
  const kindRef = newRefColumn<TypeRef>(cap, -1); (kindRef as unknown as Int32Array).set(I.kindRef as unknown as Int32Array);
  const issuerRef = newRefColumn<EntityRef>(cap, -1); (issuerRef as unknown as Int32Array).set(I.issuerRef as unknown as Int32Array);
  const currencyId = new Int8Array(cap).fill(-1); currencyId.set(I.currencyId);
  const issuedUnits = new Float64Array(cap).fill(Number.NaN); issuedUnits.set(I.issuedUnits);
  I.cap = cap; I.kindRef = kindRef; I.issuerRef = issuerRef; I.currencyId = currencyId; I.issuedUnits = issuedUnits;
}

/** The one write. Ledger-internal (`check-hygiene.sh` guards the import). */
export function writeInstrumentRow(v2: V2World, ref: InstrRef, kindRef: TypeRef, issuerRef: EntityRef, currencyId: number): void {
  const I = mutableInstrumentIndex(v2);
  ensureCap(I, ref);
  I.kindRef[ref] = kindRef;
  I.issuerRef[ref] = issuerRef;
  I.currencyId[ref] = currencyId;
}

/** The one write of the issued amount. Ledger-internal (`check-hygiene.sh` guards the import). */
export function writeIssuedUnits(v2: V2World, ref: InstrRef, units: number): void {
  const I = mutableInstrumentIndex(v2);
  ensureCap(I, ref);
  I.issuedUnits[ref] = units;
}

/** Whether this ref is a row of the index — an instrument somebody issued. */
export const instrumentRefRegistered = (v2: V2World, ref: InstrRef): boolean =>
  ref >= 0 && ref < v2.instruments.cap && v2.instruments.kindRef[ref] !== ABSENT_REF;

export function isRegisteredInstrument(v2: V2World, id: InstrumentId): boolean {
  return instrumentRefRegistered(v2, instrumentRefOf(v2, id));
}

/** The instrument's kind tag, or undefined for an id the world never issued. */
export function instrumentKindOf(v2: V2World, id: InstrumentId): string | undefined {
  const ref = instrumentRefOf(v2, id);
  return instrumentRefRegistered(v2, ref) ? typeOf(v2, v2.instruments.kindRef[ref]) : undefined;
}

/** Who issued it — undefined for an unissued id AND for an instrument nobody owes (a pair). */
export function instrumentIssuerOf(v2: V2World, id: InstrumentId): EntityId | undefined {
  const ref = instrumentRefOf(v2, id);
  if (!instrumentRefRegistered(v2, ref)) return undefined;
  const iss = v2.instruments.issuerRef[ref];
  return iss === ABSENT_REF ? undefined : entityOf(v2, iss);
}

/** The money the instrument is denominated in, or undefined for an id the world never issued. */
export function instrumentCurrencyOf(v2: V2World, id: InstrumentId): CurrencyCode | undefined {
  const ref = instrumentRefOf(v2, id);
  if (!instrumentRefRegistered(v2, ref)) return undefined;
  const c = v2.instruments.currencyId[ref];
  return c < 0 ? undefined : currencyOfId(c);
}

/** The issued amount the index states, in the instrument's own unit — undefined where the class
 *  store owns it or nobody has stated it. */
export function instrumentIssuedUnitsOf(v2: V2World, id: InstrumentId): number | undefined {
  const ref = instrumentRefOf(v2, id);
  if (!instrumentRefRegistered(v2, ref)) return undefined;
  const u = v2.instruments.issuedUnits[ref];
  return Number.isNaN(u) ? undefined : u;
}

/** §3.13-BOOK dIV — A COMPANY'S SHARES IN ISSUE: the index's count for its equity; zero for a
 *  company with no share register (a private firm, until it lists) and for one nobody declared. */
export function issuedSharesOf(v2: V2World, companyId: string): number {
  return instrumentIssuedUnitsOf(v2, equityInstrumentId(companyId)) ?? 0;
}

/** A fund's shares in issue — the same read for an ETF's share, keyed by the fund (`etfShareId`). */
export function etfSharesOutstandingOf(v2: V2World, fundId: string): number {
  return instrumentIssuedUnitsOf(v2, etfShareId(fundId)) ?? 0;
}

/** Market cap as a READ: the price the market printed times the shares the index says exist. */
export function marketCapAt(v2: V2World, c: { id: string; stockPrice: number }): number {
  return marketCapOf(c, issuedSharesOf(v2, c.id));
}

/** Every registered instrument, as refs — the enumeration one shared intern table could not give. */
export function registeredInstrumentRefs(v2: V2World): InstrRef[] {
  const out: InstrRef[] = [];
  const I = v2.instruments;
  const n = Math.min(I.cap, v2.refs.instruments.strings.length);
  for (let r = 0; r < n; r++) if (I.kindRef[r] !== ABSENT_REF) out.push(r as InstrRef);
  return out;
}
