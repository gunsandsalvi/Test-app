import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 38; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 30) {
      console.log(`\n================ WEEK ${w} USA ================`);
      const usa = state.regions.USA as any;
      const comps = state.companies.filter(c => c.region === 'USA');
      const totalCapex = comps.reduce((s, c) => s + (c.isDefaulted ? 0 : c.capex), 0);
      const totalEmp = comps.reduce((s, c) => s + (c.isDefaulted ? 0 : c.employeeCount), 0);
      console.log(`Total Capex: ${totalCapex.toExponential(3)}, Total Emp: ${totalEmp}, TrackedInv: ${usa.investmentComponentUSD?.toExponential(3)}`);
      const topCapex = [...comps].sort((a, b) => b.capex - a.capex).slice(0, 3);
      for (const c of topCapex) {
        console.log(`  Top Capex: ${c.ticker} (${c.name}) capex=${c.capex?.toExponential(3)} maint=${c.maintenanceCapex?.toExponential(3)} growth=${c.growthCapex?.toExponential(3)} rev=${c.annualRevenue?.toExponential(3)} shares=${c.sharesOutstanding?.toExponential(3)} marketCap=${c.marketCap?.toExponential(3)} p=${c.stockPrice}`);
      }
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
