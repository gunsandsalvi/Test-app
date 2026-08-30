/**
 * XB2b — the dealer's derivative book, and why a hedge is not free.
 *
 * The defect this replaces: XB2 let every hedger strike a forward at pure covered-interest parity,
 * in unlimited size, against a dealer that absorbed it at no cost. That is an infinite supply of
 * derivatives — the same shape as any other formula this project deletes, except the thing being
 * assumed away is a balance sheet.
 *
 * A real FX forward desk faces three costs and they are all quantities, not preferences:
 *   1. **Balance sheet.** The notional consumes leverage capacity through a potential-future-
 *      exposure add-on, and the leverage ratio does not care that the position is hedged.
 *   2. **Inventory.** A desk internalizes offsetting client flow first — a EUR seller against a
 *      EUR buyer costs nothing. Only the RESIDUAL has to be carried and delta-hedged in spot.
 *   3. **Margin.** The client posts initial margin against future exposure; variation margin is
 *      the weekly mark. Both are real cash movements, not bookkeeping.
 *
 * The price of all this is the **cross-currency basis** — the deviation of the traded forward from
 * CIP. It is the single most important thing this file buys: post-2008, CIP stopped holding
 * precisely because dealer balance sheets became expensive, and a basis that widens with dealer
 * utilization reproduces that rather than assuming it. When the desk is empty, hedging is nearly
 * free and the basis is near zero; when it is full, hedging costs real money and some hedgers
 * walk away — which is what a supply curve IS.
 */

import { RegionId } from './geography';

/** A dealer's live FX forward inventory, by the currency it is net long or short. */
export interface FxDealerBook {
  /** Net notional the desk is long in each foreign currency (negative = short). */
  netNotionalByRegion: Record<string, number>;
  /** Initial margin held from clients — the desk's cash, and its liability back to them. */
  initialMarginHeldUSD: number;
  /** Gross notional outstanding, which is what the leverage add-on is charged on. */
  grossNotionalUSD: number;
}

/**
 * Potential future exposure per dollar of FX forward notional — the capital add-on a leverage
 * ratio charges on a short-dated FX contract. Small per dollar, which is why desks can run large
 * books at all, and decisive once the book is large relative to equity.
 */
export const FX_PFE_ADD_ON_RATE = 0.02;

/** Initial margin a client posts per dollar of notional. Real cash, held by the desk. */
export const FX_INITIAL_MARGIN_RATE = 0.02;

/**
 * DER closed the rule-1/15 defect this file used to carry. The cross-currency basis was
 * `MAX(150) x utilization x (0.35 + 0.65 x oneWayShare)`: a formula with a ceiling, whose maximum
 * was an observed crisis-era level (rule 4) and whose split was invented. It is now a CLEARED
 * price — hedger demand against what the desks can actually write, in stages/fx-hedging.ts, and
 * published on the region as `crossCurrencyBasisBps`.
 *
 * What survives is the WIDTH of a spot desk's own market-making schedule (XB6): a desk quotes at
 * the market when it is empty and a basis away when it is full, and this is the scale it uses for
 * "a basis" until a cleared one has printed. It is a scale, not a price, and nobody pays it.
 */
export const DEALER_QUOTE_WIDTH_BPS = 150;

/**
 * Share of its leverage headroom a desk will commit to derivative PFE before it stops quoting.
 *
 * G3 deliberately did NOT merge this with the cash desks' commitment
 * (DEALER_DESK_SHARE_OF_BALANCE_SHEET): the bases are different things — a derivative consumes
 * capacity through a 2% PFE add-on and a cash bond consumes it one-for-one — so one number
 * covering both would be one number meaning two. DER owns whether the two decisions are really
 * one when it makes the basis a cleared price.
 */
export const FX_DESK_CAPACITY_SHARE_OF_HEADROOM = 0.25;

/**
 * What the desk can still write, in notional, given its own equity and what it already carries.
 * Zero when it is full — and a dealer at zero capacity is why a hedge can be unavailable at any
 * price, which no formula-priced hedge can express.
 */
export function fxDeskCapacityUSD(leverageHeadroomUSD: number, book: FxDealerBook | undefined): number {
  const totalUSD = (Math.max(0, leverageHeadroomUSD) * FX_DESK_CAPACITY_SHARE_OF_HEADROOM) / FX_PFE_ADD_ON_RATE;
  return Math.max(0, totalUSD - (book?.grossNotionalUSD ?? 0));
}

/** An empty desk, for a bank that has not written a forward yet. */
export function emptyFxDealerBook(): FxDealerBook {
  return { netNotionalByRegion: {}, initialMarginHeldUSD: 0, grossNotionalUSD: 0 };
}

export type { RegionId };
