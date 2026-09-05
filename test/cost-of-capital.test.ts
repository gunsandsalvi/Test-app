/** §3.26-d — one owner of what a firm's capital requires. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOfCapitalOf, riskFreeRateOf, weeklyCapitalChargeLocal, EQUITY_RISK_PREMIUM } from '../src/domain/company-week/cost-of-capital';

test('the hurdle is the long rate plus the premium on the firm\'s own beta at its own risk aversion', () => {
  assert.equal(costOfCapitalOf({ beta: 1 }, 0.04), 0.04 + EQUITY_RISK_PREMIUM);
  assert.equal(costOfCapitalOf({ beta: 2, management: { patienceWeeks: 13, riskAversion: 1.5, appointedWeek: 0 } }, 0.04), 0.04 + 2 * EQUITY_RISK_PREMIUM * 1.5);
  assert.equal(costOfCapitalOf({ beta: 1 }, -0.1), 0, 'never negative');
});

test('the region\'s rate is its own ten-year point, the policy rate before a curve exists', () => {
  assert.equal(riskFreeRateOf({ zeroRates: { tenor10Y: 0.045 }, policyRateAnnual: 0.03 }), 0.045);
  assert.equal(riskFreeRateOf({ policyRateAnnual: 0.03 }), 0.03);
});

test('the weekly charge is the net plant at that rate over the year', () => {
  // §3.26-f-ii: the net plant is the register's read at the week — new plant is unworn.
  const firm = { beta: 1, plant: [{ costLocal: 5200, enteredServiceWeek: 10, usefulLifeYears: 10, kind: 'heavy_equipment' }] };
  assert.ok(Math.abs(weeklyCapitalChargeLocal(firm, 0.04, 10) - (5200 * (0.04 + EQUITY_RISK_PREMIUM)) / 52) < 1e-9);
  assert.equal(weeklyCapitalChargeLocal({ beta: 1, plant: [{ costLocal: 100, enteredServiceWeek: 0, usefulLifeYears: 1, kind: 'heavy_equipment' }] }, 0.04, 52), 0,
    'a fully worn vintage carries no charge');
});
