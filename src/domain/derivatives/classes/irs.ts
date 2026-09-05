/**
 * DER1/DRV — the interest-rate swap CLASS. Why the market exists, who is on each side and what
 * the swap spread is stays documented at the market stage (07g); this module is what the
 * CONTRACT does: a fixed rate against the compounded overnight print (OIS, §7.194), weekly.
 *
 * strike: the par rate struck, annual decimal. referenceId: '' (the underlying is the rate
 * itself). termKey: 's2'|'s5'|'s10'.
 */

import { DerivativeClassProfile } from '../profile';
import { annuityFactor } from '../../pricing';

export type SwapTenorKey = 's2' | 's5' | 's10';
export const SWAP_TENOR_YEARS: Record<SwapTenorKey, number> = { s2: 2, s5: 5, s10: 10 };
export const SWAP_TENORS: SwapTenorKey[] = ['s2', 's5', 's10'];

/** Which point of the cleared sovereign curve each swap tenor is measured against. */
export const SWAP_TENOR_ZERO_FIELD: Record<SwapTenorKey, 'tenor2Y' | 'tenor5Y' | 'tenor10Y'> = {
  s2: 'tenor2Y', s5: 'tenor5Y', s10: 'tenor10Y',
};

/**
 * The DV01-equivalent loss a fixed-rate book suffers on a two-sigma weekly repricing — what an
 * owner has to decide whether it can absorb. Duration times the move, on the notional.
 */
export function repricingLossLocal(bookLocal: number, durationYears: number, moveBps: number): number {
  return Math.max(0, bookLocal) * Math.max(0, durationYears) * (Math.max(0, moveBps) / 10000);
}

export const IRS_PROFILE: DerivativeClassProfile = {
  id: 'IRS',
  roleA: 'PAY_FIXED',
  roleB: 'RECEIVE_FIXED',
  // Basel CEM interest-rate add-on, 1-5y bucket. Small per dollar — which is why rates books
  // run large — and real once the desk's whole derivative book shares one leverage budget.
  pfeAddOnRate: 0.005,
  /** §3.17-ii: the rate's own weekly move at this tenor, on the swap's remaining life — the
   *  repricing of the fixed leg one session can bring. */
  closeOutMoveOf: (c, m) => {
    const bps = m.rateWeeklyMoveBps(c.regionId, c.termKey);
    if (bps === undefined) return undefined;
    return (bps / 10000) * Math.max(0, c.maturityWeek - m.week) / 52;
  },
  // The floating leg pays the rate the week PRINTED; the fixed leg pays the strike. A payer of
  // fixed gains exactly when rates rose against it, which is the hedge it entered for.
  periodicLegUSDToB: (c, m) => {
    const usdToB = (c.notional * (c.strike - m.overnightRateAnnual(c.regionId))) / 52;
    return { usdToB, reason: 'swap settlement' };
  },
  /**
   * §3.17-iii — THE SWAP HAS A MARK. Its value to the payer of fixed is what the remaining fixed
   * leg is worth against today's par: the weekly difference (par − strike) on the notional over
   * the weeks left, DISCOUNTED at the par rate (the annuity a par swap's own rate prices — the
   * undiscounted close-out this replaces overstated a ten-year swap's value by the whole curve).
   * The lifecycle settles the CHANGE each week as variation margin, and at maturity nothing is
   * left to value, so the marks telescope to zero while the weekly nets carried the cash. A
   * tenor with no par print this week does not mark.
   */
  markToMarketUSDToA: (c, m) => {
    const par = m.parRateAnnual(c.regionId, c.termKey);
    if (!Number.isFinite(par)) return null;
    const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
    if (remainingWeeks === 0) return 0;
    return (c.notional * (par - c.strike) / 52) * annuityFactor(par / 52, remainingWeeks);
  },
  markReasonLive: 'swap variation margin',
  markReasonFinal: 'swap settled',
  eventTermination: () => null,
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};
