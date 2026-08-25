import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 66; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 62) {
      console.log(`\n================ WEEK ${w} ================`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`${rid}: derivedNominal=${reg.derivedNominalGdpUSD?.toExponential(3)}, lastWeekNominal=${reg.lastWeekNominalGdpUSD?.toExponential(3)}, smoothedRate=${reg.smoothedWeeklyGrowthRate?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toExponential(3)}, C=${reg.consumptionComponentUSD?.toExponential(3)}, I=${reg.investmentComponentUSD?.toExponential(3)}, G=${(reg.governmentSpendingUSD * 52)?.toExponential(3)}, NX=${(reg.netExportsUSD * 52)?.toExponential(3)}`);
      }
    }
  } catch (e: any) {
    console.log(`\nCRASH at week ${w}: ${e.message}`);
    for (const [rid, r] of Object.entries(state.regions)) {
      const reg = r as any;
      console.log(`${rid}: derivedNominal=${reg.derivedNominalGdpUSD?.toExponential(3)}, lastWeekNominal=${reg.lastWeekNominalGdpUSD?.toExponential(3)}, smoothedRate=${reg.smoothedWeeklyGrowthRate?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toExponential(3)}, C=${reg.consumptionComponentUSD?.toExponential(3)}, I=${reg.investmentComponentUSD?.toExponential(3)}`);
    }
    break;
  }
}
