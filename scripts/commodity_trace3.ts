import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
console.log("=== COMMODITY SPOT PRICE TRACE ===");
console.log(`Week 0 (Initial):`);
state.commodities.forEach(c => {
  console.log(`  ${c.id}: spotPrice=${c.spotPrice.toFixed(2)} (historical[0]=${c.historicalPrices[0]?.toFixed(2)})`);
});

const traceWeeks = [1, 10, 52, 100, 200, 520];
for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (traceWeeks.includes(w)) {
      console.log(`Week ${w}:`);
      state.commodities.forEach(c => {
        console.log(`  ${c.id}: spotPrice=${c.spotPrice.toExponential(2)}`);
      });
    }
  } catch (err: any) {
    console.log(`Failed at week ${w} with error: ${err.message}`);
    break;
  }
}
