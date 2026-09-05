/**
 * §3.13-BOOK d4b — THE BILATERAL BOOKS HAVE ONE DOOR, and the door resolves the parties. A
 * contract naming a party the world does not hold is refused where it is written, the way a wire
 * naming one is — not found by an audit a week later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { bookTradeInvoices, publishRepoBook, repoBookOf, publishSecurityLoanBook, securityLoanBookOf, publishPrimeBrokerageBook, primeBrokerageBookOf, strikeDerivatives, derivativesOf, derivativesBookOf, keepDerivatives, novateDerivatives, derivativeContractOf } from '../src/engine/ledger/contract-ledger';
import type { WeeklyStepContext } from '../src/engine/simulation/stages/context';
import type { DerivativeContract } from '../src/domain/derivatives/contract';
import { asEntityId, asInstrumentId } from '../src/domain/ids';
import type { TradeInvoice } from '../src/domain/trade-invoice';
import type { RepoContract } from '../src/domain/repo';
import type { SecurityLoan } from '../src/domain/securities-lending';
import type { PrimeBrokerageLine } from '../src/domain/prime-brokerage';

const invoice = (sellerId: string, buyerId: string): TradeInvoice => ({
  sellerId: asEntityId(sellerId), sellerRegion: 'USA', buyerId: asEntityId(buyerId), buyerRegion: 'USA',
  subUnitId: 'steel', currency: 'USD', amountCurrency: 100, bookedUsdPerCurrency: 1, weekBooked: 1, weekDue: 5,
});

test('an invoice between two firms the world holds is booked; one naming a firm it does not is refused', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireWorld(wireWorldOf(v2, [{ id: asEntityId('USA_ACME') }, { id: asEntityId('USA_BOLT') }], []));
  try {
    const state: { tradeInvoices?: TradeInvoice[] } = {};
    bookTradeInvoices(state, [invoice('USA_ACME', 'USA_BOLT')]);
    assert.equal(state.tradeInvoices?.length, 1);
    assert.throws(() => bookTradeInvoices(state, [invoice('USA_ACME', 'USA_NOBODY')]), /no entity, region or bank/);
    assert.equal(state.tradeInvoices?.length, 1, 'the refused invoice is not on the book');
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('a repo book resolves its lenders and borrowers, the window included, and needs a world', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const contract: RepoContract = {
    id: 'USA-REPO-1-0', regionId: 'USA', lender: { kind: 'CENTRAL_BANK', region: 'USA' }, borrowerId: asEntityId('USA_BANK1'),
    principalLocal: 1e9, rateAnnual: 0.05, struckWeek: 1, maturityWeek: 2, collateral: [{ bondId: asInstrumentId('USA-GOV-2Y-INIT'), faceLocal: 1.1e9 }],
  };
  assert.throws(() => publishRepoBook(v2, 'USA', [contract]), /no world active/);
  setActiveWireWorld(wireWorldOf(v2, [{ id: asEntityId('USA_BANK1') }], []));
  try {
    publishRepoBook(v2, 'USA', [contract]);
    // §3.13-BOOK d4c-ii: the book is rows of the contract store, read back as the contract it was.
    assert.deepEqual(repoBookOf(v2, 'USA'), [contract]);
    assert.deepEqual(repoBookOf(v2, 'EUR'), [], 'another region reads its own rows');
    assert.throws(() => publishRepoBook(v2, 'USA', [{ ...contract, borrowerId: asEntityId('USA_GHOST') }]), /no entity, region or bank/);
    // A call shrinks the contract and releases a pledge; the row takes the new terms.
    const called = { ...contract, principalLocal: 4e8, collateral: [{ bondId: asInstrumentId('USA-GOV-2Y-INIT'), faceLocal: 4.4e8 }] };
    publishRepoBook(v2, 'USA', [called]);
    assert.deepEqual(repoBookOf(v2, 'USA'), [called]);
    // A matured contract leaves the book; its row is freed.
    publishRepoBook(v2, 'USA', []);
    assert.deepEqual(repoBookOf(v2, 'USA'), []);
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('§3.13-BOOK d4c-i: a struck derivative is a row of the contract store, and comes back as the object it was', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const a = { kind: 'INSTITUTION' as const, id: asEntityId('INST-A') };
  const b = { kind: 'INSTITUTION' as const, id: asEntityId('INST-B') };
  const c = { kind: 'INSTITUTION' as const, id: asEntityId('INST-C') };
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: a.id }, { id: b.id }, { id: c.id }]));
  const ctx = { v2 } as unknown as WeeklyStepContext;
  try {
    const swap: DerivativeContract = {
      id: 'USA-IRS-s5-1-0', classId: 'IRS', regionId: 'USA', currency: 'USD', a, b, notional: 1e6, strike: 0.04,
      reference: { kind: 'RATE' }, termKey: 's5', struckWeek: 1, maturityWeek: 261,
    };
    const future: DerivativeContract = {
      id: 'FUT-OIL-3M-1-0', classId: 'COMMODITY_FUTURE', regionId: 'USA', currency: 'USD', a: b, b: a, notional: 7e5, strike: 100,
      reference: { kind: 'COMMODITY', commodityId: 'OIL' }, termKey: '3M', units: 7000, settledMarkLocal: 0, struckWeek: 1, maturityWeek: 14,
    };
    strikeDerivatives(ctx, [swap, future]);
    assert.deepEqual(derivativesOf(v2), [swap, future], 'the store materializes exactly what was struck, in order');
    assert.throws(() => strikeDerivatives(ctx, [{ ...swap, id: 'x', a: { kind: 'INSTITUTION', id: asEntityId('INST-GHOST') } }]), /no entity, region or bank/);
    // The lifecycle advances a mark and keeps the survivors; the rows follow.
    const book = derivativesBookOf(ctx);
    book[1].settledMarkLocal = 3_500;
    keepDerivatives(ctx, [book[1]]);
    assert.deepEqual(derivativesOf(v2).map((k) => [k.id, k.settledMarkLocal]), [['FUT-OIL-3M-1-0', 3_500]]);
    // A novation re-points the row.
    novateDerivatives(ctx, (p) => (p.id === a.id ? c : p));
    assert.deepEqual(derivativesOf(v2)[0].b, c);
    assert.equal(derivativeContractOf(v2, 'USA-IRS-s5-1-0'), undefined, 'a freed row is gone');
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('§3.13-BOOK d4c-iii: a stock loan is a row of the contract store, recall week and all', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const lender = { kind: 'INSTITUTION' as const, id: asEntityId('INST-L') };
  const borrower = { kind: 'INSTITUTION' as const, id: asEntityId('INST-B') };
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: lender.id }, { id: borrower.id }]));
  try {
    const loan: SecurityLoan = {
      id: 'USA-SBL-USA_ACME-1-0', regionId: 'USA', instrumentId: asInstrumentId('USA_ACME'), lender, borrower, shares: 1_000,
      feeBps: 35.5, currency: 'USD', collateralLocal: 20_000, lenderPositionAtStrike: 5_000, struckWeek: 1,
    };
    publishSecurityLoanBook(v2, 'USA', [loan]);
    assert.deepEqual(securityLoanBookOf(v2, 'USA'), [loan]);
    const recalled: SecurityLoan = { ...loan, id: `${loan.id}-R`, shares: 400, collateralLocal: 8_000, recalledWeek: 3 };
    const rest: SecurityLoan = { ...loan, shares: 600, collateralLocal: 12_000 };
    publishSecurityLoanBook(v2, 'USA', [recalled, rest]);
    assert.deepEqual(securityLoanBookOf(v2, 'USA'), [recalled, rest]);
    assert.throws(() => publishSecurityLoanBook(v2, 'USA', [{ ...loan, id: 'x', borrower: { kind: 'INSTITUTION', id: asEntityId('INST-GHOST') } }]), /no entity, region or bank/);
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('a prime-brokerage book is rows of the contract store: a line re-struck keeps its row, a repaid one leaves', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireWorld(wireWorldOf(v2, [{ id: asEntityId('USA_BANK1') }], [{ id: asEntityId('INST-HF1') }, { id: asEntityId('INST-HF2') }]));
  try {
    const line: PrimeBrokerageLine = {
      id: 'USA-PB-INST-HF1', regionId: 'USA', brokerId: asEntityId('USA_BANK1'), fundId: asEntityId('INST-HF1'),
      drawnLocal: 5e8, haircutRate: 0.25, rateAnnual: 0.06, struckWeek: 2,
    };
    const other: PrimeBrokerageLine = { ...line, id: 'USA-PB-INST-HF2', fundId: asEntityId('INST-HF2'), drawnLocal: 1e8 };
    publishPrimeBrokerageBook(v2, 'USA', [line, other]);
    assert.deepEqual(primeBrokerageBookOf(v2, 'USA'), [line, other]);
    assert.deepEqual(primeBrokerageBookOf(v2, 'EUR'), [], 'another region reads its own rows');
    // The close sweep raised the balance and the rate; the morning repaid the other fund.
    const swept = { ...line, drawnLocal: 6e8, rateAnnual: 0.08, struckWeek: 3 };
    publishPrimeBrokerageBook(v2, 'USA', [swept]);
    assert.deepEqual(primeBrokerageBookOf(v2, 'USA'), [swept]);
    assert.throws(() => publishPrimeBrokerageBook(v2, 'USA', [{ ...line, fundId: asEntityId('INST-GHOST') }]), /no entity, region or bank/);
    assert.throws(() => publishPrimeBrokerageBook(v2, 'EUR', [swept]), /published on EUR/);
  } finally {
    setActiveWireWorld(undefined);
  }
});
