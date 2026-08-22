import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [52, 104, 156, 208, 260, 312, 364, 416, 468, 520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    console.log(JSON.stringify({
      week: w,
      usaGdpGrowth: state.regions.USA.gdpGrowth,
      usaInflation: state.regions.USA.inflation,
      usaPolicyRate: state.regions.USA.policyRate,
      activeCompanies: state.companies.filter(c => !c.isDefaulted).length,
      us500: state.compositeIndices.us500.value,
      brentSpot: state.commodities.find(c => c.id === 'BRENT')?.spotPrice,
    }));
  }
}
