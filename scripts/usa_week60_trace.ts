import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 65; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 58) {
      const usa = state.regions.USA as any;
      const wageIndices = Object.entries(usa.occupationPools || {}).map(([k, v]: any) => `${k}:${v.wageIndex?.toFixed(4)}`);
      console.log(`\n--- WEEK ${w} USA ---`);
      console.log(`GDP: derived=${usa.derivedNominalGdpUSD?.toExponential(3)}, lastWeek=${usa.lastWeekNominalGdpUSD?.toExponential(3)}, gdpGrowth=${usa.gdpGrowth}`);
      console.log(`Components: C=${usa.consumptionComponentUSD?.toExponential(3)}, I=${usa.investmentComponentUSD?.toExponential(3)}, G=${usa.governmentComponentUSD?.toExponential(3)}, NX=${usa.netExportsComponentUSD?.toExponential(3)}`);
      console.log(`Household Income: ${usa.estimatedHouseholdIncomeUSD?.toExponential(3)}, WageIndices: [${wageIndices.join(', ')}]`);
      console.log(`Government Spending: ${usa.governmentSpendingUSD?.toExponential(3)}, Revenue: ${usa.governmentRevenueUSD?.toExponential(3)}, DeficitPct: ${usa.fiscalDeficitPctGdp}`);
      console.log(`SmoothedGrowthRate: ${usa.smoothedWeeklyGrowthRate}`);
    }
  } catch (e: any) {
    console.log(`\nCRASH at week ${w}: ${e.message}`);
    const usa = state.regions.USA as any;
    console.log(`Last USA state before crash: derivedGdp=${usa.derivedNominalGdpUSD?.toExponential(3)}, lastWeek=${usa.lastWeekNominalGdpUSD?.toExponential(3)}`);
    break;
  }
}
