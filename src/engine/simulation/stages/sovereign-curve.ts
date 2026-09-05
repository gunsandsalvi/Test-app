/**
 * §3.13-SOV row 5 / §3.25 — ONE CURVE OWNER.
 *
 * A region's zero curve had TWO representations that could not agree. 07c fitted
 * `yieldCurveParams` through the bond prices it cleared and published all five `zeroRates` as
 * reads of that fit; 07f then refitted `yieldCurveParams` through the bills it cleared PLUS four
 * synthetic points read straight back off `zeroRates` — a fit through the previous fit's own
 * output — and wrote only `tenor3M`, leaving 2Y–30Y at 07c's values. So the parameters described
 * one curve, the published points described another, and consumers were split between them: `P6`
 * measured all twenty tenor points disagreeing, worst 36bp.
 *
 * There is one curve because there is one market in a region's paper. It is fitted ONCE, here,
 * through every point the week's sessions actually cleared — each bond and each bill at its own
 * remaining tenor — and every published field is a READ of that fit. The auctions do not own it:
 * they clear against the curve standing at week start, which is what a real session prices
 * against, and deposit what they observed (`ctx.sovereignCurvePoints`).
 *
 * A week with no cleared point leaves the curve where it was. That is not a fallback standing in
 * for a mechanism — it is the answer: nothing traded, so nothing revised the price of time.
 */

import { RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';

/** The tenors the curve publishes. Points on ONE fit, never a place a rate is separately kept. */
const PUBLISHED_TENORS = [
  ['tenor3M', 0.25], ['tenor2Y', 2], ['tenor5Y', 5], ['tenor10Y', 10], ['tenor30Y', 30],
] as const;

export function runSovereignCurveStage(ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const points = ctx.sovereignCurvePoints.get(regionId) ?? [];
    if (points.length === 0) return;
    // `lambda` is the curve's shape parameter and is not fitted here — it is the one thing about a
    // region's term structure that does not move week to week.
    const fitted = fitNelsonSiegelParams(points, reg.yieldCurveParams.lambda);
    reg.yieldCurveParams = fitted;
    // §3.25: the tenors this fit was made through, so a point read off it carries its provenance.
    reg.sovereignCurve = {
      fittedWeek: ctx.nextWeek,
      tradedTenorsYears: [...new Set(points.map((p) => p.tenorYears))].sort((a, b) => a - b),
    };
    reg.zeroRates = {
      ...reg.zeroRates,
      ...Object.fromEntries(PUBLISHED_TENORS.map(([field, years]) => [field, calculateNelsonSiegelZeroRate(years, fitted)])),
    };
  });
}
