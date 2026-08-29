/**
 * SEG-D — the SME pools' own week: a measured P&L, and development that reads it.
 *
 * A pool is the mass of firms below naming resolution in one registry industry. Everything it
 * does is already a real payment through the settlement layer, so this stage does not compute
 * its economics — it MEASURES them from what the pool actually paid and was paid, and lets the
 * pool's size, margin, investment and distress follow from that.
 *
 * What this replaces (§5-SEG): revenue that walked by `demandSignal x 0.06`, employment by
 * `x 0.05`, both clamped to +/-4% a week, off a hand-written map from five buckets to a few
 * category growth rates. That is an outcome imposed by formula (rule 13), and because every
 * bucket got the same treatment and nothing reallocated between them, the tier's composition
 * could never change. Here a pool that sells more earns more, hires more and invests more; one
 * whose costs outrun its receipts runs its cash down and sheds staff — the same cash-exhaustion
 * shape a named firm has.
 *
 * Runs directly after settlement, which is where the week's pool flows land.
 */

import { RegionId } from '../../../types';
import { WeeklyStepContext } from './context';

/**
 * How fast a measured margin is allowed to move the pool's carried margin. A week of receipts is
 * noisy — a pool that happened to clear little this week has not become unprofitable — so the
 * carried margin is an exponential average of what it measurably earned, the same way a firm's
 * reported margin is a quarter of trading rather than a day of it.
 */
const MARGIN_MEASUREMENT_WEIGHT = 0.08;

/** Weeks of wages a pool wants in the bank. Below this it is cash-constrained and behaves like
 *  it: investment first, then headcount. Small firms really do run on a few weeks of payroll. */
const TARGET_CASH_WEEKS_OF_WAGES = 6;

/** The share of revenue a pool invests when it is not cash-constrained. */
const TARGET_CAPEX_TO_REVENUE = 0.05;

export function runSmePoolStage(ctx: WeeklyStepContext): void {
  const flows = ctx.lastSettlementReport?.smePoolFlowsByPool;
  if (!flows) return;

  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    (reg?.smePools || []).forEach((pool) => {
      const byReason = flows.get(`${regionId}:${pool.industry}`);

      // ---- 1. The week's measured P&L. Receipts are what the pool was paid; costs are what it
      // paid out, excluding the two flows that are not costs: borrowed money arriving, and
      // capital leaving with a firm that was born out of the pool. ----
      let receiptsUSD = 0;
      let operatingCostUSD = 0;
      byReason?.forEach((amountUSD, reason) => {
        if (reason.includes('origination') || reason.includes('firm birth')) return;
        if (amountUSD > 0) receiptsUSD += amountUSD;
        else operatingCostUSD += -amountUSD;
      });

      // ---- 2. Margin, measured. A pool that cannot cover its wage bill out of its receipts is
      // making a loss, and the number says so — there is no reversion to a "realistic baseline"
      // pulling it back, which is what the old formula did. ----
      if (receiptsUSD > 0) {
        const measuredMargin = (receiptsUSD - operatingCostUSD) / receiptsUSD;
        pool.marginPct = Number((
          pool.marginPct * (1 - MARGIN_MEASUREMENT_WEIGHT) + measuredMargin * MARGIN_MEASUREMENT_WEIGHT
        ).toFixed(4));
      }

      // ---- 3. Revenue IS measured receipts. The pool's total was previously written by the
      // goods auction alone, which counted only what it sold in the modelled categories and
      // ignored every service it sold — so the number it divided its costs by was the wrong one.
      // Smoothed for the same reason the margin is: one week of clearing is not a year of trade.
      // ----
      if (receiptsUSD > 0) {
        pool.annualRevenueUSD = Math.max(1, Number((
          pool.annualRevenueUSD * (1 - MARGIN_MEASUREMENT_WEIGHT)
          + (receiptsUSD * 52) * MARGIN_MEASUREMENT_WEIGHT
        ).toFixed(0)));
      }

      // The revenue history the labor market hires against — the pool's own measured output, so
      // its hiring reads the same series a named firm's does.
      pool.revenueHistoryUSD = [...(pool.revenueHistoryUSD ?? []).slice(-12), pool.annualRevenueUSD];

      // ---- 4. Investment under a real budget constraint. A pool invests out of what it has:
      // the target share of revenue, but never more than the cash it holds above the payroll
      // buffer it needs to keep. This is the last link of the credit-transmission chain with a
      // budget behind it — borrowed money raises the cash, which raises what can be invested,
      // and a pool with no cash cannot invest whatever its revenue says. ----
      const cashUSD = pool.cashUSD ?? 0;
      const weeklyWageBillUSD = operatingCostUSD > 0 ? operatingCostUSD : 0;
      const bufferUSD = weeklyWageBillUSD * TARGET_CASH_WEEKS_OF_WAGES;
      const investableUSD = Math.max(0, cashUSD - bufferUSD);
      pool.capexUSD = Number(Math.max(0, Math.min(
        pool.annualRevenueUSD * TARGET_CAPEX_TO_REVENUE,
        investableUSD * 52
      )).toFixed(0));

      // ---- 5. Distress, measured in cash. A pool short of its payroll buffer is a pool whose
      // firms are failing, and its pooled default rate is what the banks lending to it price
      // against (bank-lending.ts reads it). Coverage is the pool's own measured earnings against
      // the debt service the banks' real loans imply. ----
      const annualEarningsUSD = pool.annualRevenueUSD * pool.marginPct;
      const annualDebtServiceUSD = Math.max(1, pool.debtUSD * (reg.policyRate + 0.03));
      const coverage = annualEarningsUSD / annualDebtServiceUSD;
      const cashCoverWeeks = weeklyWageBillUSD > 0 ? cashUSD / weeklyWageBillUSD : TARGET_CASH_WEEKS_OF_WAGES;
      const cashStress = Math.max(0, 1 - cashCoverWeeks / TARGET_CASH_WEEKS_OF_WAGES);
      pool.defaultRateAnnualPct = Number(Math.max(0.002, Math.min(0.25,
        0.015
        + Math.max(0, 1 - coverage) * 0.04
        + cashStress * 0.06
      )).toFixed(4));
    });
  });
}
