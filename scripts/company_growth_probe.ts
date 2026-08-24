import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

const state0 = createInitialGameState();
let state = state0;

console.log('Initial revenues:');
const tickers = ['MRDN', 'CRWN', 'HRTG', 'ANLT', 'LMBR', 'THMS'];
tickers.forEach(t => {
  const c = state.companies.find(comp => comp.ticker === t);
  if (c) console.log(`${t}: sector=${c.sector}, region=${c.region}, rev=${c.annualRevenue}, baseRev=${c.baselineAnnualRevenue}`);
});

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w % 52 === 0) {
    console.log(`\nWeek ${w}:`);
    tickers.forEach(t => {
      const c = state.companies.find(comp => comp.ticker === t);
      if (c) {
        const lines = (c.productLines || []).map(l => `${l.category}:${l.categoryMarketShare.toFixed(2)}`).join(', ');
        console.log(`  ${t}: rev=${c.annualRevenue.toFixed(1)}, baseRev=${c.baselineAnnualRevenue?.toFixed(1)}, lines=[${lines}]`);
      }
    });
  }
}
