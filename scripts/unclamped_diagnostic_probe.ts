// scripts/unclamped_diagnostic_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
const regionIds = ['USA', 'EUR', 'UK', 'JPN'] as const;
let firstDivergenceWeek: Record<string, number | null> = {};
regionIds.forEach(r => { firstDivergenceWeek[r] = null; });

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  regionIds.forEach(r => {
    const reg = state.regions[r];
    const flags: string[] = [];
    if (Math.abs(reg.gdpGrowth) > 0.15) flags.push(`gdpGrowth=${(reg.gdpGrowth*100).toFixed(1)}%`);
    if (reg.unemploymentRate > 0.30 || reg.unemploymentRate < 0.01) flags.push(`unemployment=${(reg.unemploymentRate*100).toFixed(1)}%`);
    if (Math.abs(reg.inflation) > 0.40) flags.push(`inflation=${(reg.inflation*100).toFixed(1)}%`);
    const maxShare = Math.max(0, ...state.companies.filter(c=>c.region===r).flatMap(c => (c.productLines||[]).map(l=>l.categoryMarketShare)));
    if (maxShare > 0.90) flags.push(`maxCategoryShare=${(maxShare*100).toFixed(1)}%`);
    if (flags.length > 0 && firstDivergenceWeek[r] === null) {
      firstDivergenceWeek[r] = w;
      console.log(`[${r}] FIRST DIVERGENCE at week ${w}: ${flags.join(', ')}`);
    }
  });
  if (isNaN(state.regions.USA.gdpGrowth) || isNaN(state.regions.USA.inflation)) {
    console.log(`NaN encountered at week ${w} — stopping early.`);
    break;
  }
  if ([13,52,104,156,208,260,312,364,416,468,520].includes(w)) {
    console.log(`--- Week ${w} ---`);
    regionIds.forEach(r => {
      const reg = state.regions[r];
      console.log(`  [${r}] gdp=${(reg.gdpGrowth*100).toFixed(2)}% unemp=${(reg.unemploymentRate*100).toFixed(2)}% inflation=${(reg.inflation*100).toFixed(2)}% regime=${reg.cycleRegime} policyRate=${(reg.policyRate*100).toFixed(2)}%`);
    });
    const ci = state.regions.USA.categoryDemand as any;
    console.log(`  [USA] CorporateIndustrial clearedInputPriceIndex=${ci.CorporateIndustrial?.clearedInputPriceIndex?.toFixed(3)}`);
    const maxShareByCat: Record<string, number> = {};
    state.companies.filter(c=>c.region==='USA').forEach(c => (c.productLines||[]).forEach(l => { maxShareByCat[l.category] = Math.max(maxShareByCat[l.category]||0, l.categoryMarketShare); }));
    console.log(`  [USA] max category shares: ${JSON.stringify(Object.fromEntries(Object.entries(maxShareByCat).map(([k,v])=>[k,(v*100).toFixed(1)+'%'])))}`);
  }
}
console.log('\n=== First divergence week per region ===');
console.log(JSON.stringify(firstDivergenceWeek, null, 2));
