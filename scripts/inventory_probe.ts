import { createInitialGameState } from '../src/engine/simulation/initialization';
import { advanceWeeklyStep } from '../src/engine/simulation/core';
import { RegionId } from '../src/types';

function runInventoryProbe() {
  console.log('=== INVENTORY & INPUT-OUTPUT MAP PROBE (USA) ===\n');
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

    if (sampleWeeks.includes(w)) {
      const usa = state.regions.USA;
      console.log(`--- Week ${w} (${usa.cycleRegime}) ---`);
      
      targetCategories.forEach(cat => {
        const entry = usa.categoryDemand[cat as keyof typeof usa.categoryDemand];
        const invBln = ((entry?.inventoryLevelUSD ?? 0) / 1e9).toFixed(2);
        const demandBln = ((entry?.demandLevelUSD ?? 0) / 1e9).toFixed(2);
        const pressurePct = (((entry?.inputCostPressure ?? 0) * 100)).toFixed(2);
        const growthPct = (((entry?.demandGrowthAnnual ?? 0) * 100)).toFixed(2);

        console.log(
          `  ${cat.padEnd(25)} | Demand: $${demandBln}B | Inv: $${invBln}B | InputPressure: ${pressurePct}% | Growth: ${growthPct}%`
        );
      });
      console.log('');
    }
  }
}

runInventoryProbe();
