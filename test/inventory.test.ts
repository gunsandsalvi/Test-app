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

// §3.13-BOOK f3 — THE GOODS LOTS ARE THE REGISTER'S LOTS.
import { ensureV2 } from '../src/engine2/world';
import { pushLot, consumeFifo, goodRowOf, inputUnitsHeld, totalInputValueLocal, materializeInputInventory, openGoodsPass, closeGoodsPass, consumeFifoOnViews, GOOD_KIND } from '../src/engine2/lots';
import { rowLotsOf, rowUnits, bookRowsOf, rowLotUnits } from '../src/engine2/holdings';
import { setSegmentStock, segmentStockUnits, segmentStockLocal, segmentStockRowOf } from '../src/engine/ledger/goods-ledger';
import { SUBUNITS, SUBUNIT_INDEX, NSUB } from '../src/engine2/state';
import { typeOf } from '../src/engine2/world';

test('a delivered lot is a GOOD row on the firm\'s book, drawn first-in-first-out by week', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const sub = SUBUNITS[0];
  pushLot(v2, 'USA_ACME', 'USA', sub, 'COMPANY:USA_BOLT', 10, 2, 5, 1);
  pushLot(v2, 'USA_ACME', 'USA', sub, 'COMPANY:USA_BOLT', 4, 3, 3, 2); // an earlier week, landing late
  const r = goodRowOf(v2, 'USA_ACME', sub);
  assert.ok(r >= 0);
  assert.equal(typeOf(v2, v2.holdings.typeRef[r]), GOOD_KIND);
  assert.equal(rowUnits(v2.holdings, r), 14);
  assert.equal(inputUnitsHeld(v2, 'USA_ACME', sub), 14);
  assert.equal(totalInputValueLocal(v2, 'USA_ACME'), 32);
  assert.deepEqual(materializeInputInventory(v2, 'USA_ACME')[sub].map((l) => [l.unitsHeld, l.unitPriceLocal, l.acquiredWeek, l.sellerId]), [[10, 2, 5, 'COMPANY:USA_BOLT'], [4, 3, 3, 'COMPANY:USA_BOLT']]);
  // The draw re-sorts by week: the week-3 lot goes first.
  const drawn = consumeFifo(v2, 'USA_ACME', sub, 6);
  assert.equal(drawn.availableUnits, 14);
  assert.deepEqual(drawn.costsLocal, [4 * 3, 2 * 2]);
  assert.deepEqual(rowLotsOf(v2, r).map((l) => [l.units, l.priceLocal, l.week]), [[8, 2, 5]]);
  assert.equal(rowUnits(v2.holdings, r), 8);
  // Drawn to nothing, the row leaves the book.
  consumeFifo(v2, 'USA_ACME', sub, 8);
  assert.equal(goodRowOf(v2, 'USA_ACME', sub), -1);
  assert.deepEqual(bookRowsOf(v2, 'USA_ACME'), []);
});

test('a production pass addresses the same lots by slot, and closing it writes the rows back', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const sub = SUBUNITS[1];
  pushLot(v2, 'USA_ACME', 'USA', sub, 'COMPANY:USA_BOLT', 10, 1, 1, 1);
  pushLot(v2, 'USA_ACME', 'USA', sub, 'COMPANY:USA_BOLT', 5, 2, 2, 2);
  const P = openGoodsPass(v2);
  const firmRow = v2.rowById.get('USA_ACME')!;
  const slot = firmRow * NSUB + SUBUNIT_INDEX.get(sub)!;
  assert.ok(P.rowOfSlot[slot] >= 0);
  const dead: number[] = [];
  const drawn = consumeFifoOnViews(P.views, firmRow, SUBUNIT_INDEX.get(sub)!, 12, null, dead);
  assert.equal(drawn.takenUnits, 12);
  assert.equal(dead.length, 1, 'the first lot was consumed whole and handed to the sink');
  closeGoodsPass(v2, P, [dead]);
  const r = goodRowOf(v2, 'USA_ACME', sub);
  assert.deepEqual(rowLotsOf(v2, r).map((l) => [l.units, l.priceLocal]), [[3, 2]]);
  assert.equal(rowUnits(v2.holdings, r), 3);
  assert.equal(v2.holdings.qtyLocal[r], 6);
});

test('§3.13-BOOK f5: a region\'s pool stock of a category is a GOOD row on its segment, in units at a price', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const sub = SUBUNITS[2];
  setSegmentStock(v2, 'USA', sub, 100, 2);
  const r = segmentStockRowOf(v2, 'USA', sub);
  assert.ok(r >= 0);
  assert.equal(segmentStockUnits(v2, 'USA', sub), 100);
  assert.equal(segmentStockLocal(v2, 'USA', sub), 200);
  assert.equal(rowLotUnits(v2, r), 100, 'the row is its lots');
  // The stock falls at a new price: the oldest lot is consumed, the value is re-struck.
  setSegmentStock(v2, 'USA', sub, 60, 3);
  assert.equal(segmentStockUnits(v2, 'USA', sub), 60);
  assert.equal(segmentStockLocal(v2, 'USA', sub), 180);
  assert.deepEqual(rowLotsOf(v2, r).map((l) => [l.units, l.priceLocal]), [[60, 2]]);
  assert.equal(segmentStockUnits(v2, 'EUR', sub), 0, 'another region holds its own');
});
