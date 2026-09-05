/** §3.15b-ii — the week's auction is recorded rung by rung, and summarised for the story. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordPrimaryOffering, auctionSummaryOf, AuctionRecord } from '../src/domain/government';

test('a region keeps the latest week only, and the summary names the shortfalls largest first', () => {
  const reg: { lastAuction?: AuctionRecord } = {};
  recordPrimaryOffering(reg, 10, { bondId: 'USA-GOV-2Y-1', kind: 'BOND', offeredLocal: 10e9, placedLocal: 10e9, withdrawnLocal: 0 });
  recordPrimaryOffering(reg, 10, { bondId: 'USA-GOV-10Y-1', kind: 'BOND', offeredLocal: 8e9, placedLocal: 5e9, withdrawnLocal: 3e9 });
  recordPrimaryOffering(reg, 10, { bondId: 'USA-GOV-3M-1', kind: 'BILL', offeredLocal: 4e9, placedLocal: 0, withdrawnLocal: 4e9 });
  recordPrimaryOffering(reg, 10, { bondId: 'USA-GOV-5Y-1', kind: 'BOND', offeredLocal: 0, placedLocal: 0, withdrawnLocal: 0 });
  assert.equal(reg.lastAuction?.offerings.length, 3, 'a rung with nothing on offer is not an offering');
  const a = auctionSummaryOf(reg.lastAuction!.offerings);
  assert.equal(a.offeredLocal, 22e9);
  assert.equal(a.placedLocal, 15e9);
  assert.equal(a.withdrawnLocal, 7e9);
  assert.ok(a.coverage !== undefined && Math.abs(a.coverage - 15 / 22) < 1e-12);
  assert.deepEqual(a.shortfalls.map((o) => o.bondId), ['USA-GOV-3M-1', 'USA-GOV-10Y-1']);
  recordPrimaryOffering(reg, 11, { bondId: 'USA-GOV-2Y-1', kind: 'BOND', offeredLocal: 1e9, placedLocal: 1e9, withdrawnLocal: 0 });
  assert.equal(reg.lastAuction.week, 11);
  assert.equal(reg.lastAuction.offerings.length, 1, 'the week turned and the record opened fresh');
  assert.equal(auctionSummaryOf([]).coverage, undefined);
});
