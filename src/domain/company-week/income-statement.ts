/**
 * §5-STRUCT step 2 — A FIRM'S INCOME STATEMENT FOR ONE WEEK.
 *
 * Fourth object out of the company kernel, and the smallest — which is the point. Four lines of
 * arithmetic that every firm in the model runs, written twice inline (once for the profile path,
 * once for the industrial path) with the tax treatment differing between them for no stated reason.
 * A rule written twice is a rule that will diverge.
 *
 * THE ASYMMETRY IS CLOSED (decided 2026-08-31, §4.0 Tier 1 item 8): **a loss is not taxed and is
 * not rebated.** The industrial path used to apply `(1 - taxRate)` to a negative pre-tax figure —
 * a rebate no firm receives in cash, flattering every distressed industrial company by the tax
 * rate — and floored EBIT at $1 besides, so no operating loss could reach coverage, the default
 * trigger, the rating, or the tax line. Both are gone: one rule, the profile path's, for every
 * firm. The genuinely real version of loss relief — carry-forwards against future profits — is
 * TAXR's charter, not a flag here.
 */

export interface IncomeStatement {
  ebitdaUSD: number;
  ebitUSD: number;
  netIncomeUSD: number;
  epsUSD: number;
}

/**
 * One tax rule for every firm: tax applies when operations earn (EBIT > 0); a loss is carried at
 * its full size. NOTE THE GUARD IS ON **EBIT**, NOT ON PRE-TAX INCOME — the two differ for a firm
 * whose operations earn but whose interest bill exceeds them (EBIT positive, pre-tax negative:
 * the classic over-levered but operationally sound company, a large share of the distressed set).
 * That is the profile path's long-standing convention, kept deliberately; changing the guard
 * basis is a modelling decision for TAXR, not a cleanup.
 */
export function netIncomeUSD(
  ebitUSD: number,
  annualInterestUSD: number,
  taxRate: number
): number {
  const preTax = ebitUSD - annualInterestUSD;
  if (ebitUSD > 0) return preTax * (1 - taxRate);
  return preTax;
}

/**
 * The industrial path: EBITDA is revenue at the firm's own margin, D&A comes off it, and interest
 * and tax come off that. EBIT is unfloored — an operating loss exists and reaches coverage, the
 * default trigger, the rating and the tax rule above, which is the whole point of measuring it.
 */
export function industrialIncome(i: {
  revenueUSD: number;
  ebitdaMargin: number;
  daShareOfRevenue: number;
  annualInterestUSD: number;
  taxRate: number;
  sharesOutstanding: number;
}): IncomeStatement {
  const ebitdaUSD = i.revenueUSD * i.ebitdaMargin;
  const daUSD = i.revenueUSD * i.daShareOfRevenue;
  const ebitUSD = ebitdaUSD - daUSD;
  const net = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate);
  return {
    ebitdaUSD,
    ebitUSD,
    netIncomeUSD: net,
    epsUSD: i.sharesOutstanding > 0 ? net / i.sharesOutstanding : 0,
  };
}

/**
 * The profile path: revenue plus whatever the profile module says the firm's other income is,
 * less its three cost lines, less straight-line depreciation on gross PP&E — a bank's or an
 * insurer's shape, where the margin is not a stated ratio and the firm knows exactly what
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
  const net = netIncomeUSD(ebitUSD, i.annualInterestUSD, i.taxRate);
  return {
    ebitdaUSD,
    ebitUSD,
    netIncomeUSD: net,
    epsUSD: i.sharesOutstanding > 0 ? net / i.sharesOutstanding : 0,
  };
}
