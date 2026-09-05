/**
 * §3.26b-i — DWELLINGS EXIST: the owner-occupied stock is units with an owner, the ownership rate
 * and the stock's value are reads of it, a dwelling changing hands is a HOUSE wire, and W7 closes
 * the identity per region.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownershipRateOf, housingStockValueLocal, householdsCountOf, dwellingAssetOf } from '../src/domain/housing';
import { AVERAGE_HOUSEHOLD_SIZE } from '../src/domain/region-macro';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal, summarizeWires } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { moveDwellings } from '../src/engine/ledger/dwelling-ledger';
import { dwellingIdentityGaps } from '../src/engine/audit/wires';
import { companyPartyOf } from '../src/domain/party';
import { asEntityId } from '../src/domain/ids';

test('the ownership rate and the stock\'s value are reads of the register, never numbers written', () => {
  const hm = { ownerOccupiedUnits: 62_000, medianHomePriceLocal: 400_000 };
  assert.equal(householdsCountOf(250_000), 250_000 / AVERAGE_HOUSEHOLD_SIZE);
  assert.ok(Math.abs(ownershipRateOf(hm, 250_000) - 0.62) < 1e-12);
  assert.equal(housingStockValueLocal(hm), 62_000 * 400_000);
  // Twice the dwellings on the same population: twice the rate and twice the stock — nothing else moves them.
  const more = { ...hm, ownerOccupiedUnits: 124_000 };
  assert.ok(Math.abs(ownershipRateOf(more, 250_000) - 1.24) < 1e-12);
  assert.equal(housingStockValueLocal(more), 2 * housingStockValueLocal(hm));
  assert.equal(dwellingAssetOf('USA'), 'DWELLING:USA');
});

test('a dwelling changing hands is a HOUSE wire the summary nets per region, and W7 closes on it', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const builder = asEntityId('CO-BUILD');
  const j = newWireJournal(1, 7);
  setActiveWireJournal(j);
  setActiveWireWorld(wireWorldOf(v2, [{ id: builder }], []));
  try {
    const n = moveDwellings(companyPartyOf(builder), { kind: 'HOUSEHOLD', region: 'USA' }, 'USA', 120, 400_000, 'household purchase of a new dwelling');
    assert.ok(n >= 1, 'the kind the ledger declared and nothing wrote has a writer');
    assert.equal(moveDwellings(companyPartyOf(builder), { kind: 'HOUSEHOLD', region: 'USA' }, 'USA', 0, 1, 'nothing'), -1);
    moveDwellings({ kind: 'HOUSEHOLD', region: 'EUR' }, companyPartyOf(builder), 'EUR', 5, 300_000, 'sold back');
  } finally {
    setActiveWireWorld(undefined);
    setActiveWireJournal(undefined);
  }
  const w = summarizeWires(j);
  assert.equal(w.byKind.HOUSE, 2);
  assert.deepEqual(w.dwellingNetUnitsByRegion, { USA: 120, EUR: -5 });
  assert.deepEqual(dwellingIdentityGaps({ USA: 1000, EUR: 800 }, { USA: 1120, EUR: 795 }, w.dwellingNetUnitsByRegion), [], 'every unit that moved has its wire');
  const off = dwellingIdentityGaps({ USA: 1000, EUR: 800 }, { USA: 1130, EUR: 795 }, w.dwellingNetUnitsByRegion);
  assert.deepEqual(off, [{ region: 'USA', gapUnits: 10 }], 'ten dwellings appeared with nothing saying so');
});
