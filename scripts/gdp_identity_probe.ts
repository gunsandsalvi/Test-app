// scripts/gdp_identity_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [13,52,104,208,364,520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    console.log(JSON.stringify({
      week: w, regime: r.cycleRegime,
      simulatedGdpGrowth: +(r.gdpGrowth*100).toFixed(2),
      bottomUpGdpGrowth: +(r.gdpGrowthBottomUp*100).toFixed(2),
      C: Math.round(r.consumptionComponentUSD), I: Math.round(r.investmentComponentUSD),
      G: Math.round(r.governmentSpendingUSD*52), NX: Math.round(r.exportsUSD - r.importsUSD),
      derivedNominalGdpUSD: Math.round(r.derivedNominalGdpUSD),
    }));
  }
}
