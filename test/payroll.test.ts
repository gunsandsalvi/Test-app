/**
 * §7.115, the largest measured defect in this file's history: the listing branch skipped payroll
 * entirely, so 1,712 private firms employing 8.20M people paid no wages at all and 67% of the
 * USA's named wage bill never reached a household.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payrollWeek, headcountCostDeltaAnnualUSD } from '../src/domain/company-week/payroll';

test('only the deviation from baseline adjusts a stated margin', () => {
  // A stated EBITDA margin already contains a baseline wage bill; charging the whole payroll
  // against it again counts labour twice.
  const p = payrollWeek({ weeklyUSD: 1_200_000, baselineWeeklyUSD: 1_000_000 });
  assert.equal(p.aboveBaselineAnnualUSD, 200_000 * 52);
  assert.equal(p.weeklyUSD, 1_200_000, 'and the full bill is still reported, for profiles that charge it');
});

test('a firm paying exactly its baseline adjusts nothing', () => {
  assert.equal(payrollWeek({ weeklyUSD: 5e5, baselineWeeklyUSD: 5e5 }).aboveBaselineAnnualUSD, 0);
});

test('a firm paying below baseline gets a CREDIT, not a floor at zero', () => {
  // A firm that has shed staff or pays under the going rate really does have a lower wage bill
  // than the margin assumes, and the deviation says so in both directions.
  const p = payrollWeek({ weeklyUSD: 8e5, baselineWeeklyUSD: 1e6 });
  assert.ok(p.aboveBaselineAnnualUSD < 0);
  assert.equal(p.aboveBaselineAnnualUSD, -200_000 * 52);
});

test('a headcount change is priced at the firm own wage', () => {
  // 10 people at 100k of weekly payroll over 100 heads = 1k/week each, 52k/yr each.
  assert.equal(headcountCostDeltaAnnualUSD(100_000, 100, 10), 10 * 1000 * 52);
  assert.equal(headcountCostDeltaAnnualUSD(100_000, 100, -10), -10 * 1000 * 52);
});

test('a firm with no staff prices a headcount change at zero, not at Infinity', () => {
  assert.equal(headcountCostDeltaAnnualUSD(0, 0, 5), 0);
  assert.equal(headcountCostDeltaAnnualUSD(1e6, 0, 5), 0);
});
