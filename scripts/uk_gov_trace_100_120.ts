import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 120; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w >= 95) {
      const uk = state.regions.UK as any;
      console.log(`Week ${w} UK: govSpending=${uk.governmentSpendingUSD?.toExponential(3)}, govRev=${uk.governmentRevenueUSD?.toExponential(3)}, deficitPct=${uk.fiscalDeficitPctGdp}, fiscalStance=${uk.fiscalStanceScore}, gdpGrowth=${uk.gdpGrowth}, derivedGdp=${uk.derivedNominalGdpUSD?.toExponential(3)}, lastWeekGdp=${uk.lastWeekNominalGdpUSD?.toExponential(3)}, debt=${uk.totalGovDebtUSD?.toExponential(3)}`);
    }
  } catch (e: any) {
    console.log(`Crash at week ${w}: ${e.message}`);
    const uk = state.regions.UK as any;
    console.log(`UK state at crash: govSpending=${uk.governmentSpendingUSD}, govRev=${uk.governmentRevenueUSD}, deficitPct=${uk.fiscalDeficitPctGdp}, fiscalStance=${uk.fiscalStanceScore}, derivedGdp=${uk.derivedNominalGdpUSD}, lastWeekGdp=${uk.lastWeekNominalGdpUSD}`);
    break;
  }
}
