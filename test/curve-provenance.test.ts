/** §3.25 — a curve point says whether it was traded or interpolated. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curvePointAt, calculateNelsonSiegelZeroRate, type NelsonSiegelParams } from '../src/engine/nelsonSiegel';

const params: NelsonSiegelParams = { beta0: 0.04, beta1: -0.01, beta2: 0.005, lambda: 1.5 };
const traded = { fittedWeek: 40, tradedTenorsYears: [0.25, 2, 9.99] };

test('the rate is the fit\'s, and the point says what it is', () => {
  const p = curvePointAt(5, params, traded);
  assert.equal(p.rate, calculateNelsonSiegelZeroRate(5, params));
  assert.deepEqual(p.provenance, { kind: 'INTERPOLATED', week: 40, between: [2, 9.99] });
});

test('a tenor within a week of a trade is that trade', () => {
  assert.deepEqual(curvePointAt(10, params, traded).provenance, { kind: 'TRADED', week: 40, tenorYears: 9.99 });
  assert.deepEqual(curvePointAt(2, params, traded).provenance, { kind: 'TRADED', week: 40, tenorYears: 2 });
});

test('beyond the trades the fit extrapolates, and says so', () => {
  assert.deepEqual(curvePointAt(30, params, traded).provenance, { kind: 'EXTRAPOLATED', week: 40, nearest: 9.99 });
  assert.deepEqual(curvePointAt(0.1, params, traded).provenance, { kind: 'EXTRAPOLATED', week: 40, nearest: 0.25 });
});

test('a curve nothing has ever cleared on is untraded everywhere', () => {
  assert.deepEqual(curvePointAt(10, params, { fittedWeek: 0, tradedTenorsYears: [] }).provenance, { kind: 'UNTRADED' });
});
