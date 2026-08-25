import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w % 52 === 0 || w === 150 || w === 250) {
    const wti = state.commodities.find(c => c.symbol === 'WTI') as any;
    const wtiProducers = state.companies.filter(c => (c as any).producedCommodityId === 'WTI' || (c as any).producedCommodityId === wti?.id);
    const totalRev = wtiProducers.reduce((s, c) => s + c.annualRevenue, 0);
    const totalHeadcount = wtiProducers.reduce((s, c) => s + c.employeeCount, 0);
    console.log(`W${w}: WTI spotPrice=$${wti.spotPrice} (baseline=$${wti.historicalPrices?.[0]}) | supply=${wti.supplyUnits?.toExponential(3)} demand=${wti.demandUnits?.toExponential(3)} ratio=${(wti.supplyUnits / (wti.demandUnits || 1)).toFixed(2)} | producers=${wtiProducers.length} totalRev=${(totalRev/1e9).toFixed(2)}B totalEmp=${totalHeadcount}`);
  }
}
