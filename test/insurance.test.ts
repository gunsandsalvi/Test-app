/**
 * §3.16b-i — an insurer has a book, a price and its own losses. The price answers its own
 * experience and its own capital; the book opens at what the seed stated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteInsuranceRate, nextLossPerCover, openInsuranceBook, PREMIUM_TO_SURPLUS_RATIO, corporateInsurableBaseLocal, householdInsurableBaseLocal } from '../src/domain/institutions';

test('the quote earns the expected claims plus the hurdle on the surplus held against the premium', () => {
  const rate = quoteInsuranceRate({ lossPerCoverAnnual: 0.02, requiredReturnAnnual: 0.06, premiumToSurplus: 1.2 });
  // rate = loss + hurdle × (rate / PSR)
  assert.ok(Math.abs(rate - (0.02 + 0.06 * rate / 1.2)) < 1e-15);
  assert.ok(quoteInsuranceRate({ lossPerCoverAnnual: 0.03, requiredReturnAnnual: 0.06, premiumToSurplus: 1.2 }) > rate, 'worse losses quote higher');
  assert.ok(quoteInsuranceRate({ lossPerCoverAnnual: 0.02, requiredReturnAnnual: 0.12, premiumToSurplus: 1.2 }) > rate, 'a dearer capital quotes higher');
  assert.equal(quoteInsuranceRate({ lossPerCoverAnnual: -1, requiredReturnAnnual: 0.06, premiumToSurplus: 1.2 }), 0);
  assert.throws(() => quoteInsuranceRate({ lossPerCoverAnnual: 0.02, requiredReturnAnnual: 1.5, premiumToSurplus: 1.2 }));
});

test('experience moves one policy-term step toward what the book cost; the seed book is the pool split by capital at the one rate', () => {
  assert.ok(Math.abs(nextLossPerCover(0.02, 0.072, 52) - (0.02 + 0.052 / 52)) < 1e-15);
  const a = openInsuranceBook({ regionBaseLocal: 1000, ownSurplusLocal: 30, regionSurplusLocal: 100, seedLossRatio: 0.7 });
  const b = openInsuranceBook({ regionBaseLocal: 1000, ownSurplusLocal: 70, regionSurplusLocal: 100, seedLossRatio: 0.7 });
  assert.equal(a.coverLocal + b.coverLocal, 1000, 'the region\'s cover is what there is to insure');
  assert.equal(a.rateAnnual, b.rateAnnual, 'one seed rate');
  assert.ok(Math.abs(a.rateAnnual * 1000 - 100 * PREMIUM_TO_SURPLUS_RATIO) < 1e-9, 'at which the region\'s premiums are what its capital let it write');
  assert.ok(Math.abs(a.lossPerCoverAnnual - 0.7 * a.rateAnnual) < 1e-15);
  assert.equal(corporateInsurableBaseLocal({ grossPPELocal: 40, annualRevenue: 60 }), 100);
  assert.equal(householdInsurableBaseLocal(-5, 20), 20);
});
