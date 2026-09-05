/** §3.15-iii — a number that is not there prints as not there, never as zero or par. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatStockPrice, formatBps, formatPercent, formatMultiple, formatParPrice, MISSING } from '../src/engine/formatters';

test('every engine formatter prints the dash for NaN and undefined, and the number otherwise', () => {
  for (const v of [NaN, undefined, null]) {
    assert.equal(formatCurrency(v), MISSING);
    assert.equal(formatStockPrice(v), MISSING);
    assert.equal(formatBps(v), MISSING);
    assert.equal(formatPercent(v, { isDecimal: true }), MISSING);
    assert.equal(formatMultiple(v), MISSING);
    assert.equal(formatParPrice(v), MISSING);
  }
  assert.equal(formatPercent(0.052, { isDecimal: true }), '5.20%');
  assert.equal(formatStockPrice(12.5), '$12.50');
  assert.equal(formatMultiple(2.25), '2.3x');
});
