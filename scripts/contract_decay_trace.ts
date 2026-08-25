import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';

let state = createInitialGameState();
const report: any = [];

for (let w = 1; w <= 450; w++) {
  state = advanceWeeklyStep(state);
  
  const reg = state.regions['USA'];
  const supplierCount = state.companies.filter(c => c.region === 'USA' && !c.isDefaulted && (c.productLines || []).some(l => l.subUnitId === 'industrial_automation')).length;
  
  const sampleSupplier = state.companies.find(c => c.region === 'USA' && !c.isDefaulted && (c.productLines || []).some(l => l.subUnitId === 'industrial_automation'));
  
  if (w % 10 === 0 && sampleSupplier) {
    const currentUnitPrice = reg.categoryDemand['industrial_automation']?.unitPriceUSD ?? 80000;
    const currentInvUSD = sampleSupplier.finishedGoodsInventoryUSD ?? 0;
    const warehouseCapacityUSD = sampleSupplier.annualRevenue * 0.15;
    const productionThrottle = currentInvUSD > warehouseCapacityUSD ? 0.3 : 1.0;
    const targetProductionUSD = (sampleSupplier.annualRevenue * 0.02 / 52) * ((sampleSupplier.productLines || []).find(l => l.subUnitId === 'industrial_automation')?.revenueShare ?? 1.0) * productionThrottle;
    const targetProductionUnits = targetProductionUSD / currentUnitPrice;
    const currentUnits = sampleSupplier.finishedGoodsUnits ?? (currentInvUSD / currentUnitPrice);
    
    report.push({
      week: w,
      supplierCount,
      sampleSupplier: {
        ticker: sampleSupplier.ticker,
        annualRevenue: sampleSupplier.annualRevenue,
        currentInvUSD,
        warehouseCapacityUSD,
        productionThrottle,
        targetProductionUnits,
        currentUnits,
        activeContracts: (reg.activeContracts || []).filter(c => c.supplierCompanyId === sampleSupplier.ticker).length
      }
    });
  }
}

fs.writeFileSync('scripts/contract_decay_trace_output.json', JSON.stringify(report, null, 2));
console.log('Trace complete.');
