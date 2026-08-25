import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 130; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w % 10 === 0 || (w >= 75 && w <= 125)) {
      const wti = state.commodities.find(c => c.id === 'WTI' || c.symbol === 'WTI') as any;
      console.log(`Week ${w}: WTI spotPrice=${wti.spotPrice}, supplyUnits=${wti.weeklySupplyUnits?.toExponential(3)}, demandUnits=${wti.weeklyDemandUnits?.toExponential(3)}, ratio=${(wti.weeklyDemandUnits / Math.max(1e-6, wti.weeklySupplyUnits)).toFixed(4)}`);
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
