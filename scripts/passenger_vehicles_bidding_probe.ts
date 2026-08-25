import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log("Running passenger vehicles bidding probe (520 weeks)...");
let state = createInitialGameState();
let success = true;

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w % 52 === 0 || w === 1 || w === 10) {
      const usa = state.regions.USA as any;
      const autoState = usa.categoryDemand['passenger_vehicles'];
      const contracts = (usa.activeContracts || []).filter((c: any) => c.subUnitId === 'passenger_vehicles');
      const supFirms = state.companies.filter(c => c.region === 'USA' && (c.productLines || []).some(l => l.subUnitId === 'passenger_vehicles'));
      const totalInvUnits = supFirms.reduce((s, c) => s + (c.finishedGoodsUnits ?? 0), 0);
      console.log(`W${w}: Auto Price=$${autoState?.unitPriceUSD} (PriceIndex=${autoState?.clearedInputPriceIndex}) | SuppliedUnits=${autoState?.totalUnitsSuppliedThisWeek?.toFixed(1)} DemandedUnits=${autoState?.totalUnitsDemandedThisWeek?.toFixed(1)} | ActiveContracts=${contracts.length} | SupFirms=${supFirms.length} TotalInvUnits=${totalInvUnits.toFixed(1)}`);
      if (contracts.length > 0 && (w === 52 || w === 260 || w === 520)) {
        console.log(`   Sample contract: ${contracts[0].supplierCompanyId} -> ${contracts[0].customerCompanyId}, qty=${contracts[0].quantityUnitsPerWeek}/wk, price=$${contracts[0].priceUSD}, remaining=${contracts[0].weeksRemaining}wks`);
      }
    }
  } catch (e: any) {
    console.error(`FAILED at week ${w}:`, e.message);
    success = false;
    break;
  }
}

if (success) {
  console.log("\nPASSENGER VEHICLES PROBE 520-WEEK RUN COMPLETED SUCCESSFULLY!");
}
