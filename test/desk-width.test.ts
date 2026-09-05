/** §3.26-e-ii — a desk's width is what carrying the position costs it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskScheduleWidth, fxConversionPipOf } from '../src/domain/dealer-desk';

test('financing plus measured risk at the bank\'s own aversion, in the book\'s statistic', () => {
  const base = { statKind: 'PRICE_LIKE' as const, currentStat: 100, durationYears: 5, repoRateAnnual: 0.052, riskAversion: 1 };
  // A market that has not printed twice is quoted on its financing alone: 5.2%/52 of the level.
  assert.ok(Math.abs(deskScheduleWidth({ ...base, measuredWeeklyMove: undefined }) - 0.1) < 1e-9);
  // A name that moved 2% last week adds 2% of the level; a board twice as risk-averse adds 4%.
  assert.ok(Math.abs(deskScheduleWidth({ ...base, measuredWeeklyMove: 0.02 }) - 2.1) < 1e-9);
  assert.ok(Math.abs(deskScheduleWidth({ ...base, measuredWeeklyMove: 0.02, riskAversion: 2 }) - 4.1) < 1e-9);
  // A yield-like book: the same value cost per unit of duration, in bps.
  const y = deskScheduleWidth({ ...base, statKind: 'YIELD_LIKE', currentStat: 250, measuredWeeklyMove: undefined });
  assert.ok(Math.abs(y - (0.001 / 5) * 10000) < 1e-9);
});

test('the FX pip is the desk\'s width on a rate of one: financing plus the pair\'s measured move', () => {
  assert.ok(Math.abs(fxConversionPipOf({ repoRateAnnual: 0.052, measuredWeeklyMove: undefined, riskAversion: 1 }) - 0.001) < 1e-12);
  assert.ok(Math.abs(fxConversionPipOf({ repoRateAnnual: 0.052, measuredWeeklyMove: 0.005, riskAversion: 2 }) - 0.011) < 1e-12);
});
