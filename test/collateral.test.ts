/**
 * §7.230: the engine reconciled at a 1-dollar tolerance and the harness checked at 1e6, so a bank
 * could be a million dollars over-pledged, pass the reconcile, and fail the check in the same week.
 * Two attempts at that §6.1 row failed because of it (§7.226).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overPledgedByBond, isFullyBacked, pledgedFaceByBond, PLEDGE_ROUNDING_TOLERANCE_USD }
  from '../src/domain/collateral';

const position = (pledged: [string, number][], held: [string, number][]) =>
  ({ pledgedByBond: new Map(pledged), heldByBond: new Map(held) });

test('the gap the two tolerances used to disagree about is caught', () => {
  // 500k over-pledged: under the old harness tolerance of 1e6 this was invisible.
  const p = position([['USA-GOV-B13-4', 1_500_000]], [['USA-GOV-B13-4', 1_000_000]]);
  assert.equal(overPledgedByBond(p).get('USA-GOV-B13-4'), 500_000);
  assert.equal(isFullyBacked(p), false);
});

test('a bond pledged against nothing held is over-pledged by the whole face', () => {
  const p = position([['USA-GOV-B26-9', 250e6]], []);
  assert.equal(overPledgedByBond(p).get('USA-GOV-B26-9'), 250e6);
});

test('the tolerance is a rounding allowance and nothing more', () => {
  assert.ok(PLEDGE_ROUNDING_TOLERANCE_USD <= 1);
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 1_000_000.5]], [['USA-GOV-5Y-INIT', 1_000_000]])), true);
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 1_000_002]], [['USA-GOV-5Y-INIT', 1_000_000]])), false);
});

test('holding more than is pledged is never a violation', () => {
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 10]], [['USA-GOV-5Y-INIT', 1e9]])), true);
});

test('pledges sum across every contract a borrower has open', () => {
  const book = [
    { borrowerTicker: 'XIVF', collateral: [{ bondId: 'USA-GOV-B13-4', faceUSD: 100 }] },
    { borrowerTicker: 'XIVF', collateral: [{ bondId: 'USA-GOV-B13-4', faceUSD: 250 }] },
    { borrowerTicker: 'OTHR', collateral: [{ bondId: 'USA-GOV-B13-4', faceUSD: 999 }] },
  ];
  assert.equal(pledgedFaceByBond(book, 'XIVF').get('USA-GOV-B13-4'), 350);
});
