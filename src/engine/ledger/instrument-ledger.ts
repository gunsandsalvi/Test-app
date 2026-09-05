/**
 * §3.13-BOOK (dI) — THE INSTRUMENT INDEX'S ONE WRITER.
 *
 * An instrument is DECLARED when it is issued: by the tranche ledger when a ladder rung is issued,
 * by the seed and the birth passes for a company's equity, by the seed for a fund's shares. The
 * declaration is idempotent — the same instrument declared twice must say the same kind, issuer
 * and money, and a second declaration that disagrees is a defect at the site, not a quiet
 * overwrite (the rule `stated.ts` already holds a stated number to).
 */
import type { V2World } from '../../engine2/world';
import { internInstrument, internType, internEntity, instrumentRefOf, CURRENCY_ID } from '../../engine2/world';
import { writeInstrumentRow, writeIssuedUnits, instrumentRefRegistered, instrumentKindOf, instrumentIssuerOf, instrumentCurrencyOf } from '../../engine2/instruments';
import { ABSENT_REF, type InstrRef } from '../../engine2/refs';
import type { InstrumentId, EntityId } from '../../domain/ids';
import { currencyOf, type CurrencyCode, type RegionId } from '../../domain/geography';
import { equityInstrumentId, etfShareId } from '../../domain/instrument-keys';
import { defect } from '../../domain/defect';
import type { InstrumentKind } from '../../domain/assets';
import type { InstitutionalEntityType } from '../../domain/institutions';

/**
 * What the index can hold. The register's kinds are the wire's instrument kinds plus the
 * private-equity interest (a wire kind of its own once a fund interest moves by wire); the BOOK
 * kinds (§3.13-BOOK dII) are the instruments the adapters mint an id for and clear — a swap
 * tenor, a single-name CDS, a spot pair, a cross-currency basis book, a futures contract, a repo
 * book, a stock-borrow book — which nobody issues and nobody holds on the register, and which the
 * index therefore holds with NO issuer. Money, goods and houses have their own ledgers; a bilateral
 * contract is slice (d4)'s.
 */
// §3.13-BOOK (e): the vocabulary is the asset registry's (`domain/assets/index.ts:InstrumentKind`).
export type { InstrumentKind };

interface InstrumentDeclaration {
  id: InstrumentId;
  kind: InstrumentKind;
  /** Undefined for an instrument nobody owes — a traded pair, a book. */
  issuer?: EntityId;
  currency: CurrencyCode;
  /** §3.13-BOOK dIV: the amount in issue, for the kinds whose count no class store keeps. */
  issuedUnits?: number;
}

/** Declare an instrument. Returns its ref; a disagreeing second declaration defects. */
export function registerInstrument(v2: V2World, d: InstrumentDeclaration): InstrRef {
  const ref = internInstrument(v2, d.id);
  if (instrumentRefRegistered(v2, ref)) {
    const kind = instrumentKindOf(v2, d.id), issuer = instrumentIssuerOf(v2, d.id), currency = instrumentCurrencyOf(v2, d.id);
    if (kind !== d.kind || issuer !== d.issuer || currency !== d.currency) {
      return defect(`instrument ${d.id} declared twice and the declarations disagree: ${kind}/${issuer}/${currency} then ${d.kind}/${d.issuer}/${d.currency}`);
    }
    if (d.issuedUnits !== undefined) setIssuedUnits(v2, d.id, d.issuedUnits);
    return ref;
  }
  writeInstrumentRow(v2, ref, internType(v2, d.kind), d.issuer === undefined ? ABSENT_REF : internEntity(v2, d.issuer), CURRENCY_ID[d.currency]);
  if (d.issuedUnits !== undefined) setIssuedUnits(v2, d.id, d.issuedUnits);
  return ref;
}

/**
 * §3.13-BOOK dIV — THE ISSUED AMOUNT MOVES HERE, and only here: a listing creates it, a buyback,
 * a stock-paid merger, a spin-off and a take-private change it, a fund's creations and
 * redemptions change a fund's. It was `Company.sharesOutstanding` and `EtfFund.sharesOutstanding`,
 * written by six stages and read as a field; the index is the one owner and every reader is
 * `issuedSharesOf` / `etfSharesOutstandingOf`.
 */
export function setIssuedUnits(v2: V2World, id: InstrumentId, units: number): void {
  const ref = instrumentRefOf(v2, id);
  if (!instrumentRefRegistered(v2, ref)) return defect(`issued amount stated for ${id}, which the instrument index does not hold`);
  if (!Number.isFinite(units) || units < 0) return defect(`issued amount of ${id} stated as ${units}`);
  writeIssuedUnits(v2, ref, units);
}

/** THE SEED'S SHARE COUNT rides a stash from the generator to the declaration at
 *  `openSeededBooks`, like the seed's ladders and books; it is never a field. A private firm's
 *  is zero — its founders hold shares, but there is no register until it lists. */
const seedIssuedSharesStash = new WeakMap<object, number>();
export function stashSeedIssuedShares(comp: object, shares: number): void { seedIssuedSharesStash.set(comp, shares); }
export function seedIssuedSharesOf(comp: object): number { return seedIssuedSharesStash.get(comp) ?? 0; }

/** A company's equity, declared where the company comes into being — the seed and every birth —
 *  with its shares in issue: the caller's count where it has one (a spin-off), else the seed's
 *  stash, else none (a birth is private). */
export function registerCompanyEquity(v2: V2World, c: { id: EntityId; region: RegionId }, issuedShares?: number): InstrRef {
  return registerInstrument(v2, { id: equityInstrumentId(c.id), kind: 'EQUITY', issuer: c.id, currency: currencyOf(c.region), issuedUnits: issuedShares ?? seedIssuedSharesOf(c) });
}

/** A fund's shares, for the fund kinds whose shares are an instrument on the register: an ETF's,
 *  a money-market fund's and a private-equity fund's interest, all keyed by the fund's own id
 *  (the wire's convention; `etfShareId` and `peFundInterestId` are the fund's entity id verbatim). */
export function registerFundShares(v2: V2World, e: { id: EntityId; region: RegionId; entityType: InstitutionalEntityType }): InstrRef | undefined {
  const kind: InstrumentKind | undefined = e.entityType === 'ETF' ? 'ETF_SHARE'
    : e.entityType === 'MONEY_MARKET_FUND' ? 'MMF_SHARE'
      : e.entityType === 'PRIVATE_EQUITY' ? 'PE_FUND_INTEREST' : undefined;
  if (kind === undefined) return undefined;
  // A fund's shares in issue open at zero; its creations are what mint them (an ETF), and a
  // money-market or private-equity fund's interest is the register's own count.
  return registerInstrument(v2, { id: etfShareId(e.id), kind, issuer: e.id, currency: currencyOf(e.region), issuedUnits: 0 });
}

/** §3.13-BOOK dII — A BOOK THE ADAPTER MINTS AN ID FOR, declared where it is built: kind and
 *  money, no issuer. Idempotent, so an adapter that builds the same book every week declares it
 *  once and reads it thereafter. */
export function registerBook(v2: V2World, id: InstrumentId, kind: 'IRS' | 'CDS' | 'CDS_INDEX' | 'FX_SPOT' | 'XCS' | 'COMMODITY_FUTURE' | 'BOND_FUTURE' | 'REPO' | 'SBL' | 'OPTION', currency: CurrencyCode): InstrRef {
  return registerInstrument(v2, { id, kind, currency });
}
