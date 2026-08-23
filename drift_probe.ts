import { createInitialGameState, advanceWeeklyStep } from './src/engine/simulation';

let state = createInitialGameState();
for (let i = 0; i < 52; i++) {
    state = advanceWeeklyStep(state);
    let r = state.regions['USA'];
    console.log(`W${i}: beta0=${r.yieldCurveParams.beta0.toFixed(4)} pi=${r.inflation.toFixed(4)} def=${r.fiscalDeficitPctGdp.toFixed(4)} NIM=${r.bankingSector.netInterestMarginPct.toFixed(4)}`);
}
