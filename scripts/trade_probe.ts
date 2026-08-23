import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const checkpoints = [13, 52, 104, 208, 364, 520];
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    console.log(JSON.stringify({
      week: w,
      exports: Math.round(r.exportsUSD),
      imports: Math.round(r.importsUSD),
      tradeBalance: Math.round(r.tradeBalance),
      fxUsdEur: state.fxPairs.find(f => f.pair === 'EUR/USD')?.rate,
    }));
  }
}
