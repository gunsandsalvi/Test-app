/**
 * §7.226: PEF1 wired 0.495B out of a 0.000B account at week 12 and carried -0.50B for forty weeks,
 * because the distribution side was bounded by drawn capital alone while the CALL side ten lines
 * above was already bounded by real cash. One assertion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distributable, redeemable } from '../src/domain/fund';

test('a fund cannot distribute money it does not have', () => {
  // THE DEFECT: requested 0.495B, drawn capital 6.551B, balance 0.
  const d = distributable(495e6, 6_551e6, 0);
  assert.equal(d.payableLocal, 0);
  assert.equal(d.boundBy, 'cash');
});

test('and it names which constraint bound, because they mean different things', () => {
  // Short of cash is a liquidity event; at the drawn capital is simply finished returning it.
  assert.equal(distributable(100, 1000, 40).boundBy, 'cash');
  assert.equal(distributable(100, 40, 1000).boundBy, 'drawn-capital');
  assert.equal(distributable(100, 1000, 1000).boundBy, 'nothing');
});

test('a distribution never exceeds either bound, over a swept range', () => {
  for (const req of [0, 1, 1e6, 1e9]) {
    for (const drawn of [0, 5e5, 2e9]) {
      for (const cash of [0, 5e5, 2e9]) {
        const { payableLocal } = distributable(req, drawn, cash);
        assert.ok(payableLocal <= req + 1e-9 && payableLocal <= drawn + 1e-9 && payableLocal <= cash + 1e-9,
          `${req}/${drawn}/${cash} -> ${payableLocal}`);
        assert.ok(payableLocal >= 0);
      }
    }
  }
});

test('a negative balance can never fund a redemption', () => {
  assert.equal(redeemable(1e9, -5e8), 0);
});
