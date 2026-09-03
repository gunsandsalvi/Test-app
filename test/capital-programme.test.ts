/**
 * §6.1/§7.151: maintenance capex used to be derived from its own current value — an EMA of itself
 * with no anchor — so whatever it was seeded at is what it stayed, and capital ARRIVED at ~0.5% of
 * the capital stock a year against ~8% straight-line depreciation. The plant was consumed several
 * times faster than it was replaced, invisibly, for as long as nobody measured the construction
 * stock. These are the assertions that make that impossible to reintroduce.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCapitalProgramme, maintenanceTargetUSD, commissionCapital, CapitalProgrammeInputs }
  from '../src/domain/company-week/capital-programme';

const healthy = (over: Partial<CapitalProgrammeInputs> = {}): CapitalProgrammeInputs => ({
  grossPPEUSD: 1_200_000_000, accumulatedDepreciationUSD: 540_000_000, usefulLifeYears: 12,
  weeklyEbitdaUSD: 4_000_000, weeklyInterestUSD: 500_000,
  cashUSD: 200_000_000, currentLiabilitiesUSD: 300_000_000,
  annualRevenueUSD: 1_000_000_000, newRevenueUSD: 1_000_000_000,
  priorMaintenanceCapexUSD: 100_000_000, priorGrowthCapexUSD: 40_000_000,
  priorMaintenanceShortfallStreak: 0, baselineGrowthCapexToRevenueRatio: 0.04,
  isInvestmentGrade: true, addressableGrowthAnnual: 0.03, categoryShortfall: 0,
  capacityCatchupShareAnnual: 0.25, effectiveDebtRate: 0.04,
  marketCapUSD: 2_000_000_000, totalDebtUSD: 500_000_000, avgCompetitiveness: 0,
  ...over,
});

test('maintenance is anchored to the plant, not to its own last value', () => {
  // THE DEFECT: the target must move with gross PP&E and useful life and with nothing else.
  assert.equal(maintenanceTargetUSD(1_200_000_000, 12), 100_000_000);
  const doubled = planCapitalProgramme(healthy({ grossPPEUSD: 2_400_000_000 }));
  assert.equal(doubled.targetMaintenanceCapexUSD, 200_000_000);
  // And it does NOT move when only the prior value moves.
  const a = planCapitalProgramme(healthy({ priorMaintenanceCapexUSD: 1 }));
  const b = planCapitalProgramme(healthy({ priorMaintenanceCapexUSD: 999_000_000 }));
  assert.equal(a.targetMaintenanceCapexUSD, b.targetMaintenanceCapexUSD);
});

test('a firm that cannot fund upkeep defers it, and the deferral compounds', () => {
  const broke = planCapitalProgramme(healthy({ weeklyEbitdaUSD: 0, cashUSD: 0, isInvestmentGrade: false }));
  assert.ok(broke.maintenanceShortfallThisWeekUSD > 0);
  assert.equal(broke.maintenanceShortfallStreak, 1);
  // Recovery is twice as fast as accumulation.
  const recovering = planCapitalProgramme(healthy({ priorMaintenanceShortfallStreak: 10 }));
  assert.equal(recovering.maintenanceShortfallStreak, 8);
});

test('a distressed firm cannot borrow its way out of deferred upkeep', () => {
  const junk = planCapitalProgramme(healthy({ weeklyEbitdaUSD: 0, cashUSD: 0, isInvestmentGrade: false }));
  assert.equal(junk.debtFundedMaintenanceUSD, 0);
  const ig = planCapitalProgramme(healthy({ weeklyEbitdaUSD: 0, cashUSD: 0, isInvestmentGrade: true }));
  assert.ok(ig.debtFundedMaintenanceUSD > 0);
});

test('a firm expands when the market it sells into cannot be met', () => {
  // §7.127's supply famine persisted because capex read only the firm's FINANCES and never
  // whether it could fill the orders in front of it.
  const met = planCapitalProgramme(healthy({ categoryShortfall: 0 }));
  const short = planCapitalProgramme(healthy({ categoryShortfall: 0.5 }));
  assert.ok(short.growthCapexUSD > met.growthCapexUSD);
});

test('investment is never negative, however hard the firm is squeezed', () => {
  const squeezed = planCapitalProgramme(healthy({
    effectiveDebtRate: 0.9, cashUSD: -1e9, marketCapUSD: 0, avgCompetitiveness: -10,
  }));
  assert.ok(squeezed.growthCapexUSD >= 0);
  assert.ok(squeezed.maintenanceCapexUSD >= 0);
  assert.ok(squeezed.capexUSD >= 0);
});

test('the plant grows by what was COMMISSIONED, not what was ordered', () => {
  const { commissionedUSD, stillUnderConstruction } = commissionCapital(
    [{ valueUSD: 100, entersServiceWeek: 5 }, { valueUSD: 900, entersServiceWeek: 40 }], 10);
  assert.equal(commissionedUSD, 100);
  assert.equal(stillUnderConstruction.length, 1);
  assert.equal(stillUnderConstruction[0].valueUSD, 900);
});

test('§7.288: growth capex is bounded by the money the firm actually commands', () => {
  // The desire can be unbounded (a deep shortage, a high q); the BID cannot exceed the year's
  // free cash flow after maintenance plus the cash pile above the treasurer's own operating
  // buffer — both existing mechanisms, no stated leverage factor (rule 2). Debt- or
  // equity-funded expansion raises the money FIRST; the proceeds land as cash and widen the
  // next week's cap by exactly what was raised.
  const greedy = planCapitalProgramme(healthy({
    categoryShortfall: 5, capacityCatchupShareAnnual: 1.0,
    marketCapUSD: 50_000_000_000, priorGrowthCapexUSD: 0,
  }));
  const fcf = Math.max(0, (4_000_000 - 500_000) * 52 - greedy.maintenanceCapexUSD);
  const deployable = Math.max(0, 200_000_000 - 1_000_000_000 * 0.05);
  assert.ok(greedy.growthCapexUSD <= (fcf + deployable) * 0.10 + 1,
    `growth ${greedy.growthCapexUSD} must be <= 10% step toward the funding cap ${fcf + deployable}`);
  // A firm with no cash beyond its buffer and no free cash flow bids no growth at all.
  const broke = planCapitalProgramme(healthy({
    categoryShortfall: 5, capacityCatchupShareAnnual: 1.0, priorGrowthCapexUSD: 0,
    weeklyEbitdaUSD: 400_000, cashUSD: 50_000_000,
  }));
  assert.ok(broke.growthCapexUSD <= 1, 'no fundable money, no growth bid');
});
