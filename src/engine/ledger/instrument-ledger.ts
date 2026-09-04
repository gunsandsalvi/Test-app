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
import { internInstrument, internType, internEntity, CURRENCY_ID } from '../../engine2/world';
import { writeInstrumentRow, instrumentRefRegistered, instrumentKindOf, instrumentIssuerOf, instrumentCurrencyOf } from '../../engine2/instruments';
import { ABSENT_REF, type InstrRef } from '../../engine2/refs';
import type { InstrumentId, EntityId } from '../../domain/ids';
import { currencyOf, type CurrencyCode, type RegionId } from '../../domain/geography';
import { equityInstrumentId, etfShareRegisterId } from '../../domain/instrument-keys';
import { defect } from '../../domain/defect';
import type { AssetKind } from './wire';
import type { InstitutionalEntityType } from '../../domain/institutions';

/** What the index can hold: every wire asset kind that is an INSTRUMENT (money and goods have
 *  their own ledgers; a house and a contract are slice (dII)'s and (f)'s). */
export type InstrumentKind = Exclude<AssetKind, 'MONEY' | 'GOOD' | 'HOUSE' | 'CONTRACT'>;

export interface InstrumentDeclaration {
  id: InstrumentId;
  kind: InstrumentKind;
  /** Undefined for an instrument nobody owes — a traded pair, a book. */
  issuer?: EntityId;
  currency: CurrencyCode;
}

/** Declare an instrument. Returns its ref; a disagreeing second declaration defects. */
export function registerInstrument(v2: V2World, d: InstrumentDeclaration): InstrRef {
  const ref = internInstrument(v2, d.id);
  if (instrumentRefRegistered(v2, ref)) {
    const kind = instrumentKindOf(v2, d.id), issuer = instrumentIssuerOf(v2, d.id), currency = instrumentCurrencyOf(v2, d.id);
    if (kind !== d.kind || issuer !== d.issuer || currency !== d.currency) {
      return defect(`instrument ${d.id} declared twice and the declarations disagree: ${kind}/${issuer}/${currency} then ${d.kind}/${d.issuer}/${d.currency}`);
    }
    return ref;
  }
  writeInstrumentRow(v2, ref, internType(v2, d.kind), d.issuer === undefined ? ABSENT_REF : internEntity(v2, d.issuer), CURRENCY_ID[d.currency]);
  return ref;
}

/** A company's equity, declared where the company comes into being — the seed and every birth. */
export function registerCompanyEquity(v2: V2World, c: { id: EntityId; region: RegionId }): InstrRef {
  return registerInstrument(v2, { id: equityInstrumentId(c.id), kind: 'EQUITY', issuer: c.id, currency: currencyOf(c.region) });
}

/** A fund's shares, for the fund kinds whose shares are an instrument on the register: an ETF's
 *  and a money-market fund's, both keyed by the fund's own id (the wire's convention). */
export function registerFundShares(v2: V2World, e: { id: EntityId; region: RegionId; entityType: InstitutionalEntityType }): InstrRef | undefined {
  const kind: InstrumentKind | undefined = e.entityType === 'ETF' ? 'ETF_SHARE' : e.entityType === 'MONEY_MARKET_FUND' ? 'MMF_SHARE' : undefined;
  if (kind === undefined) return undefined;
  return registerInstrument(v2, { id: etfShareRegisterId(e.id), kind, issuer: e.id, currency: currencyOf(e.region) });
}
