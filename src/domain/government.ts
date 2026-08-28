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
 * budget, splitting by the same procurement share the national accounts already use. This is
 * what makes rising debt and rising rates crowd out procurement and transfers — and why interest
 * must NOT be added on top of the deficit, which would double-count it (a real fiscal deficit
 * already includes interest).
 *
 * `primaryShare` floors at zero: a government whose interest bill exceeds its whole budget
 * borrows the difference. That is a debt spiral, and it is allowed to happen.
 */
export function decomposeGovernmentSpending(
  spendingWeeklyUSD: number,
  interestWeeklyUSD: number,
  procurementShare: number
): { interestUSD: number; procurementUSD: number; transfersUSD: number } {
  const interestUSD = Math.max(0, interestWeeklyUSD);
  const primaryUSD = Math.max(0, spendingWeeklyUSD - interestUSD);
  return {
    interestUSD,
    procurementUSD: primaryUSD * procurementShare,
    transfersUSD: primaryUSD * (1 - procurementShare),
  };
}
