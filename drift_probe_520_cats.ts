import { createInitialGameState, advanceWeeklyStep } from './src/engine/simulation';
let state = createInitialGameState();
for (let i = 0; i < 520; i++) {
    state = advanceWeeklyStep(state);
    if (i % 52 == 0 || i == 519) {
        let r = state.regions['USA'];
        let cat = r.categoryDemand['StapleHousehold'];
        let bs = r.bankingSector;
        console.log(`W${i}: StapleHousehold Demand Growth=${cat.demandGrowthAnnual.toFixed(4)} Level=${cat.demandLevelUSD.toExponential(2)} BankCap=${bs.bankCapitalRatio.toFixed(4)} NIM=${bs.netInterestMarginPct.toFixed(4)} CCI=${bs.creditConditionsIndex.toFixed(4)} unemp=${r.unemploymentRate.toFixed(4)} corpIndDem=${r.categoryDemand['CorporateIndustrial'].demandGrowthAnnual.toFixed(4)}`);
    }
}
