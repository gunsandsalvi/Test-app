/**
 * §7.230: the engine reconciled at a 1-dollar tolerance and the harness checked at 1e6, so a bank
 * could be a million dollars over-pledged, pass the reconcile, and fail the check in the same week.
 * Two attempts at that §6.1 row failed because of it (§7.226).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overPledgedByBucket, isFullyBacked, pledgedFaceByBucket, PLEDGE_ROUNDING_TOLERANCE_USD }
  from '../src/domain/collateral';

const position = (pledged: [string, number][], held: [string, number][]) =>
  ({ pledgedByBucket: new Map(pledged), heldByBucket: new Map(held) });

test('the gap the two tolerances used to disagree about is caught', () => {
  // 500k over-pledged: under the old harness tolerance of 1e6 this was invisible.
  const p = position([['b13', 1_500_000]], [['b13', 1_000_000]]);
  assert.equal(overPledgedByBucket(p).get('b13'), 500_000);
  assert.equal(isFullyBacked(p), false);
});

test('a bucket pledged against nothing held is over-pledged by the whole face', () => {
  const p = position([['b26', 250e6]], []);
  assert.equal(overPledgedByBucket(p).get('b26'), 250e6);
});

test('the tolerance is a rounding allowance and nothing more', () => {
  assert.ok(PLEDGE_ROUNDING_TOLERANCE_USD <= 1);
  assert.equal(isFullyBacked(position([['t5', 1_000_000.5]], [['t5', 1_000_000]])), true);
  assert.equal(isFullyBacked(position([['t5', 1_000_002]], [['t5', 1_000_000]])), false);
});

test('holding more than is pledged is never a violation', () => {
  assert.equal(isFullyBacked(position([['t5', 10]], [['t5', 1e9]])), true);
});

test('pledges sum across every contract a borrower has open', () => {
  const book = [
    { borrowerTicker: 'XIVF', collateral: [{ bucketKey: 'b13', faceUSD: 100 }] },
    { borrowerTicker: 'XIVF', collateral: [{ bucketKey: 'b13', faceUSD: 250 }] },
    { borrowerTicker: 'OTHR', collateral: [{ bucketKey: 'b13', faceUSD: 999 }] },
  ];
  assert.equal(pledgedFaceByBucket(book, 'XIVF').get('b13'), 350);
});
