/**
 * WHAT A UNIT OF FACE FETCHES — the one read, so the mark and the check that tests the mark
 * cannot disagree about what the price is.
 *
 * A tranche's price comes from its OWN cash flows discounted at its region's cleared curve plus
 * the spread its own book cleared: the issuer's OAS for a fixed-rate bond, its discount margin
 * for a floater. Returns undefined for paper it cannot price rather than guessing — a caller
 * leaves such a row alone, and the audit counts it.
 */
import { priceFromSpreadBps, ZeroCurve } from './bond';

/** The terms and the cleared spread, as the caller reads them off whatever store it has. */
export interface ClearedPaper {
  isFloating: boolean;
  /** FIXED: the locked coupon. FLOATING: the locked margin over the reference, in bps. */
  couponRate: number;
  floatingMarginBps: number;
  /** Paper that pays once at maturity (commercial paper) rather than on a coupon period. */
  paysOnlyAtMaturity: boolean;
  weeksToMaturity: number;
  /** The reference the floater resets against. */
  policyRate: number;
  /** What that paper's own book cleared: an OAS for a bond, a discount margin for a loan. */
  clearedSpreadBps: number;
}

/** The standard coupon period for paper that pays more than once. */
export const COUPON_PERIOD_WEEKS = 26;

export function pricePerFace(paper: ClearedPaper, curve: ZeroCurve): number | undefined {
  if (!(paper.weeksToMaturity > 0)) return 1;
  const annualCouponRate = paper.isFloating
    ? paper.policyRate + paper.floatingMarginBps / 10000
    : paper.couponRate;
  const periodWeeks = paper.paysOnlyAtMaturity
    ? Math.max(1, paper.weeksToMaturity)
    : COUPON_PERIOD_WEEKS;
  const price = priceFromSpreadBps({ annualCouponRate, periodWeeks, weeksToMaturity: paper.weeksToMaturity },
    curve, paper.clearedSpreadBps);
  return price > 0 && isFinite(price) ? price : undefined;
}
