import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 265; w++) {
  const prevGdp = (state.regions.USA as any).derivedNominalGdpUSD;
  state = advanceWeeklyStep(state);
  if (w >= 248 && w <= 262) {
    const reg = state.regions.USA as any;
    const c = reg.consumptionComponentUSD;
    const i = reg.investmentComponentUSD;
    const g = reg.governmentSpendingUSD * 52;
    const nx = reg.tradeBalance;
    const gdp = reg.derivedNominalGdpUSD;
    const rawRate = (gdp / prevGdp - 1) - (reg.inflation / 52);
    const smoothed = reg.smoothedWeeklyGrowthRate;
    const gdpGrowth = reg.gdpGrowth;
    console.log(`W${w}: GDP=${gdp.toExponential(4)} (dGDP=${(gdp - prevGdp).toExponential(3)}) | C=${c.toExponential(4)} I=${i.toExponential(4)} G=${g.toExponential(4)} NX=${nx.toExponential(4)} | raw=${rawRate.toFixed(6)} smoothed=${smoothed?.toFixed(6)} gdpGrowth=${(gdpGrowth*100).toFixed(2)}% inf=${(reg.inflation*100).toFixed(2)}%`);
  }
}
