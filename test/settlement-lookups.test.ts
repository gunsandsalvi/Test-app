/** §3.15-v — a surface asks the ledgers' tables what an id IS; it never makes one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partyIdOf, partyId, partyTableSize } from '../src/engine/ledger/party';
import { reasonIdOf, internReason, reasonTableSize } from '../src/engine/simulation/stages/settlement';
import { asEntityId } from '../src/domain/ids';

test('the read-only lookups return nothing for the unseen and do not grow the tables', () => {
  const partiesBefore = partyTableSize(), reasonsBefore = reasonTableSize();
  const never = { kind: 'COMPANY' as const, id: asEntityId('NEVER-SEEN-CO-15V') };
  assert.equal(partyIdOf(never), undefined);
  assert.equal(reasonIdOf('a reason nobody has paid under, 15-v'), undefined);
  assert.equal(partyTableSize(), partiesBefore, 'a lookup interns nothing');
  assert.equal(reasonTableSize(), reasonsBefore);
  const id = partyId(never);
  const rid = internReason('a reason nobody has paid under, 15-v');
  assert.equal(partyIdOf(never), id, 'once interned, the lookup finds it');
  assert.equal(reasonIdOf('a reason nobody has paid under, 15-v'), rid);
});
