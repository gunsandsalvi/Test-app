/** §3.15b-iii — a party that does not perform, and the run of it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollOverdraftStreaks, overdraftRunIsTold } from '../src/domain/banking';

test('a run extends on consecutive sweeps, restarts after a clean week, and ends when the party is not swept', () => {
  let s = rollOverdraftStreaks(undefined, new Map([['COMPANY:A', 5e6], ['COMPANY:B', 1e6]]), 10);
  assert.deepEqual(s['COMPANY:A'], { weeks: 1, lastWeek: 10, drawnLocal: 5e6, drawnRunLocal: 5e6 });
  s = rollOverdraftStreaks(s, new Map([['COMPANY:A', 2e6]]), 11);
  assert.deepEqual(s['COMPANY:A'], { weeks: 2, lastWeek: 11, drawnLocal: 2e6, drawnRunLocal: 7e6 });
  assert.equal(s['COMPANY:B'], undefined, 'a clean close ends the run');
  s = rollOverdraftStreaks(s, new Map([['COMPANY:A', 1e6], ['COMPANY:B', 3e6]]), 13);
  assert.equal(s['COMPANY:A'].weeks, 1, 'a week skipped is a run that ended and a new one');
  assert.equal(s['COMPANY:B'].weeks, 1);
  assert.equal(rollOverdraftStreaks(s, new Map([['COMPANY:A', 0]]), 14)['COMPANY:A'], undefined, 'a zero draw is not a sweep');
});

test('a run is told when it becomes one and each time it doubles', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 12, 13, 24, 48].map(overdraftRunIsTold), [false, false, true, false, false, true, false, true, false, true, true]);
});
