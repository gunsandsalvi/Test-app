/**
 * Sizing a dividend on yield x market cap bled TEN TIMES a real dividend out of every profitable
 * company — measured in the cash ledger's first week at 15-25M/wk against 20M/wk of sales, because
 * the equity level is a known-inflated formula. A board pays a share of what it EARNS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividendDecision, sustainableDividendWeeklyUSD } from '../src/domain/company-week/distributions';

const base = { declaredYield: 0.03, marketCapUSD: 30e9, netIncomeUSD: 400e6,
  maxPayoutRatio: 0.4, weekOfQuarter: 1, weeksInQuarter: 13 };

test('earnings bind when the declared yield outruns them', () => {
  // THE DEFECT: 3% of a 30B cap is 900M a year; 40% of 400M of earnings is 160M. The board pays
  // what it earns.
  const d = dividendDecision(base);
  assert.equal(d.boundBy, 'earnings');
  assert.ok(Math.abs(d.accrualWeeklyUSD - 160e6 / 52) < 1e-6);
});

test('a loss-making company pays nothing, with no clamp anywhere', () => {
  // §1.6: it falls out of sizing on earnings rather than on capitalisation.
  assert.equal(dividendDecision({ ...base, netIncomeUSD: -1e9 }).accrualWeeklyUSD, 0);
  assert.equal(dividendDecision({ ...base, netIncomeUSD: 0 }).accrualWeeklyUSD, 0);
  assert.equal(sustainableDividendWeeklyUSD(-5e9, 0.9), 0);
});

test('the declared yield binds when earnings comfortably cover it', () => {
  const d = dividendDecision({ ...base, netIncomeUSD: 100e9 });
  assert.equal(d.boundBy, 'declared-yield');
  assert.ok(Math.abs(d.accrualWeeklyUSD - (0.03 * 30e9) / 52) < 1e-6);
});

test('thirteen weeks of dividend leave in one week and nothing in the other twelve', () => {
  // What a shareholder's cash actually looks like, and what a fund reinvesting it feels.
  let paidWeeks = 0;
  let totalPaid = 0;
  for (let w = 1; w <= 13; w++) {
    const d = dividendDecision({ ...base, weekOfQuarter: w });
    if (d.cashThisWeekUSD > 0) { paidWeeks++; totalPaid += d.cashThisWeekUSD; }
  }
  assert.equal(paidWeeks, 1, 'exactly one payment date a quarter');
  const accrued = dividendDecision(base).accrualWeeklyUSD * 13;
  assert.ok(Math.abs(totalPaid - accrued) < 1e-6, 'and the cash equals the quarter of accrual');
});

test('a company with no declared yield pays nothing however profitable', () => {
  assert.equal(dividendDecision({ ...base, declaredYield: 0, netIncomeUSD: 1e12 }).accrualWeeklyUSD, 0);
});

test('a negative declared yield is not a reverse dividend', () => {
  assert.equal(dividendDecision({ ...base, declaredYield: -0.05 }).accrualWeeklyUSD, 0);
});
