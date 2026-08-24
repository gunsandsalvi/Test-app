import { createInitialGameState } from '../src/engine/simulation/initialization';
import { advanceWeeklyStep } from '../src/engine/simulation/core';

function runBiddingProbe() {
  console.log('=== BIDDING & PRICE DISCOVERY PROBE (USA) ===\n');
  let state = createInitialGameState();

  const sampleWeeks = [1, 13, 26, 52, 104, 208, 364, 520];
  const targetCategories = [
    'CorporateIndustrial',
    'CorporateTech',
    'StapleHousehold',
    'StandardHousehold',
    'LuxuryHousehold',
  ];

  for (let w = 1; w <= 520; w++) {
    state = advanceWeeklyStep(state);
    const usa = state.regions.USA;

    if (sampleWeeks.includes(w)) {
      console.log(`--- Week ${w} (${usa.cycleRegime}) ---`);
      console.log('Category Demands & Clearing:');
      targetCategories.forEach(cat => {
        const entry = usa.categoryDemand[cat as keyof typeof usa.categoryDemand];
        const invBln = ((entry?.inventoryLevelUSD ?? 0) / 1e9).toFixed(2);
        const demandBln = ((entry?.demandLevelUSD ?? 0) / 1e9).toFixed(2);
        const priceIdx = (entry?.clearedInputPriceIndex ?? 1.0).toFixed(4);
        const pressurePct = (((entry?.inputCostPressure ?? 0) * 100)).toFixed(2);
        console.log(
          `  ${cat.padEnd(23)} | Dem: $${demandBln}B | Inv: $${invBln}B | ClearedPriceIdx: ${priceIdx} | InputPressure: ${pressurePct}%`
        );
      });

      console.log('Sample Company Input Supply Constraints:');
      const usaCompanies = state.companies.filter(c => c.region === 'USA').slice(0, 8);
      usaCompanies.forEach(c => {
        const prodLines = (c.productLines || []).map(p => `${p.category}(${(p.revenueShare*100).toFixed(0)}%)`).join(', ');
        console.log(
          `  ${c.ticker.padEnd(6)} (${c.sector.padEnd(12)}) | Constraint: ${(c.inputSupplyConstraintFactor ?? 1).toFixed(3)} | Margin: ${(c.ebitda / Math.max(1, c.annualRevenue) * 100).toFixed(1)}% | Rev: $${(c.annualRevenue / 1e6).toFixed(1)}M | Lines: ${prodLines}`
        );
      });
      console.log('');
    }
  }

  console.log('Bidding Probe Complete.');
}

runBiddingProbe();
