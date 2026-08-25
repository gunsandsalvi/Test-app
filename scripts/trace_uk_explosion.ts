import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 55; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 45) {
      console.log(`\n================ WEEK ${w} UK ================`);
      const uk = state.regions.UK as any;
      console.log(`GDP: derived=${uk.derivedNominalGdpUSD?.toExponential(3)}, C=${uk.consumptionComponentUSD?.toExponential(3)}, I=${uk.investmentComponentUSD?.toExponential(3)}, G=${(uk.governmentSpendingUSD * 52)?.toExponential(3)}, NX=${(uk.tradeBalance)?.toExponential(3)}`);
      const comps = state.companies.filter(c => c.region === 'UK');
      const topCapex = [...comps].sort((a, b) => b.capex - a.capex).slice(0, 3);
      for (const c of topCapex) {
        console.log(`  Top Capex: ${c.ticker} (${c.name}) capex=${c.capex?.toExponential(3)} maint=${c.maintenanceCapex?.toExponential(3)} growth=${c.growthCapex?.toExponential(3)} rev=${c.annualRevenue?.toExponential(3)} ebitda=${c.ebitda?.toExponential(3)} comp=${(c.productLines || []).map(l => l.competitiveness).join(',')}`);
      }
      const topRev = [...comps].sort((a, b) => b.annualRevenue - a.annualRevenue).slice(0, 3);
      for (const c of topRev) {
        console.log(`  Top Rev: ${c.ticker} (${c.name}) rev=${c.annualRevenue?.toExponential(3)} capex=${c.capex?.toExponential(3)}`);
      }
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
