/**
 * §5-STRUCT step 2 — the employer's weekly labor decision (domain/company-week/labor-demand.ts).
 * Each test is the assertion that would have caught its recorded defect on the day it was written.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ownPriceGrowthAnnual, outputPriceVsBaseline, demandPullFromFill,
  revenueGrowthWindow, quitRateWeeklyAt, firmQuitMultiplier, employerWeekPosting,
} from '../src/domain/company-week/labor-demand';
import {
  BASELINE_QUIT_RATE_WEEKLY, NEUTRAL_LABOR_TIGHTNESS, DISTRESS_LAYOFF_SPEED,
  HIRING_ADJUSTMENT_SPEED_MULTIPLE,
} from '../src/domain/region-macro';

test('§7.210 — the quit rate is concave in tightness and cannot exceed 1', () => {
  // A neutral market quits at exactly the baseline (the linear form quit 5% below it).
  assert.equal(quitRateWeeklyAt(NEUTRAL_LABOR_TIGHTNESS), BASELINE_QUIT_RATE_WEEKLY);
  // JPN's seed tightness of 215: the linear form said 1.69/week (everyone quits); the matching
  // function's concave form says a hot market, not a national resignation.
  const hot = quitRateWeeklyAt(215);
  assert.ok(hot < 0.2, `expected a hot-market quit rate, got ${hot}`);
  assert.ok(hot > BASELINE_QUIT_RATE_WEEKLY);
  // A market with no vacancies: nobody in fact quits toward nothing.
  assert.equal(quitRateWeeklyAt(0), 0);
});

test('§7.149 — a firm whose own product halved in price is not overstaffed', () => {
  assert.equal(outputPriceVsBaseline([{ weight: 1, base: 100, now: 50 }]), 0.5);
  // No usable price: the deflator is 1, never a guess.
  assert.equal(outputPriceVsBaseline([{ weight: 1, base: 0, now: 50 }]), 1);
});

test('§7.249 — own-price growth annualizes over its own window and falls back honestly', () => {
  // One line, price 100 -> 110 over 12 weeks: (0.1) * 52/12 annualized.
  const g = ownPriceGrowthAnnual([{ weight: 1, p0: 100, p1: 110 }], 12, 0.02);
  assert.ok(Math.abs(g - 0.1 * (52 / 12)) < 1e-12);
  // No line with usable history: the region's inflation, not zero.
  assert.equal(ownPriceGrowthAnnual([], 12, 0.037), 0.037);
});

test('§7.247 — the demand pull sees what the markets left unserved, honestly Infinity', () => {
  // Markets asked for twice what they received: the pull is 2.
  assert.equal(demandPullFromFill([{ weight: 1, demanded: 10, supplied: 5 }]), 2);
  // A market that received NOTHING: Infinity, bounded downstream by affordability, never here.
  assert.equal(demandPullFromFill([{ weight: 1, demanded: 10, supplied: 0 }]), Infinity);
  // No measured demand: neutral.
  assert.equal(demandPullFromFill([]), 1);
});

test('revenue window: no history is no signal, not a zero signal', () => {
  assert.equal(revenueGrowthWindow(undefined, 100), null);
  assert.equal(revenueGrowthWindow([100], 100), null);
  const w = revenueGrowthWindow([100, 100, 110], 110);
  assert.ok(w && w.windowWeeks === 2);
});

test('HH6 — the firm quit multiplier is bounded at zero for a firm paying far above market', () => {
  assert.equal(firmQuitMultiplier(10, 1), 0);
  assert.equal(firmQuitMultiplier(1, 1), 1);
});

test('§7.247 — understaffed with affordable earnings cancels growth-signal layoffs', () => {
  const p = employerWeekPosting({
    currentHeads: 100, desiredWeeklyChangeHeads: -5, quitsHeads: 1,
    productiveHeadsCap: 200, outputNeedHeads: 150,
    affordableHireHeads: 30, affordableCutHeads: 0, cashIsNegative: false,
  });
  assert.equal(p.layoffs, 0);
  assert.ok(p.vacancies > 0);
});

test('§7.269 — growth hiring is bounded by the plant, not by the wish', () => {
  const p = employerWeekPosting({
    currentHeads: 100, desiredWeeklyChangeHeads: 50, quitsHeads: 0,
    productiveHeadsCap: 110, outputNeedHeads: 100,
    affordableHireHeads: 0, affordableCutHeads: 0, cashIsNegative: false,
  });
  assert.equal(p.vacancies, 10 * HIRING_ADJUSTMENT_SPEED_MULTIPLE);
});

test('LAB — a firm out of cash sheds regardless of every friction above', () => {
  const p = employerWeekPosting({
    currentHeads: 100, desiredWeeklyChangeHeads: 0, quitsHeads: 0,
    productiveHeadsCap: 200, outputNeedHeads: 150,
    affordableHireHeads: 30, affordableCutHeads: 0, cashIsNegative: true,
  });
  assert.equal(p.layoffs, 100 * DISTRESS_LAYOFF_SPEED);
});

test('§5-PROD — labor demand nets out the employer\'s OWN learning, not a uniform drift', async () => {
  const { realEmploymentGrowthAnnual } = await import('../src/domain/company-week/labor-demand');
  // Same nominal and price growth: the faster learner demands less labor.
  const slow = realEmploymentGrowthAnnual(0.05, 0.02, 0.005);
  const fast = realEmploymentGrowthAnnual(0.05, 0.02, 0.03);
  assert.ok(fast < slow);
});
