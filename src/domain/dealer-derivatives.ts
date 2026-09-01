/**
 * XB2b — the dealer's FX forward INVENTORY, and why a hedge is not free.
 *
 * A real FX forward desk faces three costs and they are all quantities, not preferences:
 * balance sheet (the notional consumes leverage through a PFE add-on), inventory (offsetting
 * client flow internalizes; only the RESIDUAL is carried and delta-hedged in spot), and margin
 * (real cash, posted and held). The price of all this is the cross-currency basis — a CLEARED
 * price now (stages/fx-hedging.ts), published on the region as `crossCurrencyBasisBps`.
 *
 * DRV: the balance-sheet half — the PFE add-on, the budget share, the capacity — moved to
 * `domain/derivatives/registry.ts`, ONE rule for every derivative class the desk writes. What
 * stays here is the desk's net INVENTORY by currency (what the spot desk has to work, XB2f) and
 * the initial margin it holds as a liability.
 */

import { RegionId } from './geography';

/** A dealer's live FX forward inventory, by the currency it is net long or short. */
export interface FxDealerBook {
  /** Net notional the desk is long in each foreign currency (negative = short). */
  netNotionalByRegion: Record<string, number>;
  /** Initial margin held from clients — the desk's cash, and its liability back to them. */
  initialMarginHeldUSD: number;
  /** Gross notional outstanding — a measurement of the one derivative book, kept beside the
   *  net so the spot desk reads one struct. */
  grossNotionalUSD: number;
}

/**
 * The WIDTH of a spot desk's own market-making schedule (XB6): a desk quotes at the market when
 * it is empty and a basis away when it is full, and this is the scale it uses for "a basis"
 * until a cleared one has printed. It is a scale, not a price, and nobody pays it.
 */
export const DEALER_QUOTE_WIDTH_BPS = 150;

/** An empty desk, for a bank that has not written a forward yet. */
export function emptyFxDealerBook(): FxDealerBook {
  return { netNotionalByRegion: {}, initialMarginHeldUSD: 0, grossNotionalUSD: 0 };
}

export type { RegionId };
