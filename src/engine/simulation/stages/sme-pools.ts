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
      const cashCoverWeeks = weeklyWageBillUSD > 0 ? cashUSD / weeklyWageBillUSD : TARGET_CASH_WEEKS_OF_WAGES;

      // DIST — THE DEFAULT RATE IS AN INTEGRAL OVER THE POOL, NOT A FUNCTION OF ITS MEAN.
      //
      // `Math.max(0, 1 - coverage)` is a THRESHOLD, and this read it at the pool average — so a
      // pool with mean coverage 1.2 had exactly ZERO coverage-driven defaults however many of its
      // firms sat below 1, and **a mean-preserving spread could not cause a single default**,
      // which is the mechanism of a credit cycle. `E[f(x)]` is not `f(E[x])` (§5-DIST).
      //
      // The pool now carries a leverage cross-section struck from the same rule the named tier
      // uses (§7.140), and the rate is the weighted sum of each stratum's own distress. The mean
      // is preserved exactly, so this changes no aggregate — it changes what the aggregate can
      // RESPOND to.
      //
      // The `[0.002, 0.25]` band goes with it (rule 2). It existed to bound a formula read at a
      // point; a weighted sum of a bounded per-stratum function needs no second bound.
      const strata = pool.strata && pool.strata.length > 0
        ? pool.strata
        : [{ weight: 1, leverageMultiple: annualEarningsUSD > 0 ? pool.debtUSD / annualEarningsUSD : 0 }];
      const meanLeverage = annualEarningsUSD > 0 ? pool.debtUSD / annualEarningsUSD : 0;
      const strataMean = strata.reduce((a, st) => a + st.weight * st.leverageMultiple, 0);
      // Re-centre on the pool's CURRENT leverage each week: the shape is the cross-section's, the
      // level is the pool's own book. Without this the strata would drift away from the debt they
      // are supposed to describe (rule 3).
      const recentre = strataMean > 0 ? meanLeverage / strataMean : 0;
      const coverageOf = (lev: number) => {
        const debtService = lev * recentre * annualEarningsUSD * (reg.policyRate + 0.03);
        return debtService > 0 ? annualEarningsUSD / debtService : Number.POSITIVE_INFINITY;
      };
      const coverageDistress = strata.reduce(
        (a, st) => a + st.weight * Math.max(0, 1 - coverageOf(st.leverageMultiple)), 0);

      // DIST — AND THE CASH TERM IS THE SAME DEFECT, in the half that is actually LIVE today.
      //
      // `cashStress` read the pool's mean cash cover, so a pool holding six weeks of wages on
      // average showed no distress even when a third of its firms held two. Cash is not spread
      // evenly across a pool: what a firm has left is what its earnings leave after ITS OWN debt
      // service, so the strata that pay the most interest hold the least — which is why they are
      // the ones that fail. The pool's cash is allocated on exactly that residual, so it is a
      // distribution of the pool's own money and not a second stock (rule 3).
      const residualOf = (lev: number) => Math.max(0, 1 - lev * recentre * (reg.policyRate + 0.03));
      const meanResidual = strata.reduce((a, st) => a + st.weight * residualOf(st.leverageMultiple), 0);
      const cashStressIntegral = meanResidual > 0
        ? strata.reduce((a, st) => {
            const stratumCoverWeeks = cashCoverWeeks * (residualOf(st.leverageMultiple) / meanResidual);
            return a + st.weight * Math.max(0, 1 - stratumCoverWeeks / TARGET_CASH_WEEKS_OF_WAGES);
          }, 0)
        : Math.max(0, 1 - cashCoverWeeks / TARGET_CASH_WEEKS_OF_WAGES);

      pool.defaultRateAnnualPct = Number(Math.max(0,
        0.015 + coverageDistress * 0.04 + cashStressIntegral * 0.06
      ).toFixed(4));

      // DIST — THE ABSORBING BARRIER, AND ITS REINJECTION.
      //
      // A default wrote the bank's loan down (bank-lending.ts) and left the FIRM in the pool:
      // a pool could default 5% a year forever and its cross-section never changed. That is a
      // one-sided flow (rule 14) — the lender lost the money and nobody stopped existing.
      //
      // Firms do not fail at random: the ones that fail are the ones that could not service
      // their debt, so the exiting weight is drawn from the strata in proportion to their OWN
      // distress. The survivors are therefore less levered than the pool was — which is what a
      // credit cycle's cleansing phase IS, and a scalar pool could not represent it at all.
      //
      // Reinjection is the other half: an SME tier is not a closed cohort. New firms form, and
      // they form UNLEVERED — a business starts without a balance sheet. Entry replaces the
      // exiting weight, so the pool's firm count is conserved while its composition shifts. What
      // makes this a barrier rather than a rescale is that the weight leaves from one end of the
      // distribution and re-enters at the other.
      if (pool.strata && pool.strata.length > 0) {
        const weeklyExitRate = pool.defaultRateAnnualPct / 52;
        const distressOf = (lev: number) => Math.max(0, 1 - coverageOf(lev))
          + Math.max(0, 1 - (cashCoverWeeks * (residualOf(lev) / Math.max(1e-9, meanResidual))) / TARGET_CASH_WEEKS_OF_WAGES);
        const totalDistress = pool.strata.reduce((a, st) => a + st.weight * distressOf(st.leverageMultiple), 0);
        // DIST — the same integral, published for the employment side. A firm that cannot cover
        // its debt service is the firm that sheds staff, and that is a property of the STRATA,
        // not of the pool's average. Bounded at 1 because it is a SHARE OF FIRMS — a definitional
        // bound, not a behavioural one (rule 2): `distressOf` sums a coverage term and a cash
        // term, so it can exceed 1 for a stratum failing on both, and no more of a pool than all
        // of it can be in trouble.
        pool.distressedFirmShare = Number(Math.max(0, Math.min(1, totalDistress)).toFixed(4));
        if (weeklyExitRate > 0 && totalDistress > 0) {
          const leastLevered = pool.strata.reduce((lo, st) => st.leverageMultiple < lo ? st.leverageMultiple : lo, Infinity);
          let reinjectedWeight = 0;
          const survivors = pool.strata.map((st) => {
            // Each stratum loses weight in proportion to its share of the pool's total distress.
            const exiting = st.weight * weeklyExitRate * (distressOf(st.leverageMultiple) / totalDistress) * pool.strata!.length;
            const leaving = Math.min(st.weight, Math.max(0, exiting));
            reinjectedWeight += leaving;
            return { weight: st.weight - leaving, leverageMultiple: st.leverageMultiple };
          });
          // Entrants form unlevered, at the least-levered end of the surviving distribution.
          const entryStratum = survivors.reduce((best, st) =>
            st.leverageMultiple <= leastLevered ? st : best, survivors[0]);
          entryStratum.weight += reinjectedWeight;
          const total = survivors.reduce((a, st) => a + st.weight, 0);
          pool.strata = total > 0
            ? survivors.map((st) => ({ weight: Number((st.weight / total).toFixed(6)), leverageMultiple: st.leverageMultiple }))
            : pool.strata;
        }
      }
    });
  });
}
