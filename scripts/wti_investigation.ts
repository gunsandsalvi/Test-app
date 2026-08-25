import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { COMMODITY_CATEGORY_LINKAGE } from '../src/types';

let state = createInitialGameState();
console.log('COMMODITY_CATEGORY_LINKAGE for WTI:', COMMODITY_CATEGORY_LINKAGE['WTI']);

for (let w = 1; w <= 30; w++) {
  state = advanceWeeklyStep(state);
  const wti = state.commodities.find(c => c.id === 'WTI');
  const producers = state.companies.filter(c => c.producedCommodityId === 'WTI' && !c.isDefaulted);
  const totalRev = producers.reduce((s, c) => s + c.annualRevenue, 0);
  const linkage = COMMODITY_CATEGORY_LINKAGE['WTI'];
  const catDemandTotal = (['USA','EUR','UK','JPN'] as any[]).reduce((s, r) => s + (state.regions[r].categoryDemand as any)[linkage.subUnitId].demandLevelUSD, 0);
  console.log(`Week ${w}: WTI spot=${wti?.spotPrice} | totalProducerRev=${totalRev.toExponential(3)} | catDemandTotal=${catDemandTotal.toExponential(3)} | intensityShare=${linkage.intensityShare.toFixed(4)} | supplyUnits=${wti?.weeklySupplyUnits.toExponential(3)} | demandUnits=${wti?.weeklyDemandUnits.toExponential(3)}`);
}
