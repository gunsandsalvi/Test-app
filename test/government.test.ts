/**
 * §7.230: the fiscal check compared outlays against `governmentSpendingWeeklyLocal * 1.5` — a stated 50%
 * tolerance against a number that is NOT the budget — so §6.1's EUR row could never have closed
 * whatever the engine did. The budget is the decomposition, and it now lives on one object.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Government, GovernmentFields } from '../src/domain/government-entity';

const fields = (over: Partial<GovernmentFields> = {}): GovernmentFields => ({
  governmentRevenueLocal: 2_000_000_000,
  governmentSpendingWeeklyLocal: 2_600_000_000,
  governmentPayrollWeeklyLocal: 400_000_000,
  governmentTransfersWeeklyLocal: undefined,
  governmentProcurementSpentLocal: 0,
  fiscalStanceScore: 0,
  ...over,
});

test('a government inside its budget reports no overrun', () => {
  const gov = new Government('EUR', fields(), []);
  assert.equal(gov.overrun().overrunLocal, 0);
});

test('an overrun is discretionary, never contractual', () => {
  // PUB1e: interest and payroll are paid in full, so an outlay above budget means a discretionary
  // line grew. The old check could not say this because nothing held both halves.
  const gov = new Government('EUR', fields({ governmentProcurementSpentLocal: 4_000_000_000 }), []);
  const { overrunLocal, contractualLocal, discretionaryLocal } = gov.overrun();
  assert.ok(overrunLocal > 0, 'spending 4B of procurement on a 2.6B budget must overrun');
  assert.ok(discretionaryLocal > contractualLocal);
});

test('the budget is the decomposition, not the spending line', () => {
  // The bug in one assertion: budgetLocal is what the parts sum to, and reading
  // governmentSpendingWeeklyLocal in its place is what made the old check measure nothing.
  const w = new Government('EUR', fields(), []).week();
  const parts = w.interestLocal + w.payrollLocal + w.procurementBudgetLocal + w.transfersLocal;
  assert.ok(Math.abs(w.budgetLocal - parts) < 1e-6);
});

test('payroll comes off the top, so a rising wage bill cuts programmes', () => {
  const lean = new Government('EUR', fields({ governmentPayrollWeeklyLocal: 100_000_000 }), []).week();
  const heavy = new Government('EUR', fields({ governmentPayrollWeeklyLocal: 900_000_000 }), []).week();
  assert.ok(heavy.procurementBudgetLocal < lean.procurementBudgetLocal);
  assert.ok(heavy.payrollLocal > lean.payrollLocal);
});

test('the deficit is outlays less revenue, both off the same object', () => {
  const gov = new Government('EUR', fields({ governmentRevenueLocal: 1_000_000_000 }), []);
  assert.equal(gov.deficitWeeklyLocal(), gov.week().outlaysLocal - 1_000_000_000);
});
