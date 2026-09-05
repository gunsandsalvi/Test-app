/**
 * §7.230: the engine reconciled at a 1-dollar tolerance and the harness checked at 1e6, so a bank
 * could be a million dollars over-pledged, pass the reconcile, and fail the check in the same week.
 * Two attempts at that §6.1 row failed because of it (§7.226).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overPledgedByBond, isFullyBacked, PLEDGE_ROUNDING_TOLERANCE_LOCAL }
  from '../src/domain/collateral';
import { asInstrumentId } from '../src/domain/ids';

/** §3.13-BOOK slice (a): a fixture is where a literal legitimately BECOMES an instrument id. */
const id = asInstrumentId;

const position = (pledged: [string, number][], held: [string, number][]) =>
  ({
    pledgedByBond: new Map(pledged.map(([k, v]) => [id(k), v] as const)),
    heldByBond: new Map(held.map(([k, v]) => [id(k), v] as const)),
  });

test('the gap the two tolerances used to disagree about is caught', () => {
  // 500k over-pledged: under the old harness tolerance of 1e6 this was invisible.
  const p = position([['USA-GOV-B13-4', 1_500_000]], [['USA-GOV-B13-4', 1_000_000]]);
  assert.equal(overPledgedByBond(p).get(id('USA-GOV-B13-4')), 500_000);
  assert.equal(isFullyBacked(p), false);
});

test('a bond pledged against nothing held is over-pledged by the whole face', () => {
  const p = position([['USA-GOV-B26-9', 250e6]], []);
  assert.equal(overPledgedByBond(p).get(id('USA-GOV-B26-9')), 250e6);
});

test('the tolerance is a rounding allowance and nothing more', () => {
  assert.ok(PLEDGE_ROUNDING_TOLERANCE_LOCAL <= 1);
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 1_000_000.5]], [['USA-GOV-5Y-INIT', 1_000_000]])), true);
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 1_000_002]], [['USA-GOV-5Y-INIT', 1_000_000]])), false);
});

test('holding more than is pledged is never a violation', () => {
  assert.equal(isFullyBacked(position([['USA-GOV-5Y-INIT', 10]], [['USA-GOV-5Y-INIT', 1e9]])), true);
});
