/**
 * §3.26b-i / §3.13-BOOK g-i — DWELLINGS EXIST, ON THE REGISTER: the household sector's dwellings are
 * a DWELLING row on its own book whose lots are the houses at the price each was bought at; the
 * ownership rate and the stock's value are reads of it; a dwelling changing hands is a DWELLING wire
 * and the row in one operation, and W7 closes the identity per region.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownershipRateOf, housingStockValueLocal, householdsCountOf, dwellingInstrumentId } from '../src/domain/housing';
import { AVERAGE_HOUSEHOLD_SIZE } from '../src/domain/region-macro';
import { ensureV2 } from '../src/engine2/world';
import { bookRowsOf, rowLotsOf, rowBasisLocal } from '../src/engine2/holdings';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal, summarizeWires } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { moveDwellings, dwellingUnitsOf } from '../src/engine/ledger/dwelling-ledger';
import { householdBookId } from '../src/engine/ledger/holdings-ledger';
import { dwellingIdentityGaps } from '../src/engine/audit/wires';
import { companyPartyOf } from '../src/domain/party';
import { asEntityId } from '../src/domain/ids';

test('the ownership rate and the stock\'s value are reads of the register\'s units, never numbers written', () => {
  assert.equal(householdsCountOf(250_000), 250_000 / AVERAGE_HOUSEHOLD_SIZE);
  assert.ok(Math.abs(ownershipRateOf(62_000, 250_000) - 0.62) < 1e-12);
  assert.equal(housingStockValueLocal(62_000, 400_000), 62_000 * 400_000);
  // Twice the dwellings on the same population: twice the rate and twice the stock — nothing else moves them.
  assert.ok(Math.abs(ownershipRateOf(124_000, 250_000) - 1.24) < 1e-12);
  assert.equal(housingStockValueLocal(124_000, 400_000), 2 * housingStockValueLocal(62_000, 400_000));
  assert.equal(dwellingInstrumentId('USA'), 'DWELLING:USA');
});

test('a dwelling changing hands is a DWELLING wire and a lot on the sector\'s row; the summary nets it per region and W7 closes on it', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const builder = asEntityId('CO-BUILD');
  const hh = { kind: 'HOUSEHOLD' as const, region: 'USA' as const };
  const j = newWireJournal(1, 7);
  setActiveWireJournal(j);
  setActiveWireWorld(wireWorldOf(v2, [{ id: builder }], []));
  try {
    assert.equal(dwellingUnitsOf(v2, 'USA'), 0, 'no row yet');
    const n = moveDwellings(v2, companyPartyOf(builder), hh, 'USA', 120, 400_000, 'household purchase of a new dwelling');
    assert.ok(n >= 1, 'the kind the ledger declared and nothing wrote has a writer');
    assert.equal(dwellingUnitsOf(v2, 'USA'), 120, 'the sector\'s row holds what it bought');
    const [r] = bookRowsOf(v2, householdBookId('USA'));
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 120, priceLocal: 400_000, week: 7 }], 'a lot at the price the houses were bought at');
    assert.equal(rowBasisLocal(v2, r), 120 * 400_000, 'the stock has a basis now');
    assert.equal(moveDwellings(v2, companyPartyOf(builder), hh, 'USA', 0, 1, 'nothing'), -1);
    // A second week's purchase is a second lot; a sale out of the sector retires off the oldest first.
    setActiveWireJournal(newWireJournal(2, 8));
    moveDwellings(v2, companyPartyOf(builder), hh, 'USA', 30, 420_000, 'household purchase of a new dwelling');
    moveDwellings(v2, hh, companyPartyOf(builder), 'USA', 5, 410_000, 'sold back to the builder');
    assert.equal(dwellingUnitsOf(v2, 'USA'), 145);
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 115, priceLocal: 400_000, week: 7 }, { units: 30, priceLocal: 420_000, week: 8 }]);
    setActiveWireJournal(j);
    moveDwellings(v2, companyPartyOf(builder), { kind: 'HOUSEHOLD', region: 'EUR' }, 'EUR', 40, 300_000, 'a second region');
    moveDwellings(v2, { kind: 'HOUSEHOLD', region: 'EUR' }, companyPartyOf(builder), 'EUR', 5, 300_000, 'sold back');
    assert.equal(dwellingUnitsOf(v2, 'EUR'), 35);
  } finally {
    setActiveWireWorld(undefined);
    setActiveWireJournal(undefined);
  }
  const w = summarizeWires(j);
  assert.equal(w.byKind.DWELLING, 3);
  assert.deepEqual(w.dwellingNetUnitsByRegion, { USA: 120, EUR: 35 });
  assert.deepEqual(dwellingIdentityGaps({ USA: 1000, EUR: 800 }, { USA: 1120, EUR: 835 }, w.dwellingNetUnitsByRegion), [], 'every unit that moved has its wire');
  const off = dwellingIdentityGaps({ USA: 1000, EUR: 800 }, { USA: 1130, EUR: 835 }, w.dwellingNetUnitsByRegion);
  assert.deepEqual(off, [{ region: 'USA', gapUnits: 10 }], 'ten dwellings appeared with nothing saying so');
});
