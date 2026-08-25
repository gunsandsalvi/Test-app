import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 64; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 62) {
      console.log(`\n================ WEEK ${w} UK COMPANIES WITH TOP CAPEX ================`);
      const ukCompanies = state.companies.filter(c => c.region === 'UK');
      const sorted = [...ukCompanies].sort((a, b) => b.capex - a.capex);
      for (let i = 0; i < Math.min(5, sorted.length); i++) {
        const c = sorted[i];
        console.log(`Ticker: ${c.ticker} | Name: ${c.name} | Capex: ${c.capex?.toExponential(3)} (maint=${c.maintenanceCapex?.toExponential(3)}, growth=${c.growthCapex?.toExponential(3)}) | Rev: ${c.annualRevenue?.toExponential(3)} | Cash: ${c.cash?.toExponential(3)} | ProductLines: ${c.productLines?.length}`);
      }
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
