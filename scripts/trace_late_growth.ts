import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w % 52 === 0) {
    const reg = state.regions.USA as any;
    const trackedFirms = state.companies.filter(f => f.region === 'USA' && !f.isDefaulted);
    const totalMaintCapex = trackedFirms.reduce((s, f) => s + f.maintenanceCapex, 0);
    const totalGrowthCapex = trackedFirms.reduce((s, f) => s + f.growthCapex, 0);
    const totalRev = trackedFirms.reduce((s, f) => s + f.annualRevenue, 0);
    const avgTobinQ = trackedFirms.reduce((s, f) => s + f.tobinsQ, 0) / trackedFirms.length;
    const avgDebt = trackedFirms.reduce((s, f) => s + f.totalDebt, 0);
    const avgCash = trackedFirms.reduce((s, f) => s + f.cash, 0);
    console.log(`Year ${w/52} (W${w}): USA GDP=${(reg.derivedNominalGdpUSD/1e12).toFixed(1)}T | C=${(reg.consumptionComponentUSD/1e12).toFixed(1)}T I=${(reg.investmentComponentUSD/1e12).toFixed(1)}T G=${(reg.governmentSpendingUSD*52/1e12).toFixed(1)}T | TotalRev=${(totalRev/1e12).toFixed(2)}T MaintCap=${(totalMaintCapex/1e9).toFixed(1)}B GrowthCap=${(totalGrowthCapex/1e9).toFixed(1)}B avgTobinQ=${avgTobinQ.toFixed(2)} Debt=${(avgDebt/1e12).toFixed(2)}T Cash=${(avgCash/1e12).toFixed(2)}T`);
  }
}
