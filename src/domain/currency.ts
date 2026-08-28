/**
 * The currency boundary (XB3b).
 *
 * Every monetary figure this model stores is denominated in the price level of the region that
 * owns it. That was not a decision anybody took — it fell out of the bootstrap, where one
 * primitive (productivity per capita) sets each region's price level and every per-unit price
 * inherits it exactly. Measured across all 28 sub-units: a region's goods prices sit at the same
 * ratio to the USA's as its productivity does (EUR 0.658 against 0.682), and the seed exchange
 * rate is the precise inverse of that ratio — 1/0.6824 = 1.4655, the EUR rate to the digit. The
 * conversion has existed since the bootstrap was written and has never been applied.
 *
 * It did not matter while nothing compared two regions. Within a region every figure is in the
 * same units, so margins, leverage and coverage are all correct. It matters the moment anything
 * crosses a border — and things already do: cross-border portfolios (XB1/XB2), world aggregates,
 * and now landed-cost sourcing, which is simply the first mechanism to fail loudly on it.
 *
 * **Nobody re-denominates their books.** A firm keeps its accounts in its own money and converts
 * at the market rate when it deals abroad, so that is what this does: local money stays local and
 * honestly named, and every crossing converts at the rate the FX market actually cleared. The
 * alternative — restating every figure into one numéraire at seed — would flatten the four price
 * levels to parity and leave the exchange rate nothing to do, which deletes the competitiveness
 * channel rather than modelling it.
 */

import { RegionId } from './geography';

/** USD per one unit of each region's money, as the FX market last cleared it. */
export type FxToUsd = (regionId: RegionId) => number;

function safeRate(rate: number): number {
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/** A figure held in `from`'s money, expressed in USD. */
export function localToUsd(amountLocal: number, from: RegionId, fxToUsd: FxToUsd): number {
  return amountLocal * safeRate(fxToUsd(from));
}

/** A figure held in USD, expressed in `to`'s money. */
export function usdToLocal(amountUsd: number, to: RegionId, fxToUsd: FxToUsd): number {
  return amountUsd / safeRate(fxToUsd(to));
}

/**
 * A figure held in `from`'s money, expressed in `to`'s money — the conversion a buyer performs to
 * compare a foreign supplier's quote against a domestic one, and the one an investor performs to
 * carry a foreign asset on its own books.
 *
 * This is where the competitiveness channel lives: when a region's currency weakens, everything
 * it sells gets cheaper in every other region's money without a single price on its own books
 * changing. That is mechanical, and it is what the deleted `getFxCompetitivenessAdjustment`
 * formula was standing in for.
 */
export function convertLocal(amount: number, from: RegionId, to: RegionId, fxToUsd: FxToUsd): number {
  if (from === to) return amount;
  return amount * (safeRate(fxToUsd(from)) / safeRate(fxToUsd(to)));
}

/**
 * A rate table snapshotted for a whole pass, so every conversion inside one week's decision uses
 * the same rate. Re-reading a moving rate partway through a comparison is how two halves of one
 * decision end up priced against different worlds.
 */
export function snapshotFxToUsd(regionIds: RegionId[], fxToUsd: FxToUsd): Record<string, number> {
  const table: Record<string, number> = {};
  regionIds.forEach(r => { table[r] = safeRate(fxToUsd(r)); });
  return table;
}

export function fromTable(table: Record<string, number>): FxToUsd {
  return (regionId: RegionId) => safeRate(table[regionId]);
}
