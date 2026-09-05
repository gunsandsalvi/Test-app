/** §3.20d-ii — a line idle for the management's exit horizon leaves; its share goes to the others. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitIdleLines } from '../src/domain/company-week/product-lines';
import type { ProductLine } from '../src/domain/company';

const line = (subUnitId: string, revenueShare: number, idleStreakWeeks?: number): ProductLine =>
  ({ industry: 'x', subUnitId, revenueShare, categoryMarketShare: 0.1, competitiveness: 1, idleStreakWeeks } as unknown as ProductLine);

test('an idle line counts weeks; an active one resets; the horizon exits it and the share is redistributed', () => {
  const lines = [line('a', 0.5, 3), line('b', 0.3, 0), line('c', 0.2, 7)];
  const active = new Map([['a', false], ['b', true], ['c', false]]);
  const out = exitIdleLines(lines, active, 8);
  assert.deepEqual(out.exited.map((l) => l.subUnitId), ['c'], 'c reaches the horizon');
  assert.deepEqual(out.lines.map((l) => [l.subUnitId, l.idleStreakWeeks]), [['a', 4], ['b', 0]]);
  assert.ok(Math.abs(out.lines[0].revenueShare - 0.5 / 0.8) < 1e-12 && Math.abs(out.lines[1].revenueShare - 0.3 / 0.8) < 1e-12, 'shares renormalised over the survivors');
});

test('a firm can lose its last line; nothing is invented to replace it', () => {
  const out = exitIdleLines([line('a', 1, 51)], new Map(), 52);
  assert.equal(out.lines.length, 0);
  assert.equal(out.exited.length, 1);
});
