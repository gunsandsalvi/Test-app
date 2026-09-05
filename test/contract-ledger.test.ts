/**
 * §3.13-BOOK d4b — THE BILATERAL BOOKS HAVE ONE DOOR, and the door resolves the parties. A
 * contract naming a party the world does not hold is refused where it is written, the way a wire
 * naming one is — not found by an audit a week later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal } from '../src/engine/ledger/wire';
import { seedLadder } from '../src/engine/ledger/tranche-ledger';
import { governmentIssuer } from '../src/domain/entity-keys';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { issueHolding, transferHolding, retireHolding, lienUnitsOf } from '../src/engine/ledger/holdings-ledger';
import { bankPartyOf } from '../src/domain/party';
import { bookTradeInvoices, tradeInvoicesOf, settleTradeInvoices, commitCapital, lpCommitmentsOf, drawCommitment, returnCommitment, liveObligationPartiesOf, publishRepoBook, repoBookOf, publishSecurityLoanBook, securityLoanBookOf, publishPrimeBrokerageBook, primeBrokerageBookOf, strikeDerivatives, derivativesOf, derivativesBookOf, keepDerivatives, novateDerivatives, derivativeContractOf } from '../src/engine/ledger/contract-ledger';
import type { WeeklyStepContext } from '../src/engine/simulation/stages/context';
import type { DerivativeContract } from '../src/domain/derivatives/contract';
import { asEntityId, asInstrumentId } from '../src/domain/ids';
import type { TradeInvoice } from '../src/domain/trade-invoice';
import type { RepoContract } from '../src/domain/repo';
import type { SecurityLoan } from '../src/domain/securities-lending';
import type { PrimeBrokerageLine } from '../src/domain/prime-brokerage';
import type { LpCommitment } from '../src/domain/commitment';

const invoice = (sellerId: string, buyerId: string): TradeInvoice => ({
  sellerId: asEntityId(sellerId), sellerRegion: 'USA', buyerId: asEntityId(buyerId), buyerRegion: 'USA',
  subUnitId: 'steel', currency: 'USD', amountCurrency: 100, bookedUsdPerCurrency: 1, weekBooked: 1, weekDue: 5,
});

test('an invoice between two firms the world holds is booked; one naming a firm it does not is refused', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireWorld(wireWorldOf(v2, [{ id: asEntityId('USA_ACME') }, { id: asEntityId('USA_BOLT') }], []));
  try {
    const first = invoice('USA_ACME', 'USA_BOLT');
    bookTradeInvoices(v2, [first]);
    // §3.13-BOOK d4c-v: the book is rows of the contract store, read back as the invoice it was.
    assert.deepEqual(tradeInvoicesOf(v2), [first]);
    assert.throws(() => bookTradeInvoices(v2, [invoice('USA_ACME', 'USA_NOBODY')]), /no entity, region or bank/);
    assert.equal(tradeInvoicesOf(v2).length, 1, 'the refused invoice is not on the book');
    const second = { ...invoice('USA_BOLT', 'USA_ACME'), weekDue: 9 };
    bookTradeInvoices(v2, [second]);
    const book = tradeInvoicesOf(v2);
    assert.deepEqual(book, [first, second], 'insertion order');
    // The settlement hands back the survivors it was given; the paid one's row is freed.
    settleTradeInvoices(v2, [book[1]]);
    assert.deepEqual(tradeInvoicesOf(v2), [second]);
    assert.throws(() => settleTradeInvoices(v2, [first]), /not on the contract store/);
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

test('a capital commitment is a row of the contract store: a call draws it, a distribution returns it', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: asEntityId('USA_PEF1') }, { id: asEntityId('INST-PEN1') }, { id: asEntityId('INST-PEN2') }]));
  try {
    const c1: LpCommitment = { fundId: asEntityId('USA_PEF1'), lpEntityId: asEntityId('INST-PEN1'), regionId: 'USA', committedLocal: 1e9, drawnLocal: 4e8 };
    const c2: LpCommitment = { ...c1, lpEntityId: asEntityId('INST-PEN2'), committedLocal: 5e8, drawnLocal: 2e8 };
    commitCapital(v2, c1); commitCapital(v2, c2);
    assert.deepEqual(lpCommitmentsOf(v2, 'USA_PEF1'), [c1, c2]);
    assert.deepEqual(lpCommitmentsOf(v2, 'USA_PEF2'), [], 'another fund reads its own rows');
    assert.throws(() => commitCapital(v2, { ...c1, lpEntityId: asEntityId('INST-GHOST') }), /no entity, region or bank/);
    assert.throws(() => commitCapital(v2, c1), /written twice/);
    const [first] = lpCommitmentsOf(v2, 'USA_PEF1');
    drawCommitment(v2, first, 1e8);
    assert.equal(lpCommitmentsOf(v2, 'USA_PEF1')[0].drawnLocal, 5e8);
    returnCommitment(v2, lpCommitmentsOf(v2, 'USA_PEF1')[0], 6e8);
    assert.equal(lpCommitmentsOf(v2, 'USA_PEF1')[0].drawnLocal, 0, 'a distribution never returns more than was drawn');
    assert.throws(() => drawCommitment(v2, { ...c1 }, 1), /not on the contract store/);
    // The one liveness read: every row, its two parties resolved.
    const live = liveObligationPartiesOf(v2).filter((o) => o.kind === 'COMMITMENT');
    assert.equal(live.length, 2);
    assert.deepEqual(live[0].a, { kind: 'INSTITUTION', id: 'USA_PEF1' });
    assert.deepEqual(live[1].b, { kind: 'INSTITUTION', id: 'INST-PEN2' });
  } finally {
    setActiveWireWorld(undefined);
  }
});

test('a repo pledge is a lien on the borrower\'s row: it cannot be sold under, it is released with the contract, it dies with the paper', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const bank = asEntityId('USA_BANK1');
  const bond = asInstrumentId('USA-GOV-2Y-INIT');
  setActiveWireJournal(newWireJournal(1, 0));
  setActiveWireWorld(wireWorldOf(v2, [{ id: bank }], []));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1000, rateType: 'FIXED', couponRate: 0.02, originationWeek: 0, maturityWeek: 104, seniority: 'SENIOR' }]);
    const spec = (units: number) => ({ instrumentType: 'GOV_BOND' as const, instrumentId: bond, issuerRegion: 'USA' as const, valueLocal: units, units });
    issueHolding(v2, { kind: 'GOVERNMENT', region: 'USA' }, bankPartyOf(bank), spec(1000), 'seed');
    const contract: RepoContract = {
      id: 'USA-REPO-1-0', regionId: 'USA', lender: { kind: 'CENTRAL_BANK', region: 'USA' }, borrowerId: bank,
      principalLocal: 540, rateAnnual: 0.05, struckWeek: 1, maturityWeek: 2, collateral: [{ bondId: bond, faceLocal: 600 }],
    };
    publishRepoBook(v2, 'USA', [contract]);
    assert.equal(lienUnitsOf(v2, bank, 'GOV_BOND', bond), 600, 'the publish wrote the lien');
    // Selling what is free is fine; selling into the lien is a defect at the site.
    transferHolding(v2, bankPartyOf(bank), { kind: 'CLEARING_HOUSE', region: 'USA' }, spec(400), 'sale');
    assert.throws(() => transferHolding(v2, bankPartyOf(bank), { kind: 'CLEARING_HOUSE', region: 'USA' }, spec(5), 'sale'), /under a lien/);
    // A call shrinks the pledge; the lien follows the book.
    publishRepoBook(v2, 'USA', [{ ...contract, principalLocal: 270, collateral: [{ bondId: bond, faceLocal: 300 }] }]);
    assert.equal(lienUnitsOf(v2, bank, 'GOV_BOND', bond), 300);
    // The paper matures: the retirement is not a sale, and the lien shrinks to what is left.
    retireHolding(v2, bankPartyOf(bank), { kind: 'GOVERNMENT', region: 'USA' }, spec(500), 'redemption');
    assert.equal(lienUnitsOf(v2, bank, 'GOV_BOND', bond), 100);
    // The contract leaves the book: the lien is released.
    publishRepoBook(v2, 'USA', []);
    assert.equal(lienUnitsOf(v2, bank, 'GOV_BOND', bond), 0);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});
