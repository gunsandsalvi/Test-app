import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
for (let w = 1; w <= 100; w++) {
  state = advanceWeeklyStep(state);
  if (w % 10 === 0) {
    const usa = state.regions.USA as any;
    const cats = ['heavy_equipment', 'industrial_automation', 'industrial_chemicals', 'enterprise_software', 'network_infrastructure', 'food_beverage', 'apparel_retail', 'luxury_goods'];
    console.log(`week ${w}:`, cats.map(c => `${c}=${usa.categoryDemand[c]?.demandGrowthAnnual?.toFixed(4)}`).join(' '));
  }
}
