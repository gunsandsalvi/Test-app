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

// §3.13-INV-iv — WHAT A BATCH COST, AND WHETHER THERE WAS A BATCH AT ALL.
import { advanceProductionPipeline } from '../src/engine/simulation/stages/05-unit-bidding';

test('a lead is a queue: what arrives is what was started that many weeks ago, with its own cost', () => {
  // Week 1 on a three-week line: the queue seeds full, so the firm is in steady state rather than
  // a year of nothing — and what arrives is one week's batch, not three.
  const w1 = advanceProductionPipeline(undefined, 3, 10, 30);
  assert.deepEqual({ u: w1.arrivedUnits, v: w1.arrivedValueLocal }, { u: 10, v: 30 });
  assert.equal(w1.queue.length, 3);
  // A dearer week goes in behind the cheaper ones and comes out three weeks later, at ITS cost.
  let q = w1.queue;
  for (const [units, cost] of [[10, 60], [10, 90], [10, 120]] as const) {
    q = advanceProductionPipeline(q, 3, units, cost).queue;
  }
  const arrived = advanceProductionPipeline(q, 3, 0, 0);
  assert.equal(arrived.arrivedValueLocal, 60, 'the week that cost 60 arrives, not the week that cost 120');
});

test('a week that starts nothing capitalises nothing — a cost per unit is never a division by zero', () => {
  // The caller hands a zero cost when it starts no units; the lot that reaches the queue is empty
  // in both, so nothing downstream can read an infinite unit cost off it.
  const idle = advanceProductionPipeline(undefined, 2, 0, 0);
  assert.deepEqual(idle.queue, [{ units: 0, valueLocal: 0 }, { units: 0, valueLocal: 0 }]);
  const drained = advanceProductionPipeline(idle.queue, 2, 0, 0);
  assert.equal(drained.arrivedUnits, 0);
  assert.equal(drained.arrivedValueLocal, 0);
  // A line with no lead at all passes the week straight through, cost and units together.
  const instant = advanceProductionPipeline(undefined, 0, 7, 21);
  assert.deepEqual({ u: instant.arrivedUnits, v: instant.arrivedValueLocal, q: instant.queue }, { u: 7, v: 21, q: [] });
});

test('a firm\'s first week on a line opens in steady state, and its opening batches carry a real cost', () => {
  // §3.13-INV-iv-b: the seeded queue is an opening STOCK — units at the week's own rate, so what
  // arrives is valued at what it would have cost. Seeded at zero it would be free goods, and the
  // firm's first `lead` weeks of sales would book a windfall margin.
  const first = advanceProductionPipeline(undefined, 4, 25, 100);
  assert.equal(first.arrivedUnits, 25, 'in steady state from the first week, not a year of silence');
  assert.equal(first.arrivedValueLocal, 100);
  assert.equal(first.queue.length, 4);
  assert.deepEqual(new Set(first.queue.map((l) => l.valueLocal)), new Set([100]), 'every opening lot is stated at the same rate');
  // The unit cost of what arrives is the unit cost of what it is making — no windfall, no infinity.
  assert.equal(first.arrivedValueLocal / first.arrivedUnits, 4);
});

// §3.13-INV-v — FINISHED STOCK IS LOTS AT WHAT IT COST TO MAKE.
import { writeFinishedRows, finishedStockOf, finishedUnitsOf, drawFinishedFifo, produceFinishedLot } from '../src/engine/ledger/goods-ledger';

test('a week\'s production is a lot at its own cost, and a delivery draws the oldest and returns what it cost', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const sub = SUBUNITS[0];
  produceFinishedLot(v2, 'USA_ACME', 'USA', sub, 100, 200, 1);  // 2.00 a unit
  produceFinishedLot(v2, 'USA_ACME', 'USA', sub, 100, 500, 2);  // 5.00 a unit — a dearer week
  assert.equal(finishedUnitsOf(v2, 'USA_ACME', sub), 200);
  assert.deepEqual(finishedStockOf(v2, 'USA_ACME'), [{ subUnitId: sub, units: 200, costLocal: 700 }]);
  // Selling 150 takes the whole cheap batch and half the dear one: COGS is what THOSE units cost.
  const cogs = drawFinishedFifo(v2, 'USA_ACME', sub, 150, 3);
  assert.equal(cogs, 200 + 50 * 5);
  assert.equal(finishedUnitsOf(v2, 'USA_ACME', sub), 50);
  assert.deepEqual(finishedStockOf(v2, 'USA_ACME'), [{ subUnitId: sub, units: 50, costLocal: 250 }],
    'what is left is the dear batch, at the dear batch\'s cost');
});

test('the week\'s rows are reconciled to the record they must equal, gross first', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const sub = SUBUNITS[0], other = SUBUNITS[1];
  // Made 100 at 2.00 and sold 100: it nets to nothing, but the lot churn is real — the old batch
  // goes out at ITS cost and the new one comes in at its own.
  produceFinishedLot(v2, 'USA_ACME', 'USA', sub, 100, 100, 1); // last week, 1.00 a unit
  const r1 = writeFinishedRows(v2, 'USA_ACME', 'USA',
    { [sub]: { unitsHeld: 100, valueLocal: 999 } },
    { [sub]: { arrivedUnits: 100, arrivedCostLocal: 200, deliveredUnits: 100 } }, 2);
  assert.equal(r1.cogsLocal, 100, 'the units that left cost 1.00 each, not this week\'s 2.00');
  assert.deepEqual(finishedStockOf(v2, 'USA_ACME'), [{ subUnitId: sub, units: 100, costLocal: 200 }]);
  // Units that arrive from outside the goods flow (an estate's reclassified lots) come in at the
  // record's own value per unit, and a row the record no longer carries is closed.
  const r2 = writeFinishedRows(v2, 'USA_ACME', 'USA', { [other]: { unitsHeld: 40, valueLocal: 120 } }, undefined, 3);
  assert.equal(r2.cogsLocal, 0);
  assert.deepEqual(finishedStockOf(v2, 'USA_ACME'), [{ subUnitId: other, units: 40, costLocal: 120 }],
    'the good the record dropped is off the book; the one it gained is on it at 3.00 a unit');
});
