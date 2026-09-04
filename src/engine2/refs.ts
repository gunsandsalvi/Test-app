/**
 * §3.13-BOOK slice (b) — THE REF SPACES, AND WHY AN INTEGER NEEDS A TYPE.
 *
 * A columnar store cannot hold a string, so every string a row names is an INTEGER into an intern
 * table: `H.instrRef`, `H.typeRef`, `H.regionRef`, `TS.idRef`, `TS.issuerRef`, `A.keyRef`. There
 * is ONE table behind all of them (`world.ts:internString`), so those integers are drawn from one
 * numbering, and the only thing keeping an instrument ref out of a region column is that the two
 * columns have different names.
 *
 * That is not a hypothetical. `H.instrRef[r]`, `H.regionRef[r]` and `H.typeRef[r]` are the same
 * KIND of number today: a comparison across two of them compiles, runs, and answers — wrongly, and
 * without a symptom, because a ref of the wrong space still decodes to a real string.
 *
 * **THESE TYPES ERASE.** A branded number is the same number at runtime, so nothing here can move
 * a value; `structuredClone` on the host state is untouched, and every ref keeps the exact integer
 * it has today. That is deliberate and it is the §5 sequencing lesson: slice (b) is done in two
 * steps, and this is the first — every writer and reader NAMES its space while the numbering is
 * still shared, where nothing can break because the numbers are equal. Only once the compiler has
 * proved every site is in the right space does the second step give each space its own array,
 * which renumbers.
 *
 * **-1 IS THE ABSENT REF** in every space, and stays a plain number literal at each site: a
 * sentinel is not a member of the space it is absent from.
 */

/** A ref naming an INSTRUMENT — a tranche, a listed equity, a fund share, a contract. */
export type InstrRef = number & { readonly __ref: 'Instrument' };

/** A ref naming an ENTITY — anything that can hold, issue or be paid. */
export type EntityRef = number & { readonly __ref: 'Entity' };

/** A ref naming a REGION. */
export type RegionRef = number & { readonly __ref: 'Region' };

/** A ref naming an instrument KIND tag (`'CORP_BOND'`, `'EQUITY'`, …) — a taxonomy member, not
 *  an instance, and the distinction slice (e) collapses the four taxonomies into. */
export type TypeRef = number & { readonly __ref: 'Type' };

/** A ref naming a company by TICKER — its party address, never its id (`domain/ids.ts`). */
export type TickerRef = number & { readonly __ref: 'Ticker' };

/** A ref naming an ACCOUNT — a party and a currency together (`ledger/accounts.ts:accountKey`). */
export type AccountRef = number & { readonly __ref: 'Account' };

/** A ref naming a PARTY KEY — `ledger/party.ts:partyKey`, which is a party's ledger address and
 *  is NOT yet the same string as its entity id. Slice (c) merges the two spaces; until it does,
 *  they are two, and saying so is the point of this file. */
export type PartyKeyRef = number & { readonly __ref: 'PartyKey' };

/**
 * A columnar ref column whose ELEMENTS carry their space.
 *
 * `Int32Array[i]` types as `number`, so a brand on the intern function alone dies at the first
 * read and every comparison downstream is unchecked again. Dropping the numeric index signature
 * and restating it as `B` keeps the brand across the subscript, which is the whole point: with
 * this, `H.typeRef[r] === H.instrRef[r]` does not compile, and neither does writing a bare number
 * into a ref column. Everything else about the array — `length`, `fill`, `set`, `subarray` — is
 * unchanged, and the runtime object IS an `Int32Array`.
 *
 * Construction and growth cast once, at the two places that allocate; nothing else needs to.
 */
export interface RefColumn<B extends number> extends Omit<Int32Array, number> {
  [index: number]: B;
}

/** Allocate a ref column. `fill` is applied before the cast, so a -1-filled column stays -1. */
export const newRefColumn = <B extends number>(cap: number, fill = 0): RefColumn<B> =>
  (fill === 0 ? new Int32Array(cap) : new Int32Array(cap).fill(fill)) as unknown as RefColumn<B>;

/**
 * THE ABSENT REF, in every space at once.
 *
 * `-1` means "this row names nothing here" — a freed tranche row, a facility with no bank, a
 * holding not yet keyed. It is a sentinel and therefore a member of no space, so it is typed as
 * the intersection of all of them: assignable into any ref column, and impossible to confuse with
 * a real ref because no intern function can return it.
 */
export const ABSENT_REF = -1 as InstrRef & EntityRef & RegionRef & TypeRef & TickerRef & AccountRef & PartyKeyRef;
