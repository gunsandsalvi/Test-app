import { createInitialGameState } from '../src/engine/simulation/initialization';
import { advanceWeeklyStep } from '../src/engine/simulation/core';

function runInventoryFixProbe() {
  console.log('=== INVENTORY FIX PROBE (USA) ===\n');
  let state = createInitialGameState();

  const sampleWeeks = [1, 13, 26, 52, 104, 208, 364, 520];
  const targetCategories = [
    'CorporateIndustrial',
    'CorporateTech',
    'StapleHousehold',
    'StandardHousehold',
    'LuxuryHousehold',
  ];

  let maxConsecutiveCeilingPressure = 0;
  let currentConsecutiveCeilingPressure = 0;

  for (let w = 1; w <= 520; w++) {
    state = advanceWeeklyStep(state);
    const usa = state.regions.USA;

    let anyAtCeiling = false;
    targetCategories.forEach(cat => {
      const entry = usa.categoryDemand[cat as keyof typeof usa.categoryDemand];
      if ((entry?.inputCostPressure ?? 0) >= 0.499) {
        anyAtCeiling = true;
      }
    });

    if (anyAtCeiling) {
      currentConsecutiveCeilingPressure++;
      if (currentConsecutiveCeilingPressure > maxConsecutiveCeilingPressure) {
        maxConsecutiveCeilingPressure = currentConsecutiveCeilingPressure;
      }
    } else {
      currentConsecutiveCeilingPressure = 0;
    }

    if (sampleWeeks.includes(w)) {
      console.log(`--- Week ${w} (${usa.cycleRegime}) ---`);
      targetCategories.forEach(cat => {
        const entry = usa.categoryDemand[cat as keyof typeof usa.categoryDemand];
        const invBln = ((entry?.inventoryLevelUSD ?? 0) / 1e9).toFixed(2);
        const demandBln = ((entry?.demandLevelUSD ?? 0) / 1e9).toFixed(2);
        const pressurePct = (((entry?.inputCostPressure ?? 0) * 100)).toFixed(2);
        console.log(
          `  ${cat.padEnd(25)} | Demand: $${demandBln}B | Inv: $${invBln}B | InputPressure: ${pressurePct}%`
        );
      });
      console.log('');
    }
  }

  console.log(`Max consecutive weeks with any category at 0.5 ceiling: ${maxConsecutiveCeilingPressure}`);
}

runInventoryFixProbe();
