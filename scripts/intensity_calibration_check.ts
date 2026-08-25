import { createInitialGameState } from '../src/engine/simulation';
import { COMMODITY_CATEGORY_LINKAGE } from '../src/types';

// This initializes state, which triggers calibration
createInitialGameState();

console.log("=== COMMODITY INTENSITY CALIBRATION CHECK ===");
Object.keys(COMMODITY_CATEGORY_LINKAGE).forEach(commodityId => {
  const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId];
  console.log(`${commodityId}: subUnitId=${linkage.subUnitId}, intensityShare=${linkage.intensityShare.toFixed(6)}`);
});
