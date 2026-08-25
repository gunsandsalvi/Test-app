import { createInitialGameState } from '../src/engine/simulation/initialization.ts';
import { advanceWeeklyStep } from '../src/engine/simulation/core.ts';

let state = createInitialGameState();
for(let w=1; w<=10; w++) {
   state = advanceWeeklyStep(state);
}

const reg = state.regions['JPN'];
console.log("JPN state:");
console.log("GDP Growth:", reg.gdpGrowth);
console.log("Household Income:", reg.estimatedHouseholdIncomeUSD);
console.log("Population:", reg.totalPopulation);
console.log("Pools:", reg.occupationPools);
console.log("Shares:", reg.occupationLaborForceShare);

