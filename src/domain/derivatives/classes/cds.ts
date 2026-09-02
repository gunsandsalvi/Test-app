/**
 * CRD/DER2/DRV — the single-name CDS CLASS. The market's framing (the float is the protection
 * somebody NEEDS; sellers price with the bond book's own arithmetic; cleared spread minus cash
 * OAS is the BASIS) stays documented at the market stage (07h); this module is the CONTRACT:
 * premium weekly, par-less-recovery on a credit event, terminated.
 *
 * strike: the spread struck, in bps of notional per year (rule 9). referenceId: the reference
 * COMPANY id — the same key the bond book prices. termKey: ''.
 */

import { DerivativeClassProfile } from '../profile';

/**
 * The standard tenor. Five years is where single-name CDS liquidity actually sits, and a tenor
 * has to be SOME length for the premium leg to have a horizon; a market-convention primitive of
 * the same kind as the repo book's overnight default.
 */
export const CDS_TENOR_WEEKS = 5 * 52;

/**
 * The large-exposure limit: how much of its own capital a bank will carry against ONE name
 * before it has to lay the rest off. A real regulatory primitive (rule 4 allows those; the
 * leverage floor and risk weights sit beside it). It turns 09-concentration's measurement into
 * a decision: exposure above this is not a preference to hedge, it is a position the bank is
 * not allowed to keep.
 */
export const LARGE_EXPOSURE_LIMIT_OF_CAPITAL = 0.25;

/**
 * What a lender must lay off: the exposure to one name beyond what its capital lets it carry,
 * net of protection it has already bought. A measurement of the bank's own book, not a view.
 */
export function protectionNeedUSD(args: {
  exposureUSD: number;
  bankEquityUSD: number;
  alreadyHedgedUSD: number;
}): number {
  const carryableUSD = Math.max(0, args.bankEquityUSD) * LARGE_EXPOSURE_LIMIT_OF_CAPITAL;
  return Math.max(0, args.exposureUSD - carryableUSD - Math.max(0, args.alreadyHedgedUSD));
}

export const CDS_PROFILE: DerivativeClassProfile = {
  id: 'CDS',
  roleA: 'PROTECTION_BUYER',
  roleB: 'PROTECTION_SELLER',
  // Basel CEM credit-derivative add-on: 5% on an investment-grade reference, 10% below it. The
  // flat rate is the capacity denominator (a desk sizes what it can write before it knows the
  // name); the contract-level rule charges the book it actually carries.
  pfeAddOnRate: 0.10,
  pfeAddOnRateFor: (_c, isInvestmentGrade) => (isInvestmentGrade ? 0.05 : 0.10),
  initialMarginRate: 0,
  /** The buyer pays the struck spread on the notional, weekly, for the life of the trade. */
  periodicLegUSDToB: (c) => ({
    usdToB: (c.notionalUSD * (c.strike / 10000)) / 52,
    reason: 'CDS premium',
  }),
  markToMarketUSDToA: () => null,
  /** A defaulted reference entity terminates the contract: the seller pays par less what the
   *  workout actually recovers (G5, §7.192), which is what makes buying protection worth it. */
  eventTermination: (c, m) => {
    if (!m.isIssuerDefaulted(c.referenceId)) return null;
    const recovery = Math.max(0, Math.min(1, m.recoveryRate(c.regionId)));
    const payoutUSD = c.notionalUSD * Math.max(0, 1 - recovery);
    return payoutUSD > 0 ? { usdToB: -payoutUSD, reason: 'CDS credit event settled' } : { usdToB: 0, reason: 'CDS credit event settled' };
  },
  // Replacement value to the buyer: the spread move since striking, over the remaining life —
  // the premium it would now save (or newly pay) replacing the contract at the current print.
  closeOutUSDToB: (c, m) => {
    const current = m.cdsSpreadBps(c.referenceId);
    if (!Number.isFinite(current)) return 0;
    const remainingYears = Math.max(0, c.maturityWeek - m.week) / 52;
    return -(((current - c.strike) / 10000) * c.notionalUSD * remainingYears);
  },
};
