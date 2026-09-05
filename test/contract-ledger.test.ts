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
import { bookTradeInvoices, publishRepoBook } from '../src/engine/ledger/contract-ledger';
import { asEntityId } from '../src/domain/ids';
import type { TradeInvoice } from '../src/domain/trade-invoice';
import type { RepoContract } from '../src/domain/repo';

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
  const reg: { repoBook?: RepoContract[] } = {};
  const contract: RepoContract = {
    id: 'USA-REPO-1-0', regionId: 'USA', lender: { kind: 'CENTRAL_BANK', region: 'USA' }, borrowerId: asEntityId('USA_BANK1'),
    principalLocal: 1e9, rateAnnual: 0.05, struckWeek: 1, maturityWeek: 2, collateral: [],
  };
  assert.throws(() => publishRepoBook(reg, [contract]), /no world active/);
  setActiveWireWorld(wireWorldOf(v2, [{ id: asEntityId('USA_BANK1') }], []));
  try {
    publishRepoBook(reg, [contract]);
    assert.equal(reg.repoBook?.length, 1);
    assert.throws(() => publishRepoBook(reg, [{ ...contract, borrowerId: asEntityId('USA_GHOST') }]), /no entity, region or bank/);
  } finally {
    setActiveWireWorld(undefined);
  }
});
