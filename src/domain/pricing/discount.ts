/**
 * THE TIME VALUE OF MONEY, IN ONE PLACE.
 *
 * Three formulas were written out by hand in eight modules — the discount factor, the annuity it
 * implies, and the level payment that amortises a loan. Each copy chose its own variable names
 * and its own edge cases, and a reader had to prove to themselves that `rWeekly / (1 - (1 +
 * rWeekly) ** -n)` in three files was the same number. It is. They live here now.
 *
 * **The convention is DISCRETE compounding at the period's own rate**, because every cash flow in
 * this model is dated in weeks and paid periodically: a coupon is due on a date, not accrued
 * continuously. The one holdout is `engine/nelsonSiegel.ts`, whose `calculateDiscountFactor` uses
 * `exp(-z·t)` — a fitting module that also prices. Unifying it moves every sovereign price, so it
 * belongs in the same commit as step 13's sovereign pricing rather than ahead of it.
 *
 * Rates are ANNUAL DECIMALS unless the argument says otherwise, and a period rate is the rate for
 * ONE period (rule 8: periodicity is part of the number).
 */

/** What one unit of money at `periods` from now is worth today, at `ratePerPeriod`. */
export function discountFactor(ratePerPeriod: number, periods: number): number {
  if (!(periods > 0)) return 1;
  return Math.pow(1 + ratePerPeriod, -periods);
}

/**
 * The present value of ONE unit paid each period for `periods` periods. At a zero rate every
 * payment is worth its face, so the factor is the count — the limit the closed form cannot take.
 */
export function annuityFactor(ratePerPeriod: number, periods: number): number {
  if (!(periods > 0)) return 0;
  if (Math.abs(ratePerPeriod) < 1e-12) return periods;
  return (1 - discountFactor(ratePerPeriod, periods)) / ratePerPeriod;
}

/**
 * The payment, per unit of principal, that amortises a loan over `periods` at `ratePerPeriod` —
 * the reciprocal of the annuity above. At a zero rate it is principal split evenly.
 */
export function levelPaymentFactor(ratePerPeriod: number, periods: number): number {
  if (!(periods > 0)) return 0;
  const a = annuityFactor(ratePerPeriod, periods);
  return a > 0 ? 1 / a : 0;
}

/**
 * A bond's price per unit of FACE: its coupons discounted, plus what it redeems at, discounted.
 * `couponPerPeriod` and `ratePerPeriod` are in the SAME period as `periods` — annual coupons
 * against an annual rate over years, or weekly against weekly over weeks.
 */
export function presentValuePerFace(args: {
  couponPerPeriod: number;
  periods: number;
  ratePerPeriod: number;
  redemptionPerFace: number;
}): number {
  const { couponPerPeriod, periods, ratePerPeriod, redemptionPerFace } = args;
  return couponPerPeriod * annuityFactor(ratePerPeriod, periods)
    + redemptionPerFace * discountFactor(ratePerPeriod, periods);
}
