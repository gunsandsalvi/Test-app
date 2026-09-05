/**
 * The pricing primitives were written out by hand in eight modules before they had a home. These
 * assertions are what stop them being written a ninth time with a different edge case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discountFactor, annuityFactor, levelPaymentFactor, presentValuePerFace,
  zeroRateAt, priceFromSpreadBps, spreadBpsFromPrice, priceFromYield, yieldFromPrice, ZeroCurve,
} from '../src/domain/pricing';
import { ASSET_REGISTRY } from '../src/domain/assets';
import { discountBillProceedsLocal, billYieldFromPrice } from '../src/domain/government';

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

test('a sloped curve is priced along its whole length, not at one point', () => {
  // The shortcut -- discount everything at the rate where the paper MATURES -- misprices exactly
  // when the curve has shape, which is the case a curve exists to describe. A steep curve must
  // price a coupon bond cheaper than a flat curve at the long end would, because the early
  // coupons are discounted at the LOW short rates and the shortcut never sees them.
  const steep: ZeroCurve = { tenor3M: 0.01, tenor2Y: 0.02, tenor5Y: 0.05, tenor10Y: 0.05, tenor30Y: 0.05 };
  const flatLong: ZeroCurve = { tenor3M: 0.05, tenor2Y: 0.05, tenor5Y: 0.05, tenor10Y: 0.05, tenor30Y: 0.05 };
  const terms = { annualCouponRate: 0.05, periodWeeks: 26, weeksToMaturity: 5 * 52 };
  assert.ok(priceFromSpreadBps(terms, steep, 0) > priceFromSpreadBps(terms, flatLong, 0),
    'the steep curve discounts the early coupons less, so the bond is worth more');
});

test('matured paper is worth its face', () => {
  assert.equal(priceFromSpreadBps({ annualCouponRate: 0.05, periodWeeks: 26, weeksToMaturity: 0 }, FLAT, 300), 1);
});

test('every asset kind declares what its quantity is counted in', () => {
  // The property a stored dollar total cannot have: a kind that cannot say what its units ARE has
  // no honest way to be valued, and every such kind in this model ended up storing the product of
  // units and price and losing the price that made it.
  for (const [type, m] of Object.entries(ASSET_REGISTRY)) {
    assert.ok(['PAR', 'SHARES', 'GOODS_UNITS', 'CONTRACTS', 'MONEY', 'DWELLINGS', 'COST'].includes(m.countedIn), `${type} has no unit of measure`);
    // Money is the only kind whose price is one by definition; everything else must be priced.
    if (m.countedIn === 'MONEY') assert.equal(m.assetClass, 'CASH_LIKE', `${type} is counted in money but is not cash`);
  }
});

test('a sovereign prices off ONE yield, and the inverse returns the yield it came from', () => {
  // §3.13-SOV row 4: the sovereign book clears a yield today; rule 3 says it must clear a PRICE
  // and derive the yield. These are the two directions that swap costs.
  const terms = { annualCouponRate: 0.04, periodWeeks: 26, weeksToMaturity: 10 * 52 };
  let last = Infinity;
  for (const y of [-0.01, 0, 0.02, 0.04, 0.08, 0.20]) {
    const p = priceFromYield(terms, y);
    assert.ok(p < last, `price must fall as yield rises (${y})`);
    last = p;
    assert.ok(Math.abs(yieldFromPrice(terms, p) - y) < 1e-6, `round trip at ${y}`);
  }
});

test('a bond yielding its own coupon is worth par ONLY when the coupon is annual', () => {
  // The one price a bond has that needs no arithmetic to verify — and it is exact only when the
  // coupon period matches the yield's compounding. `priceFromYield` discounts at an ANNUAL
  // EFFECTIVE yield, so a 4% coupon paid twice a year is genuinely worth more than one paid once,
  // and the bond trades ABOVE par against a 4% yield. That premium is real, not error: it is
  // rule 8 in the price, and asserting par at every frequency would be asserting the convention
  // away. Measured: 30y at 26-week coupons is 1.006849, at 13-week 1.010290.
  for (const weeks of [52, 5 * 52, 30 * 52]) {
    const annual = priceFromYield({ annualCouponRate: 0.04, periodWeeks: 52, weeksToMaturity: weeks }, 0.04);
    assert.ok(Math.abs(annual - 1) < 1e-12, `annual coupons at coupon = yield are exactly par (${weeks}w), got ${annual}`);
    const semi = priceFromYield({ annualCouponRate: 0.04, periodWeeks: 26, weeksToMaturity: weeks }, 0.04);
    const quarterly = priceFromYield({ annualCouponRate: 0.04, periodWeeks: 13, weeksToMaturity: weeks }, 0.04);
    assert.ok(quarterly > semi && semi > annual, `paying sooner is worth more (${weeks}w)`);
  }
});

test('a zero-coupon bill is worth its discounted face and nothing more', () => {
  // A bill carries no coupon (bond.md N5.c): its whole return is the discount, so its price is
  // exactly the discount factor. If this drifts, the bill has grown a coupon it does not have.
  const bill = { annualCouponRate: 0, periodWeeks: 13, weeksToMaturity: 13 };
  const p = priceFromYield(bill, 0.05);
  assert.ok(p < 1, 'a discount bill is worth less than face');
  assert.ok(Math.abs(p - discountFactor(0.05, 13 / 52)) < 1e-12, 'and exactly its discount factor');
  assert.ok(Math.abs(yieldFromPrice(bill, p) - 0.05) < 1e-6, 'round trip');
});

test('a bill round trips on SIMPLE interest, which is not what a coupon bond uses', () => {
  // §3.13-SOV row 4: a bill is quoted money-market style, 1/(1+y*t). Asserting it here stops the
  // two conventions being swapped for each other by someone who sees two functions that both
  // turn a yield into a price.
  for (const years of [0.25, 0.5, 1]) {
    for (const y of [0, 0.02, 0.05, 0.10]) {
      const p = discountBillProceedsLocal(1, y, years);
      assert.ok(Math.abs(billYieldFromPrice(p, years) - y) < 1e-12, `bill round trip at ${y}, ${years}y`);
    }
  }
  // And they are genuinely different numbers, so neither can stand in for the other.
  const simple = discountBillProceedsLocal(1, 0.05, 0.25);
  const compound = priceFromYield({ annualCouponRate: 0, periodWeeks: 13, weeksToMaturity: 13 }, 0.05);
  assert.ok(Math.abs(simple - compound) > 1e-5, 'simple and compound differ on a 13-week bill');
});
