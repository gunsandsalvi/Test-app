/** §3.15b-i — a workout keeps its own record of the week, so a story that develops can be told from it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estateWeekOf, estateWeekPaidLocal, Estate, CLAIM_SENIORITY } from '../src/domain/estate';
import { asEntityId, asTicker } from '../src/domain/ids';

test('the record is fresh when the week turns and the same object within a week', () => {
  const e: Estate = { companyId: asEntityId('KRLN'), ticker: asTicker('KRLN'), regionId: 'USA', openedWeek: 10, assets: { cashLocal: 0, receivablesLocal: 0, inventoryLocal: 0, ppeLocal: 0 }, claims: [], distributedLocal: 0 };
  const w11 = estateWeekOf(e, 11);
  w11.paidByClassLocal[CLAIM_SENIORITY.SECURED - 1] += 40e6;
  w11.buyerIds.push(asEntityId('PEER'));
  assert.equal(estateWeekOf(e, 11), w11, 'the same week reads the same record');
  assert.equal(estateWeekPaidLocal(w11), 40e6);
  const w12 = estateWeekOf(e, 12);
  assert.notEqual(w12, w11);
  assert.deepEqual(w12, { week: 12, paidByClassLocal: [0, 0, 0], inventorySoldLocal: 0, ppeSoldLocal: 0, buyerIds: [] });
  assert.equal(e.lastWeek, w12, 'the estate carries only its latest week');
});
