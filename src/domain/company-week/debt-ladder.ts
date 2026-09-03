import { annuityFactor } from '../pricing';
/**
 * §5-STRUCT step 2 — A FIRM'S DEBT LADDER FOR ONE WEEK.
 *
 * Third object out of the ~1,900-line company kernel. What is here is the DECIDING: whether a call
 * is worth making, how much of it the firm can afford, and which paper is coming due. What stays
 * in the stage is the DOING: mutating tranches, posting cash, reaching holders through the
 * register. That split is the whole point — the decisions are testable and the effects have one
 * writer (§1.3).
 *
 * THE RULE THIS EXISTS TO PROTECT. An issuer used to call at PAR, for free, the moment rates moved
 * 1% its way — **an option no lender writes.** The real test is not "is the coupon above the
 * market": it is whether the present value of the saving over the paper's remaining life exceeds
 * what the call costs. That is also what a make-whole premium exists to neutralise: for an
 * investment-grade bond the premium IS the present value of the saving, so a purely rate-driven
 * call never clears the test and an IG issuer calls for a real reason instead.
 */

/** What one call would be worth, and what it would cost, per dollar of principal. */
export interface CallEconomics {
  /** Present value of the coupon saving over the remaining life, per dollar. */
  savingPvPerDollar: number;
  /** What the call option costs to exercise, per dollar, over par. */
  premiumPerDollar: number;
  /** The saving clears the premium AND is large enough to be worth the transaction. */
  isAccretive: boolean;
}

/** A coupon saving is worth its present value over the paper's remaining life, not its face. */
export function callSavingPvPerDollar(
  rateSavingAnnual: number,
  remainingYears: number,
  discountRate: number
): number {
  return rateSavingAnnual * annuityFactor(discountRate, Math.max(0, remainingYears));
}

/**
 * Is this call worth making? Both halves must hold: the present value must beat the premium, AND
 * the rate saving must be material — a treasurer does not run a refinancing for a basis point.
 */
export function callEconomics(i: {
  couponRate: number | undefined;
  currentFairRate: number;
  remainingYears: number;
  premiumPerDollar: number;
  /** Below this, the saving is not worth the transaction whatever the arithmetic says. */
  materialSavingAnnual: number;
}): CallEconomics {
  // A floating tranche carries a margin rather than a coupon; there is nothing to refinance INTO a
  // lower fixed rate, so its saving is zero rather than NaN.
  const rateSavingAnnual = (i.couponRate ?? i.currentFairRate) - i.currentFairRate;
  const savingPvPerDollar = callSavingPvPerDollar(rateSavingAnnual, i.remainingYears, i.currentFairRate);
  return {
    savingPvPerDollar,
    premiumPerDollar: i.premiumPerDollar,
    isAccretive: savingPvPerDollar > i.premiumPerDollar && rateSavingAnnual > i.materialSavingAnnual,
  };
}

/**
 * How much of a tranche the firm can actually call. **Cash has to cover the premium too**, so the
 * callable size is smaller than the free version — the detail that separates a real call from an
 * accounting one.
 */
export function callableAmountUSD(i: {
  tranchePrincipalUSD: number;
  cashUSD: number;
  cashFloorUSD: number;
  premiumPerDollar: number;
}): number {
  const budgetUSD = i.cashUSD - i.cashFloorUSD;
  if (!(budgetUSD > 0)) return 0;
  return Math.max(0, Math.min(i.tranchePrincipalUSD, budgetUSD / (1 + i.premiumPerDollar)));
}

/** The paper coming due inside a window — what has to be refinanced or repaid. */
export function tranchesDueWithin<T extends { maturityWeek?: number; principalUSD: number }>(
  tranches: T[],
  week: number,
  withinWeeks: number
): T[] {
  return tranches.filter((t) => (t.maturityWeek ?? Infinity) - week <= withinWeeks);
}

/** A ladder carries no zero rungs: a tranche repaid to nothing is gone, not a row of zeroes. */
export function dropExhausted<T extends { principalUSD: number }>(tranches: T[], dustUSD = 1): T[] {
  return tranches.filter((t) => t.principalUSD > dustUSD);
}
