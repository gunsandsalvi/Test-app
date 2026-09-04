/**
 * FIFO exists because a blended average destroys the thing that makes inventory interesting: a firm
 * that bought cheap into a risen market earns the difference and one that bought dear eats it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeCarryingCost, consumeLotsFifo, fulfillmentRatio, CostedLot }
  from '../src/domain/company-week/inventory';

const lot = (unitsHeld: number, unitPriceLocal: number, acquiredWeek: number): CostedLot =>
  ({ unitsHeld, unitPriceLocal, acquiredWeek });

test('the oldest lot goes first, whatever order it is stored in', () => {
  const { costLocal, unitsTaken } = consumeLotsFifo([lot(10, 5, 9), lot(10, 1, 2)], 10);
  assert.equal(unitsTaken, 10);
  assert.equal(costLocal, 10, 'the week-2 lot at $1 is consumed before the week-9 lot at $5');
});

test('cost is what the units COST, not what they are worth now', () => {
  // The whole reason lots exist rather than one average.
  const cheapFirst = consumeLotsFifo([lot(5, 1, 1), lot(5, 100, 2)], 5);
  assert.equal(cheapFirst.costLocal, 5);
});

test('a partial lot is split, so no units are created or destroyed', () => {
  const { remaining, unitsTaken } = consumeLotsFifo([lot(10, 2, 1)], 4);
  assert.equal(unitsTaken, 4);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].unitsHeld, 6);
  assert.equal(remaining[0].unitPriceLocal, 2, 'the remainder keeps its own cost');
});

test('a firm cannot consume more than it holds', () => {
  const r = consumeLotsFifo([lot(3, 10, 1)], 1000);
  assert.equal(r.unitsTaken, 3);
  assert.equal(r.availableUnits, 3);
  assert.equal(r.remaining.length, 0);
});

test('per-lot costs are returned in consumption order, and they sum to the total', () => {
  // They are returned because the caller folds them into a running total spanning several
  // sub-units, and float addition is not associative — §7.237 caught this twice.
  const r = consumeLotsFifo([lot(2, 3, 1), lot(2, 7, 2)], 4);
  assert.deepEqual(r.costsLocal, [6, 14]);
  assert.equal(r.costsLocal.reduce((a, c) => a + c, 0), r.costLocal);
});

test('wanting nothing consumes nothing and leaves the stack alone', () => {
  const stack = [lot(5, 1, 1)];
  const r = consumeLotsFifo(stack, 0);
  assert.equal(r.unitsTaken, 0);
  assert.equal(r.remaining.length, 1);
  assert.equal(r.costLocal, 0);
});

test('a warehouse is not free, and the charge is reported separately from the stock', () => {
  const { stock, totalCostLocal } = chargeCarryingCost(
    { grain: { unitsHeld: 100, valueLocal: 5200 } }, () => 0.52);
  assert.equal(totalCostLocal, 52, '52% a year is 1% a week of 5200');
  assert.equal(stock.grain.valueLocal, 5148);
  assert.equal(stock.grain.unitsHeld, 100, 'the units do not evaporate — only the value does');
});

test('carrying cost never drives a stock value negative', () => {
  const { stock } = chargeCarryingCost({ x: { unitsHeld: 1, valueLocal: 10 } }, () => 5200);
  assert.ok(stock.x.valueLocal >= 0);
});

test('a line needing nothing is fully fulfilled', () => {
  assert.equal(fulfillmentRatio(0, 0), 1);
  assert.equal(fulfillmentRatio(5, 10), 0.5);
  assert.equal(fulfillmentRatio(50, 10), 1, 'surplus is not over-fulfilment');
});
