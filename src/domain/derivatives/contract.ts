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

/**
 * The subset of the ledger's parties that can stand on a bilateral derivative. The arms are
 * structurally the ledger's own `PartyRef` arms of the same kind, so a party passes to `pay()`
 * directly — one encoding of who owes whom (§1.4).
 */
export type DerivativeParty =
  | { kind: 'COMPANY'; ticker: string }
  | { kind: 'BANK'; ticker: string }
  | { kind: 'INSTITUTION'; id: string };

export function derivativePartyKey(p: DerivativeParty): string {
  return `${p.kind}:${p.kind === 'INSTITUTION' ? p.id : p.ticker}`;
}

/** The classes the registry knows. A new derivative adds a member here and a profile module. */
export type DerivativeClassId = 'IRS' | 'CDS' | 'COMMODITY_FUTURE' | 'FX_FORWARD';

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
  /** What the contract is ON: issuer id (CDS), commodity id (futures), foreign region (FX). */
  referenceId: string;
  /** The tenor bucket its market quotes: 's2'|'s5'|'s10' (IRS), '1M'|'3M'|'6M' (futures). */
  termKey: string;
  /** Physical size, for classes quoted per unit (futures). USD-sized classes leave it unset. */
  units?: number;
  /**
   * Mark-to-market already SETTLED as variation margin, cumulative USD to A (§7.241: each week
   * pays the CHANGE in the mark, never the whole mark). Only mark-leg classes carry it.
   */
  settledMarkUSD?: number;
  struckWeek: number;
  maturityWeek: number;
}

/**
 * §7.241 WRITTEN ONCE — the standing cover a hedger already has, so no book ever again re-hedges
 * an exposure its live contracts already carry. Keys: the party's side, and optionally what the
 * cover is on and at which tenor.
 */
export function standingCoverUSD(
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
    if (referenceId !== undefined && c.referenceId !== referenceId) continue;
    if (termKey !== undefined && c.termKey !== termKey) continue;
    if (derivativePartyKey(side === 'a' ? c.a : c.b) === partyKey) usd += c.notional;
  }
  return usd;
}

/** As standingCoverUSD, in physical units — the unit-quoted classes net in their own quantity. */
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
    if (c.referenceId !== referenceId || c.termKey !== termKey) continue;
    if (derivativePartyKey(side === 'a' ? c.a : c.b) === partyKey) units += c.units ?? 0;
  }
  return units;
}
