import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 255; w++) {
  state = advanceWeeklyStep(state);
  if (w >= 248 && w <= 255) {
    const reg = state.regions.USA as any;
    console.log(`W${w}: smoothedWeeklyGrowthRate=${reg.smoothedWeeklyGrowthRate?.toFixed(6)} | fiscalDeficitPct=${(reg.fiscalDeficitPctGdp*100).toFixed(2)}% | govRevenue=${(reg.governmentRevenueUSD*52/1e12).toFixed(2)}T | govSpending=${(reg.governmentSpendingUSD*52/1e12).toFixed(2)}T | G_annual=${(reg.governmentSpendingUSD*52/1e12).toFixed(2)}T`);
  }
}
