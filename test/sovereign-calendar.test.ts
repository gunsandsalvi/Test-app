/**
 * §3.13e-ii — THE CENTRAL BANK IS A HOLDER OF RECORD. Its sovereign book accrues on its rows like
 * every holder's, what accrued is its coupon income, and the receivable is a read of its book.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { bookAccruedLocal } from '../src/engine2/holdings';
import { setActiveWireWorld, setActiveWireJournal, newWireJournal } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { issueHolding, centralBankBookId } from '../src/engine/ledger/holdings-ledger';
import { seedLadder } from '../src/engine/ledger/tranche-ledger';
import { governmentIssuer } from '../src/domain/entity-keys';
import { asInstrumentId } from '../src/domain/ids';
import { accrueSovereignHolders } from '../src/engine/simulation/stages/sovereign-calendar';
import { centralBankBookLocal, centralBankSovereignAssetsLocal } from '../src/engine/sovereign-register';
import { institutionTotalAssetsLocal } from '../src/domain/institutions';
import { asEntityId } from '../src/domain/ids';

const bond = asInstrumentId('USA-GOV-5Y-INIT');
const gov = { kind: 'GOVERNMENT' as const, region: 'USA' as const };
const cbParty = { kind: 'CENTRAL_BANK' as const, region: 'USA' as const };

test('the central bank accrues on its rows, its income is the accrual, and its receivable is a read of its book', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [], []));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.052, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    issueHolding(v2, gov, cbParty, { instrumentType: 'GOV_BOND', instrumentId: bond, issuerRegion: 'USA', valueLocal: 1000, units: 1000 }, 'open-market purchase');
    const ctx = { v2, updatedInstitutionalEntities: [], updatedCompanies: [] };
    // Two weeks on a 5.2% coupon: 1000 × 0.052 × 2 / 52 = 2.
    const earned = accrueSovereignHolders(ctx, 'USA', { [bond]: 0.052 }, () => 2);
    assert.ok(Math.abs(earned.centralBankEarnedLocal - 2) < 1e-12, 'its income is what accrued');
    assert.equal(earned.bankEarnedLocal.size, 0);
    assert.ok(Math.abs(bookAccruedLocal(v2, centralBankBookId('USA')) - 2) < 1e-12, 'and it sits on its rows');
    assert.ok(Math.abs(centralBankBookLocal(v2, 'USA') - 1000) < 1e-9, 'the book is the paper at its mark');
    assert.ok(Math.abs(centralBankSovereignAssetsLocal(v2, 'USA') - 1002) < 1e-9, 'the asset side is the paper plus the receivable');
    // A bill (no coupon in the table) accrues nothing; a second week adds one more.
    const again = accrueSovereignHolders(ctx, 'USA', { [bond]: 0.052 }, () => 1);
    assert.ok(Math.abs(again.centralBankEarnedLocal - 1) < 1e-12);
    assert.ok(Math.abs(bookAccruedLocal(v2, centralBankBookId('USA')) - 3) < 1e-12);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('§3.13f: what an institution has accrued and not been paid is an asset on its sheet, read off its rows', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const fund = { kind: 'INSTITUTION' as const, id: asEntityId('INST-P') };
  setActiveWireJournal(newWireJournal(1, 3));
  setActiveWireWorld(wireWorldOf(v2, [], [{ id: fund.id }]));
  try {
    seedLadder(v2, governmentIssuer('USA'), [{ id: bond, principalLocal: 1e6, rateType: 'FIXED', couponRate: 0.052, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    issueHolding(v2, gov, fund, { instrumentType: 'GOV_BOND', instrumentId: bond, issuerRegion: 'USA', valueLocal: 1000, units: 1000 }, 'fill');
    const entity = { id: fund.id, isDefaulted: false } as unknown as { id: typeof fund.id; isDefaulted: boolean };
    accrueSovereignHolders({ v2, updatedInstitutionalEntities: [entity] as never, updatedCompanies: [] }, 'USA', { [bond]: 0.052 }, () => 1);
    const accrued = bookAccruedLocal(v2, fund.id);
    assert.ok(Math.abs(accrued - 1) < 1e-12, 'one week of a 5.2% coupon on 1000');
    const total = institutionTotalAssetsLocal({ entityType: 'PENSION_FUND' }, 0, 1000, 0, 0, accrued);
    assert.ok(Math.abs(total - 1001) < 1e-9, 'the sheet carries the receivable beside the paper');
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});
