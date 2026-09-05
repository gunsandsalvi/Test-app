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


// §3.13-INV-ii — A RUNNING BALANCE CARRIES ITS BASIS; IT DOES NOT VALUE ANYTHING.
import { setOutputStock } from '../src/engine/ledger/goods-ledger';

test('the mid-week balance carries the value per unit the row already had, at any quantity', () => {
  const sub = SUBUNITS[0];
  const prior = { unitsHeld: 100, valueLocal: 250 }; // 2.50 a unit, whatever the market is doing
  const sold: { outputInventoryBySubUnit?: Partial<Record<string, { unitsHeld: number; valueLocal: number }>> } = {};
  setOutputStock(sold, prior, sub, 60);
  assert.deepEqual(sold.outputInventoryBySubUnit![sub], { unitsHeld: 60, valueLocal: 150 },
    'forty units left and the basis per unit is untouched');
  // Sold out: no units, no value, and no division by zero on the way.
  const empty: typeof sold = {};
  setOutputStock(empty, prior, sub, 0);
  assert.deepEqual(empty.outputInventoryBySubUnit![sub], { unitsHeld: 0, valueLocal: 0 });
  // A row the firm did not hold before opens at nothing rather than at an invented price.
  const fresh: typeof sold = {};
  setOutputStock(fresh, undefined, sub, 40);
  assert.deepEqual(fresh.outputInventoryBySubUnit![sub], { unitsHeld: 40, valueLocal: 0 });
  // A prior row of zero units cannot imply a price either.
  const degenerate: typeof sold = {};
  setOutputStock(degenerate, { unitsHeld: 0, valueLocal: 99 }, sub, 10);
  assert.deepEqual(degenerate.outputInventoryBySubUnit![sub], { unitsHeld: 10, valueLocal: 0 });
});

// §3.13-INV-ii-b — SPOILAGE DESTROYS UNITS, AND THE JOURNAL SAYS SO (goods.md E4).
import { spoilOutputStock } from '../src/engine/ledger/goods-ledger';
import { newWireJournal, setActiveWireJournal, summarizeWires } from '../src/engine/ledger/wire';

test('what perishes is units; the value follows at the row\'s own basis, and W4 can see it', () => {
  const sub = SUBUNITS[0], other = SUBUNITS[1];
  const j = newWireJournal(1, 4);
  setActiveWireJournal(j);
  let out;
  try {
    out = spoilOutputStock(
      { [sub]: { unitsHeld: 200, valueLocal: 500 }, [other]: { unitsHeld: 50, valueLocal: 100 } },
      'USA', (su) => (su === sub ? 0.1 : 0),
    );
  } finally { setActiveWireJournal(undefined); }
  assert.deepEqual(out[sub], { unitsHeld: 180, valueLocal: 450 }, 'a tenth perished, and 2.50 a unit is still 2.50 a unit');
  assert.deepEqual(out[other], { unitsHeld: 50, valueLocal: 100 }, 'a good that does not perish is untouched');
  // The units did not merely vanish: the week's journal carries the transformation W4 replays.
  assert.equal(summarizeWires(j).goodsFlowByKey[`USA|${sub}`]?.scrappedUnits, 20);
  assert.equal(summarizeWires(j).goodsFlowByKey[`USA|${other}`], undefined);
});

test('a share at or beyond the whole shelf life takes the stock, and never more than it', () => {
  const sub = SUBUNITS[0];
  const j = newWireJournal(1, 4);
  setActiveWireJournal(j);
  let all, none;
  try {
    all = spoilOutputStock({ [sub]: { unitsHeld: 30, valueLocal: 90 } }, 'USA', () => 4);
    none = spoilOutputStock({ [sub]: { unitsHeld: 30, valueLocal: 90 } }, 'USA', () => -1);
  } finally { setActiveWireJournal(undefined); }
  assert.deepEqual(all[sub], { unitsHeld: 0, valueLocal: 0 }, 'a rate over one perishes the stock, not more than it');
  assert.deepEqual(none[sub], { unitsHeld: 30, valueLocal: 90 }, 'a negative rate cannot create units');
  assert.equal(summarizeWires(j).goodsFlowByKey[`USA|${sub}`]?.scrappedUnits, 30);
});
