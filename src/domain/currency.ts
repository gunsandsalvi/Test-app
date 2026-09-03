/**
 * THE CURRENCY BOUNDARY.
 *
 * Every monetary figure this model stores is denominated in the money of whoever owns it. That
 * was not a decision anybody took — it fell out of the bootstrap, where one primitive
 * (productivity per capita) sets each region's price level and every per-unit price inherits it
 * exactly. Measured across all 28 sub-units: a region's goods prices sit at the same ratio to the
 * USA's as its productivity does (EUR 0.658 against 0.682), and the seed exchange rate is the
 * precise inverse of that ratio — 1/0.6824 = 1.4655, the EUR rate to the digit.
 *
 * **Nobody re-denominates their books.** A firm keeps its accounts in its own money and converts
 * at the market rate when it deals abroad, so that is what this does: local money stays local and
 * honestly named, and every crossing converts at the rate the FX market actually cleared. The
 * alternative — restating every figure into one numéraire at seed — would flatten the four price
 * levels to parity and leave the exchange rate nothing to do, which deletes the competitiveness
 * channel rather than modelling it.
 *
 * WHAT CHANGED (§3.13c). The conversion existed and was applied at nineteen call sites, all of
 * them DECISION stages comparing a foreign quote, and at none of the places money actually
 * MOVES: `pay()` took an amount and a payer and a payee and converted nothing, so a German firm
 * paying a US supplier subtracted N euros from one balance and added N dollars to another, and
 * the wire ledger balanced because it was adding two numbers that are not the same kind of
 * thing. The primitive here is now keyed by CURRENCY rather than by region — a region is a
 * place, money is money — and it is what the ledger converts with.
 */

import { RegionId, CurrencyCode, CURRENCY_BY_REGION, CURRENCY_CODES, NUMERAIRE } from './geography';
import { defect } from './defect';

/**
 * What one unit of each currency is worth in the numéraire, as the FX market last cleared it.
 * The one rate table; `engine2/world.ts` carries the world's copy and the FX auction writes it.
 */
export type FxTable = Readonly<Record<CurrencyCode, number>>;

/** USD per one unit of each region's money — the region-keyed read the older stages hold. */
export type FxToUsd = (regionId: RegionId) => number;

/** GUARD: a rate that is missing or nonsensical is a broken read, not a reason to price a
 *  foreign figure at parity. It fails here, naming the currency. */
function requireRate(rate: number, currency: CurrencyCode): number {
  if (Number.isFinite(rate) && rate > 0) return rate;
  return defect(`no FX rate for ${currency} (got ${rate}) — the pair is missing or has not cleared`);
}

/** What one unit of `currency` is worth in the numéraire. */
export function rateOf(fx: FxTable, currency: CurrencyCode): number {
  return currency === NUMERAIRE ? 1 : requireRate(fx[currency], currency);
}

/**
 * An amount held in `from`'s money, expressed in `to`'s money — the conversion a buyer performs
 * to compare a foreign supplier's quote against a domestic one, the one an investor performs to
 * carry a foreign asset on its own books, and the one the LEDGER performs when a payment crosses
 * a currency.
 *
 * This is where the competitiveness channel lives: when a currency weakens, everything priced in
 * it gets cheaper in every other money without a single price on its own books changing.
 */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, fx: FxTable): number {
  if (from === to) return amount;
  return amount * (rateOf(fx, from) / rateOf(fx, to));
}

/** An amount in `currency`, expressed in the numéraire. */
export const toNumeraire = (amount: number, currency: CurrencyCode, fx: FxTable): number =>
  currency === NUMERAIRE ? amount : amount * rateOf(fx, currency);

/** An amount in the numéraire, expressed in `currency`. */
export const fromNumeraire = (amount: number, currency: CurrencyCode, fx: FxTable): number =>
  currency === NUMERAIRE ? amount : amount / rateOf(fx, currency);

/** A parity table — the world before the FX market has cleared once, and nothing else. */
export const PARITY_FX: FxTable = Object.freeze(
  CURRENCY_CODES.reduce((t, c) => { t[c] = 1; return t; }, {} as Record<CurrencyCode, number>)
);

/** The table an `FxToUsd` reader implies, snapshotted once so a whole pass converts at one rate. */
export function fxTableFrom(regionIds: readonly RegionId[], fxToUsd: FxToUsd): FxTable {
  const table = { ...PARITY_FX } as Record<CurrencyCode, number>;
  regionIds.forEach((r) => { table[CURRENCY_BY_REGION[r]] = requireRate(fxToUsd(r), CURRENCY_BY_REGION[r]); });
  return table;
}

// ---- The region-keyed reads. A region is a place and its money is `CURRENCY_BY_REGION`; these
// exist because the decision stages hold a region and not a currency, and each is one hop. ----

/** A figure held in `from`'s money, expressed in `to`'s money. */
export function convertLocal(amount: number, from: RegionId, to: RegionId, fxToUsd: FxToUsd): number {
  if (from === to) return amount;
  return amount * (requireRate(fxToUsd(from), CURRENCY_BY_REGION[from]) / requireRate(fxToUsd(to), CURRENCY_BY_REGION[to]));
}

/** A figure held in `from`'s money, expressed in the numéraire. */
export function localToUsd(amountLocal: number, from: RegionId, fxToUsd: FxToUsd): number {
  return amountLocal * requireRate(fxToUsd(from), CURRENCY_BY_REGION[from]);
}

/** A figure held in the numéraire, expressed in `to`'s money. */
export function usdToLocal(amountUsd: number, to: RegionId, fxToUsd: FxToUsd): number {
  return amountUsd / requireRate(fxToUsd(to), CURRENCY_BY_REGION[to]);
}

/**
 * A rate table snapshotted for a whole pass, so every conversion inside one week's decision uses
 * the same rate. Re-reading a moving rate partway through a comparison is how two halves of one
 * decision end up priced against different worlds.
 */
export function snapshotFxToUsd(regionIds: readonly RegionId[], fxToUsd: FxToUsd): Record<string, number> {
  const table: Record<string, number> = {};
  regionIds.forEach(r => { table[r] = requireRate(fxToUsd(r), CURRENCY_BY_REGION[r]); });
  return table;
}

export function fromTable(table: Record<string, number>): FxToUsd {
  return (regionId: RegionId) => requireRate(table[regionId], CURRENCY_BY_REGION[regionId]);
}
