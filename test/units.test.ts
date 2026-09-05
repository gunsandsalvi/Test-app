/**
 * §3.28b-i — the period formulas have one owner, and each name means one thing (rule 8).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEKS_PER_YEAR, YEAR_OVER_YEAR_LEVELS, runRateAnnual, weeklyOfAnnual, trailingYear, yearAgoLevel, yearOverYear, realGrowthAnnual } from '../src/domain/units';

test('a year is fifty-two weeks, and the run-rate is linear both ways', () => {
  assert.equal(WEEKS_PER_YEAR, 52);
  assert.equal(runRateAnnual(1_000), 52_000, 'a week of a flow at a year\'s run-rate');
  assert.ok(Math.abs(runRateAnnual(0.001) - 0.052) < 1e-15, 'a going rate that moved 0.1% this week grows 5.2% a year — linear, not compounded');
  assert.ok(Math.abs(weeklyOfAnnual(0.052) - 0.001) < 1e-15);
  assert.equal(weeklyOfAnnual(runRateAnnual(3.7)), 3.7, 'the two are inverses');
});

test('a year-over-year read needs fifty-three levels, so that index 0 is exactly a year back', () => {
  assert.equal(YEAR_OVER_YEAR_LEVELS, 53);
  let window: number[] = [];
  for (let w = 0; w < 52; w++) {
    window = trailingYear(window, 100 + w);
    assert.equal(yearAgoLevel(window), undefined, `week ${w}: ${window.length} levels is not a year`);
  }
  window = trailingYear(window, 200);
  assert.equal(window.length, 53);
  assert.equal(yearAgoLevel(window), 100, 'the oldest level is the one 52 weeks before the newest');
  window = trailingYear(window, 201);
  assert.equal(window.length, 53, 'the window does not grow past a year');
  assert.equal(yearAgoLevel(window), 101);
  assert.equal(window.at(-1), 201);
});

test('year-over-year is the change of the index over its trailing year, as a decimal', () => {
  assert.ok(Math.abs(yearOverYear(1.03, 1) - 0.03) < 1e-15, 'a level 3% above its year-ago level');
  assert.ok(Math.abs(yearOverYear(103, 100) - 0.03) < 1e-12);
  assert.ok(Math.abs(yearOverYear(97, 100) + 0.03) < 1e-12, 'deflation reads negative');
  assert.equal(yearOverYear(250, 250), 0);
});

test('real growth is the ratio of the gross rates over the same year, not the difference', () => {
  const real = realGrowthAnnual(0.05, 0.02);
  assert.ok(Math.abs(real - (1.05 / 1.02 - 1)) < 1e-15);
  assert.ok(Math.abs(real - 0.029411764705882) < 1e-12);
  assert.ok(real < 0.05 - 0.02, 'the difference overstates it — by six basis points here');
  assert.equal(realGrowthAnnual(0.02, 0.02), 0, 'nominal at the rate of inflation is standing still');
  assert.ok(Math.abs(realGrowthAnnual(0, 0.10) - (1 / 1.1 - 1)) < 1e-15, 'flat nominal under 10% inflation is a 9.09% real fall');
});
