// scripts/blended_gdp_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [52,104,156,208,260,364,468,520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    console.log(JSON.stringify({
      week: w, regime: r.cycleRegime, blendedGdpGrowth: +(r.gdpGrowth*100).toFixed(2),
      bottomUpComponent: +(r.gdpGrowthBottomUp*100).toFixed(2), unemployment: +(r.unemploymentRate*100).toFixed(2),
      policyRate: +(r.policyRate*100).toFixed(2),
    }));
  }
}
