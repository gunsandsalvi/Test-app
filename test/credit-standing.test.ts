/**
 * The public tier defaulted at ~10%/yr against ~1-2% in reality while the private tier with
 * real ladders showed ZERO — because nothing at all stood between a bad week and a default. These
 * assert the thing that now does: a firm draws its line first, and defaults when the line is
 * exhausted, which is a different event and a far rarer one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditMetrics, revolverDrawUSD, isInDefault, maturityWallShare }
  from '../src/domain/company-week/credit-standing';

/** A bank sheet at a given capital ratio, with equity and a loss rate the rest of the world
 *  would recognise — the three numbers a bank's own standing is now measured from. */
const bankSheet = (bankCapitalRatio: number) =>
  ({ bankCapitalRatio, bankEquityLocal: 1e8, bankLossRateAnnual: 0.008 });

test('coverage is unbounded, because a bound is not a measurement', () => {
  // The old [-50, 50] clamp destroyed the information that a firm has no earnings at all.
  const wrecked = creditMetrics({ isBank: false, totalDebtUSD: 1e9, revenueLocal: 1e9,
    ebitdaLocal: 1, ebitUSD: -2e8, annualInterestUSD: 1e6, ...bankSheet(0.1) });
  assert.ok(wrecked.coverage < -50, `coverage ${wrecked.coverage} should not be clamped`);
});

test('a firm with no earnings still reports a finite leverage', () => {
  const m = creditMetrics({ isBank: false, totalDebtUSD: 1e9, revenueLocal: 0,
    ebitdaLocal: 0, ebitUSD: 0, annualInterestUSD: 0, ...bankSheet(0.1) });
  assert.ok(isFinite(m.leverage) && isFinite(m.coverage));
  assert.ok(m.leverage > 0);
});

test('a bank is rated on its capital, not on an EBITDA it does not report', () => {
  const thin = creditMetrics({ isBank: true, totalDebtUSD: 1e9, revenueLocal: 1e9,
    ebitdaLocal: 0, ebitUSD: 0, annualInterestUSD: 0, ...bankSheet(0.04) });
  const sound = creditMetrics({ isBank: true, totalDebtUSD: 1e9, revenueLocal: 1e9,
    ebitdaLocal: 0, ebitUSD: 0, annualInterestUSD: 0, ...bankSheet(0.12) });
  assert.ok(thin.coverage < sound.coverage);
});

test("a bank's coverage is a continuum, not a step: every ratio has its own number", () => {
  const at = (ratio: number) => creditMetrics({ isBank: true, totalDebtUSD: 1e9, revenueLocal: 1e9,
    ebitdaLocal: 0, ebitUSD: 0, annualInterestUSD: 0, ...bankSheet(ratio) }).coverage;
  const ladder = [0.09, 0.10, 0.11, 0.12, 0.13];
  const seen = ladder.map(at);
  assert.equal(new Set(seen).size, ladder.length, `two-valued coverage: ${seen.join(', ')}`);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1]);
  // And a worse loan book buys fewer years of buffer at the same capital.
  const risky = creditMetrics({ isBank: true, totalDebtUSD: 1e9, revenueLocal: 1e9, ebitdaLocal: 0,
    ebitUSD: 0, annualInterestUSD: 0, bankCapitalRatio: 0.12, bankEquityLocal: 1e8,
    bankLossRateAnnual: 0.04 }).coverage;
  assert.ok(risky < at(0.12));
});

test('a firm whose earnings cannot carry another dollar of interest gets nothing', () => {
  // The case the default trigger is FOR: the line closes exactly when a lender would stop.
  assert.equal(revolverDrawUSD({ cashShortfallUSD: 5e8, headroomUSD: 0, alreadyDrawnUSD: 0 }), 0);
});

test('a draw never exceeds the shortfall or the remaining headroom', () => {
  assert.equal(revolverDrawUSD({ cashShortfallUSD: 100, headroomUSD: 1e9, alreadyDrawnUSD: 0 }), 100);
  assert.equal(revolverDrawUSD({ cashShortfallUSD: 1e9, headroomUSD: 500, alreadyDrawnUSD: 200 }), 300);
  assert.equal(revolverDrawUSD({ cashShortfallUSD: 1e9, headroomUSD: 100, alreadyDrawnUSD: 900 }), 0);
});

test('default needs BOTH cash exhausted and coverage below the floor', () => {
  const base = { wasDefaulted: false, mergerAcquired: false, coverageFloor: 1.0 };
  assert.equal(isInDefault({ ...base, cashLocal: -1, coverage: 0.5 }), true);
  assert.equal(isInDefault({ ...base, cashLocal: -1, coverage: 5.0 }), false, 'solvent but illiquid is not default');
  assert.equal(isInDefault({ ...base, cashLocal: 1e9, coverage: 0.1 }), false, 'thin cover with cash is not default');
});

test('an acquired firm is not in default, however bad its book', () => {
  assert.equal(isInDefault({ wasDefaulted: true, mergerAcquired: true, cashLocal: -1e9,
    coverage: -100, coverageFloor: 1.0 }), false);
});

test('the maturity wall is the share falling due inside a year', () => {
  const ladder = [
    { principalLocal: 250, maturityWeek: 10 },
    { principalLocal: 750, maturityWeek: 400 },
  ];
  assert.equal(maturityWallShare(ladder, 5), 0.25);
  assert.equal(maturityWallShare([], 5), 0);
});
