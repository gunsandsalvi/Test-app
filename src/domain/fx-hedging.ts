/**
 * XB2 — the FX hedge on a cross-border book, and what it does to demand.
 *
 * The institutional rule, not an option: an insurer or a pension fund buying a foreign BOND
 * hedges the currency. Its liabilities are in its members' currency and its regulator charges
 * mismatch, so an unhedged foreign bond is a currency bet it is not in business to take. Equity
 * is different — hedging there is discretionary and partial, and the unhedged part carries real
 * FX exposure into the holder's marks.
 *
 * The consequence for DEMAND is the point, and it is not intuitive. Under covered interest parity
 * the forward is `F = S x (1 + r_home t) / (1 + r_foreign t)`, so selling the foreign currency
 * forward earns `(r_home - r_foreign)` per period. A hedged foreign bond therefore returns
 * `foreign_yield + r_home - r_foreign`, and comparing that against a home bond leaves
 * `(foreign_yield - r_foreign)` against `(home_yield - r_home)`.
 *
 * **Cross-border bond flow chases the spread over the local short rate, never the headline
 * yield.** A 15% bond in a 14% policy-rate country is worse than a 4% bond in a 1% one, and the
 * hedge is what makes that true rather than a preference anyone had to be given.
 */

import { RegionId } from './geography';

/** A real forward: a contract with a bank, a size, a rate and a date — not a discount applied to a yield. */
export interface FxForward {
  id: string;
  holderId: string;
  /** The bank on the other side. Its book carries the mirror image of every mark below. */
  counterpartyTicker: string;
  /** The currency being sold forward — the currency of the assets being hedged. */
  foreignRegion: RegionId;
  notionalUSD: number;
  /** Home-per-foreign rate struck at inception, against which every later mark is measured. */
  contractedRate: number;
  maturityWeek: number;
  /** §7.241 — the cumulative mark ALREADY SETTLED as variation margin. Each week pays the CHANGE
   * in the mark, not the whole mark: without this a persistent 5% spot move paid ~5% of notional
   * up to tenor times over the contract's life, weekly, into bank equity and holder cash. */
  paidMarkUSD?: number;
}

/**
 * Share of a cross-border position that gets hedged. Fixed income at 1.0 is a genuine rule — an
 * insurer's regulator charges the mismatch, so it has no choice.
 *
 * HF4 — a hedge ratio is a MANDATE PROPERTY, not one number for everyone. The equity 0.35 this
 * replaces was an observed average of published policies (rule 4: a real-world equilibrium)
 * applied to every entity type alike, so a pension fund matching liabilities in its own currency
 * and a macro fund taking currency risk on purpose hedged identically.
 *
 * The split that decides it is the one the model already makes everywhere else: a LIABILITY-DRIVEN
 * book has a claim to match in its own money, and a currency mismatch on it is a real exposure its
 * regulator prices — so it hedges everything, equity included. A RETURN-SEEKING book holds foreign
 * equity partly FOR the currency: the exposure is part of the position, and it hedges the part its
 * mandate says is not. And a global macro fund hedges nothing, because the currency IS the trade.
 *
 * Still open, and DER's: the ratio should also respond to what the hedge COSTS, which needs the
 * basis to be a cleared price rather than a formula.
 */
export const HEDGE_RATIO_FIXED_INCOME = 1.0;

/** A liability-driven holder's equity hedge: the same as its bond book's, because the reason is
 *  the same — the claim it is matching is in its own currency. */
export const HEDGE_RATIO_EQUITY_LIABILITY_DRIVEN = 1.0;
/** A return-seeking holder's: foreign equity is held partly for the currency, so the mandate
 *  hedges the smaller half of the exposure and lives with the rest. */
export const HEDGE_RATIO_EQUITY_RETURN_SEEKING = 0.35;

/** This entity's own equity hedge ratio, off its mandate. */
export function equityHedgeRatioFor(
  entityType: string,
  hedgeFundStrategy?: string
): number {
  if (entityType === 'INSURER' || entityType === 'PENSION_FUND') return HEDGE_RATIO_EQUITY_LIABILITY_DRIVEN;
  // The currency is the position, not a side effect of it.
  if (hedgeFundStrategy === 'GLOBAL_MACRO') return 0;
  return HEDGE_RATIO_EQUITY_RETURN_SEEKING;
}

/** Short-dated forwards rolled continuously — how a bond book is actually hedged. */
export const FX_FORWARD_TENOR_WEEKS = 13;

/**
 * What hedging does to a foreign holder's required yield, in bps.
 *
 * A holder needs the foreign bond to beat its home alternative AFTER the hedge. Since the hedge
 * pays `r_home - r_issuer`, the foreign yield must be higher by exactly `r_issuer - r_home` for
 * the two to match. Positive when the issuer's policy rate is above the holder's: hedging out of
 * a high-rate currency costs, so the paper has to yield more to be worth owning.
 */
export function hedgedReservationAdjustmentBps(holderPolicyRate: number, issuerPolicyRate: number): number {
  return (issuerPolicyRate - holderPolicyRate) * 10000;
}

/**
 * The forward's mark this week: what the holder gains or loses on the contract as spot moves.
 *
 * A holder short the foreign currency gains when that currency FALLS — which is the whole point,
 * because the assets it is hedging lost the same amount. The bank on the other side takes the
 * mirror, so the pair nets to the dealer spread and nothing is created.
 */
export function forwardMarkToMarketUSD(fwd: FxForward, currentRate: number): number {
  if (!(fwd.contractedRate > 0) || !(currentRate > 0)) return 0;
  return fwd.notionalUSD * ((fwd.contractedRate - currentRate) / fwd.contractedRate);
}
