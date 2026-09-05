/** §3.26-a — a print's sensitivity comes off the paper's own schedule at the print's own yield. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dv01PerUnitFace, priceFromYield, type PaperTerms } from '../src/domain/pricing/bond';

const tenYear: PaperTerms = { annualCouponRate: 0.05, periodWeeks: 52, weeksToMaturity: 520 };
const twoYear: PaperTerms = { annualCouponRate: 0.05, periodWeeks: 52, weeksToMaturity: 104 };

test('dv01 is positive, larger for longer paper, and zero for matured or unpriced paper', () => {
  const par10 = priceFromYield(tenYear, 0.05);
  const par2 = priceFromYield(twoYear, 0.05);
  const d10 = dv01PerUnitFace(tenYear, par10);
  const d2 = dv01PerUnitFace(twoYear, par2);
  assert.ok(d10 > 0 && d2 > 0);
  assert.ok(d10 > d2);
  // Roughly the duration in years times a basis point, per unit of face.
  assert.ok(d10 > 0.0006 && d10 < 0.0009, `${d10}`);
  assert.equal(dv01PerUnitFace({ ...tenYear, weeksToMaturity: 0 }, 1), 0);
  assert.equal(dv01PerUnitFace(tenYear, 0), 0);
});
