/**
 * PUB1 — the government as a real counterparty.
 *
 * Before this, a sovereign tranche's `couponRate` was stored and paid by nobody: the government
 * booked no interest expense at all, while banks and money funds were credited carry on the same
 * paper. One side of a real flow.
 */

import { GovDebtTranche } from './region-macro';

/**
 * Weighted-average coupon per tenor bucket. Holders own buckets, not individual tranches
 * (07c clears the curve at seven points), so this is the rate a bucket's holders are paid at.
 */
export function sovereignCouponByBucket(
  tranches: GovDebtTranche[] | undefined,
  bucketKey: (tenorYears: number) => string
): Record<string, number> {
  const principal: Record<string, number> = {};
  const weighted: Record<string, number> = {};
  (tranches ?? []).forEach((t) => {
    const k = bucketKey(t.tenorAtIssuanceYears);
    principal[k] = (principal[k] ?? 0) + t.principalUSD;
    weighted[k] = (weighted[k] ?? 0) + t.principalUSD * (t.couponRate ?? 0);
  });
  const out: Record<string, number> = {};
  Object.keys(principal).forEach((k) => {
    out[k] = principal[k] > 0 ? weighted[k] / principal[k] : 0;
  });
  return out;
}

/** What the whole stack costs this week — the government's real interest expense. */
export function weeklyInterestExpenseUSD(tranches: GovDebtTranche[] | undefined): number {
  return (tranches ?? []).reduce((a, t) => a + (t.principalUSD * (t.couponRate ?? 0)) / 52, 0);
}

/**
 * PUB1's decomposition: `spending = interest + procurement + transfers`.
 *
 * Interest is a contractual claim and comes off the top; what remains is the discretionary
 * budget, splitting by the same procurement share the national accounts use. This is what makes
 * rising debt and rising rates crowd out procurement and transfers — and why interest must NOT
 * be added on top of the deficit, which already includes it.
 *
 * PUB1e: the FISCAL STANCE belongs here, applied to the procurement line only. A stimulus buys
 * more goods; it does not raise the transfer schedule, which is set by program rules. It used to
 * be applied in the demand stage alone, so the goods market bid for a stimulus the treasury's
 * account never paid for.
 *
 * `primaryShare` floors at zero: a government whose interest bill exceeds its whole budget
 * borrows the difference. That is a debt spiral, and it is allowed to happen.
 */
export function decomposeGovernmentSpending(
  spendingWeeklyUSD: number,
  interestWeeklyUSD: number,
  procurementShare: number,
  fiscalStanceScore: number = 0,
  /** PUB3: what the government owes its own staff this week — real headcount x real wages. */
  payrollWeeklyUSD: number = 0
): { interestUSD: number; payrollUSD: number; procurementBudgetUSD: number; transfersUSD: number } {
  const interestUSD = Math.max(0, interestWeeklyUSD);
  const payrollUSD = Math.max(0, payrollWeeklyUSD);
  // Payroll is contractual like interest: it comes off the top, and what is left is the
  // discretionary budget. A government facing a rising wage bill cuts programs, not salaries.
  const primaryUSD = Math.max(0, spendingWeeklyUSD - interestUSD - payrollUSD);
  return {
    interestUSD,
    payrollUSD,
    procurementBudgetUSD: primaryUSD * procurementShare * (1 + fiscalStanceScore * FISCAL_STANCE_PROCUREMENT_SENSITIVITY),
    transfersUSD: primaryUSD * (1 - procurementShare),
  };
}

/**
 * PUB3 — what the government owes its own employees, weekly.
 *
 * The defect this closes: government employees occupy real jobs in the labor market (they are in
 * the occupation pools, 14.3% of employment) and earn real wages inside the labor share — so
 * households receive the money — but NO EMPLOYER EVER PAID IT. The budget had no compensation
 * line at all. Measured at seed: 1.65M USA staff, 8.1% of GDP, entirely unpaid.
 *
 * Worse than a missing leg: because the wages were already in household income via the labor
 * share, and the transfer envelope was sized as the whole primary budget, households were
 * credited the same ~8% of output TWICE — once as wages and once inside transfers. Carving
 * payroll out of the primary budget removes that double count; it does not take income away
 * that anyone was really owed.
 *
 * Real national accounts split a ~36%-of-GDP state as compensation ~8% + purchases ~11% +
 * transfers ~13% + interest ~4%. This is the compensation line.
 */
export function governmentPayrollWeeklyUSD(args: {
  governmentEmployment: number;
  /** Structural base wage per occupation (annual), before the market's own wage index. */
  baseAnnualWageUSD: Record<string, number>;
  /** The pools' live wage indexes — so a tight labor market raises the government's bill too. */
  wageIndexByOccupation: Record<string, number>;
  /** What the government employs, from GOVERNMENT_OCCUPATION_MIX. */
  occupationMix: Partial<Record<string, number>>;
}): number {
  const annualPerHead = Object.entries(args.occupationMix).reduce(
    (a, [occ, share]) =>
      a + (args.baseAnnualWageUSD[occ] ?? 0) * (args.wageIndexByOccupation[occ] ?? 1) * (share ?? 0),
    0
  );
  return (Math.max(0, args.governmentEmployment) * annualPerHead) / 52;
}

/** How far a full stimulus (stance 1.0) lifts the procurement line above its structural share. */
export const FISCAL_STANCE_PROCUREMENT_SENSITIVITY = 0.25;

/**
 * What actually left the treasury's account this week. PUB1e: procurement is the amount the
 * government's bids REALLY filled in the goods market, not what it budgeted — a government that
 * cannot buy what it planned to buy has not spent the money. The difference is unspent budget,
 * and it is named rather than assumed away.
 */
export function governmentOutlaysUSD(parts: {
  interestUSD: number;
  /** PUB3: staff are paid in full — a government does not skip payroll. */
  payrollUSD: number;
  transfersUSD: number;
  procurementSpentUSD: number;
}): number {
  return parts.interestUSD + parts.payrollUSD + parts.transfersUSD + parts.procurementSpentUSD;
}

/**
 * How far above last week's price the government will still buy. PUB1e.
 *
 * Procurement is contracted to a program requirement, so a government is far less price-elastic
 * than a household — whose willingness to pay tops out near 1.9% over (HOUSEHOLD_BID_BASE_PREMIUM
 * by tier). It is not unbounded: a real agency re-tenders rather than pay any price.
 *
 * The REAL constraint is the appropriated dollar budget, which is why this is a tolerance and not
 * a size. A fixed budget meeting a rising price buys fewer units, so inflation erodes real
 * government purchases on its own — the mechanism the old flat +10% cap was crudely standing in
 * for by excluding the government outright from any category that moved more than 10% in a week.
 *
 * Measured: unspent budget falls 0.81B -> 0.36B (w20) as the tolerance goes +10% -> +50%, and
 * stops moving after that. What remains is the goods market's own excess demand rationing every
 * bidder pro-rata, which no willingness to pay can fix.
 */
export const GOVERNMENT_BID_PRICE_TOLERANCE = 0.50;
