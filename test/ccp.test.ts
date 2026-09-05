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
import { strikeDerivatives, ccpSheetAt, memberMarginPostedLocal, bankMarginAtHouseLocal } from '../src/engine/ledger/contract-ledger';
import { newPaymentJournal, reasonText } from '../src/engine/simulation/stages/settlement';
import { newWireJournal, setActiveWireJournal } from '../src/engine/ledger/wire';
import { partyOf } from '../src/engine/ledger/party';
import { PARITY_FX } from '../src/domain/currency';
import { postInitialMargin, payThroughHouse } from '../src/engine/simulation/stages/derivative-lifecycle';
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
    openSectorRow(v2, ccpParty('USA'), asTicker('BK1'), 'USD', 50_000);
    const sheet = ccpSheetAt(v2, 'USA');
    assert.equal(sheet.marginHeldLocal, 50_000, '§3.17-iv-b: both members posted');
    assert.equal(sheet.cashLocal, 50_000);
    assert.equal(ccpFreeResourcesLocal(sheet), 0, 'the postings are the one inflow: cash equals margin');
    assert.equal(memberMarginPostedLocal(v2, a, 'USD'), 25_000, 'the fund\'s margin at the house');
    assert.equal(bankMarginAtHouseLocal(v2, dealer), 25_000, 'the dealer\'s margin at the house is its asset');
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('§3.17-iv-b: every leg goes through the house — both members post to it, and a departed member\'s leg is not written', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'BANK' as const, id: dealer };
  const c: DerivativeContract = {
    id: 'USA-FXF-1-0', classId: 'FX_FORWARD', regionId: 'USA', currency: 'USD', a, b, notional: 1e6, strike: 1.1,
    reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '', settledMarkLocal: 0, initialMarginLocal: 25_000, struckWeek: 1, maturityWeek: 14,
  };
  const journal = newPaymentJournal();
  const ctx = { v2, paymentJournal: journal, pendingNetById: [], pendingTouchedIds: [], fx: PARITY_FX } as unknown as WeeklyStepContext;
  setActiveWireJournal(newWireJournal(1, 0));
  try {
    const legs = () => Array.from({ length: journal.n }, (_, i) => ({ payer: partyKey(partyOf(journal.payerId[i])), payee: partyKey(partyOf(journal.payeeId[i])), amount: journal.amount[i], reason: reasonText(journal.reasonId[i]) }));
    postInitialMargin(ctx, c);
    assert.deepEqual(legs(), [
      { payer: 'INSTITUTION:INST-A', payee: 'CCP:USA', amount: 25_000, reason: 'initial margin posted' },
      { payer: 'BANK_SECURITIES:USA_BANK1', payee: 'CCP:USA', amount: 25_000, reason: 'initial margin posted' },
    ], 'both members post; the bank from its securities account');
    const net = new Map<string, number>();
    payThroughHouse(ctx, c, 100, 'derivative variation margin', net);
    assert.deepEqual(legs().slice(2), [
      { payer: 'INSTITUTION:INST-A', payee: 'CCP:USA', amount: 100, reason: 'derivative variation margin' },
      { payer: 'CCP:USA', payee: 'BANK:USA_BANK1', amount: 100, reason: 'derivative variation margin' },
    ], 'A pays the house, the house pays B');
    assert.equal(net.get('INSTITUTION:INST-A'), -100);
    assert.equal(net.get('BANK:USA_BANK1'), 100);
    payThroughHouse(ctx, c, -40, 'derivative close-out', net, (p) => p.kind !== 'BANK');
    assert.deepEqual(legs().slice(4), [
      { payer: 'CCP:USA', payee: 'INSTITUTION:INST-A', amount: 40, reason: 'derivative close-out' },
    ], 'the departed member pays nothing; the house still pays the survivor');
  } finally {
    setActiveWireJournal(undefined);
  }
});
