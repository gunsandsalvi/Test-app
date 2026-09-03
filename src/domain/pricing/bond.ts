/**
 * PRICE FROM SPREAD, AND SPREAD FROM PRICE — the pair step 13 is built on.
 *
 * The books clear a SPREAD (an OAS on a bond, a discount margin on a loan). The register holds
 * FACE. A holding is worth price × face, and the price is what the cleared spread implies once
 * the paper's own cash flows are discounted — not 1.00 for everything, which is what
 * `holdings-ledger.ts` returns today and what makes credit trade at par whatever the market said.
 *
 * The two directions are one function and its inverse, solved rather than approximated, so a
 * price fed back through gives the spread it came from. Nothing here reads the world: it takes
 * cash flows and a curve, which is what makes it testable and what keeps the pricing out of the
 * stages.
 */
import { discountFactor } from './discount';

/** The cleared zero curve, at the tenors the books actually strike. */
export interface ZeroCurve {
  tenor3M: number;
  tenor2Y: number;
  tenor5Y: number;
  tenor10Y: number;
  tenor30Y: number;
}

const CURVE_POINTS: { years: number; key: keyof ZeroCurve }[] = [
  { years: 0.25, key: 'tenor3M' }, { years: 2, key: 'tenor2Y' }, { years: 5, key: 'tenor5Y' },
  { years: 10, key: 'tenor10Y' }, { years: 30, key: 'tenor30Y' },
];

/**
 * The zero rate at any horizon: linear between the struck tenors, flat outside them. Flat rather
 * than extrapolated on purpose — a curve says nothing about 40 years and inventing a slope there
 * would be a number with no market behind it.
 */
export function zeroRateAt(curve: ZeroCurve, years: number): number {
  const t = Math.max(0, years);
  if (t <= CURVE_POINTS[0].years) return curve[CURVE_POINTS[0].key];
  for (let i = 1; i < CURVE_POINTS.length; i++) {
    const hi = CURVE_POINTS[i], lo = CURVE_POINTS[i - 1];
    if (t <= hi.years) {
      const w = (t - lo.years) / (hi.years - lo.years);
      return curve[lo.key] + w * (curve[hi.key] - curve[lo.key]);
    }
  }
  return curve[CURVE_POINTS[CURVE_POINTS.length - 1].key];
}

/** What a piece of paper pays and when, in the paper's own terms. */
export interface PaperTerms {
  /** The annual coupon as a decimal of face. A floater's is its reference plus its margin. */
  annualCouponRate: number;
  /** Weeks between coupons; the whole remaining life for paper that pays once, at maturity. */
  periodWeeks: number;
  /** Weeks until it redeems. Zero or less is matured paper, worth its face. */
  weeksToMaturity: number;
}

/** The remaining coupon dates, in years from now, and the periods they represent. */
function scheduleOf(terms: PaperTerms): { periods: number; periodYears: number; couponPerPeriod: number } {
  const periodWeeks = Math.max(1, terms.periodWeeks);
  const periods = Math.max(0, Math.floor(terms.weeksToMaturity / periodWeeks));
  return {
    periods,
    periodYears: periodWeeks / 52,
    couponPerPeriod: (terms.annualCouponRate * periodWeeks) / 52,
  };
}

/**
 * Price per unit of face at a given spread over the curve.
 *
 * EVERY CASH FLOW IS DISCOUNTED AT ITS OWN TENOR — the curve's rate where that payment lands,
 * plus the spread. Discounting the whole schedule at one rate is the shortcut, and it misprices
 * exactly when the curve has shape, which is the case the curve exists to describe. That is what
 * an OAS is: ONE spread over the WHOLE curve, not a spread over a single point on it.
 */
export function priceFromSpreadBps(terms: PaperTerms, curve: ZeroCurve, spreadBps: number): number {
  if (!(terms.weeksToMaturity > 0)) return 1;
  const years = terms.weeksToMaturity / 52;
  const { periods, couponPerPeriod } = scheduleOf(terms);
  const spread = spreadBps / 10000;
  const dfAt = (t: number): number => {
    const rate = zeroRateAt(curve, t) + spread;
    // A rate at or below −100% a year has no discount factor; that is a bad input, not a price.
    return rate <= -1 ? 0 : discountFactor(rate, t);
  };
  if (periods === 0) {
    // Paper that redeems before its next coupon date: one payment, face plus what it accrued.
    return (1 + terms.annualCouponRate * years) * dfAt(years);
  }
  // Coupons land on the schedule counting BACK from maturity, so the last one is at maturity.
  let pv = 0;
  const periodYears = Math.max(1, terms.periodWeeks) / 52;
  for (let i = 1; i <= periods; i++) {
    const t = years - (periods - i) * periodYears;
    if (t <= 0) continue;
    pv += couponPerPeriod * dfAt(t);
  }
  return pv + dfAt(years);
}

/**
 * The spread a price implies, solved by bisection over the range the clearing engine itself
 * quotes. Price falls monotonically in spread, so a bisection converges and cannot land on the
 * wrong root. Returns the bracket end when the price is outside what any spread can produce —
 * the caller decides whether that is a print or an untraded book (rule 1).
 */
export function spreadBpsFromPrice(terms: PaperTerms, curve: ZeroCurve, price: number): number {
  let lo = -2000, hi = 100000;
  if (price >= priceFromSpreadBps(terms, curve, lo)) return lo;
  if (price <= priceFromSpreadBps(terms, curve, hi)) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (priceFromSpreadBps(terms, curve, mid) > price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
