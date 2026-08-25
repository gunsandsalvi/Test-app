import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w % 50 === 0 || w === 1 || w === 10) {
    const reg = state.regions.USA as any;
    const c = reg.consumptionComponentUSD;
    const i = reg.investmentComponentUSD;
    const g = reg.governmentSpendingUSD * 52;
    const nx = reg.tradeBalance;
    const gdp = reg.derivedNominalGdpUSD;
    const inc = reg.estimatedHouseholdIncomeUSD;
    const trackedFirms = state.companies.filter(c => c.region === 'USA' && !c.isDefaulted);
    const trackedCapex = trackedFirms.reduce((s, f) => s + f.maintenanceCapex + f.growthCapex, 0);
    const trackedRev = trackedFirms.reduce((s, f) => s + f.annualRevenue, 0);
    const trackedEmp = trackedFirms.reduce((s, f) => s + f.employeeCount, 0);
    console.log(`W${w}: GDP=$${(gdp/1e12).toFixed(2)}T | C=$${(c/1e12).toFixed(2)}T I=$${(i/1e12).toFixed(2)}T G=$${(g/1e12).toFixed(2)}T NX=$${(nx/1e12).toFixed(2)}T | HhInc=$${(inc/1e12).toFixed(2)}T TrackedRev=$${(trackedRev/1e12).toFixed(2)}T TrackedCapex=$${(trackedCapex/1e9).toFixed(1)}B TrackedEmp=${trackedEmp}`);
  }
}
