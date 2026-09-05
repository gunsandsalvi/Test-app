/**
 * §6.1/§7.151: maintenance capex used to be derived from its own current value — an EMA of itself
 * with no anchor — so whatever it was seeded at is what it stayed, and capital ARRIVED at ~0.5% of
 * the capital stock a year against ~8% straight-line depreciation. The plant was consumed several
 * times faster than it was replaced, invisibly, for as long as nobody measured the construction
 * stock. These are the assertions that make that impossible to reintroduce.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCapitalProgramme, annualDepreciationLocal, usefulLifeYearsOf, commissionCapital, CapitalProgrammeInputs }
  from '../src/domain/company-week/capital-programme';

const healthy = (over: Partial<CapitalProgrammeInputs> = {}): CapitalProgrammeInputs => ({
  grossPPELocal: 1_200_000_000, accumulatedDepreciationLocal: 540_000_000, usefulLifeYears: 12,
  weeklyEbitdaLocal: 4_000_000, weeklyInterestLocal: 500_000,
  cashLocal: 200_000_000, currentLiabilitiesLocal: 300_000_000,
  annualRevenueLocal: 1_000_000_000, newRevenueLocal: 1_000_000_000,
  priorMaintenanceCapexLocal: 100_000_000, priorGrowthCapexLocal: 40_000_000,
  priorMaintenanceShortfallStreak: 0, baselineGrowthCapexToRevenueRatio: 0.04,
  isInvestmentGrade: true, addressableGrowthAnnual: 0.03, categoryShortfall: 0,
  capacityCatchupShareAnnual: 0.25, effectiveDebtRate: 0.04,
  marketCapLocal: 2_000_000_000, totalDebtLocal: 500_000_000, avgCompetitiveness: 0,
  ...over,
});

test('maintenance is anchored to the plant, not to its own last value', () => {
  // THE DEFECT: the target must move with gross PP&E and useful life and with nothing else.
  assert.equal(annualDepreciationLocal(1_200_000_000, 12), 100_000_000);
  const doubled = planCapitalProgramme(healthy({ grossPPELocal: 2_400_000_000 }));
  assert.equal(doubled.targetMaintenanceCapexLocal, 200_000_000);
  // And it does NOT move when only the prior value moves.
  const a = planCapitalProgramme(healthy({ priorMaintenanceCapexLocal: 1 }));
  const b = planCapitalProgramme(healthy({ priorMaintenanceCapexLocal: 999_000_000 }));
  assert.equal(a.targetMaintenanceCapexLocal, b.targetMaintenanceCapexLocal);
});

test('§3.26-f-i: the P&L charge and the stock\'s reduction are one schedule', () => {
  // A3: depreciation is a real cost against profit AND a real reduction in the stock — the SAME
  // number. The programme's weekly reduction is the schedule's year-rate sliced by 52, and the
  // upkeep target is the year-rate itself; the P&L takes the year-rate (income-statement.test).
  const schedule = annualDepreciationLocal(1_200_000_000, 12);
  const programme = planCapitalProgramme(healthy());
  assert.equal(programme.weeklyDepreciationLocal, schedule / 52);
  assert.equal(programme.targetMaintenanceCapexLocal, schedule);
});

test('§3.26-f-i: the life is read once — a carrier\'s is its fleet\'s, every other firm\'s its sector\'s', () => {
  assert.equal(usefulLifeYearsOf({ sector: 'Tech' }), 7);
  assert.equal(usefulLifeYearsOf({ sector: 'Industrials' }), 18);
  assert.equal(usefulLifeYearsOf({ sector: 'Industrials', carrierFleet: { assets: [{ mode: 'SEA' }] } }), 25,
    'a ship is worn over its own 25 years, not the sector\'s 18');
  assert.equal(usefulLifeYearsOf({ sector: 'Industrials', carrierFleet: { assets: [{ mode: 'ROAD' }] } }), 10);
});

test('a firm that cannot fund upkeep defers it, and the deferral compounds', () => {
  const broke = planCapitalProgramme(healthy({ weeklyEbitdaLocal: 0, cashLocal: 0, isInvestmentGrade: false }));
  assert.ok(broke.maintenanceShortfallThisWeekLocal > 0);
  assert.equal(broke.maintenanceShortfallStreak, 1);
  // Recovery is twice as fast as accumulation.
  const recovering = planCapitalProgramme(healthy({ priorMaintenanceShortfallStreak: 10 }));
  assert.equal(recovering.maintenanceShortfallStreak, 8);
});

test('a distressed firm cannot borrow its way out of deferred upkeep', () => {
  const junk = planCapitalProgramme(healthy({ weeklyEbitdaLocal: 0, cashLocal: 0, isInvestmentGrade: false }));
  assert.equal(junk.debtFundedMaintenanceLocal, 0);
  const ig = planCapitalProgramme(healthy({ weeklyEbitdaLocal: 0, cashLocal: 0, isInvestmentGrade: true }));
  assert.ok(ig.debtFundedMaintenanceLocal > 0);
});

test('a firm expands when the market it sells into cannot be met', () => {
  // §7.127's supply famine persisted because capex read only the firm's FINANCES and never
  // whether it could fill the orders in front of it.
  const met = planCapitalProgramme(healthy({ categoryShortfall: 0 }));
  const short = planCapitalProgramme(healthy({ categoryShortfall: 0.5 }));
  assert.ok(short.growthCapexLocal > met.growthCapexLocal);
});

test('investment is never negative, however hard the firm is squeezed', () => {
  const squeezed = planCapitalProgramme(healthy({
    effectiveDebtRate: 0.9, cashLocal: -1e9, marketCapLocal: 0, avgCompetitiveness: -10,
  }));
  assert.ok(squeezed.growthCapexLocal >= 0);
  assert.ok(squeezed.maintenanceCapexLocal >= 0);
  assert.ok(squeezed.capexLocal >= 0);
});

test('the plant grows by what was COMMISSIONED, not what was ordered', () => {
  const { commissionedLocal, stillUnderConstruction } = commissionCapital(
    [{ valueLocal: 100, entersServiceWeek: 5 }, { valueLocal: 900, entersServiceWeek: 40 }], 10);
  assert.equal(commissionedLocal, 100);
  assert.equal(stillUnderConstruction.length, 1);
  assert.equal(stillUnderConstruction[0].valueLocal, 900);
});

test('§7.288: growth capex is bounded by the money the firm actually commands', () => {
  // The desire can be unbounded (a deep shortage, a high q); the BID cannot exceed the year's
  // free cash flow after maintenance plus the cash pile above the treasurer's own operating
  // buffer — both existing mechanisms, no stated leverage factor (rule 2). Debt- or
  // equity-funded expansion raises the money FIRST; the proceeds land as cash and widen the
  // next week's cap by exactly what was raised.
  const greedy = planCapitalProgramme(healthy({
    categoryShortfall: 5, capacityCatchupShareAnnual: 1.0,
    marketCapLocal: 50_000_000_000, priorGrowthCapexLocal: 0,
  }));
  const fcf = Math.max(0, (4_000_000 - 500_000) * 52 - greedy.maintenanceCapexLocal);
  const deployable = Math.max(0, 200_000_000 - 1_000_000_000 * 0.05);
  assert.ok(greedy.growthCapexLocal <= (fcf + deployable) * 0.10 + 1,
    `growth ${greedy.growthCapexLocal} must be <= 10% step toward the funding cap ${fcf + deployable}`);
  // A firm with no cash beyond its buffer and no free cash flow bids no growth at all.
  const broke = planCapitalProgramme(healthy({
    categoryShortfall: 5, capacityCatchupShareAnnual: 1.0, priorGrowthCapexLocal: 0,
    weeklyEbitdaLocal: 400_000, cashLocal: 50_000_000,
  }));
  assert.ok(broke.growthCapexLocal <= 1, 'no fundable money, no growth bid');
});
