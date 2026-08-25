import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
console.log("Initial state (w=0):");
for (const rid of ['USA', 'UK', 'JPN', 'EUR']) {
  const reg = state.regions[rid as any] as any;
  const initialHhInc = reg.estimatedHouseholdIncomeUSD;
  const initialGdp = reg.derivedNominalGdpUSD ?? reg.estimatedNominalGdpUSD;
  console.log(`  ${rid}: initialHhInc=$${(initialHhInc/1e12).toFixed(2)}T initialGdp=$${(initialGdp/1e12).toFixed(2)}T`);
}

for (let w = 1; w <= 10; w++) {
  state = advanceWeeklyStep(state);
  const usa = state.regions.USA as any;
  const c = usa.consumptionComponentUSD;
  const i = usa.investmentComponentUSD;
  const g = usa.governmentSpendingUSD * 52;
  const gdp = usa.derivedNominalGdpUSD;
  const hhInc = usa.estimatedHouseholdIncomeUSD;
  const aut = usa.categoryDemand.industrial_automation;
  console.log(`W${w}: USA HhInc=$${(hhInc/1e12).toFixed(2)}T GDP=$${(gdp/1e12).toFixed(2)}T (C=$${(c/1e12).toFixed(2)}T I=$${(i/1e12).toFixed(2)}T G=$${(g/1e12).toFixed(2)}T) | ind_auto targetDemand=$${(aut?.demandLevelUSD/1e9).toFixed(1)}B growth=${(aut?.demandGrowthAnnual*100).toFixed(1)}%`);
}
