// scripts/production_signal_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
console.log('=== Production Signal Probe ===\n');

for (let i = 1; i <= 260; i++) {
  state = advanceWeeklyStep(state);
  
  if (i % 26 === 0) {
    const usa = state.regions.USA;
    const clearedPrice = (usa.categoryDemand['CorporateIndustrial'] as any)?.clearedInputPriceIndex ?? 1.0;
    
    // Sum of all USA companies' finishedGoodsInventoryUSD
    let totalInv = 0;
    let totalRev = 0;
    state.companies.filter(c => c.region === 'USA').forEach(c => {
      totalInv += c.finishedGoodsInventoryUSD ?? 0;
      totalRev += c.annualRevenue;
    });

    console.log(`--- Week ${i} ---`);
    console.log(`  Cleared Price Index: ${clearedPrice.toFixed(3)}`);
    console.log(`  Total Inventory / Revenue: ${(totalInv / totalRev * 100).toFixed(2)}%`);
  }
}
