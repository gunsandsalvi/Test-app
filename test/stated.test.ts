/** §5-FINALIZATION R — a stated number is declared once, owned, and its declaration is the constant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stated, statedRegistry, SEED_INSURER_INSTITUTIONAL_SHARE } from '../src/domain/stated';

test('the declaration is the constant; a second declaration of the same id must agree', () => {
  const v = stated({ id: 'test.shape', value: 0.125, kind: 'SHAPE', owner: 'test', reason: 'a pin', replacedBy: 'nothing' });
  assert.equal(v, 0.125);
  assert.equal(stated({ id: 'test.shape', value: 0.125, kind: 'SHAPE', owner: 'test', reason: 'a pin', replacedBy: 'nothing' }), 0.125);
  assert.throws(() => stated({ id: 'test.shape', value: 0.25, kind: 'SHAPE', owner: 'test', reason: 'a pin', replacedBy: 'nothing' }), /declared twice/);
  assert.ok(statedRegistry().some((s) => s.id === 'seed.insurerInstitutionalShare' && s.value === SEED_INSURER_INSTITUTIONAL_SHARE));
});
