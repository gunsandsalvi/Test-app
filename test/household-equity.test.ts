/** §3.13 C2.a — the household sector's buy side: a split read off its book, a budget that is a claim on money, an indexer's schedule. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directShareOfEquitySaving, householdDirectBudgetLocal, householdDirectPurchaseShares } from '../src/domain/household-equity';
import { asInstrumentId } from '../src/domain/ids';

test('the split is the mix the sector already holds; a sector holding nothing directly is the indexer it was', () => {
  assert.equal(directShareOfEquitySaving(300, 100), 0.75);
  assert.equal(directShareOfEquitySaving(0, 500), 0);
  assert.equal(directShareOfEquitySaving(500, 0), 1);
  assert.equal(directShareOfEquitySaving(0, 0), 0, 'nothing held either way: all of it goes to the broad fund');
  assert.equal(directShareOfEquitySaving(-5, 100), 0, 'a negative mark is not a holding');
});

test('the budget is the announced slice, and never more than the deposits above the buffer floor', () => {
  assert.equal(householdDirectBudgetLocal({ announcedLocal: 100, depositsLocal: 1_000, bufferFloorLocal: 950 }), 50);
  assert.equal(householdDirectBudgetLocal({ announcedLocal: 100, depositsLocal: 1_000, bufferFloorLocal: 500 }), 100);
  assert.equal(householdDirectBudgetLocal({ announcedLocal: 100, depositsLocal: 400, bufferFloorLocal: 500 }), 0, 'below the floor nothing is bid');
  assert.equal(householdDirectBudgetLocal({ announcedLocal: 0, depositsLocal: 1_000, bufferFloorLocal: 0 }), 0);
});

test('the schedule spreads the budget across the float by value at the reference price; no float, no bid', () => {
  const a = asInstrumentId('EQ:A'), b = asInstrumentId('EQ:B'), c = asInstrumentId('EQ:C');
  const shares = householdDirectPurchaseShares(1_000, [
    { id: a, refPrice: 10, floatValueLocal: 3_000 },
    { id: b, refPrice: 50, floatValueLocal: 1_000 },
    { id: c, refPrice: 20, floatValueLocal: 0 },
  ]);
  assert.equal(shares.get(a), 75, 'three quarters of the budget, at 10 a share');
  assert.equal(shares.get(b), 5, 'a quarter of it, at 50 a share');
  assert.equal(shares.has(c), false, 'a name with no float is not for sale');
  const spentAtReference = [...shares.entries()].reduce((s, [id, n]) => s + n * (id === a ? 10 : 50), 0);
  assert.equal(spentAtReference, 1_000, 'the whole budget is committed at the reference price');
  assert.equal(householdDirectPurchaseShares(0, [{ id: a, refPrice: 10, floatValueLocal: 1 }]).size, 0);
  assert.equal(householdDirectPurchaseShares(100, []).size, 0);
});
