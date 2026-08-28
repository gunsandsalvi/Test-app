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
  fiscalStanceScore: number = 0
): { interestUSD: number; procurementBudgetUSD: number; transfersUSD: number } {
  const interestUSD = Math.max(0, interestWeeklyUSD);
  const primaryUSD = Math.max(0, spendingWeeklyUSD - interestUSD);
  return {
    interestUSD,
    procurementBudgetUSD: primaryUSD * procurementShare * (1 + fiscalStanceScore * FISCAL_STANCE_PROCUREMENT_SENSITIVITY),
    transfersUSD: primaryUSD * (1 - procurementShare),
  };
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
  transfersUSD: number;
  procurementSpentUSD: number;
}): number {
  return parts.interestUSD + parts.transfersUSD + parts.procurementSpentUSD;
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
