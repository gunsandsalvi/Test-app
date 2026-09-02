import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawPreferences, patienceWeeksOf, riskAversionOf, adaptiveExpectation, expectationFromHistory,
  PATIENCE_WEEKS_MIN, PATIENCE_WEEKS_MAX, RISK_AVERSION_MIN, RISK_AVERSION_MAX, PATIENCE_MEDIAN_WEEKS,
} from '../src/domain/preferences';
import { getRngState, setRngState } from '../src/engine/rng';

test('a draw lies inside the two ranges and is the same for the same identity and week', () => {
  const a = drawPreferences('firm:ABCD', 0);
  const b = drawPreferences('firm:ABCD', 0);
  assert.deepEqual(a, b);
  assert.ok(a.patienceWeeks >= PATIENCE_WEEKS_MIN && a.patienceWeeks <= PATIENCE_WEEKS_MAX);
  assert.ok(a.riskAversion >= RISK_AVERSION_MIN && a.riskAversion <= RISK_AVERSION_MAX);
  assert.equal(a.appointedWeek, 0);
});

test('a replacement in a later week is a different management', () => {
  const a = drawPreferences('firm:ABCD', 0);
  const b = drawPreferences('firm:ABCD', 52);
  assert.notDeepEqual([a.patienceWeeks, a.riskAversion], [b.patienceWeeks, b.riskAversion]);
});

test('drawing from an entity scope leaves the global stream where it was', () => {
  setRngState(123456789);
  const before = getRngState();
  drawPreferences('firm:WXYZ', 3);
  assert.equal(getRngState(), before);
});

test('the population is dispersed around the median brain, log-uniformly', () => {
  const draws = Array.from({ length: 2000 }, (_, i) => drawPreferences(`e${i}`, 0));
  const logP = draws.map((d) => Math.log(d.patienceWeeks)).sort((a, b) => a - b);
  const medianP = Math.exp(logP[logP.length / 2]);
  assert.ok(Math.abs(medianP / PATIENCE_MEDIAN_WEEKS - 1) < 0.08, `median patience ${medianP}`);
  const logR = draws.map((d) => Math.log(d.riskAversion)).sort((a, b) => a - b);
  const medianR = Math.exp(logR[logR.length / 2]);
  assert.ok(Math.abs(medianR - 1) < 0.08, `median risk aversion ${medianR}`);
  // Genuinely dispersed: a quarter of the population is at least twice as patient as the median.
  const twiceAsPatient = draws.filter((d) => d.patienceWeeks >= 2 * PATIENCE_MEDIAN_WEEKS).length / draws.length;
  assert.ok(twiceAsPatient > 0.2 && twiceAsPatient < 0.35, `${twiceAsPatient}`);
});

test('no management means the median brain — yesterday\'s rule', () => {
  assert.equal(patienceWeeksOf(undefined), PATIENCE_MEDIAN_WEEKS);
  assert.equal(riskAversionOf(undefined), 1);
});

test('the adaptive expectation adopts the first observation and then moves by 1/horizon', () => {
  assert.equal(adaptiveExpectation(undefined, 100, 10), 100);
  assert.equal(adaptiveExpectation(NaN, 100, 10), 100);
  assert.equal(adaptiveExpectation(100, 200, 10), 110);
  assert.equal(adaptiveExpectation(100, 200, 1), 200);
});

test('an expectation from history averages the last `horizon` prints and ignores empties', () => {
  assert.equal(expectationFromHistory([1, 2, 3, 4], 9, 2), 3.5);
  assert.equal(expectationFromHistory([1, 2, 3, 4], 9, 52), 2.5);
  assert.equal(expectationFromHistory([], 9, 4), 9);
  assert.equal(expectationFromHistory([0, 0], 9, 4), 9);
});

// §7.345 — the deflator carries the revenue's own lag.
import { smoothedPriceAt } from '../src/domain/company-week/labor-demand';

test('a smoothed price is a plain mean over a short history and an EMA over a long one', () => {
  assert.equal(smoothedPriceAt([10], 0, 0.08), 10);
  assert.ok(Math.abs(smoothedPriceAt([10, 20], 1, 0.5) - (0.5 * 20 + 0.25 * 10) / 0.75) < 1e-12);
  // A step from 100 to 200 twelve weeks ago: the smoothed level today sits well below 200, so a
  // revenue EMA that stepped the same way deflates to ~zero real growth, not to a collapse.
  const h = [...Array(40).fill(100), ...Array(12).fill(200)];
  const now = smoothedPriceAt(h, h.length - 1, 0.08);
  assert.ok(now > 150 && now < 170, `${now}`);
});
