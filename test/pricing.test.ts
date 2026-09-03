/**
 * The pricing primitives were written out by hand in eight modules before they had a home. These
 * assertions are what stop them being written a ninth time with a different edge case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discountFactor, annuityFactor, levelPaymentFactor, presentValuePerFace,
  zeroRateAt, priceFromSpreadBps, spreadBpsFromPrice, ZeroCurve,
} from '../src/domain/pricing';

const FLAT: ZeroCurve = { tenor3M: 0.04, tenor2Y: 0.04, tenor5Y: 0.04, tenor10Y: 0.04, tenor30Y: 0.04 };

test('a zero rate is the limit the closed forms cannot take', () => {
  // The floors these replaced (max(1e-6, rate)) existed only because (1-DF)/r divides by zero.
  assert.equal(annuityFactor(0, 10), 10, 'ten payments of one are worth ten');
  assert.equal(levelPaymentFactor(0, 10), 0.1, 'principal split evenly');
  assert.equal(discountFactor(0, 10), 1);
});

test('a level payment is the reciprocal of the annuity it amortises', () => {
  for (const r of [0.001, 0.01, 0.05]) {
    for (const n of [12, 52, 360]) {
      assert.ok(Math.abs(levelPaymentFactor(r, n) * annuityFactor(r, n) - 1) < 1e-12, `${r}/${n}`);
    }
  }
});

test('a bond at its own discount rate is worth par', () => {
  assert.ok(Math.abs(presentValuePerFace({ couponPerPeriod: 0.05, periods: 7, ratePerPeriod: 0.05, redemptionPerFace: 1 }) - 1) < 1e-12);
});

test('the curve interpolates between struck tenors and stays flat outside them', () => {
  const c: ZeroCurve = { tenor3M: 0.01, tenor2Y: 0.02, tenor5Y: 0.03, tenor10Y: 0.04, tenor30Y: 0.05 };
  assert.equal(zeroRateAt(c, 0.1), 0.01, 'flat below the shortest point');
  assert.equal(zeroRateAt(c, 40), 0.05, 'flat beyond the longest — a curve says nothing about 40 years');
  assert.ok(Math.abs(zeroRateAt(c, 3.5) - 0.025) < 1e-12, 'halfway between 2Y and 5Y');
});

test('price falls as spread rises, and the inverse returns the spread it came from', () => {
  const terms = { annualCouponRate: 0.05, periodWeeks: 26, weeksToMaturity: 5 * 52 };
  let last = Infinity;
  for (const s of [-100, 0, 100, 500, 2000]) {
    const p = priceFromSpreadBps(terms, FLAT, s);
    assert.ok(p < last, `price must fall as spread rises (${s}bp)`);
    last = p;
    assert.ok(Math.abs(spreadBpsFromPrice(terms, FLAT, p) - s) < 0.01, `round trip at ${s}bp`);
  }
});

test('paper that pays its coupon at maturity is worth face plus what it accrued, discounted', () => {
  // Commercial paper: one payment, thirteen weeks out. It cannot be worth par at a positive rate.
  const cp = { annualCouponRate: 0.06, periodWeeks: 13, weeksToMaturity: 13 };
  const p = priceFromSpreadBps(cp, FLAT, 0);
  assert.ok(p > 0.99 && p < 1.02, `a 13-week note prices near par, got ${p}`);
  assert.ok(priceFromSpreadBps(cp, FLAT, 500) < p, 'and wider is cheaper');
});

test('matured paper is worth its face', () => {
  assert.equal(priceFromSpreadBps({ annualCouponRate: 0.05, periodWeeks: 26, weeksToMaturity: 0 }, FLAT, 300), 1);
});
