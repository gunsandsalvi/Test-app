/**
 * Stage 1: Micro -> Macro Feedback
 *
 * Aggregates last week's per-company state (floating-rate debt, revenue-vs-baseline health,
 * employment, margins, defaults) into region-level signals consumed by stage 2's region
 * macro evolution.
 */

import { GameState } from '../../../types';
import { CREDIT_RECOVERY_RATE } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { REGION_IDS } from '../../../domain/geography';

/** How long a default keeps feeding credit contagion before it is treated as absorbed. */
const CONTAGION_WINDOW_WEEKS = 52;

export function runMacroFeedbackStage(state: GameState, ctx: WeeklyStepContext): void {
  const { prevActiveFirms } = ctx;

  // GUARD deleted `regionFloatingPrincipal` here: a full-universe tranche sweep every week to
  // feed `evolveBankingSector`'s `businessLoanBookInputUSD`, a parameter declared and never read
  // since G2 made business lending the itemized stage's decision. It also counted bank
  // facilities, the double-count 07d exists to avoid.
  REGION_IDS.forEach(rid => {
    const firms = prevActiveFirms.filter(f => f.region === rid);
    if (firms.length === 0) return;
    ctx.regionTrackedHealthSignal[rid] = firms.reduce((s, f) => s + (f.annualRevenue - f.baselineAnnualRevenue) / Math.max(1, f.baselineAnnualRevenue), 0) / firms.length;
  });

  REGION_IDS.forEach(rid => {
    ctx.regionPublicCompanyEmployment[rid] = prevActiveFirms.filter(f => f.region === rid).reduce((s, f) => s + f.employeeCount, 0);
  });

  // GUARD also deleted `avgMargin`/`marginCompression`: stage 02 passed the literal 0 and
  // nothing read either, so the 0.22 threshold was a magic number with no owner and no consumer.
  // Since HC2 the market holds private paper too, so a private default is a real credit event
  // like any other.
  //
  // S8: contagion is a RECENT-loss signal, not a permanent scar. The previous count included
  // every company that had EVER defaulted, so the number could only ratchet upward — a default
  // in week 3 still tightened credit in week 200, and with the universe now at 2,000+ firms the
  // scar dominated the signal. Real contagion decays as losses are absorbed: count defaults
  // inside a rolling year, weighted so the freshest carry most of it, plus the currently
  // distressed cohort (a live state, not a memory).
  const week = state.currentWeek;
  let weightedRecentDefaults = 0;
  state.companies.forEach((c) => {
    if (!c.isDefaulted) return;
    const age = week - (c.defaultedWeek ?? week);
    if (age < 0 || age > CONTAGION_WINDOW_WEEKS) return;
    weightedRecentDefaults += 1 - age / CONTAGION_WINDOW_WEEKS;
  });
  const currentlyDistressed = state.companies.filter((c) => !c.isDefaulted && c.creditRating === 'CCC').length;
  ctx.recentDefaultsCount = Math.round(weightedRecentDefaults + currentlyDistressed);
  // G5 — THE CONTAGION COEFFICIENT IS GONE. `recentDefaultsCount x 12` added basis points to a
  // cleared price by formula (rule 3), and `/500` turned the same count into a systemic stress
  // factor. Contagion is not a coefficient on a count: it is real losses landing on real books
  // and tightening the capacity those books have left, and that channel now EXISTS — an estate
  // writes its residual off its holders' equity (stages/estate-resolution.ts), which is what a
  // credit loss is. The default count survives as the STATISTIC it always was.
  //
  // What replaces the stress factor is a measurement rather than a count: how much worse this
  // world's own workouts are recovering than the prior a lender starts from. A run of severe
  // resolutions IS a stressed credit market, and it is the market saying so about itself.
  const recoveryStress = (Object.keys(ctx.updatedRegions) as (keyof typeof ctx.updatedRegions)[])
    .map((r) => {
      const realised = ctx.updatedRegions[r]?.realisedRecoveryRates ?? [];
      if (realised.length === 0) return 0;
      const mean = realised.reduce((a, b) => a + b, 0) / realised.length;
      return Math.max(0, (CREDIT_RECOVERY_RATE - mean) / CREDIT_RECOVERY_RATE);
    });
  ctx.systemicStressFactorGlobal = recoveryStress.length > 0
    ? Math.max(0, Math.min(1, recoveryStress.reduce((a, b) => a + b, 0) / recoveryStress.length))
    : 0;
}
