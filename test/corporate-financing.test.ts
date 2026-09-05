/** §3.20d-i — the leverage target and its pace are the management's. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCorporateFinancing, targetLeverageOf, COVENANT_LEVERAGE_CEILING } from '../src/engine/simulation/stages/corporate-financing';
import type { Company } from '../src/types';

const firm = (over: Record<string, unknown> = {}): Company => ({
  management: { patienceWeeks: 10, riskAversion: 1, appointedWeek: 0 },
  growthCapex: 52e6, maintenanceCapex: 52e6, plant: [{ costLocal: 1e9, enteredServiceWeek: 10 - 0.4 * 520, usefulLifeYears: 10, kind: 'heavy_equipment' }],
  annualRevenue: 2e9, stockPrice: 10, eps: 1, ...over,
} as unknown as Company);
const base = { week: 10, marketCapLocal: 1e9, costOfDebtAnnual: 0.04, effectiveTaxRate: 0.25, ebitdaAnnual: 4e8, ebitAnnual: 3e8, cashLocal: 2e8, rating: 'BBB' as const };

test('a more averse management targets less of the lender\'s room', () => {
  assert.equal(targetLeverageOf('BBB', { patienceWeeks: 10, riskAversion: 1, appointedWeek: 0 }), COVENANT_LEVERAGE_CEILING.BBB);
  assert.equal(targetLeverageOf('BBB', { patienceWeeks: 10, riskAversion: 2, appointedWeek: 0 }), COVENANT_LEVERAGE_CEILING.BBB / 2);
});

test('cheap debt is raised toward the target at the management\'s pace, into its own programme', () => {
  const d = decideCorporateFinancing({ ...base, comp: firm(), plant: firm().plant, totalDebtLocal: 4e8 });
  assert.equal(d.reason, 'ISSUE_CHEAP_DEBT');
  const headroomLocal = (COVENANT_LEVERAGE_CEILING.BBB - 1) * base.ebitdaAnnual;
  assert.ok(Math.abs(d.netDebtChangeLocal - Math.min(headroomLocal / 10, 2e6)) < 1e-6, 'gap over ten weeks, capped by the week\'s capex');
  const idle = decideCorporateFinancing({ ...base, comp: firm({ growthCapex: 0, maintenanceCapex: 0 }), plant: firm().plant, totalDebtLocal: 4e8 });
  assert.equal(idle.reason, 'NONE', 'nothing to deploy into: nothing raised');
});

test('above its own target a management pays down toward it, over its horizon', () => {
  const averse = firm({ management: { patienceWeeks: 20, riskAversion: 2, appointedWeek: 0 } });
  const d = decideCorporateFinancing({ ...base, comp: averse, plant: averse.plant, totalDebtLocal: 1.6e9 });
  assert.equal(d.reason, 'DELEVER_TO_TARGET');
  const gapLocal = (4 - COVENANT_LEVERAGE_CEILING.BBB / 2) * base.ebitdaAnnual;
  assert.ok(Math.abs(d.netDebtChangeLocal + Math.min(base.cashLocal, gapLocal) / 20) < 1e-6);
});
