/**
 * DRV — A DERIVATIVE IS A CONTRACT. One shape for every bilateral derivative in the model.
 *
 * What was here before: four contract structs (SwapContract, CdsContract, FuturesPosition,
 * FxForward), three party unions re-encoding the ledger's `PartyRef`, four books in four places
 * (reg.swapBook, reg.cdsBook, state.commodityFuturesBook, entity/company.fxForwards), and a
 * lifecycle written four times — which is how the futures book shipped a variation-margin leg
 * that never paid and how a merger re-key missed one book of the four.
 *
 * Now: one contract, one book (`GameState.derivativesBook`), one lifecycle
 * (stages/derivative-lifecycle.ts). Everything class-specific is BEHAVIOR and lives in a
 * `DerivativeClassProfile` under `classes/` behind the registry (rule 15): adding a derivative
 * class is one profile module and one registry line, never a new struct, book, or settle loop.
 */

import { RegionId, CurrencyCode } from '../geography';
import { bankPartyOf, companyPartyOf } from '../party';
import type { CounterpartyRef } from '../party';
import type { EntityId } from '../ids';
import { defect } from '../defect';

/**
 * The subset of the ledger's parties that can stand on a bilateral derivative. The arms are
 * structurally the ledger's own `PartyRef` arms of the same kind, so a party passes to `pay()`
 * directly — one encoding of who owes whom (§1.4).
 */
/**
 * §3.13-BOOK (c-then-3a) — A VIEW OF THE ONE UNION, not a copy of three of its arms. It was
 * declared here verbatim, and `estate.ts:ClaimHolder` declared the SAME three under another name,
 * so the model carried two identical types and a third overlapping one (`repo.ts:RepoParty`) with
 * nothing keeping any of them in step with `PartyRef`.
 */
export type DerivativeParty = CounterpartyRef;

/** §3.13-BOOK d4a: ONE KEY FORMAT. This is the ledger's own `partyKey` (`engine/ledger/party.ts`)
 *  for the three arms a contract can carry — `KIND:entityId` — spelled here because the domain
 *  cannot import the ledger's intern table; `test/derivatives.test.ts` holds the two equal. */
export function derivativePartyKey(p: DerivativeParty): string {
  return `${p.kind}:${p.id}`;
}

/**
 * §3.13-READ D10 — THE KEY, BY KIND, and never by hand.
 *
 * Ten sites built this string with a template literal — `` `BANK:${ticker}` ``,
 * `` `COMPANY:${ticker}` ``, `` `INSTITUTION:${entity.id}` `` — rather than calling
 * `derivativePartyKey`. Every one of them was asking the standing book how much cover a party
 * ALREADY has, and the standing book answers a key it does not recognise with **zero**, not an
 * error. So a single character wrong in any of the ten reads as "this party has hedged nothing"
 * and the party hedges again on top of what it already has, silently and every week. A format
 * whose failure mode is a plausible number is a format that needs a constructor.
 */
export const bankPartyKey = (bankId: EntityId): string => derivativePartyKey(bankPartyOf(bankId));
export const companyPartyKey = (companyId: EntityId): string => derivativePartyKey(companyPartyOf(companyId));
export const institutionPartyKey = (id: EntityId): string => derivativePartyKey({ kind: 'INSTITUTION', id });

/** The classes the registry knows. A new derivative adds a member here and a profile module. */
export type DerivativeClassId = 'IRS' | 'CDS' | 'COMMODITY_FUTURE' | 'FX_FORWARD' | 'OPTION' | 'XCS';

/**
 * §3.13-BOOK dIIb — WHAT A CONTRACT IS ON, typed by class. This was `referenceId: string`, four
 * id spaces in one field discriminated by `classId` alone — an issuer's entity id, a commodity
 * id, a REGION, the empty string — so every reader took a `string` and was right only on the
 * path its writer meant. Each class now states its own reference, and a reader that wants the
 * issuer asks for the issuer arm and defects on any other.
 */
export type DerivativeReference =
  /** A single-name CDS: the reference entity whose default the contract pays on. */
  | { kind: 'ISSUER'; issuerId: EntityId }
  /** A commodity future: the good it settles against. */
  | { kind: 'COMMODITY'; commodityId: string }
  /** An FX forward: the FOREIGN region — the currency the holder is short. */
  | { kind: 'REGION'; regionId: RegionId }
  /** A swap: the underlying is a rate, which is the class's own, and no thing. */
  | { kind: 'RATE' }
  /** §3.17b-i — an equity option: the issuer whose SHARES it is on (`SHARES`, not the asset kind `EQUITY`:
   *  a reference names what the contract is ON, and the hygiene ratchet on instrument-kind literals must stay clean) (its `stockPrice` is the
   *  underlying's print; `termKey` says CALL or PUT, `strike` is the strike per share, `units`
   *  the shares). */
  | { kind: 'SHARES'; issuerId: EntityId }
  /** §3.17b-iii — an index option: the region whose composite equity index it is on. */
  | { kind: 'INDEX'; regionId: RegionId };

/** The standing book keys cover by reference; this is that key — the string the field used to
 *  hold, so a cover lookup by `issuer.id`, `comm.id` or a region still finds its contracts. */
export const referenceKeyOf = (r: DerivativeReference): string =>
  r.kind === 'ISSUER' || r.kind === 'SHARES' ? r.issuerId : r.kind === 'COMMODITY' ? r.commodityId : r.kind === 'REGION' || r.kind === 'INDEX' ? r.regionId : '';

export const issuerReferenceOf = (c: { classId: DerivativeClassId; reference: DerivativeReference }): EntityId =>
  c.reference.kind === 'ISSUER' ? c.reference.issuerId : defect(`${c.classId} contract read as if it named an issuer`);
export const commodityReferenceOf = (c: { classId: DerivativeClassId; reference: DerivativeReference }): string =>
  c.reference.kind === 'COMMODITY' ? c.reference.commodityId : defect(`${c.classId} contract read as if it named a commodity`);
export const regionReferenceOf = (c: { classId: DerivativeClassId; reference: DerivativeReference }): RegionId =>
  c.reference.kind === 'REGION' ? c.reference.regionId : defect(`${c.classId} contract read as if it named a region`);
export const sharesReferenceOf = (c: { classId: DerivativeClassId; reference: DerivativeReference }): EntityId =>
  c.reference.kind === 'SHARES' ? c.reference.issuerId : defect(`${c.classId} contract read as if it named an issuer's shares`);
export const indexReferenceOf = (c: { classId: DerivativeClassId; reference: DerivativeReference }): RegionId =>
  c.reference.kind === 'INDEX' ? c.reference.regionId : defect(`${c.classId} contract read as if it named an index`);
/** §3.17b-i — the option's kind, as its `termKey` carries it. */
export type OptionType = 'CALL' | 'PUT';
export const optionTypeOf = (c: { classId: DerivativeClassId; termKey: string }): OptionType =>
  c.termKey === 'CALL' || c.termKey === 'PUT' ? c.termKey : defect(`${c.classId} contract '${c.termKey}' is neither a call nor a put`);

export interface DerivativeContract {
  id: string;
  classId: DerivativeClassId;
  /** The region whose market this contract cleared in (the holder's home region for FX). */
  regionId: RegionId;
  /**
   * §3.13c — THE MONEY THIS CONTRACT SETTLES IN, stated at strike. Every payment it generates used
   * to re-derive this as `currencyOf(c.regionId)`, and `regionId` is a proxy that means something
   * different in each market: the clearing market for IRS and CDS, the HOLDER's region for an FX
   * forward, and a hard-coded `'USA'` for a commodity future — where the region field was standing
   * in for the fact that commodities are quoted in the numéraire. An obligation says what it is
   * denominated in, the way `TradeInvoice` already does.
   */
  currency: CurrencyCode;
  /** Role A, named by the class profile: pay-fixed / protection buyer / long / hedger. */
  a: DerivativeParty;
  /** Role B, named by the class profile: receive-fixed / protection seller / short / dealer. */
  b: DerivativeParty;
  /** §3.13c: no `USD` suffix — `currency` above says what money this is in (rule 8). */
  notional: number;
  /**
   * What the contract was struck at, in the class's own stat — the same number its market
   * clears: annual decimal rate (IRS), spread bps (CDS), price per unit (futures), home-per-
   * foreign rate (FX). The profile is the only reader, so the unit cannot silently mix (§1.8).
   */
  strike: number;
  /** What the contract is ON — §3.13-BOOK dIIb: typed by class (`DerivativeReference`). */
  reference: DerivativeReference;
  /** The tenor bucket its market quotes: 's2'|'s5'|'s10' (IRS), '1M'|'3M'|'6M' (futures). */
  termKey: string;
  /** Physical size, for classes quoted per unit (futures). USD-sized classes leave it unset. */
  units?: number;
  /**
   * Mark-to-market already SETTLED as variation margin, cumulative USD to A (§7.241: each week
   * pays the CHANGE in the mark, never the whole mark). §3.17-iii: every class marks, so every
   * contract carries it from strike (0); absent only on a row nothing has marked.
   */
  settledMarkLocal?: number;
  /**
   * §3.17-i — THE INITIAL MARGIN POSTED, a fact of the contract like its strike: sized at strike
   * (`registry.ts:initialMarginAtStrike`), paid by A to the clearing house of the contract's money
   * (§3.17-iv-a, `derivative-lifecycle.ts:postInitialMargin`), whose cash it is for the contract's
   * life, and returned when the contract ends. It used to be re-derived from the class's stated rate on every read, so a
   * margin could not be anything but that rate — and 17-ii sizes it from the reference's own move.
   */
  initialMarginLocal: number;
  struckWeek: number;
  maturityWeek: number;
}

/**
 * §7.241 WRITTEN ONCE — the standing cover a hedger already has, so no book ever again re-hedges
 * an exposure its live contracts already carry. Keys: the party's side, and optionally what the
 * cover is on and at which tenor.
 */
export function standingCoverLocal(
  book: DerivativeContract[],
  classId: DerivativeClassId,
  side: 'a' | 'b',
  partyKey: string,
  week: number,
  referenceId?: string,
  termKey?: string
): number {
  let usd = 0;
  for (const c of book) {
    if (c.classId !== classId || c.maturityWeek <= week) continue;
    if (referenceId !== undefined && referenceKeyOf(c.reference) !== referenceId) continue;
    if (termKey !== undefined && c.termKey !== termKey) continue;
    if (derivativePartyKey(side === 'a' ? c.a : c.b) === partyKey) usd += c.notional;
  }
  return usd;
}

/** As standingCoverLocal, in physical units — the unit-quoted classes net in their own quantity. */
export function standingCoverUnits(
  book: DerivativeContract[],
  classId: DerivativeClassId,
  side: 'a' | 'b',
  partyKey: string,
  week: number,
  referenceId: string,
  termKey: string
): number {
  let units = 0;
  for (const c of book) {
    if (c.classId !== classId || c.maturityWeek <= week) continue;
    if (referenceKeyOf(c.reference) !== referenceId || c.termKey !== termKey) continue;
    if (derivativePartyKey(side === 'a' ? c.a : c.b) === partyKey) units += c.units ?? 0;
  }
  return units;
}
