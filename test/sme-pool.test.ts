/**
 * The test that would have caught §7.229's specimen defect on the day it was written.
 *
 * The old rule gave a sub-unit the pool had never sold into a share of exactly zero, for ever: no
 * offer produces no measurement produces no offer. It ran for sixty simulated weeks and surfaced
 * only as a downstream inflation number, because the rule lived inline in a 2,000-line stage and
 * nothing could ask it a question. It is four assertions.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capacityMixShares, subUnitsLockedOut } from '../src/domain/sme-pool';

const NEVER_SOLD_HERE = [
  { subUnitId: 'household_essentials', demandLevelAnnualLocal: 36_870_000_000, measuredRevenueUSD: 0 },
  { subUnitId: 'food_beverage', demandLevelAnnualLocal: 40_200_000_000, measuredRevenueUSD: 9_823_568_693 },
];

test('a pool with demand in front of it is never locked out of a market', () => {
  // THE DEFECT, DIRECTLY. Under the old rule this returned ['household_essentials'] every week for
  // ever, because measuredTotal > 0 selected the measured mix and that sub-unit had no entry.
  assert.deepEqual(subUnitsLockedOut(NEVER_SOLD_HERE), []);
  const share = capacityMixShares(NEVER_SOLD_HERE).get('household_essentials') ?? 0;
  assert.ok(share > 0, 'a market it has never sold into must still get capacity');
});

test('shares sum to one, which is what makes a silent zero visible', () => {
  const total = [...capacityMixShares(NEVER_SOLD_HERE).values()].reduce((a, v) => a + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

test('a pool that has sold everywhere follows its own book, not the demand', () => {
  // Trust is the coverage: with every sub-unit measured, the measured mix wins outright.
  const soldEverywhere = [
    { subUnitId: 'a', demandLevelAnnualLocal: 100, measuredRevenueUSD: 90 },
    { subUnitId: 'b', demandLevelAnnualLocal: 100, measuredRevenueUSD: 10 },
  ];
  const shares = capacityMixShares(soldEverywhere);
  assert.ok(Math.abs((shares.get('a') ?? 0) - 0.9) < 1e-9);
});

test('a pool that has sold nowhere follows the demand entirely', () => {
  const soldNowhere = [
    { subUnitId: 'a', demandLevelAnnualLocal: 300, measuredRevenueUSD: 0 },
    { subUnitId: 'b', demandLevelAnnualLocal: 100, measuredRevenueUSD: 0 },
  ];
  const shares = capacityMixShares(soldNowhere);
  assert.ok(Math.abs((shares.get('a') ?? 0) - 0.75) < 1e-9);
});
