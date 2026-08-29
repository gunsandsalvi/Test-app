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
}

/**
 * Share of a cross-border position that gets hedged. Fixed income at 1.0 is a genuine rule — an
 * insurer's regulator charges the mismatch, so it has no choice.
 *
 * RULE 4/17, OPEN: the equity 0.35 is not a rule, it is an observed average of published
 * policies — a real-world EQUILIBRIUM, and one constant applied to every entity type alike. A
 * hedge ratio is a MANDATE property: it belongs on the entity's profile, so a pension fund and a
 * hedge fund can differ, and so it can respond to what hedging costs. Owner: HF.
 */
export const HEDGE_RATIO_FIXED_INCOME = 1.0;
export const HEDGE_RATIO_EQUITY = 0.35;

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
