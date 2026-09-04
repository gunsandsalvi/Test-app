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

export interface InstrumentIndex {
  /** Rows are indexed by `InstrRef`; `cap` is how many refs the columns cover. */
  cap: number;
  /** The instrument's KIND — the register's type tag. ABSENT_REF = this ref names no issued instrument. */
  kindRef: RefColumn<TypeRef>;
  /** Who issued it. ABSENT_REF = nobody: a book or a pair that is traded but owed by no one. */
  issuerRef: RefColumn<EntityRef>;
  /** The money it is denominated in, as an index into CURRENCY_CODES; -1 = absent. */
  currencyId: Int8Array;
}

/** THE INDEX IS SEALED: outside `src/engine/ledger/` every column is read-only. */
export type ReadonlyInstrumentIndex = {
  readonly [K in keyof InstrumentIndex]:
    InstrumentIndex[K] extends RefColumn<infer B> ? RefColumn<B>
    : InstrumentIndex[K] extends Int8Array ? Readonly<Int8Array>
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
  };
}

function ensureCap(I: InstrumentIndex, ref: number): void {
  if (ref < I.cap) return;
  let cap = I.cap;
  while (cap <= ref) cap *= 2;
  const kindRef = newRefColumn<TypeRef>(cap, -1); (kindRef as unknown as Int32Array).set(I.kindRef as unknown as Int32Array);
  const issuerRef = newRefColumn<EntityRef>(cap, -1); (issuerRef as unknown as Int32Array).set(I.issuerRef as unknown as Int32Array);
  const currencyId = new Int8Array(cap).fill(-1); currencyId.set(I.currencyId);
  I.cap = cap; I.kindRef = kindRef; I.issuerRef = issuerRef; I.currencyId = currencyId;
}

/** The one write. Ledger-internal (`check-hygiene.sh` guards the import). */
export function writeInstrumentRow(v2: V2World, ref: InstrRef, kindRef: TypeRef, issuerRef: EntityRef, currencyId: number): void {
  const I = mutableInstrumentIndex(v2);
  ensureCap(I, ref);
  I.kindRef[ref] = kindRef;
  I.issuerRef[ref] = issuerRef;
  I.currencyId[ref] = currencyId;
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

/** Every registered instrument, as refs — the enumeration one shared intern table could not give. */
export function registeredInstrumentRefs(v2: V2World): InstrRef[] {
  const out: InstrRef[] = [];
  const I = v2.instruments;
  const n = Math.min(I.cap, v2.refs.instruments.strings.length);
  for (let r = 0; r < n; r++) if (I.kindRef[r] !== ABSENT_REF) out.push(r as InstrRef);
  return out;
}
