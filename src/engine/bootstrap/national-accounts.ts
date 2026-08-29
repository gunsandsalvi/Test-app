/**
 * National Accounts Identity
 *
 * The single owner of how this economy's output decomposes — on the income side into wages,
 * household capital income, government transfers and household taxes, and on the expenditure
 * side into C + I + G + NX. Both sides must describe the SAME economy: before this module
 * existed the two were derived independently (household income from an occupation wage table,
 * expenditure from separate component formulas), and they did not agree — measured at init,
 * household income came to 106.6% of output and bottom-up C+I+G+NX to 143% of it. That gap was
 * not "growth": the simulation spent its first weeks converging the level, and the first-year
 * growth formula annualized that transient into a ~110% headline GDP growth rate that then
 * poisoned the Taylor rule, the yield curve, FX and equity flows.
 *
 * The shares below are structural modeling primitives with real-world referents, not observed
 * data (see the no-real-world-data rule). Three are chosen; the fourth is what the accounting
 * identity then requires, and the fact that it lands inside its own realistic range is the
 * check that the other three are sane:
 *
 *   (1 - s)(1 - theta)(alpha + kappa + tr) + p*gs + i + nx = 1
 *
 * where s = household savings rate (0.065), gs = government spending share of output (0.36,
 * itself EFFECTIVE_TAX_RATE + FISCAL_DEFICIT_PCT_GDP), tr = (1 - p)*gs the transfer share, and
 * i (~0.076) and nx (~0) are the investment and net-export shares the firm and trade bootstraps
 * actually produce. Solving for theta gives 0.132 — an effective household tax rate in exactly
 * the band a real one occupies, and one implying households fund ~42% of government revenue
 * with corporate and other taxes covering the rest.
 *
 * Because i varies slightly by region (0.070-0.081 across the four), the expenditure identity
 * closes to within ~1% of output rather than exactly — a real statistical discrepancy, not a
 * defect. The INCOME identity, which is fully determined by these constants, is asserted exactly
 * at init by assertHouseholdIncomeIdentity below.
 *
 * **THIS FILE'S OWN EXIT CONDITION HAS BEEN MET AND IT HAS NOT EXITED.** The paragraph that
 * stood here said the constants are "replaced by the flows themselves" once households are real
 * agents with real payroll, taxes and transfer receipts. They are: HH closed (§7.60), and §7.96
 * made household income the measured sum of what employers actually pay. Yet
 * `computeHouseholdDisposableIncomeUSD` survives as the fallback, `assertHouseholdIncomeIdentity`
 * still ENFORCES these shares at startup, and `LABOR_SHARE_OF_OUTPUT` still sets the wage LEVEL
 * through `getBaseAnnualWageUSD`. So the measured sum and the identity coexist and disagree —
 * §6.1's household-income row. Retiring this module is that row's real content.
 */

/** Share of output paid out as wages — the labor share. */
export const LABOR_SHARE_OF_OUTPUT = 0.62;

/**
 * Share of output households receive as capital income (dividends, interest, rent). The rest of
 * capital income is retained by firms and funds investment, so this is well below (1 - labor share).
 */
export const HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT = 0.13;

/**
 * Household capital income per dollar of wages. Derived from the two shares above rather than
 * chosen independently, so that capital income tracks the real wage bill week to week while
 * still equaling HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT * output whenever wages are at their
 * structural share — which is exactly the state the bootstrap starts in.
 */
export const HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR =
  HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT / LABOR_SHARE_OF_OUTPUT;

/**
 * Share of government spending that buys real goods and services (the G in C+I+G+NX). The
 * remainder is transfer payments, which are NOT government purchases — they are household
 * income, and are spent (or saved) by households as part of C. Both the demand side
 * (03-category-demand.ts, which routes government purchases into real category bids) and the
 * expenditure identity (11-fiscal-and-sovereign-debt.ts) must use this one number: they used to
 * disagree, the demand side spending 35% of government outlays while the GDP identity counted
 * 100% of them.
 */
export const GOV_PROCUREMENT_SHARE_OF_SPENDING = 0.35;

/**
 * Effective tax rate on household gross income (wages + capital income + transfers). This is the
 * one share solved from the identity above rather than chosen; see the module header.
 */
export const HOUSEHOLD_EFFECTIVE_TAX_RATE = 0.1322;

/**
 * PUB1c — the two tax instruments the model had no base for, which is why real collections
 * covered only about half of what the government spent.
 *
 * Neither touches the identity above. **Employer payroll tax** is a cost to the FIRM, so it
 * reduces profit (and the corporate tax on it) without changing household disposable income.
 * **Consumption tax** is a wedge inside the household's consumption budget: disposable income is
 * unchanged and real purchases fall, which is exactly what a VAT does. So the identity assert
 * still holds while the revenue becomes real.
 */
export const EMPLOYER_PAYROLL_TAX_RATE = 0.0765;
export const CONSUMPTION_TAX_RATE = 0.10;

/**
 * Share of a lost wage that unemployment insurance replaces. A transfer-policy primitive; it
 * lived as a bare literal inside the weekly evolution before, where the cold-start bootstrap
 * could not see it.
 */
export const UNEMPLOYMENT_REPLACEMENT_RATE = 0.35;



/**
 * Household disposable income: the one definition used by both the cold-start bootstrap and the
 * weekly evolution, so the two can never drift apart. Every downstream consumer
 * (`Region.estimatedHouseholdIncomeUSD`) treats this figure as spendable, which is why it is
 * disposable (post-tax) rather than gross.
 *
 * Unemployment benefits are themselves government transfers, so they are counted inside the
 * transfer total rather than added on top of it: the government pays at least its standing
 * program budget, and pays more than that only when unemployment claims exceed the budget — a
 * real automatic stabilizer, and the reason this takes the larger of the two rather than summing
 * them (which would double-count benefits).
 */
/**
 * PUB1c — the labor share is TOTAL COMPENSATION, so the employer's payroll tax comes out of it
 * before households see a wage. Splits a wage bill into what the treasury gets and what is paid.
 */
export function splitWageBill(totalCompensationUSD: number): { grossWagesUSD: number; employerPayrollTaxUSD: number } {
  const grossWagesUSD = totalCompensationUSD / (1 + EMPLOYER_PAYROLL_TAX_RATE);
  return { grossWagesUSD, employerPayrollTaxUSD: totalCompensationUSD - grossWagesUSD };
}

export function computeHouseholdDisposableIncomeUSD(parts: {
  /** TOTAL COMPENSATION (the labor share). The employer payroll tax is split out inside, so
   * callers pass one number and cannot disagree about where the split happens. */
  wageIncomeUSD: number;
  /**
   * PUB3b: the government's REAL transfer obligation this week (unemployment benefits plus the
   * social/retirement program), from `governmentObligationsWeeklyUSD`. It used to be derived here
   * as a share of the spending budget — a second representation of a number the budget already
   * owned, and the reason the transfer line and the budget line could disagree.
   */
  transfersWeeklyUSD: number;
}): number {
  // Capital income is a share of OUTPUT, keyed off total compensation — it has nothing to do
  // with the payroll tax, and deriving it from post-tax wages shrank it by the payroll rate
  // (measured: the identity assert fired at 78.66% against a required 79.46%).
  const capitalIncomeUSD = parts.wageIncomeUSD * HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR;
  const { grossWagesUSD } = splitWageBill(parts.wageIncomeUSD);
  // PUB3b: the transfers households receive ARE the ones the government budgeted, annualised.
  // The `max(computedTransfers, unemploymentBenefits)` this replaces existed because neither
  // number was real; now unemployment benefits are one term INSIDE the obligation, so the
  // stabilizer is a sum rather than a comparison.
  const transfersUSD = Math.max(0, parts.transfersWeeklyUSD) * 52;
  const grossIncomeUSD = grossWagesUSD + capitalIncomeUSD + transfersUSD;
  return grossIncomeUSD * (1 - HOUSEHOLD_EFFECTIVE_TAX_RATE);
}

/**
 * Throws if the cold-start household income departs from what the shares above require. The
 * identity is fully determined at init — wages sit exactly at the labor share, transfers exactly
 * at the transfer share — so the only slack is the deliberate integer rounding in the inputs
 * (whole-dollar occupation wages, whole-person employment counts), worth a few parts per
 * hundred thousand. The tolerance below covers exactly that and nothing more: the bug this
 * guards against ran 0.21 of output wide, some three orders of magnitude outside it. It exists
 * so that a future change to any wage, occupation-mix or fiscal primitive that silently reopens
 * the 106.6%-of-output gap fails loudly at startup instead of surfacing weeks later as fake
 * growth.
 */
export function assertHouseholdIncomeIdentity(
  regionId: string,
  householdIncomeUSD: number,
  outputUSD: number,
  /**
   * PUB3b: the government's REAL weekly transfer obligation. It used to be re-derived here from
   * the spending budget and a procurement share — a third representation of a number the budget
   * owns, which is exactly what the assert exists to catch elsewhere.
   */
  transfersWeeklyUSD: number
): void {
  const transferShare = (Math.max(0, transfersWeeklyUSD) * 52) / outputUSD;
  // PUB1c: households receive the labor share NET of the employer's payroll tax.
  const expectedShare =
    (LABOR_SHARE_OF_OUTPUT / (1 + EMPLOYER_PAYROLL_TAX_RATE)
      + HOUSEHOLD_CAPITAL_INCOME_SHARE_OF_OUTPUT + transferShare) *
    (1 - HOUSEHOLD_EFFECTIVE_TAX_RATE);
  const actualShare = householdIncomeUSD / outputUSD;
  if (Math.abs(actualShare - expectedShare) > 1e-4) {
    throw new Error(
      `National accounts identity broken at init for region ${regionId}: household income is ` +
        `${(actualShare * 100).toFixed(4)}% of output but the income decomposition requires ` +
        `${(expectedShare * 100).toFixed(4)}%. Fix the wage/occupation/fiscal primitives that ` +
        `feed it — do not adjust this assertion.`
    );
  }
}

/**
 * The expenditure side of the identity: C + I + G + NX. One function so the cold-start bootstrap
 * and the weekly derivation in 11-fiscal-and-sovereign-debt.ts cannot compute "GDP" two
 * different ways — which is how the two sides came to disagree by 43% of output in the first
 * place.
 *
 * C is household disposable income net of saving; G counts government purchases only (transfers
 * reach GDP through C, see GOV_PROCUREMENT_SHARE_OF_SPENDING); I and NX are passed in as the
 * real figures their own subsystems produce.
 */
export function computeExpenditureGdpUSD(parts: {
  householdIncomeUSD: number;
  savingsRate: number;
  investmentUSD: number;
  /** PUB1e/PUB3b: G is the procurement the government REALLY bought, annualised. */
  governmentPurchasesUSD: number;
  netExportsUSD: number;
}): { consumptionUSD: number; governmentPurchasesUSD: number; gdpUSD: number } {
  const consumptionUSD = parts.householdIncomeUSD * (1 - parts.savingsRate);
  const governmentPurchasesUSD = parts.governmentPurchasesUSD;
  return {
    consumptionUSD,
    governmentPurchasesUSD,
    gdpUSD: consumptionUSD + parts.investmentUSD + governmentPurchasesUSD + parts.netExportsUSD,
  };
}
