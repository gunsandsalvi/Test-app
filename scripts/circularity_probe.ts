// scripts/circularity_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [52, 104, 208, 364, 468, 520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const tope = state.companies.find(c => c.ticker === 'TOPE')!;
    console.log(JSON.stringify({
      week: w,
      revenue: Math.round(tope.annualRevenue),
      dividendYield: tope.dividendYield,
      executionQuality: tope.executionQuality,
      growthCapex: Math.round(tope.growthCapex),
      crowdingOnTechCategory: (state.regions.USA.categoryDemand as any).CorporateTech?.crowdingIntensity,
    }));
  }
}
