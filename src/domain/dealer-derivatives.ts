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
 * The basis at full utilization, in bps. The desk's quote deviates from CIP by up to this much
 * when its capacity is exhausted — the point at which balance sheet is scarce enough that the
 * cheapest hedger is indifferent. Crisis-era cross-currency bases reached this order.
 */
export const MAX_CROSS_CURRENCY_BASIS_BPS = 150;

/** Share of its leverage headroom a desk will commit to derivative PFE before it stops quoting. */
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

/**
 * The price of the hedge: how far the desk's quote sits from CIP, in bps.
 *
 * Rises with utilization, and rises FASTER with the residual it cannot internalize — a desk with
 * balanced two-way flow carries almost nothing and quotes almost nothing, while a desk absorbing
 * one-way demand has to hold and delta-hedge the position and charges for it. That asymmetry is
 * why a basis blows out when everyone wants to hedge the same way at once, which is exactly when
 * it happens in reality.
 */
export function crossCurrencyBasisBps(args: {
  grossNotionalUSD: number;
  netNotionalUSD: number;
  capacityUSD: number;
}): number {
  const totalCapacityUSD = args.capacityUSD + args.grossNotionalUSD;
  if (totalCapacityUSD <= 0) return MAX_CROSS_CURRENCY_BASIS_BPS;
  const utilization = Math.min(1, args.grossNotionalUSD / totalCapacityUSD);
  // The un-internalized share: what the desk actually has to carry.
  const oneWayShare = args.grossNotionalUSD > 0
    ? Math.min(1, Math.abs(args.netNotionalUSD) / args.grossNotionalUSD)
    : 0;
  return MAX_CROSS_CURRENCY_BASIS_BPS * utilization * (0.35 + 0.65 * oneWayShare);
}

/** An empty desk, for a bank that has not written a forward yet. */
export function emptyFxDealerBook(): FxDealerBook {
  return { netNotionalByRegion: {}, initialMarginHeldUSD: 0, grossNotionalUSD: 0 };
}

export type { RegionId };

/**
 * Share of its net FX position a desk flattens in spot each week.
 *
 * A market maker does not want the currency risk — it wants the spread. Having bought foreign
 * currency forward from a hedger, it sells that currency SPOT to flatten, and carries only what
 * it cannot execute without moving the price against itself. Below 1 because a desk works a large
 * position over time rather than dumping it.
 */
export const FX_DELTA_HEDGE_EXECUTION_RATE = 0.6;

/**
 * How much a week of net spot flow moves a currency, per unit of flow relative to the market's
 * own size. FX is deep, so the coefficient is small — but hedging flow is a large share of real
 * FX volume, and this is the channel by which a hedged foreign bond portfolio weighs on the
 * currency it is invested in. That is a real and well-documented effect with no representation
 * in this model before XB2c: the desks accumulated exposure and only marked it.
 */
export const FX_SPOT_PRICE_IMPACT_PER_GDP = 0.35;
