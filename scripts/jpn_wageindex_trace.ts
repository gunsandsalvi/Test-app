import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 20; w++) {
  try {
    state = advanceWeeklyStep(state);
  } catch (e: any) {
    console.log(`crashed at week ${w}: ${e.message}`);
    break;
  }
  const jpn = state.regions.JPN as any;
  const wageIndices = Object.entries(jpn.occupationPools || {}).map(([k, v]: any) => `${k}:${v.wageIndex?.toExponential?.(3)}`);
  console.log(`week ${w}: estimatedHouseholdIncomeUSD=${jpn.estimatedHouseholdIncomeUSD?.toExponential?.(3)} wageIndices=[${wageIndices.join(', ')}]`);
}
