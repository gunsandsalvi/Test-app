/**
 * §3.13-BOOK slice (c) — A SEEDED CREDIT ROW NAMES A REAL ISSUER.
 *
 * The seed opens every institution's book by wiring each holding FROM its issuer. It found that
 * issuer by looking the row's `instrumentId` up in a map keyed by COMPANY id — which worked when a
 * corporate bond's row named its company, and stopped working at §9.13-CREDIT row 1 when those
 * rows started naming a TRANCHE. `corporateTrancheId` makes `ACME-T1`; `companyEntityId` makes
 * `USA_ACME`; they are never equal, so the lookup could not hit and every seeded corporate-bond
 * and leveraged-loan row was issued from `{ INSTITUTION, id: '<trancheId>' }` — a party that does
 * not exist, interned into the party table and wired from.
 *
 * These two assertions are the ones that would have caught it: the shapes genuinely differ, and
 * the issuer read resolves a tranche to its company rather than to itself.
 */
import { test } from 'node:test';
import { companyPartyOf } from '../src/domain/party';
import assert from 'node:assert/strict';
import { corporateTrancheId } from '../src/domain/instrument-keys';
import { ensureV2 } from '../src/engine2/world';
import { buildEntityIndex } from '../src/engine/ledger/entity-index';
import type { Company } from '../src/domain/company';

import { issuerIdOf, syncLadderRows } from '../src/engine2/tranches';
import { issuerOfHoldingRow } from '../src/engine/ledger/holdings-ledger';
import type { ItemizedHolding } from '../src/domain/banking';
import { asEntityId, asInstrumentId, asTicker } from '../src/domain/ids';

test('a tranche id and its issuer company id are never the same string', () => {
  // The two grammars that were being compared. If these ever coincide the defect hides again.
  assert.notEqual(corporateTrancheId(asTicker('ACME'), 1) as string, 'USA_ACME');
});

test('the issuer of a corporate tranche is its company, not the tranche itself', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const id = corporateTrancheId(asTicker('ACME'), 1);
  // The mirror rather than the ledger: `issueTranche` wires, and a wire needs a journal. What is
  // under test is the issuer READ, which reads the rows either way puts there.
  syncLadderRows(v2, asEntityId('USA_ACME'), [{
    id, principalLocal: 1_000_000, rateType: 'FIXED', couponRate: 0.05,
    originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR',
  }]);

  // What the seed asks. Before the fix this returned the tranche id, so the seed booked the
  // holding against an institution named `ACME-T1`.
  assert.equal(issuerIdOf(v2, id) as string, 'USA_ACME');
});

test('an instrument that is not a tranche is its own issuer', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  // Equity and fund shares are keyed by the entity that issued them, so the read is the identity —
  // which is why the fix could not change how those two seed.
  assert.equal(issuerIdOf(v2, 'USA_ACME') as string, 'USA_ACME');
});

test('a seeded CORPORATE BOND row is issued by its company, not by a party that does not exist', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  const id = corporateTrancheId(asTicker('ACME'), 1);
  syncLadderRows(v2, asEntityId('USA_ACME'), [{
    id, principalLocal: 1_000_000, rateType: 'FIXED', couponRate: 0.05,
    originationWeek: 0, maturityWeek: 260, seniority: 'SENIOR',
  }]);
  // §3.13-BOOK (c-then-2): `issuerOfHoldingRow` takes the ENTITY INDEX now, not a `Map<id, ticker>`
  // mirror of it — and since (c-then-3b) the party it returns names the issuer by ENTITY id, so
  // a one-firm index is all this needs and the assertion below is on the id, not the ticker.
  const companyById = buildEntityIndex(
    [{ id: asEntityId('USA_ACME'), ticker: asTicker('ACME') } as Company], []).companyById;
  const row: ItemizedHolding = {
    instrumentId: id, instrumentType: 'CORP_BOND', issuerRegion: 'USA',
    quantityOrNotionalLocal: 1_000, units: 1_000,
  };
  // Before the fix this was `{ kind: 'INSTITUTION', id: 'ACME-T1' }`.
  assert.deepEqual(issuerOfHoldingRow(v2, row, companyById), companyPartyOf(asEntityId('USA_ACME')));
});

test('a seeded FUND SHARE row is still issued by the fund itself', () => {
  const v2 = ensureV2({} as Parameters<typeof ensureV2>[0]);
  // §3.13-BOOK (c-then-2): `issuerOfHoldingRow` takes the ENTITY INDEX now, not a `Map<id, ticker>`
  // mirror of it — and since (c-then-3b) the party it returns names the issuer by ENTITY id, so
  // a one-firm index is all this needs and the assertion below is on the id, not the ticker.
  const companyById = buildEntityIndex(
    [{ id: asEntityId('USA_ACME'), ticker: asTicker('ACME') } as Company], []).companyById;
  const row: ItemizedHolding = {
    instrumentId: asInstrumentId('USA_ETF_1'), instrumentType: 'ETF_SHARE', issuerRegion: 'USA',
    quantityOrNotionalLocal: 1_000, units: 1_000,
  };
  // The half the fix must NOT change: a fund's shares are keyed by the fund's own id.
  assert.deepEqual(issuerOfHoldingRow(v2, row, companyById), { kind: 'INSTITUTION', id: 'USA_ETF_1' });
});
