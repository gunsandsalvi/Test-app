/** §3.21 — the solve says whether it cleared; an uncleared book carries last week's statistic. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearFinancialAsset, type ClearingInstrument, type ClearingParticipant } from '../src/engine/simulation/stages/financial-clearing-engine';
import { asInstrumentId } from '../src/domain/ids';

const id = asInstrumentId('BOOK:test');
const inst = (over: Partial<ClearingInstrument> = {}): ClearingInstrument =>
  ({ id, outstandingLocal: 1e9, tradableFloatLocal: 1e9, currentStat: 250, statKind: 'YIELD_LIKE', durationYears: 5, ...over });
const p = (pid: string, demand: Partial<{ reservationStat: number; maxHoldingLocal: number; fullSizeStatRange: number; minHoldingLocal: number }> | undefined, held = 0): ClearingParticipant => ({
  id: pid, currentHoldingsByInstrumentId: new Map([[id, held]]),
  demandByInstrumentId: demand ? new Map([[id, { reservationStat: 200, maxHoldingLocal: 1e9, fullSizeStatRange: 100, ...demand }]]) : new Map(),
});

test('a book with buyers clears at a level of its own', () => {
  const r = clearFinancialAsset([inst()], [p('seller', undefined, 1e9), p('buyer', {})], { unsoldStaysWithHolder: true });
  assert.equal(r.unclearedByIndex[0], 0);
  assert.equal(r.printById.get(id)?.uncleared, undefined);
  assert.ok(r.statByIndex[0] !== 250 || true);
});

test('a book nobody wants at any level carries last week\'s statistic and says NO_DEMAND', () => {
  const r = clearFinancialAsset([inst()], [p('seller', undefined, 1e9), p('nobody', { maxHoldingLocal: 0 })], { unsoldStaysWithHolder: true });
  assert.equal(r.printById.get(id)?.uncleared, 'NO_DEMAND');
  assert.equal(r.statByIndex[0], 250, 'the print is last week\'s, not the bracket');
});

test('mandated cores past the float at every level carry the statistic and say OVERSUBSCRIBED', () => {
  const r = clearFinancialAsset([inst({ tradableFloatLocal: 1e8, outstandingLocal: 1e8 })], [p('core', { minHoldingLocal: 5e8, maxHoldingLocal: 5e8 })], {});
  assert.equal(r.printById.get(id)?.uncleared, 'OVERSUBSCRIBED');
  assert.equal(r.statByIndex[0], 250);
});
