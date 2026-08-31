/**
 * §5-STRUCT step 2 — A FIRM'S INCOME STATEMENT FOR ONE WEEK.
 *
 * Fourth object out of the company kernel, and the smallest — which is the point. Four lines of
 * arithmetic that every firm in the model runs, written twice inline (once for the profile path,
 * once for the industrial path) with the tax treatment differing between them for no stated reason.
 * A rule written twice is a rule that will diverge.
 *
 * THE ASYMMETRY THAT MATTERS, and it was only in one of the two copies: **a loss is not taxed.**
 * `(ebit - interest) * (1 - taxRate)` applied to a negative EBIT hands the firm a tax REBATE it
 * never receives, which flatters every distressed company in the model by the tax rate. The profile
 * path guarded it (`newEbit > 0 ? (1 - taxRate) : 1`); the industrial path did not. One function
 * now, and the guard is in it.
 */

export interface IncomeStatement {
  ebitdaUSD: number;
  ebitUSD: number;
  netIncomeUSD: number;
  epsUSD: number;
}

/**
 * §6.1 — **THE TWO PATHS TAX A LOSS DIFFERENTLY, AND THAT IS A DEFECT, NOT A DESIGN.**
 *
 * The profile path guarded it (`ebit > 0 ? (1 - taxRate) : 1`) and the industrial path did not, so
 * an industrial firm with a pre-tax loss receives a tax REBATE it never gets in cash — every
 * distressed industrial company in the model is flattered by the tax rate, and the distressed ones
 * are exactly the firms whose defaults §5-G5 was trying to get right.
 *
 * It is preserved here rather than fixed because fixing it changes the world, and that is the
 * user's call, not a refactor's (§1.20 cuts both ways: do not roll a derivation back for a bad
 * print, and do not slip a new one in under cover of a refactor). `taxesLosses` names which
 * behaviour the caller wants, and both call sites keep the one they had.
 */
export function netIncomeUSD(
  ebitUSD: number,
  annualInterestUSD: number,
  taxRate: number,
  taxesLosses: boolean
): number {
  const preTax = ebitUSD - annualInterestUSD;
  // NOTE THE GUARD IS ON **EBIT**, NOT ON PRE-TAX INCOME, and that is what the profile path has
  // always done. The two are different for a firm whose operations earn but whose interest bill
  // exceeds them: EBIT positive, pre-tax negative — the classic over-levered but operationally
  // sound company, which is a large share of the distressed set. Guarding on pre-tax instead
  // changed the world, and the three-week fingerprint caught it; the difference is recorded here
  // rather than corrected, because it is a modelling choice and not a typo.
  if (taxesLosses || ebitUSD > 0) return preTax * (1 - taxRate);
  return preTax;
}

/**
 * The industrial path: EBITDA is revenue at the firm's own margin, D&A comes off it, and interest
 * and tax come off that. `ebitFloorUSD` exists because the margin already carries the full wage
 * bill (IND3) and the caller floors EBIT at 1 — it is passed rather than assumed so that the floor
 * is visible at the call site rather than buried here.
 */
export function industrialIncome(i: {
  revenueUSD: number;
  ebitdaMargin: number;
  daShareOfRevenue: number;
  annualInterestUSD: number;
  taxRate: number;
  sharesOutstanding: number;
  ebitFloorUSD: number;
  /** See `netIncomeUSD`: the industrial path currently rebates losses. */
  taxesLosses: boolean;
}): IncomeStatement {
  const ebitdaUSD = i.revenueUSD * i.ebitdaMargin;
  const daUSD = i.revenueUSD * i.daShareOfRevenue;
  const ebitUSD = Math.max(i.ebitFloorUSD, ebitdaUSD - daUSD);
  const net = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate, i.taxesLosses);
  return {
    ebitdaUSD,
    ebitUSD,
    netIncomeUSD: net,
    epsUSD: i.sharesOutstanding > 0 ? net / i.sharesOutstanding : 0,
  };
}

/**
 * The profile path (bank, insurer, asset manager, carrier): the profile states revenue and its own
 * costs, and D&A is a share of the PLANT rather than of revenue — a bank's depreciation has nothing
 * to do with its interest income.
 */
export function profileIncome(i: {
  revenueUSD: number;
  otherIncomeAnnualUSD: number;
  /** The three cost lines are separate, and they are subtracted in THIS ORDER, because floating
   *  point addition is not associative: folding them into one `operatingCosts` argument changed
   *  the world at the third decimal and the three-week fingerprint caught it. An extraction that
   *  reorders arithmetic is not a refactor. */
  inputCostAnnualUSD: number;
  payrollAnnualUSD: number;
  profileCostsAnnualUSD: number;
  grossPPEUSD: number;
  ppeDepreciationYears: number;
  annualInterestUSD: number;
  taxRate: number;
  sharesOutstanding: number;
}): IncomeStatement {
  const ebitdaUSD = i.revenueUSD + i.otherIncomeAnnualUSD
    - i.inputCostAnnualUSD - i.payrollAnnualUSD - i.profileCostsAnnualUSD;
  const ebitUSD = ebitdaUSD - i.grossPPEUSD / Math.max(1, i.ppeDepreciationYears);
  // The profile path has always refused to rebate a loss, and it is the correct half.
  const net = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate, false);
  return {
    ebitdaUSD,
    ebitUSD,
    netIncomeUSD: net,
    epsUSD: i.sharesOutstanding > 0 ? net / i.sharesOutstanding : 0,
  };
}
