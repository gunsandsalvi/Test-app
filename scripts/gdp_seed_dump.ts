import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';
let state = createInitialGameState();
const dump: any = { week0: {} };
(['USA','EUR','UK','JPN'] as const).forEach(r => {
  dump.week0[r] = { lastWeekNominalGdpUSD: (state.regions[r] as any).lastWeekNominalGdpUSD, estimatedNominalGdpUSD: (state.regions[r] as any).estimatedNominalGdpUSD };
});
state = advanceWeeklyStep(state);
dump.week1 = {};
(['USA','EUR','UK','JPN'] as const).forEach(r => {
  const reg = state.regions[r] as any;
  dump.week1[r] = { gdpGrowth: reg.gdpGrowth, lastWeekNominalGdpUSD: reg.lastWeekNominalGdpUSD, estimatedNominalGdpUSD: reg.estimatedNominalGdpUSD };
});
fs.writeFileSync('scripts/gdp_seed_dump_output.json', JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
