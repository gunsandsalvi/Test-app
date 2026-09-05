/**
 * FIFO exists because a blended average destroys the thing that makes inventory interesting: a firm
 * that bought cheap into a risen market earns the difference and one that bought dear eats it.
 *
 * §3.13-INV-i: these assertions are made against the LIVE lane — the register's own lot columns
 * (`engine2/lots.ts`), which every week draws through. They used to be made against a second,
 * unreachable copy of the same rule in `domain/company-week/inventory.ts`, so the suite could stay
 * green while the code that runs went untested; that copy is deleted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentRatio } from '../src/domain/company-week/inventory';

test('a line needing nothing is fully fulfilled', () => {
  assert.equal(fulfillmentRatio(0, 0), 1);
  assert.equal(fulfillmentRatio(5, 10), 0.5);
  assert.equal(fulfillmentRatio(50, 10), 1, 'surplus is not over-fulfilment');
});

// §3.13-BOOK f3 — THE GOODS LOTS ARE THE REGISTER'S LOTS.
import { ensureV2 } from '../src/engine2/world';
import { pushLot, consumeFifo, goodRowOf, inputUnitsHeld, totalInputValueLocal, materializeInputInventory, openGoodsPass, closeGoodsPass, consumeFifoOnViews, GOOD_KIND } from '../src/engine2/lots';
import { rowLotsOf, rowUnits, bookRowsOf } from '../src/engine2/holdings';
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

