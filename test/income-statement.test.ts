/**
 * Four lines of arithmetic every firm runs, written twice inline with the tax treatment differing
 * between the copies for no stated reason. A rule written twice is a rule that will diverge — and
 * these two already had.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netIncomeUSD, industrialIncome, profileIncome } from '../src/domain/company-week/income-statement';

test('a profit is taxed', () => {
  assert.equal(netIncomeUSD(1000, 0, 0.25, false), 750);
});

test('THE ASYMMETRY: the profile path refuses to rebate a loss, the industrial path does not', () => {
  // §6.1. An industrial firm with a pre-tax loss receives a rebate it never gets in cash, which
  // flatters every distressed industrial company by the tax rate — and the distressed ones are
  // exactly the firms §5-G5's default work is about. Preserved, not fixed: fixing it changes the
  // world and that is the user's call. This test exists so it cannot drift further unnoticed.
  assert.equal(netIncomeUSD(-100, 0, 0.25, false), -100, 'profile path: the loss is the loss');
  assert.equal(netIncomeUSD(-100, 0, 0.25, true), -75, 'industrial path: a rebate at the tax rate');
});

test('the guard is on EBIT, not on pre-tax income', () => {
  // These differ for the over-levered but operationally sound firm — EBIT positive, pre-tax
  // negative — which is a large share of the distressed set. Guarding on pre-tax changed the
  // world; the three-week fingerprint caught it.
  assert.equal(netIncomeUSD(100, 500, 0.25, false), -300, 'EBIT > 0, so the rate applies');
  assert.equal(netIncomeUSD(-100, 300, 0.25, false), -400, 'EBIT <= 0, so it does not');
});

test('the industrial statement floors EBIT where the caller says', () => {
  const s = industrialIncome({ revenueUSD: 1000, ebitdaMargin: 0.01, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 10, ebitFloorUSD: 1, taxesLosses: true });
  assert.equal(s.ebitdaUSD, 10);
  assert.equal(s.ebitUSD, 1, 'EBITDA 10 less D&A 50 is floored at 1');
});

test('EPS is zero rather than Infinity for a company with no shares', () => {
  const s = industrialIncome({ revenueUSD: 1000, ebitdaMargin: 0.2, daShareOfRevenue: 0.05,
    annualInterestUSD: 0, taxRate: 0, sharesOutstanding: 0, ebitFloorUSD: 1, taxesLosses: true });
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
