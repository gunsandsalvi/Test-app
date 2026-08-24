import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { RegionId } from '../src/types';

let state = createInitialGameState();

console.log('=== INITIAL GOV DEBT TRANCHES ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const tranches = r.govDebtTranches || [];
  const totalDebt = tranches.reduce((s, t) => s + t.principalUSD, 0);
  console.log(`Region: ${id}`);
  console.log(`  Tranches count: ${tranches.length} | Total: $${(totalDebt / 1e12).toFixed(2)}T | Top-Down Debt/GDP: ${(r.debtToGdpPct * 100).toFixed(1)}%`);
  tranches.forEach(t => {
    console.log(`    ${t.id}: $${(t.principalUSD / 1e12).toFixed(2)}T, Coupon: ${(t.couponRate * 100).toFixed(2)}%, Mat: W${t.maturityWeek} (${t.tenorAtIssuanceYears}Y)`);
  });
});

for (let w = 1; w <= 104; w++) {
  state = advanceWeeklyStep(state);
}

console.log('\n=== GOV DEBT TRANCHES AT WEEK 104 (Year 2) ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const tranches = r.govDebtTranches || [];
  const totalDebt = tranches.reduce((s, t) => s + t.principalUSD, 0);
  console.log(`Region: ${id}`);
  console.log(`  Tranches count: ${tranches.length} | Total: $${(totalDebt / 1e12).toFixed(2)}T`);
  console.log(`  Derived GDP: $${(r.derivedNominalGdpUSD / 1e12).toFixed(2)}T | Bottom-Up Debt/GDP: ${(r.debtToGdpPctBottomUp * 100).toFixed(1)}% | Top-Down Debt/GDP: ${(r.debtToGdpPct * 100).toFixed(1)}%`);
  const byTenor: Record<number, number> = {};
  tranches.forEach(t => {
    byTenor[t.tenorAtIssuanceYears] = (byTenor[t.tenorAtIssuanceYears] || 0) + t.principalUSD;
  });
  console.log(`  By Tenor: 2Y: $${((byTenor[2] || 0)/1e12).toFixed(2)}T, 5Y: $${((byTenor[5] || 0)/1e12).toFixed(2)}T, 10Y: $${((byTenor[10] || 0)/1e12).toFixed(2)}T, 30Y: $${((byTenor[30] || 0)/1e12).toFixed(2)}T`);
});
