/**
 * §3.17-iv-a — THE CLEARING HOUSE IS A PARTY WITH A BALANCE SHEET. It has a key the ledger reads
 * back, it is the house of the contract's MONEY, its cash is its rows at the region's banks, and
 * its sheet is that cash against the margin its live contracts posted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { partyKey, partyFromKey } from '../src/engine/ledger/party';
import { ccpParty, samePartyRef } from '../src/domain/party';
import { ccpOfContract, ccpOfMoney, ccpSheetOf, ccpFreeResourcesLocal } from '../src/domain/clearing-house';
import { openSectorRow, ccpCashOf, ccpDepositsAt, depositLinesAt } from '../src/engine/ledger/accounts';
import { strikeDerivatives, ccpSheetAt } from '../src/engine/ledger/contract-ledger';
import type { WeeklyStepContext } from '../src/engine/simulation/stages/context';
import type { DerivativeContract } from '../src/domain/derivatives/contract';
import { asEntityId, asTicker } from '../src/domain/ids';

test('a clearing house is a party the ledger keys by region and reads back', () => {
  const usa = ccpParty('USA');
  assert.equal(partyKey(usa), 'CCP:USA');
  const back = partyFromKey('CCP:USA');
  assert.ok(back && samePartyRef(back, usa));
  assert.ok(!samePartyRef(usa, { kind: 'CLEARING_HOUSE', region: 'USA' }), 'the cash books\' pass-through is a different party');
});

test('the house a contract clears at is the house of its money', () => {
  assert.deepEqual(ccpOfMoney('EUR'), ccpParty('EUR'));
  assert.deepEqual(ccpOfContract({ currency: 'JPY' }), ccpParty('JPN'));
  assert.deepEqual(ccpOfContract({ currency: 'USD' }), ccpParty('USA'));
});

test('the sheet: cash against margin held, and what is free beyond it', () => {
  assert.equal(ccpFreeResourcesLocal(ccpSheetOf(120, 100)), 20, 'a departed member\'s margin stays with the house');
  assert.equal(ccpFreeResourcesLocal(ccpSheetOf(90, 100)), -10, 'short of what it owes its members');
});

test('its cash is its rows at the region\'s banks, and each bank\'s row is a deposit line', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  openSectorRow(v2, ccpParty('USA'), asTicker('BK1'), 'USD', 600);
  openSectorRow(v2, ccpParty('USA'), asTicker('BK2'), 'USD', 400);
  assert.equal(ccpCashOf(v2, 'USA'), 1000);
  assert.equal(ccpCashOf(v2, 'EUR'), 0);
  assert.equal(ccpDepositsAt(v2, asTicker('BK1'), 'USD'), 600);
  const lines = depositLinesAt(v2, [], [], { id: asEntityId('BK2'), ticker: asTicker('BK2'), region: 'USA' });
  assert.equal(lines.ccpLocal, 400);
});

test('the sheet off the books: the house holds the margin its live contracts posted', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  setActiveWireWorld(wireWorldOf(v2, [{ id: dealer }], [{ id: a.id }]));
  try {
    const c: DerivativeContract = {
      id: 'USA-FXF-1-0', classId: 'FX_FORWARD', regionId: 'USA', currency: 'USD', a, b: { kind: 'BANK', id: dealer }, notional: 1e6, strike: 1.1,
      reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '', settledMarkLocal: 0, initialMarginLocal: 25_000, struckWeek: 1, maturityWeek: 14,
    };
    strikeDerivatives({ v2 } as unknown as WeeklyStepContext, [c]);
    openSectorRow(v2, ccpParty('USA'), asTicker('BK1'), 'USD', 25_000);
    const sheet = ccpSheetAt(v2, 'USA');
    assert.equal(sheet.marginHeldLocal, 25_000);
    assert.equal(sheet.cashLocal, 25_000);
    assert.equal(ccpFreeResourcesLocal(sheet), 0, 'the posting is the one inflow: cash equals margin');
  } finally {
    setActiveWireWorld(undefined);
  }
});
