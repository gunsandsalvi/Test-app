/**
 * Four lines of arithmetic every firm runs. The two inline copies used to disagree on how a loss
 * is taxed; §4.0 Tier 1 item 8 (decided 2026-08-31) closed the asymmetry: ONE rule for every
 * firm — a loss is neither taxed nor rebated — and the industrial EBIT floor is gone with it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netIncomeUSD, industrialIncome, profileIncome } from '../src/domain/company-week/income-statement';

test('a profit is taxed', () => {
  assert.equal(netIncomeUSD(1000, 0, 0.25), 750);
});

test('THE ASYMMETRY IS CLOSED: a loss is the loss, for every firm', () => {
  // The industrial path used to hand a pre-tax loss a rebate at the tax rate — money no firm
  // receives in cash — flattering every distressed industrial company. One rule now; this test
  // pins it so a second path cannot reintroduce the flag.
  assert.equal(netIncomeUSD(-100, 0, 0.25), -100, 'the loss is the loss');
});

test('the guard is on EBIT, not on pre-tax income', () => {
  // These differ for the over-levered but operationally sound firm — EBIT positive, pre-tax
  // negative — which is a large share of the distressed set. Guarding on pre-tax changed the
  // world; the three-week fingerprint caught it. Kept deliberately; the basis is TAXR's call.
  assert.equal(netIncomeUSD(100, 500, 0.25), -300, 'EBIT > 0, so the rate applies');
  assert.equal(netIncomeUSD(-100, 300, 0.25), -400, 'EBIT <= 0, so it does not');
});

test('the industrial statement carries an operating loss at full size — no floor', () => {
  const s = industrialIncome({ revenueUSD: 1000, ebitdaMargin: 0.01, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0.25, sharesOutstanding: 10 });
  assert.equal(s.ebitdaUSD, 10);
  assert.equal(s.ebitUSD, -40, 'EBITDA 10 less D&A 50 is a real -40, not a floored 1');
  assert.equal(s.netIncomeUSD, -40, 'and the loss is not rebated');
});

test('EPS is zero rather than Infinity for a company with no shares', () => {
  const s = industrialIncome({ revenueUSD: 1000, ebitdaMargin: 0.2, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 0 });
  assert.equal(s.epsUSD, 0);
});

test("a profile firm's depreciation comes off its PLANT, not its revenue", () => {
  // A bank's depreciation has nothing to do with its interest income.
  const base = { revenueUSD: 1000, otherIncomeAnnualUSD: 0, inputCostAnnualUSD: 0,
    payrollAnnualUSD: 0, profileCostsAnnualUSD: 0, ppeDepreciationYears: 20,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 1 };
  const light = profileIncome({ ...base, grossPPEUSD: 0 });
  const heavy = profileIncome({ ...base, grossPPEUSD: 2000 });
  assert.equal(light.ebitUSD, 1000);
  assert.equal(heavy.ebitUSD, 900, '2000 of plant over 20 years is 100 a year');
  assert.equal(light.ebitdaUSD, heavy.ebitdaUSD, 'and it does not touch EBITDA');
});
