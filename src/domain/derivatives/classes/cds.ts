/**
 * CRD/DER2/DRV — the single-name CDS CLASS. The market's framing (the float is the protection
 * somebody NEEDS; sellers price with the bond book's own arithmetic; cleared spread minus cash
 * OAS is the BASIS) stays documented at the market stage (07h); this module is the CONTRACT:
 * premium weekly, par-less-recovery on a credit event, terminated.
 *
 * strike: the spread struck, in bps of notional per year (rule 8). reference: the reference
 * COMPANY id — the same key the bond book prices. termKey: ''.
 */

import { DerivativeClassProfile } from '../profile';
import { issuerReferenceOf } from '../contract';
import { annuityFactor } from '../../pricing';

/**
 * The standard tenor. Five years is where single-name CDS liquidity actually sits, and a tenor
 * has to be SOME length for the premium leg to have a horizon; a market-convention primitive of
 * the same kind as the repo book's overnight default.
 */
export const CDS_TENOR_WEEKS = 5 * 52;

/**
 * The large-exposure limit: how much of its own capital a bank will carry against ONE name
 * before it has to lay the rest off. A real regulatory primitive (rule 2 allows those; the
 * leverage floor and risk weights sit beside it). It turns 09-concentration's measurement into
 * a decision: exposure above this is not a preference to hedge, it is a position the bank is
 * not allowed to keep.
 */
export const LARGE_EXPOSURE_LIMIT_OF_CAPITAL = 0.25;

/**
 * What a lender must lay off: the exposure to one name beyond what its capital lets it carry,
 * net of protection it has already bought. A measurement of the bank's own book, not a view.
 */
export function protectionNeedLocal(args: {
  exposureLocal: number;
  bankEquityLocal: number;
  alreadyHedgedLocal: number;
}): number {
  const carryableLocal = Math.max(0, args.bankEquityLocal) * LARGE_EXPOSURE_LIMIT_OF_CAPITAL;
  return Math.max(0, args.exposureLocal - carryableLocal - Math.max(0, args.alreadyHedgedLocal));
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
  /** §3.17-ii: the name's own weekly spread move on the protection's remaining life — the
   *  replacement value one session can move by (the same arithmetic as `closeOutUSDToB`). */
  closeOutMoveOf: (c, m) => {
    const bps = m.cdsSpreadWeeklyMoveBps(issuerReferenceOf(c));
    if (bps === undefined) return undefined;
    return (bps / 10000) * Math.max(0, c.maturityWeek - m.week) / 52;
  },
  /** The buyer pays the struck spread on the notional, weekly, for the life of the trade. */
  periodicLegUSDToB: (c) => ({
    usdToB: (c.notional * (c.strike / 10000)) / 52,
    reason: 'CDS premium',
  }),
  /**
   * §3.17-iii — PROTECTION HAS A MARK. Its value to the buyer is the spread it is paying against
   * the spread the name clears at today, on the notional, over the weeks left — a RISKY annuity:
   * discounted at the overnight rate and survival-weighted at the hazard the cleared spread
   * implies (`spread / (1 − recovery)`), because a premium leg the name does not survive to pay
   * is worth nothing. The lifecycle settles the change weekly; a name with no print does not mark.
   */
  markToMarketUSDToA: (c, m) => {
    const current = m.cdsSpreadBps(issuerReferenceOf(c));
    if (!Number.isFinite(current)) return null;
    const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
    if (remainingWeeks === 0) return 0;
    const recovery = Math.max(0, Math.min(1, m.recoveryRate(c.regionId)));
    const hazardWeekly = (Math.max(0, current) / 10000) / Math.max(1e-9, 1 - recovery) / 52;
    const rateWeekly = m.overnightRateAnnual(c.regionId) / 52;
    return (c.notional * (current - c.strike) / 10000 / 52) * annuityFactor(rateWeekly + hazardWeekly, remainingWeeks);
  },
  markReasonLive: 'CDS variation margin',
  markReasonFinal: 'CDS settled',
  /** A defaulted reference entity terminates the contract: the seller pays par less what the
   *  workout actually recovers (G5, §7.192), which is what makes buying protection worth it —
   *  §3.17-iii: less what variation margin has already paid the buyer on the way. */
  eventTermination: (c, m) => {
    if (!m.isIssuerDefaulted(issuerReferenceOf(c))) return null;
    const recovery = Math.max(0, Math.min(1, m.recoveryRate(c.regionId)));
    const payoutLocal = c.notional * Math.max(0, 1 - recovery) - (c.settledMarkLocal ?? 0);
    return { usdToB: -payoutLocal, reason: 'CDS credit event settled' };
  },
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};
