/**
 * DER1/DRV — the interest-rate swap CLASS. Why the market exists, who is on each side and what
 * the swap spread is stays documented at the market stage (07g); this module is what the
 * CONTRACT does: a fixed rate against the compounded overnight print (OIS, §7.194), weekly.
 *
 * strike: the par rate struck, annual decimal. referenceId: '' (the underlying is the rate
 * itself). termKey: 's2'|'s5'|'s10'.
 */

import { DerivativeClassProfile } from '../profile';

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
export function repricingLossUSD(bookLocal: number, durationYears: number, moveBps: number): number {
  return Math.max(0, bookLocal) * Math.max(0, durationYears) * (Math.max(0, moveBps) / 10000);
}

export const IRS_PROFILE: DerivativeClassProfile = {
  id: 'IRS',
  roleA: 'PAY_FIXED',
  roleB: 'RECEIVE_FIXED',
  // Basel CEM interest-rate add-on, 1-5y bucket. Small per dollar — which is why rates books
  // run large — and real once the desk's whole derivative book shares one leverage budget.
  pfeAddOnRate: 0.005,
  initialMarginRate: 0,
  // The floating leg pays the rate the week PRINTED; the fixed leg pays the strike. A payer of
  // fixed gains exactly when rates rose against it, which is the hedge it entered for.
  periodicLegUSDToB: (c, m) => {
    const usdToB = (c.notional * (c.strike - m.overnightRateAnnual(c.regionId))) / 52;
    return { usdToB, reason: 'swap settlement' };
  },
  markToMarketUSDToA: () => null,
  eventTermination: () => null,
  // Replacement value: the remaining weekly nets at TODAY's par — the same leg arithmetic the
  // live contract pays, summed to maturity, so close-out and carry can never disagree (§1.4).
  closeOutUSDToB: (c, m) => {
    const par = m.parRateAnnual(c.regionId, c.termKey);
    if (!Number.isFinite(par)) return 0;
    const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
    return (c.notional * (c.strike - par) / 52) * remainingWeeks;
  },
};
