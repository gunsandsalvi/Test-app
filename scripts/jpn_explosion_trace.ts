import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 10; w++) {
  try {
    state = advanceWeeklyStep(state);
    const jpn = state.regions.JPN as any;
    console.log(`\n--- WEEK ${w} JPN ---`);
    console.log(`GDP: derived=${jpn.derivedNominalGdpUSD?.toExponential(3)}, lastWeek=${jpn.lastWeekNominalGdpUSD?.toExponential(3)}, gdpGrowth=${jpn.gdpGrowth}`);
    console.log(`Components: C=${jpn.consumptionComponentUSD?.toExponential(3)}, I=${jpn.investmentComponentUSD?.toExponential(3)}, G=${jpn.governmentComponentUSD?.toExponential(3)}, NX=${jpn.netExportsComponentUSD?.toExponential(3)}`);
    console.log(`Household: income=${jpn.estimatedHouseholdIncomeUSD?.toExponential(3)}, wealth=${jpn.householdWealthUSD?.toExponential(3)}, rate=${jpn.householdSavingsRate}`);
    console.log(`Government: spending=${jpn.governmentSpendingUSD?.toExponential(3)}, revenue=${jpn.governmentRevenueUSD?.toExponential(3)}, debt=${jpn.totalGovDebtUSD?.toExponential(3)}`);
    console.log(`Rates: policyRate=${jpn.policyRate}, inflation=${jpn.inflation}, zeroRates=2Y:${jpn.zeroRates?.tenor2Y}, 10Y:${jpn.zeroRates?.tenor10Y}, 30Y:${jpn.zeroRates?.tenor30Y}`);
    console.log(`Gov Tranches count: ${jpn.govDebtTranches?.length}`);
    const matured = (jpn.govDebtTranches || []).filter((t: any) => t.maturityWeek <= w + 1);
    console.log(`Matured tranches for next week: count=${matured.length}, principal=${matured.reduce((s: number, t: any) => s + t.principalUSD, 0)}`);
  } catch (e: any) {
    console.log(`\nCRASH at week ${w}: ${e.message}`);
    console.log(e.stack);
    break;
  }
}
