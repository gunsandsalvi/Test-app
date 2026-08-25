import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 106; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 98) {
      console.log(`\n================ WEEK ${w} ================`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`  ${rid}: derivedGdp=${reg.derivedNominalGdpUSD?.toExponential(3)}, C=${reg.consumptionComponentUSD?.toExponential(3)}, I=${reg.investmentComponentUSD?.toExponential(3)}, G=${(reg.governmentSpendingUSD * 52)?.toExponential(3)}, NX=${reg.tradeBalance?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toFixed(3)}`);
      }
      const topCapex = [...state.companies].sort((a, b) => (b.capex || 0) - (a.capex || 0)).slice(0, 5);
      console.log(`  Top Capex comps:`);
      for (const c of topCapex) {
        console.log(`    ${c.ticker} (${c.name}, ${c.region}): capex=${c.capex?.toExponential(3)}, rev=${c.annualRevenue?.toExponential(3)}, maint=${c.maintenanceCapex?.toExponential(3)}, growth=${c.growthCapex?.toExponential(3)}, p=${c.stockPrice}`);
      }
      const topRev = [...state.companies].sort((a, b) => (b.annualRevenue || 0) - (a.annualRevenue || 0)).slice(0, 5);
      console.log(`  Top Rev comps:`);
      for (const c of topRev) {
        console.log(`    ${c.ticker} (${c.name}, ${c.region}): rev=${c.annualRevenue?.toExponential(3)}, capex=${c.capex?.toExponential(3)}, p=${c.stockPrice}`);
      }
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
