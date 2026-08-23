// scripts/nominal_fix_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [104,208,300,320,340,364,468,520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    console.log(JSON.stringify({
      week: w, regime: r.cycleRegime, gdpGrowth: +(r.gdpGrowth*100).toFixed(2),
      gdpGrowthBottomUp: +(r.gdpGrowthBottomUp*100).toFixed(2), potentialGdp: +(r.potentialGdpGrowth*100).toFixed(2),
      unemployment: +(r.unemploymentRate*100).toFixed(2),
    }));
  }
}
