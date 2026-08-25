import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';
let state = createInitialGameState();
const dump: any = { weeks: [] };
for (let w = 1; w <= 100; w++) {
  state = advanceWeeklyStep(state);
  const usa = state.regions.USA;
  const entry: any = {
    week: w,
    gdpGrowth: usa.gdpGrowth,
    consumptionComponentUSD: usa.consumptionComponentUSD,
    investmentComponentUSD: usa.investmentComponentUSD,
    governmentSpendingUSD: usa.governmentSpendingUSD,
    estimatedNominalGdpUSD: (usa as any).estimatedNominalGdpUSD,
  };
  dump.weeks.push(entry);
  if (Math.abs(usa.gdpGrowth) > 0.25 || !isFinite(usa.investmentComponentUSD) || isNaN(usa.governmentSpendingUSD)) {
    dump.firstBadWeek = w;
    fs.writeFileSync('scripts/gdp_bottomup_deep_dump_output.json', JSON.stringify(dump, null, 2));
    console.log('First bad week:', w);
    process.exit(0);
  }
}
fs.writeFileSync('scripts/gdp_bottomup_deep_dump_output.json', JSON.stringify(dump, null, 2));
