/**
 * XB2/DER/DRV — the FX forward CLASS. Why cross-border flow chases the spread over the LOCAL
 * short rate (CIP and the hedge), and why the cross-currency basis is a cleared price against
 * real dealer balance sheets, stays documented at the market stage (fx-hedging.ts); this module
 * is the CONTRACT: the holder sells the foreign currency forward and the mark settles weekly as
 * variation margin against the dealer desk.
 *
 * strike: home-per-foreign rate struck at inception (CIP moved AGAINST the client by the
 * cleared basis — the desk charges for its balance sheet). reference: the foreign region —
 * the currency being sold forward. termKey: ''.
 */

import { institutionProfile, hedgeFundStrategyProfile } from '../../institution-profiles';
import { regionReferenceOf } from '../contract';
import type { InstitutionalEntityType, HedgeFundStrategy } from '../../institutions';
import { DerivativeClassProfile } from '../profile';

/** Short-dated forwards rolled continuously — how a bond book is actually hedged. */
export const FX_FORWARD_TENOR_WEEKS = 13;

/**
 * Share of a cross-border position that gets hedged — a MANDATE property, not one number for
 * everyone (HF4). Fixed income at 1.0 is a genuine rule: the regulator charges the mismatch, so
 * an insurer has no choice. A liability-driven book hedges equity too (the claim it matches is
 * in its own money); a return-seeking book holds foreign equity partly FOR the currency and
 * hedges the smaller half; a global macro fund hedges nothing, because the currency IS the trade.
 */
export const HEDGE_RATIO_FIXED_INCOME = 1.0;
export const HEDGE_RATIO_EQUITY_LIABILITY_DRIVEN = 1.0;
export const HEDGE_RATIO_EQUITY_RETURN_SEEKING = 0.35;

export function equityHedgeRatioFor(entityType: InstitutionalEntityType, hedgeFundStrategy?: HedgeFundStrategy): number {
  // §7.347 — both facts are the registries': a liability-driven kind hedges fully; a strategy
  // that does not hedge its foreign equity hedges none of it.
  if (institutionProfile(entityType).liabilityDriven) return HEDGE_RATIO_EQUITY_LIABILITY_DRIVEN;
  const strategy = hedgeFundStrategyProfile({ entityType, hedgeFundStrategy });
  if (strategy && !strategy.hedgesForeignEquity) return 0;
  return HEDGE_RATIO_EQUITY_RETURN_SEEKING;
}

/**
 * What hedging does to a foreign holder's required yield, in bps. The hedge pays
 * `r_home − r_issuer`, so the foreign paper must yield `r_issuer − r_home` more to match the
 * home alternative: hedging OUT of a high-rate currency costs, and the paper has to pay for it.
 */
export function hedgedReservationAdjustmentBps(holderPolicyRate: number, issuerPolicyRate: number): number {
  return (issuerPolicyRate - holderPolicyRate) * 10000;
}

export const FX_FORWARD_PROFILE: DerivativeClassProfile = {
  id: 'FX_FORWARD',
  roleA: 'HEDGER',
  roleB: 'DEALER',
  // Basel CEM FX add-on, sub-year — the number the FX desk's capacity always charged.
  pfeAddOnRate: 0.02,
  /** §3.17-ii: the pair's own weekly move, on the notional — a forward marks one for one. The
   *  flat 2% every ticket used to post (XB2b) is gone; the client's money with the desk is now
   *  what the currency can move in a session. */
  closeOutMoveOf: (c, m) => m.fxWeeklyMove(regionReferenceOf(c)),
  periodicLegUSDToB: () => null,
  /** A holder short the foreign currency gains when it FALLS — the assets it is hedging lost
   *  the same amount. The desk carries the mirror, so the pair nets to zero by construction. */
  markToMarketUSDToA: (c, m) => {
    const rate = m.fxToUsd(regionReferenceOf(c));
    if (!(c.strike > 0) || !(rate > 0)) return null;
    return c.notional * ((c.strike - rate) / c.strike);
  },
  markReasonLive: 'fx forward variation margin',
  markReasonFinal: 'fx forward variation margin',
  eventTermination: () => null,
  closeOutUSDToB: () => 0, // mark-leg class: the lifecycle closes out at the mark
};
