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
import { ccpOfContract, ccpOfMoney, ccpSheetOf, ccpOwnCapitalLocal, coverOneFundLocal, fundContributionsOf, CCP_CLOSE_OUT_SESSIONS, runWaterfall, writeDownSurvivors, memberMarginLimitLocal, memberMarginCapacityLocal, admittedShareOf, scaledContract } from '../src/domain/clearing-house';
import { admitToHouse } from '../src/engine/simulation/stages/derivative-lifecycle';
import { openAccount, reserveRowOf, setHomeCurrency } from '../src/engine/ledger/accounts';
import { trueUpDefaultFunds } from '../src/engine/simulation/stages/derivatives';
import { openSectorRow, ccpCashOf, ccpDepositsAt, depositLinesAt } from '../src/engine/ledger/accounts';
import { houseViewOf, keepDerivatives, strikeDerivatives, ccpSheetAt, memberMarginPostedLocal, bankMarginAtHouseLocal, bankAtHouseLocal, ccpFundOf, ccpFundLocal, publishCcpFund, membersOfHouse } from '../src/engine/ledger/contract-ledger';
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
  assert.equal(ccpOwnCapitalLocal(ccpSheetOf(120, 100, 0)), 20, 'a departed member\'s margin stays with the house');
  assert.equal(ccpOwnCapitalLocal(ccpSheetOf(130, 100, 40)), -10, 'short of what it owes its members: margin and fund');
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
    assert.equal(sheet.defaultFundLocal, 0, 'no true-up has run');
    assert.equal(ccpOwnCapitalLocal(sheet), 0, 'the postings are the one inflow: cash equals margin');
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

test('§3.17-iv-c-i: the fund is cover-one — the largest member\'s move over the close-out horizon beyond its margin — shared pro rata', () => {
  const k = Math.sqrt(CCP_CLOSE_OUT_SESSIONS) - 1;
  assert.equal(coverOneFundLocal([100, 300, 200]), 300 * k);
  assert.equal(coverOneFundLocal([]), 0, 'no members, no fund');
  const shares = fundContributionsOf(120, new Map([['a', 100], ['b', 300], ['c', 0]]));
  assert.equal(shares.get('a'), 30); assert.equal(shares.get('b'), 90); assert.equal(shares.get('c'), 0);
});

test('§3.17-iv-c-i: the fund is rows of the contract store, and a member\'s contribution is its asset', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  setActiveWireWorld(wireWorldOf(v2, [{ id: dealer }], [{ id: a.id }]));
  try {
    publishCcpFund(v2, 'USA', [{ regionId: 'USA', member: a, amountLocal: 30 }, { regionId: 'USA', member: { kind: 'BANK', id: dealer }, amountLocal: 90 }]);
    assert.equal(ccpFundLocal(v2, 'USA'), 120);
    assert.equal(ccpFundLocal(v2, 'EUR'), 0);
    assert.equal(bankAtHouseLocal(v2, dealer), 90, 'no margin yet: the asset is the contribution');
    // A true-up rewrites the rows: the fund names the members it has, at their new amounts.
    publishCcpFund(v2, 'USA', [{ regionId: 'USA', member: { kind: 'BANK', id: dealer }, amountLocal: 50 }]);
    assert.deepEqual(ccpFundOf(v2, 'USA').map((c) => [c.member.id, c.amountLocal]), [[dealer, 50]]);
    assert.throws(() => publishCcpFund(v2, 'USA', [{ regionId: 'USA', member: { kind: 'INSTITUTION', id: asEntityId('INST-GHOST') }, amountLocal: 1 }]), /no entity, region or bank/);
    assert.throws(() => publishCcpFund(v2, 'USA', [{ regionId: 'EUR', member: a, amountLocal: 1 }]), /published on USA/);
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('§3.17-iv-c-i: the weekly true-up settles each member to its share, and refunds a member that left', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'BANK' as const, id: dealer };
  setActiveWireWorld(wireWorldOf(v2, [{ id: dealer }], [{ id: a.id }]));
  const journal = newPaymentJournal();
  const ctx = { v2, paymentJournal: journal, pendingNetById: [], pendingTouchedIds: [], fx: PARITY_FX } as unknown as WeeklyStepContext;
  setActiveWireJournal(newWireJournal(1, 0));
  try {
    const legs = (from: number) => Array.from({ length: journal.n - from }, (_, i) => ({ payer: partyKey(partyOf(journal.payerId[from + i])), payee: partyKey(partyOf(journal.payeeId[from + i])), amount: journal.amount[from + i], reason: reasonText(journal.reasonId[from + i]) }));
    const c: DerivativeContract = {
      id: 'USA-FXF-1-0', classId: 'FX_FORWARD', regionId: 'USA', currency: 'USD', a, b, notional: 1e6, strike: 1.1,
      reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '', settledMarkLocal: 0, initialMarginLocal: 1000, struckWeek: 1, maturityWeek: 14,
    };
    strikeDerivatives(ctx, [c]);
    assert.deepEqual([...membersOfHouse(v2, 'USA').values()].map((m) => m.marginLocal), [1000, 1000]);
    trueUpDefaultFunds(ctx);
    const k = Math.sqrt(CCP_CLOSE_OUT_SESSIONS) - 1;
    const share = 1000 * k / 2;
    assert.deepEqual(legs(0), [
      { payer: 'INSTITUTION:INST-A', payee: 'CCP:USA', amount: share, reason: 'default fund contribution' },
      { payer: 'BANK_SECURITIES:USA_BANK1', payee: 'CCP:USA', amount: share, reason: 'default fund contribution' },
    ], 'each member pays its share in; the bank from its securities account');
    assert.equal(ccpFundLocal(v2, 'USA'), 1000 * k);
    assert.equal(bankAtHouseLocal(v2, dealer), 1000 + share, 'margin and fund');
    const n = journal.n;
    trueUpDefaultFunds(ctx);
    assert.equal(journal.n, n, 'nothing moved: the fund is at its size');
    // The contract leaves the book: no members, no fund — each is refunded what it had in.
    keepDerivatives(ctx, []);
    trueUpDefaultFunds(ctx);
    assert.deepEqual(legs(n).map((l) => [l.payer, l.payee, l.amount, l.reason]).sort(), [
      ['CCP:USA', 'BANK_SECURITIES:USA_BANK1', share, 'default fund refunded'],
      ['CCP:USA', 'INSTITUTION:INST-A', share, 'default fund refunded'],
    ]);
    assert.equal(ccpFundLocal(v2, 'USA'), 0);
    assert.equal(ccpFundOf(v2, 'USA').length, 0);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('§3.17-iv-c-ii: the waterfall pays in its stated order, claims what the defaulter\'s own money did not cover, and runs past the end', () => {
  const stack = { marginLocal: 30, fundLocal: 20, capitalLocal: 25, survivorsFundLocal: 40 };
  const r1 = runWaterfall(100, stack);
  assert.deepEqual(r1, { lossLocal: 100, fromMarginLocal: 30, fromFundLocal: 20, fromCapitalLocal: 25, fromSurvivorsLocal: 25, unfundedLocal: 0, claimLocal: 50 });
  const r2 = runWaterfall(200, stack);
  assert.deepEqual(r2, { lossLocal: 200, fromMarginLocal: 30, fromFundLocal: 20, fromCapitalLocal: 25, fromSurvivorsLocal: 40, unfundedLocal: 85, claimLocal: 150 });
  const r3 = runWaterfall(-15, stack);
  assert.deepEqual(r3, { lossLocal: 0, fromMarginLocal: 0, fromFundLocal: 0, fromCapitalLocal: 0, fromSurvivorsLocal: 0, unfundedLocal: 0, claimLocal: 0 }, 'a defaulter owed money net costs the stack nothing');
  const r4 = runWaterfall(10, { ...stack, capitalLocal: -5 });
  assert.equal(r4.fromCapitalLocal, 0, 'a house already short has no capital to give');
  assert.equal(r4.fromMarginLocal, 10);
});

test('§3.17-iv-c-ii: the survivors\' contributions are written down pro rata, and the defaulter\'s row leaves the fund', () => {
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'BANK' as const, id: asEntityId('USA_BANK1') };
  const d = { kind: 'COMPANY' as const, id: asEntityId('USA_DEAD') };
  const fund = [
    { regionId: 'USA' as const, member: a, amountLocal: 100 },
    { regionId: 'USA' as const, member: b, amountLocal: 300 },
    { regionId: 'USA' as const, member: d, amountLocal: 50 },
  ];
  const { kept, writtenDownByMember } = writeDownSurvivors(fund, (m) => m.id === d.id, 40);
  assert.deepEqual(kept.map((c) => [c.member.id, c.amountLocal]), [[a.id, 90], [b.id, 270]]);
  assert.equal(writtenDownByMember.get(a), 10);
  assert.equal(writtenDownByMember.get(b), 30);
  const whole = writeDownSurvivors(fund, (m) => m.id === d.id, 1e9);
  assert.deepEqual(whole.kept.map((c) => c.amountLocal), [0, 0], 'never more than what is in');
  assert.equal(writeDownSurvivors(fund, (m) => m.id === d.id, 0).writtenDownByMember.size, 0);
});

test('§3.17-v-i: the member limit is what its cash could re-margin over the close-out horizon, and a contract is cut to what fits', () => {
  const k = Math.sqrt(CCP_CLOSE_OUT_SESSIONS) - 1;
  assert.equal(memberMarginLimitLocal(1000), 1000 / k);
  assert.equal(memberMarginLimitLocal(-5), 0);
  assert.equal(memberMarginCapacityLocal(1000, 1000 / k - 10), 10);
  assert.equal(memberMarginCapacityLocal(1000, 1e9), 0);
  assert.equal(admittedShareOf(100, 250), 1);
  assert.equal(admittedShareOf(100, 25), 0.25);
  assert.equal(admittedShareOf(0, 0), 1, 'a contract that posts nothing is admitted whole');
  const cut = scaledContract({ notional: 1000, units: 10, initialMarginLocal: 20, strike: 7 }, 0.5);
  assert.deepEqual(cut, { notional: 500, units: 5, initialMarginLocal: 10, strike: 7 });
});

test('§3.17-v-i: the house admits a strike against each member\'s remaining capacity, cuts the second contract and records what it refused', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'BANK' as const, id: dealer };
  setActiveWireWorld(wireWorldOf(v2, [{ id: dealer }], [{ id: a.id }]));
  setActiveWireJournal(newWireJournal(1, 0));
  try {
    const k = Math.sqrt(CCP_CLOSE_OUT_SESSIONS) - 1;
    // The fund can carry 1000/k of margin; the dealer's reserves are ample.
    setHomeCurrency(v2, a, 'USD'); openAccount(v2, a, 'USD', 1000);
    setHomeCurrency(v2, b, 'USD'); reserveRowOf(v2, dealer, 'USD', 1e9);
    const reg = { ccpRefusedNotionalLocal: 0 };
    const ctx = { v2, nextWeek: 5, pendingNetById: [], pendingTouchedIds: [], fx: PARITY_FX, updatedRegions: { USA: reg } } as unknown as WeeklyStepContext;
    const c = (id: string, notional: number, im: number): DerivativeContract => ({
      id, classId: 'FX_FORWARD', regionId: 'USA', currency: 'USD', a, b, notional, strike: 1.1,
      reference: { kind: 'REGION', regionId: 'EUR' }, termKey: '', settledMarkLocal: 0, initialMarginLocal: im, struckWeek: 5, maturityWeek: 14,
    });
    const limit = 1000 / k;
    const admitted = admitToHouse(ctx, [c('one', 1e6, limit * 0.75), c('two', 1e6, limit * 0.5), c('three', 1e6, limit)]);
    assert.deepEqual(admitted.map((x) => [x.id, Math.round(x.notional), Math.round(x.initialMarginLocal)]), [
      ['one', 1e6, Math.round(limit * 0.75)],
      ['two', 5e5, Math.round(limit * 0.25)],
    ], 'the first fits, the second is cut to the quarter of the limit left, the third fits nothing');
    assert.ok(Math.abs(reg.ccpRefusedNotionalLocal - 1.5e6) < 1e-6, 'half of the second and all of the third were refused');
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('§3.17-v-ii: the market view — open interest by class, and each member\'s margin, fund and net position', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const dealer = asEntityId('USA_BANK1');
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'BANK' as const, id: dealer };
  setActiveWireWorld(wireWorldOf(v2, [{ id: dealer }], [{ id: a.id }]));
  try {
    const base = { regionId: 'USA' as const, currency: 'USD' as const, strike: 1, termKey: '', settledMarkLocal: 0, struckWeek: 1, maturityWeek: 14 };
    strikeDerivatives({ v2 } as unknown as WeeklyStepContext, [
      { ...base, id: 'f1', classId: 'FX_FORWARD', a, b, notional: 300, initialMarginLocal: 6, reference: { kind: 'REGION', regionId: 'EUR' } },
      { ...base, id: 'f2', classId: 'FX_FORWARD', a: b, b: a, notional: 100, initialMarginLocal: 2, reference: { kind: 'REGION', regionId: 'EUR' } },
      { ...base, id: 's1', classId: 'IRS', a, b, notional: 1000, initialMarginLocal: 10, reference: { kind: 'RATE' }, termKey: 's5' },
    ]);
    publishCcpFund(v2, 'USA', [{ regionId: 'USA', member: b, amountLocal: 7 }]);
    const view = houseViewOf(v2, 'USA');
    assert.deepEqual(view.openInterest, { FX_FORWARD: { contracts: 2, notionalLocal: 400 }, IRS: { contracts: 1, notionalLocal: 1000 } });
    assert.equal(view.sheet.marginHeldLocal, 36, 'both members of every contract');
    assert.deepEqual(view.members.map((m) => [m.member.id, m.marginLocal, m.fundLocal]), [[a.id, 18, 0], [dealer, 18, 7]]);
    assert.deepEqual(view.members[0].byClass, { FX_FORWARD: { contracts: 2, grossLocal: 400, netLocal: 200 }, IRS: { contracts: 1, grossLocal: 1000, netLocal: 1000 } });
    assert.deepEqual(view.members[1].byClass.FX_FORWARD, { contracts: 2, grossLocal: 400, netLocal: -200 }, 'the dealer is short what the fund is long');
    assert.deepEqual(houseViewOf(v2, 'EUR').members, []);
  } finally {
    setActiveWireWorld(undefined);
  }
});
