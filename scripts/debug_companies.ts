import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
for (let w = 1; w <= 10; w++) {
  state = advanceWeeklyStep(state);
  console.log("USA Real Consumption Growth:", state.regions.USA.householdState.realConsumptionGrowth);
  console.log("USA GDP Growth:", state.regions.USA.gdpGrowth);
}
