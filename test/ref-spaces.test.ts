/**
 * §3.13-BOOK slice (b) — THE SEVEN ID SPACES ARE SEVEN NUMBERINGS.
 *
 * Every ref column in the columnar world used to index ONE intern table, so an instrument ref, a
 * region ref and a type ref were the same kind of integer and only the columns' names kept them
 * apart. The compiler now refuses to mix them (`engine2/refs.ts`), but a type check is erased at
 * runtime — these assert the RUNTIME half: that the tables are genuinely separate, and that
 * `refs.instruments.strings` therefore answers "every instrument this world has named", which is
 * the question slice (d)'s index is built on and which one shared table could not answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureV2, internInstrument, internType, internRegion, internEntity, internTicker,
  instrumentOf, typeOf, regionOf, entityOf, tickerOf, instrumentRefOf, typeRefOf,
} from '../src/engine2/world';
import { asInstrumentId } from '../src/domain/ids';
import { NO_REF, ABSENT_REF } from '../src/engine2/refs';

const world = () => ensureV2({} as Parameters<typeof ensureV2>[0]);

test('each space numbers from zero on its own, so equal refs name different things', () => {
  const v2 = world();
  const i = internInstrument(v2, asInstrumentId('USA-GOV-5Y-INIT'));
  const t = internType(v2, 'GOV_BOND');
  const r = internRegion(v2, 'USA');
  // First in each table, so all three are 0 — which is exactly what one shared table could never
  // produce, and exactly why a ref carried across spaces is meaningless rather than merely wrong.
  assert.equal(i, 0);
  assert.equal(t, 0);
  assert.equal(r, 0);
  assert.equal(instrumentOf(v2, i), 'USA-GOV-5Y-INIT');
  assert.equal(typeOf(v2, t), 'GOV_BOND');
  assert.equal(regionOf(v2, r), 'USA');
});

test('the same string in two spaces is two refs with two meanings', () => {
  const v2 = world();
  // The equity crossing: a company id is BOTH an entity and (as its listed equity) an instrument.
  internInstrument(v2, asInstrumentId('FILLER'));
  const asEntity = internEntity(v2, 'USA_ACME');
  const asInstrument = internInstrument(v2, asInstrumentId('USA_ACME'));
  assert.notEqual(asEntity as number, asInstrument as number);
  assert.equal(entityOf(v2, asEntity), 'USA_ACME');
  assert.equal(instrumentOf(v2, asInstrument), 'USA_ACME');
});

test('interning in one space does not shift refs already handed out in another', () => {
  const v2 = world();
  const t = internType(v2, 'CORP_BOND');
  for (let n = 0; n < 50; n++) internInstrument(v2, asInstrumentId(`ACME-T${n}`));
  internTicker(v2, 'ACME');
  assert.equal(typeOf(v2, t), 'CORP_BOND');
  assert.equal(tickerOf(v2, internTicker(v2, 'ACME')), 'ACME');
});

test('a read never appends — a miss answers NO_REF and leaves the table alone', () => {
  const v2 = world();
  internInstrument(v2, asInstrumentId('REAL'));
  const before = v2.refs.instruments.strings.length;
  assert.equal(instrumentRefOf(v2, asInstrumentId('NEVER-SEEN')) as number, NO_REF as number);
  assert.equal(typeRefOf(v2, 'NEVER-SEEN') as number, NO_REF as number);
  assert.equal(v2.refs.instruments.strings.length, before);
});

test('NO_REF and ABSENT_REF are different facts and different integers', () => {
  // "never interned" must not equal "this row names nothing", or a missed lookup would match a
  // freed row. Both stay negative so every guard is `< 0`.
  assert.notEqual(NO_REF as number, ABSENT_REF as number);
  assert.ok((NO_REF as number) < 0 && (ABSENT_REF as number) < 0);
});

test('the instrument table is the list of every instrument, and holds nothing else', () => {
  const v2 = world();
  internType(v2, 'EQUITY');
  internRegion(v2, 'EUR');
  internEntity(v2, 'EUR_ACME');
  internTicker(v2, 'ACME');
  internInstrument(v2, asInstrumentId('EUR-GOV-2Y-INIT'));
  internInstrument(v2, asInstrumentId('ACME-T1'));
  assert.deepEqual(v2.refs.instruments.strings, ['EUR-GOV-2Y-INIT', 'ACME-T1']);
});
