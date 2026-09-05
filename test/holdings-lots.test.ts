/**
 * §3.13-BOOK f1 — A POSITION IS A CHAIN OF LOTS, WRITERS FIRST. Every credit is a lot at the price
 * it arrived at, a debit consumes the oldest first, a desk's short is a negative lot, and the row's
 * units are always the chain's sum.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { bookRowsOf, rowLotsOf, rowLotUnits, rowUnits } from '../src/engine2/holdings';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { issueHolding, transferHolding, retireHolding, deskBookId } from '../src/engine/ledger/holdings-ledger';
import { seedLadder } from '../src/engine/ledger/tranche-ledger';
import { governmentIssuer } from '../src/domain/entity-keys';
import { bankSecuritiesPartyOf } from '../src/domain/party';
import { asEntityId, asInstrumentId } from '../src/domain/ids';

const bond = asInstrumentId('USA-GOV-5Y-INIT');
const spec = (units: number, price: number) => ({ instrumentType: 'GOV_BOND' as const, instrumentId: bond, issuerRegion: 'USA' as const, valueLocal: units * price, units });
const gov = { kind: 'GOVERNMENT' as const, region: 'USA' as const };
const house = { kind: 'CLEARING_HOUSE' as const, region: 'USA' as const };

test('a credit is a lot at its price, a debit consumes first-in-first-out, and the row is its lots', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const fund = { kind: 'INSTITUTION' as const, id: asEntityId('INST-F') };
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: fund.id }]));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.02, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    issueHolding(v2, gov, fund, spec(100, 1.0), 'seed');
    setActiveWireJournal(newWireJournal(2, 4));
    issueHolding(v2, gov, fund, spec(50, 1.0), 'a second fill, a week later');
    const [r] = bookRowsOf(v2, fund.id);
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 100, priceLocal: 1.0, week: 3 }, { units: 50, priceLocal: 1.0, week: 4 }]);
    assert.equal(rowLotUnits(v2, r), rowUnits(v2.holdings, r));
    // A sale of 120 takes the whole first lot and 20 of the second.
    transferHolding(v2, fund, house, spec(120, 1.0), 'sale');
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 30, priceLocal: 1.0, week: 4 }]);
    assert.equal(rowLotUnits(v2, r), rowUnits(v2.holdings, r));
    // A redemption consumes the same way; an emptied row leaves the chain, lots and all.
    retireHolding(v2, fund, gov, spec(30, 1.0), 'redemption');
    assert.deepEqual(bookRowsOf(v2, fund.id), []);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('a desk that sells what it does not have carries a negative lot, and covering consumes it', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const bank = asEntityId('USA_BANK1');
  const desk = bankSecuritiesPartyOf(bank);
  setActiveWireJournal(newWireJournal(1, 7));
  setActiveWireWorld(wireWorldOf(v2, [{ id: bank }], []));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.02, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    transferHolding(v2, desk, house, spec(40, 0.99), 'a short sale');
    const [r] = bookRowsOf(v2, deskBookId(bank));
    assert.deepEqual(rowLotsOf(v2, r), [{ units: -40, priceLocal: 0.99, week: 7 }]);
    transferHolding(v2, house, desk, spec(60, 1.01), 'covered and then some');
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 20, priceLocal: 1.01, week: 7 }]);
    assert.equal(rowLotUnits(v2, r), rowUnits(v2.holdings, r));
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('§3.13-BOOK f2a: a debit takes the units the wire names, and the value that leaves is the row\'s own mark on them', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const fund = { kind: 'INSTITUTION' as const, id: asEntityId('INST-G') };
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: fund.id }]));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.02, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    issueHolding(v2, gov, fund, spec(100, 0.98), 'bought cheap');
    issueHolding(v2, gov, fund, spec(50, 1.02), 'bought dear');
    const [r] = bookRowsOf(v2, fund.id);
    const H = v2.holdings;
    assert.equal(rowUnits(H, r), 150);
    assert.ok(Math.abs(H.qtyLocal[r] - 149) < 1e-9, 'carried at what it cost until a mark');
    // Sold 120 face at par: 120 units leave — not the 121 a value proportion would have taken —
    // and the value leaving is the row's mark on them (149 × 120/150), so what is left is still
    // units × mark. The oldest lot goes first.
    transferHolding(v2, fund, house, spec(120, 1.0), 'sale at par');
    assert.equal(rowUnits(H, r), 30);
    assert.ok(Math.abs(H.qtyLocal[r] - 149 * 30 / 150) < 1e-9);
    assert.deepEqual(rowLotsOf(v2, r), [{ units: 30, priceLocal: 1.02, week: 3 }]);
    assert.equal(rowLotUnits(v2, r), rowUnits(H, r));
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});
