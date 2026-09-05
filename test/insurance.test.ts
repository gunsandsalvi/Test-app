/**
 * §3.16b-i — an insurer has a book, a price and its own losses. The price answers its own
 * experience and its own capital; the book opens at what the seed stated.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteInsuranceRate, nextLossPerCover, openInsuranceBook, placeInsuranceRenewals, PREMIUM_TO_SURPLUS_RATIO, corporateInsurableBaseLocal, householdInsurableBaseLocal } from '../src/domain/institutions';

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
  assert.equal(corporateInsurableBaseLocal([{ costLocal: 40, enteredServiceWeek: 0, usefulLifeYears: 10, kind: 'heavy_equipment' }], 60, 5), 100);
  assert.equal(householdInsurableBaseLocal(-5, 20), 20);
});

test('§3.16b-ii: a policy moves to the insurer that prices lower, within its capacity; no surplus, no renewals', () => {
  // Three books of 300 on a base of 900; a week's renewals are 300/52 each.
  const base = 900;
  const cheap = { id: 'A', coverLocal: 300, rateAnnual: 0.010, surplusLocal: 1000 };
  const dear = { id: 'B', coverLocal: 300, rateAnnual: 0.012, surplusLocal: 1000 };
  const broke = { id: 'C', coverLocal: 300, rateAnnual: 0.011, surplusLocal: 0 };
  const r = placeInsuranceRenewals([cheap, dear, broke], base, 52, 1.2);
  const keep = 300 * (1 - 1 / 52);
  assert.ok(Math.abs(r.coverById.get('C')! - keep) < 1e-9, 'the insurer with no surplus keeps only what has not renewed');
  assert.ok(Math.abs(r.coverById.get('B')! - keep) < 1e-9, 'the dearer insurer wins nothing while the cheaper has capacity');
  assert.ok(Math.abs(r.coverById.get('A')! - (keep + 3 * (300 / 52))) < 1e-9, 'every renewal went to the lowest quote');
  assert.equal(r.unplacedLocal, 0);
  assert.ok(Math.abs([...r.coverById.values()].reduce((a, v) => a + v, 0) - base) < 1e-9, 'the region\'s cover is what there is to insure');
});

test('§3.16b-ii: capacity binds at surplus × PSR / rate, the next quote takes the rest, and what nobody can write is unplaced', () => {
  const a = { id: 'A', coverLocal: 0, rateAnnual: 0.010, surplusLocal: 5 };   // capacity 5 × 1.2 / 0.01 = 600
  const b = { id: 'B', coverLocal: 0, rateAnnual: 0.020, surplusLocal: 2 };   // capacity 120
  const r = placeInsuranceRenewals([a, b], 1000, 52, 1.2);
  assert.ok(Math.abs(r.coverById.get('A')! - 600) < 1e-9);
  assert.ok(Math.abs(r.coverById.get('B')! - 120) < 1e-9);
  assert.ok(Math.abs(r.unplacedLocal - 280) < 1e-9);
  const shrunk = placeInsuranceRenewals([{ id: 'A', coverLocal: 600, rateAnnual: 0.01, surplusLocal: 100 }], 100, 52, 1.2);
  assert.ok(Math.abs(shrunk.coverById.get('A')! - 100) < 1e-9, 'a base that fell faster than a term\'s renewals squeezes the book to it');
  assert.equal(placeInsuranceRenewals([{ id: 'Z', coverLocal: 0, rateAnnual: 0, surplusLocal: 100 }], 50).coverById.get('Z'), 0, 'nobody sells cover for nothing');
});
