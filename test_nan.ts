import { createInitialGameState, advanceWeeklyStep } from './src/engine/simulation';
let state = createInitialGameState();
for (let week = 1; week <= 7; week++) {
  try {
     state = advanceWeeklyStep(state);
     for (const c of state.companies) {
       for (const l of c.productLines) {
         if (l.competitiveness > 10) {
            console.log(`Week ${week}: ${c.ticker} competitiveness for ${l.category} = ${l.competitiveness}`);
         }
       }
     }
  } catch(e) {
     console.log(`Error week ${week}`, e);
     break;
  }
}
