/**
 * §5-STRUCT step 2 — WHAT A FIRM PAYS ITS PEOPLE.
 *
 * Seventh and last of the objects this pass takes out of the company kernel.
 *
 * WHY THE DEVIATION AND NOT THE LEVEL. A stated EBITDA margin already contains a baseline wage
 * bill, so charging the whole payroll against it again counts labour twice. Only the DEVIATION
 * from baseline adjusts a stated margin — and a profile with no stated margin (the carrier)
 * charges its payroll in full instead. That is the cost-shape choice a profile exists to make, and
 * it is why this returns both figures rather than one.
 *
 * WHAT ITS ABSENCE COST, because it is the largest measured defect in the file's history (§7.115):
 * the listing branch skipped payroll entirely, so **1,712 private firms employing 8.20M people
 * paid no wages at all — 67% of the USA's named wage bill never reached a household.** One payroll,
 * one owner, one representation, and the deviation rule written down where it can be tested.
 */

export interface PayrollWeek {
  /** What the firm actually owes its staff this week, at its own offered wage. */
  weeklyUSD: number;
  /** What a firm of this shape owed at the baseline wage — the figure a stated margin contains. */
  baselineWeeklyUSD: number;
  /** The part a stated margin has NOT already accounted for, annualised. */
  aboveBaselineAnnualUSD: number;
}

/**
 * Both figures and their difference, from a wage-bill function the caller supplies. The function
 * is injected rather than imported so this stays pure and testable: the wage bill depends on
 * occupation pools that only the engine has, and the RULE here is the deviation, not the bill.
 */
export function payrollWeek(i: {
  weeklyUSD: number;
  baselineWeeklyUSD: number;
}): PayrollWeek {
  return {
    weeklyUSD: i.weeklyUSD,
    baselineWeeklyUSD: i.baselineWeeklyUSD,
    aboveBaselineAnnualUSD: (i.weeklyUSD - i.baselineWeeklyUSD) * 52,
  };
}

/**
 * What a headcount change costs or saves, annualised at the firm's own wage. Used by the labour
 * rule to price a hiring or shedding decision against earnings rather than against a stated
 * multiple — the link that makes a wage a PRICE rather than a charge.
 */
export function headcountCostDeltaAnnualUSD(
  weeklyPayrollUSD: number,
  currentHeadcount: number,
  headcountDelta: number
): number {
  if (!(currentHeadcount > 0)) return 0;
  return (weeklyPayrollUSD / currentHeadcount) * headcountDelta * 52;
}
