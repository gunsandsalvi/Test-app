/**
 * Stage 1: Micro -> Macro Feedback
 *
 * Aggregates last week's per-company state (floating-rate debt, revenue-vs-baseline health,
 * employment, margins, defaults) into region-level signals consumed by stage 2's region
 * macro evolution.
 */

import { GameState, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';

export function runMacroFeedbackStage(state: GameState, ctx: WeeklyStepContext): void {
  const { prevActiveFirms } = ctx;

  prevActiveFirms.forEach(f => {
    const floatingSum = (f.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
    ctx.regionFloatingPrincipal[f.region] += floatingSum;
  });

  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(rid => {
    const firms = prevActiveFirms.filter(f => f.region === rid);
    if (firms.length === 0) return;
    ctx.regionTrackedHealthSignal[rid] = firms.reduce((s, f) => s + (f.annualRevenue - f.baselineAnnualRevenue) / Math.max(1, f.baselineAnnualRevenue), 0) / firms.length;
  });

  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(rid => {
    ctx.regionPublicCompanyEmployment[rid] = prevActiveFirms.filter(f => f.region === rid).reduce((s, f) => s + f.employeeCount, 0);
  });

  ctx.avgMargin = prevActiveFirms.reduce((sum, c) => sum + (c.ebitda / Math.max(1, c.annualRevenue)), 0) / Math.max(1, prevActiveFirms.length);
  ctx.marginCompression = ctx.avgMargin < 0.22 ? 0.22 - ctx.avgMargin : 0.0;
  ctx.recentDefaultsCount = state.companies.filter((c) => c.isDefaulted || c.creditRating === 'CCC').length;
  ctx.creditContagionBps = ctx.recentDefaultsCount * 12;
  ctx.systemicStressFactorGlobal = Math.min(0.3, ctx.creditContagionBps / 500);
}
