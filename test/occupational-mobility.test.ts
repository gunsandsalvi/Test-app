/** §3.20-iii — the flow between occupations: idle seekers to open vacancies, through the one matching function. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occupationalMobility } from '../src/engine/simulation/stages/labor-market';
import type { OccupationType } from '../src/domain/region-macro';

const rec = (v: Partial<Record<OccupationType, number>>): Record<OccupationType, number> =>
  ({ GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0, SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0, ...v });
const sum = (r: Record<OccupationType, number>): number => Object.values(r).reduce((a, b) => a + b, 0);

test('idle seekers move to the occupations with open vacancies, never within their own, and every mover is counted once', () => {
  const m = occupationalMobility(rec({ GENERAL: 100_000 }), rec({ SKILLED_TRADES: 40_000, GENERAL: 500_000 }));
  assert.ok(m.into.SKILLED_TRADES > 0, 'the shortage is relieved');
  assert.equal(m.into.GENERAL, 0, 'a seeker does not move into its own occupation');
  assert.ok(m.into.SKILLED_TRADES <= 40_000 && m.outOf.GENERAL <= 100_000, 'capped by both sides');
  assert.ok(Math.abs(sum(m.into) - sum(m.outOf)) < 1e-6, 'one leaves an occupation for each that enters another');
});

test('nothing moves when nobody is idle or nothing is open', () => {
  assert.equal(sum(occupationalMobility(rec({}), rec({ SKILLED_TRADES: 1e5 })).into), 0);
  assert.equal(sum(occupationalMobility(rec({ GENERAL: 1e5 }), rec({})).into), 0);
});

test('the flow is search, not a transfer: fewer than all the idle move in one week', () => {
  const m = occupationalMobility(rec({ GENERAL: 50_000 }), rec({ TECHNICAL_ENGINEERING: 50_000 }));
  assert.ok(m.outOf.GENERAL > 0 && m.outOf.GENERAL < 50_000);
});
