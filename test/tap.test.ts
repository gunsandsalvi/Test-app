/**
 * §3.16 — A TAP, NOT A NEW FACILITY. Face added to an existing row goes to its holder by wire at
 * the tap price and leaves the row's terms alone; a revolver is one line per borrower and bank.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureV2 } from '../src/engine2/world';
import { newWireJournal, setActiveWireJournal, setActiveWireWorld, activeWireJournal } from '../src/engine/ledger/wire';
import { wireWorldOf } from '../src/engine/ledger/wire-world';
import { seedLadder, tapTranche, drawRevolver } from '../src/engine/ledger/tranche-ledger';
import { facilitiesOfBorrower, materializeLadder, trancheRowOf } from '../src/engine2/tranches';
import { revolverTrancheId } from '../src/domain/instrument-keys';
import { asEntityId, asInstrumentId, asTicker } from '../src/domain/ids';

const acme = { id: asEntityId('USA_ACME'), ticker: asTicker('ACME'), region: 'USA' as const };
const bank = asEntityId('USA_BANK');

test('a draw taps the one revolver at the bank; a second draw adds face and opens nothing', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  setActiveWireJournal(newWireJournal(1, 5));
  setActiveWireWorld(wireWorldOf(v2, [{ id: acme.id }, { id: bank }], []));
  try {
    seedLadder(v2, acme, []);
    const first = drawRevolver(v2, acme, bank, 10e6, { marginBps: 300, week: 5 }, 'revolver drawn: liquidity shortfall');
    assert.equal(first.opened, true);
    assert.equal(first.trancheId, revolverTrancheId(acme.id, bank));
    const second = drawRevolver(v2, acme, bank, 4e6, { marginBps: 450, week: 6 }, 'overdraft converted to a facility draw');
    assert.equal(second.opened, false, 'the line is tapped, not reopened');
    assert.equal(second.row, first.row);
    const lines = facilitiesOfBorrower(v2, acme.id);
    assert.equal(lines.length, 1, 'one line per borrower and bank');
    assert.equal(lines[0].principalLocal, 14e6);
    assert.equal(lines[0].marginBps, 300, 'a tap rides the margin the line was struck at');
    assert.equal(lines[0].maturityWeek, 5 + 52, 'and its maturity');
    assert.equal(lines[0].bankId, bank);
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});

test('a bond tap adds face at the price given, by wire, and touches no other term', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const bond = asInstrumentId('ACME-T1');
  setActiveWireJournal(newWireJournal(1, 5));
  setActiveWireWorld(wireWorldOf(v2, [{ id: acme.id }], []));
  try {
    seedLadder(v2, acme, [{ id: bond, principalLocal: 100e6, rateType: 'FIXED', couponRate: 0.05, originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR' }]);
    const r = trancheRowOf(v2, bond)!;
    const before = activeWireJournal().n;
    const wireNo = tapTranche(v2, acme, r, 20e6, 0.97, 'primary tap placed');
    assert.equal(activeWireJournal().n, before + 1, 'one wire for the added face');
    assert.ok(wireNo >= 0);
    const [t] = materializeLadder(v2, acme.id);
    assert.equal(t.principalLocal, 120e6);
    assert.equal(t.couponRate, 0.05);
    assert.equal(t.maturityWeek, 260);
    assert.throws(() => tapTranche(v2, acme, r, 0, 1, 'nothing'), 'a tap of nothing is a defect');
  } finally {
    setActiveWireJournal(undefined);
    setActiveWireWorld(undefined);
  }
});
