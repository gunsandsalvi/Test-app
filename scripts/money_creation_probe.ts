import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { RegionId } from '../src/types';

let state = createInitialGameState();

console.log('=== INITIAL BANKING & MONEY SUPPLY (Week 0) ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const b = r.bankingSector;
  console.log(`[${id}]`);
  console.log(`  Reserves: $${(b.centralBankReservesUSD / 1e12).toFixed(2)}T | Deposits: $${(b.depositsUSD / 1e12).toFixed(2)}T | M2: $${(b.moneySupplyM2USD / 1e12).toFixed(2)}T`);
  console.log(`  Loans (Bus): $${(b.businessLoanBookUSD / 1e12).toFixed(2)}T | Loans (Cons): $${(b.consumerLoanBookUSD / 1e12).toFixed(2)}T`);
  console.log(`  Capital Ratio: ${(b.bankCapitalRatio * 100).toFixed(2)}% | NIM: ${(b.netInterestMarginPct * 100).toFixed(2)}% | CCI: ${b.creditConditionsIndex}`);
});

const m2History: Record<RegionId, number[]> = { USA: [], EUR: [], UK: [], JPN: [] };
const cpiHistory: Record<RegionId, number[]> = { USA: [], EUR: [], UK: [], JPN: [] };

for (let w = 1; w <= 104; w++) {
  state = advanceWeeklyStep(state);
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
    const r = state.regions[id];
    m2History[id].push(r.bankingSector.moneySupplyM2USD);
    cpiHistory[id].push(r.inflation);
  });
}

console.log('\n=== BANKING & MONEY SUPPLY AT WEEK 104 (Year 2) ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const b = r.bankingSector;
  const initM2 = m2History[id][0];
  const finalM2 = m2History[id][103];
  const m2Growth2Yr = ((finalM2 / initM2) - 1) * 100;
  console.log(`[${id}]`);
  console.log(`  Reserves: $${(b.centralBankReservesUSD / 1e12).toFixed(2)}T | Deposits: $${(b.depositsUSD / 1e12).toFixed(2)}T | M2: $${(b.moneySupplyM2USD / 1e12).toFixed(2)}T (2-Yr Growth: ${m2Growth2Yr.toFixed(2)}%)`);
  console.log(`  Loans (Bus): $${(b.businessLoanBookUSD / 1e12).toFixed(2)}T | Loans (Cons): $${(b.consumerLoanBookUSD / 1e12).toFixed(2)}T`);
  console.log(`  Inflation: ${(r.inflation * 100).toFixed(2)}% | Policy Rate: ${(r.policyRate * 100).toFixed(2)}% | GDP Growth: ${(r.gdpGrowth * 100).toFixed(2)}%`);
  console.log(`  Household Net Worth: $${(r.householdState.netWorthUSD / 1e12).toFixed(2)}T | CCI: ${r.householdState.consumerConfidence.toFixed(1)} | Real Cons Growth: ${(r.householdState.realConsumptionGrowth * 100).toFixed(2)}%`);
});
