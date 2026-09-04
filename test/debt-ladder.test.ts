/**
 * The rule this file exists to protect: an issuer used to call at PAR, for free, the moment rates
 * moved 1% its way — an option no lender writes. The test is not "is the coupon above the market",
 * it is whether the present value of the saving beats what the call costs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callEconomics, callableAmountUSD, callSavingPvPerDollar, tranchesDueWithin, dropExhausted }
  from '../src/domain/company-week/debt-ladder';

test('a make-whole premium neutralises a purely rate-driven call', () => {
  // For an IG bond the premium IS the present value of the saving, so the call must NOT clear.
  const remainingYears = 5, fair = 0.04, coupon = 0.06;
  const pv = callSavingPvPerDollar(coupon - fair, remainingYears, fair);
  const e = callEconomics({ couponRate: coupon, currentFairRate: fair, remainingYears,
    premiumPerDollar: pv, materialSavingAnnual: 0.01 });
  assert.equal(e.isAccretive, false, 'a make-whole call must never be free money');
});

test('a cheap call on expensive paper does clear', () => {
  const e = callEconomics({ couponRate: 0.09, currentFairRate: 0.04, remainingYears: 8,
    premiumPerDollar: 0.02, materialSavingAnnual: 0.01 });
  assert.equal(e.isAccretive, true);
});

test('an immaterial saving never clears, whatever the arithmetic says', () => {
  // A treasurer does not run a refinancing for a basis point.
  const e = callEconomics({ couponRate: 0.0405, currentFairRate: 0.04, remainingYears: 20,
    premiumPerDollar: 0, materialSavingAnnual: 0.01 });
  assert.equal(e.isAccretive, false);
});

test('a floating tranche has nothing to refinance into and never calls', () => {
  const e = callEconomics({ couponRate: undefined, currentFairRate: 0.04, remainingYears: 5,
    premiumPerDollar: 0, materialSavingAnnual: 0.01 });
  assert.equal(e.savingPvPerDollar, 0);
  assert.equal(e.isAccretive, false);
});

test('the callable size is smaller than the free version, because cash covers the premium', () => {
  // 100 of cash over the floor at a 25% premium buys 80 of principal, not 100.
  assert.equal(callableAmountUSD({ tranchePrincipalUSD: 1000, cashLocal: 100, cashFloorUSD: 0,
    premiumPerDollar: 0.25 }), 80);
  // And never more than the tranche itself.
  assert.equal(callableAmountUSD({ tranchePrincipalUSD: 50, cashLocal: 1e9, cashFloorUSD: 0,
    premiumPerDollar: 0 }), 50);
});

test('a firm at or below its cash floor calls nothing', () => {
  assert.equal(callableAmountUSD({ tranchePrincipalUSD: 1000, cashLocal: 100, cashFloorUSD: 100,
    premiumPerDollar: 0 }), 0);
  assert.equal(callableAmountUSD({ tranchePrincipalUSD: 1000, cashLocal: -1e9, cashFloorUSD: 0,
    premiumPerDollar: 0 }), 0);
});

test('the maturity window is what has to be refinanced or repaid', () => {
  const ladder = [{ principalLocal: 1, maturityWeek: 10 }, { principalLocal: 1, maturityWeek: 100 },
                  { principalLocal: 1 }];
  assert.equal(tranchesDueWithin(ladder, 5, 52).length, 1);
  assert.equal(tranchesDueWithin(ladder, 5, 200).length, 2, 'undated paper is never "due"');
});

test('a ladder carries no zero rungs', () => {
  assert.equal(dropExhausted([{ principalLocal: 0 }, { principalLocal: 0.005 }, { principalLocal: 5 }], 0.01).length, 1);
});
