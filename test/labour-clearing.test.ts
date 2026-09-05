/** §3.24-i — the week's matches go to the highest bids; the marginal bid is the print. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearLabourMatches, remainingLabourBids, labourPrintOf, type LabourBid } from '../src/domain/labour-clearing';

const bids: LabourBid[] = [
  { key: 'LOW', units: 50, bidIndex: 0.95 },
  { key: 'HIGH', units: 20, bidIndex: 1.10 },
  { key: 'MID_A', units: 30, bidIndex: 1.00 },
  { key: 'MID_B', units: 10, bidIndex: 1.00 },
];

test('the highest bid fills first; an equal bid shares pro rata; the marginal bid is the print', () => {
  const a = clearLabourMatches(bids, 40);
  assert.equal(a.filledByKey.get('HIGH'), 20);
  // 20 left for the two bids at 1.00 (40 units posted): each fills half.
  assert.equal(a.filledByKey.get('MID_A'), 15);
  assert.equal(a.filledByKey.get('MID_B'), 5);
  assert.equal(a.filledByKey.has('LOW'), false);
  assert.equal(a.filledUnits, 40);
  assert.equal(labourPrintOf(bids, a.filledByKey), 1.00);
});

test('more matches than postings: everyone fills, and the lowest bid that filled is the print', () => {
  const a = clearLabourMatches(bids, 500);
  assert.equal(a.filledUnits, 110);
  assert.equal(a.filledByKey.get('LOW'), 50);
  assert.equal(labourPrintOf(bids, a.filledByKey), 0.95);
});

test('a bid below the seekers\' reservation takes nothing; nothing filled is no print', () => {
  const a = clearLabourMatches(bids, 500, 1.0);
  assert.equal(a.filledByKey.has('LOW'), false);
  assert.equal(a.filledUnits, 60);
  const none = clearLabourMatches(bids, 0);
  assert.equal(none.filledUnits, 0);
  assert.equal(labourPrintOf(bids, none.filledByKey), undefined);
});

test('a second pass clears what the first left, in the same order', () => {
  const first = clearLabourMatches(bids, 25);
  const rest = remainingLabourBids(bids, first.filledByKey);
  assert.deepEqual(rest.map((b) => [b.key, b.units]), [['LOW', 50], ['MID_A', 26.25], ['MID_B', 8.75]]);
  const second = clearLabourMatches(rest, 35);
  assert.equal(second.filledByKey.get('MID_A'), 26.25);
  assert.equal(second.filledByKey.get('MID_B'), 8.75);
  assert.equal(second.filledByKey.has('LOW'), false);
  assert.equal(second.filledUnits, 35);
});
