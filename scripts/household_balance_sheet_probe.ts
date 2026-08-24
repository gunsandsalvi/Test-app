import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { RegionId } from '../src/types';

let state = createInitialGameState();

console.log('=== INITIAL HOUSEHOLD BALANCE SHEET ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const hs = r.householdState;
  const netWorth = hs.netWorthUSD || (hs.depositsUSD + hs.equityHoldingsUSD - (hs.mortgageDebtUSD + hs.creditCardDebtUSD + hs.otherConsumerLoanDebtUSD));
  console.log(`Region: ${id}`);
  console.log(`  Income: $${(r.estimatedHouseholdIncomeUSD / 1e12).toFixed(2)}T`);
  console.log(`  Deposits: $${(hs.depositsUSD / 1e12).toFixed(2)}T | Equities: $${(hs.equityHoldingsUSD / 1e12).toFixed(2)}T`);
  console.log(`  Mortgages: $${(hs.mortgageDebtUSD / 1e12).toFixed(2)}T | CC: $${(hs.creditCardDebtUSD / 1e12).toFixed(2)}T | Other: $${(hs.otherConsumerLoanDebtUSD / 1e12).toFixed(2)}T`);
  console.log(`  Net Worth: $${(netWorth / 1e12).toFixed(2)}T | NW/Income: ${(netWorth / r.estimatedHouseholdIncomeUSD).toFixed(2)}x | D/I: ${(hs.householdDebtToIncomeRatio).toFixed(2)}x`);
});

for (let w = 1; w <= 104; w++) {
  state = advanceWeeklyStep(state);
}

console.log('\n=== HOUSEHOLD BALANCE SHEET AT WEEK 104 (Year 2) ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(id => {
  const r = state.regions[id];
  const hs = r.householdState;
  console.log(`Region: ${id}`);
  console.log(`  Income: $${(r.estimatedHouseholdIncomeUSD / 1e12).toFixed(2)}T`);
  console.log(`  Deposits: $${(hs.depositsUSD / 1e12).toFixed(2)}T | Equities: $${(hs.equityHoldingsUSD / 1e12).toFixed(2)}T`);
  console.log(`  Mortgages: $${(hs.mortgageDebtUSD / 1e12).toFixed(2)}T | CC: $${(hs.creditCardDebtUSD / 1e12).toFixed(2)}T | Other: $${(hs.otherConsumerLoanDebtUSD / 1e12).toFixed(2)}T`);
  console.log(`  Net Worth: $${(hs.netWorthUSD / 1e12).toFixed(2)}T | NW/Income: ${(hs.netWorthUSD / r.estimatedHouseholdIncomeUSD).toFixed(2)}x | D/I: ${(hs.householdDebtToIncomeRatio).toFixed(2)}x | CCI: ${hs.consumerConfidence.toFixed(1)} | Real Spend Growth: ${(hs.realConsumptionGrowth * 100).toFixed(2)}%`);
});
