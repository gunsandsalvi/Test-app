// scripts/government_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [13,52,104,208,364,520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    console.log(JSON.stringify({
      week: w, regime: r.cycleRegime, fiscalStance: +r.fiscalStanceScore.toFixed(2),
      nominalGdpUSD: Math.round(r.estimatedNominalGdpUSD), taxRate: +r.effectiveTaxRate.toFixed(3),
      govRevenueWeekly: Math.round(r.governmentRevenueUSD), govSpendingWeekly: Math.round(r.governmentSpendingUSD),
      govEmployment: r.governmentEmployment,
      govDefenseDemandGrowth: +(r.categoryDemand as any).GovernmentDefense.demandGrowthAnnual.toFixed(3),
    }));
  }
}
