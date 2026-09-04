/**
 * §3.13-BOOK slice (a) — THE ID SPACES, AND THE COMPILER KEEPS THEM APART.
 *
 * Four different things in this model are addressed by a string, and until now they were all
 * `string`, so nothing stopped one being used where another belongs:
 *
 *   · an ENTITY — anything that can hold, issue or be paid;
 *   · an INSTRUMENT — anything that can be held;
 *   · a TICKER — a company's display name and its party address, which is NOT its id;
 *   · a REGION — already nominal (`RegionId`), and the proof that this works.
 *
 * Every keying defect the plan has measured is one of those confusions: `register-split.ts`
 * booking a position under a COMPANY's id when no tranche of the kind was live (`O8`, 0.42B on
 * 219 positions); `dealer-desks.ts:clearingKeyOf` handing an auction an ISSUER key for a book that
 * priced TRANCHES, so every desk declared itself flat; fund shares reusing a holder's ENTITY id as
 * an instrument id; `PartyRef` keying companies by ticker and institutions by id.
 *
 * **BRANDS, NOT CLASSES.** The host state is `structuredClone`d every week (world.ts), so an id
 * has to survive a structural clone — which a class does not. A branded string is the same string
 * at runtime and a different type at compile time: zero cost, zero behaviour, and
 * `Map<InstrumentId, X>.get(someTicker)` stops compiling.
 *
 * **BRAND THE KEYS, NOT THE FIELDS.** `Company.ticker` has 744 references and almost all of them
 * are legitimate — a label, a party address. The ones that are DEFECTS are where a ticker keys a
 * store. So the brands go on the store's key type and on the functions that mint or resolve an
 * id, and the noise stays out.
 *
 * **`asEntityId` / `asInstrumentId` ARE THE ADMISSION.** They assert rather than check, because
 * there is nothing to check against until slice (c) and (d) build the registries. Each call is a
 * place the model takes a string's word for what it is; the COUNT of them is the size of what is
 * left, and it only goes down. A cast written inline (`x as InstrumentId`) is not the same thing —
 * it hides from that count, and is a defect at its site.
 */

/** Anything that can hold, issue or be paid: a company, an institution, a fund, a household
 *  sector's book, a government issuer, a bank's desk. */
export type EntityId = string & { readonly __brand: 'EntityId' };

/** Anything that can be held: a debt tranche, a listed equity, a fund share, a contract, a
 *  sub-unit of a good. */
export type InstrumentId = string & { readonly __brand: 'InstrumentId' };

/** A company's display name and its party address in the ledger. NOT a key into any store — that
 *  is what `EntityId` is for, and telling them apart is half of what this file exists to do. */
export type Ticker = string & { readonly __brand: 'Ticker' };

/** Take a string's word for it that it names an entity. Every call is an unproven claim; the
 *  count of them is the work slice (c) has left. */
export const asEntityId = (s: string): EntityId => s as EntityId;

/** Take a string's word for it that it names an instrument — slice (d)'s remaining work. */
export const asInstrumentId = (s: string): InstrumentId => s as InstrumentId;

/** Take a string's word for it that it is a ticker. */
export const asTicker = (s: string): Ticker => s as Ticker;

/**
 * `Object.entries` on a record keyed by an instrument id. TypeScript types an object's keys as
 * `string` whatever the index signature says, so every read of an instrument-keyed plain object
 * would otherwise need its own cast. This is that cast, once — and the reason instrument-keyed
 * PLAIN OBJECTS are a smell: a `Map<InstrumentId, T>` needs none of this. Slice (e) removes the
 * remaining ones (`sovereignBondHoldingsByBond` is the last of them).
 */
/**
 * §3.13-BOOK slice (c2b) — MEMBERSHIP IS THE PROOF. A clearing book holds a set of the entity ids
 * it admitted; a participant string that is IN that set is an entity id, and the set is what says
 * so. Written as a narrowing rather than a cast, this is the one shape that turns a runtime check
 * the code was already doing into the compiler's evidence — which is the difference between a
 * brand that means something and `as EntityId` sprinkled at the call sites.
 */
export const isKnownEntity = (known: ReadonlySet<EntityId>, id: string): id is EntityId =>
  known.has(id as EntityId);

export const instrumentEntries = <T,>(rec: Record<string, T> | undefined): [InstrumentId, T][] =>
  Object.entries(rec ?? {}) as [InstrumentId, T][];
