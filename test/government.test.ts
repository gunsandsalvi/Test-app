/**
 * §7.230: the fiscal check compared outlays against `governmentSpendingWeeklyUSD * 1.5` — a stated 50%
 * tolerance against a number that is NOT the budget — so §6.1's EUR row could never have closed
 * whatever the engine did. The budget is the decomposition, and it now lives on one object.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Government, GovernmentFields } from '../src/domain/government-entity';

const fields = (over: Partial<GovernmentFields> = {}): GovernmentFields => ({
  governmentRevenueUSD: 2_000_000_000,
  governmentSpendingWeeklyUSD: 2_600_000_000,
  governmentPayrollWeeklyUSD: 400_000_000,
  governmentTransfersWeeklyUSD: undefined,
  governmentProcurementSpentUSD: 0,
  fiscalStanceScore: 0,
  govDebtTranches: [],
  ...over,
});

test('a government inside its budget reports no overrun', () => {
  const gov = new Government('EUR', fields());
  assert.equal(gov.overrun().overrunUSD, 0);
});

test('an overrun is discretionary, never contractual', () => {
  // PUB1e: interest and payroll are paid in full, so an outlay above budget means a discretionary
  // line grew. The old check could not say this because nothing held both halves.
  const gov = new Government('EUR', fields({ governmentProcurementSpentUSD: 4_000_000_000 }));
  const { overrunUSD, contractualUSD, discretionaryUSD } = gov.overrun();
  assert.ok(overrunUSD > 0, 'spending 4B of procurement on a 2.6B budget must overrun');
  assert.ok(discretionaryUSD > contractualUSD);
});

test('the budget is the decomposition, not the spending line', () => {
  // The bug in one assertion: budgetUSD is what the parts sum to, and reading
  // governmentSpendingWeeklyUSD in its place is what made the old check measure nothing.
  const w = new Government('EUR', fields()).week();
  const parts = w.interestUSD + w.payrollUSD + w.procurementBudgetUSD + w.transfersUSD;
  assert.ok(Math.abs(w.budgetUSD - parts) < 1e-6);
});

test('payroll comes off the top, so a rising wage bill cuts programmes', () => {
  const lean = new Government('EUR', fields({ governmentPayrollWeeklyUSD: 100_000_000 })).week();
  const heavy = new Government('EUR', fields({ governmentPayrollWeeklyUSD: 900_000_000 })).week();
  assert.ok(heavy.procurementBudgetUSD < lean.procurementBudgetUSD);
  assert.ok(heavy.payrollUSD > lean.payrollUSD);
});

test('the deficit is outlays less revenue, both off the same object', () => {
  const gov = new Government('EUR', fields({ governmentRevenueUSD: 1_000_000_000 }));
  assert.equal(gov.deficitWeeklyUSD(), gov.week().outlaysUSD - 1_000_000_000);
});
