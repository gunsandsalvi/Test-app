import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 138; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 125) {
      console.log(`\n================ WEEK ${w} ================`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`  ${rid}: derivedGdp=${reg.derivedNominalGdpUSD?.toExponential(3)}, C=${reg.consumptionComponentUSD?.toExponential(3)}, I=${reg.investmentComponentUSD?.toExponential(3)}, G=${(reg.governmentSpendingUSD * 52)?.toExponential(3)}, NX=${reg.tradeBalance?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toFixed(3)}`);
      }
      const badComps = state.companies.filter(c => !isFinite(c.annualRevenue) || c.annualRevenue > 1e13 || !isFinite(c.capex) || c.capex > 1e12);
      if (badComps.length > 0) {
        console.log(`  High/bad comps (${badComps.length}):`);
        for (const bc of badComps.slice(0, 5)) {
          console.log(`    ${bc.ticker} (${bc.name}, ${bc.region}): rev=${bc.annualRevenue?.toExponential(3)}, capex=${bc.capex?.toExponential(3)}, p=${bc.stockPrice}`);
        }
      }
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    break;
  }
}
