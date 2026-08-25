import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log("Starting full 520-week sweep for PART ASA-ATD...");
let state = createInitialGameState();
let success = true;
const checkpoints = [1, 10, 52, 100, 150, 200, 250, 300, 350, 400, 450, 500, 520];

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (checkpoints.includes(w)) {
      console.log(`\n=== Year ${(w / 52).toFixed(2)} (Week ${w}) ===`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        const totalPrivEmp = (reg.privateSectorSegments || []).reduce((s: number, seg: any) => s + seg.employment, 0);
        console.log(`  ${rid}: GDP=$${(reg.derivedNominalGdpUSD / 1e12).toFixed(2)}T, gdpGrowth=${(reg.gdpGrowth * 100).toFixed(2)}%, unemp=${(reg.unemploymentRate * 100).toFixed(2)}%, inf=${(reg.inflation * 100).toFixed(2)}%, rate=${(reg.policyRate * 100).toFixed(2)}%, govEmp=${reg.governmentEmployment.toLocaleString()}, privEmp=${totalPrivEmp.toLocaleString()}`);
      }
      const wti = state.commodities.find(c => c.symbol === 'WTI');
      const brent = state.commodities.find(c => c.symbol === 'BRENT');
      const gold = state.commodities.find(c => c.symbol === 'GOLD');
      const usaIa = (state.regions.USA as any).categoryDemand?.industrial_automation;
      const badCompanies = state.companies.filter(c => 
        !Number.isFinite(c.annualRevenue) || 
        !Number.isFinite(c.ebitda) || 
        isNaN(c.stockPrice) ||
        !Number.isFinite(c.leverage) ||
        !Number.isFinite(c.oasSpreadBps)
      ).length;
      console.log(`  Commodities: WTI=$${wti?.spotPrice}, BRENT=$${brent?.spotPrice}, GOLD=$${gold?.spotPrice} | badCompanies=${badCompanies}`);
      console.log(`  USA IndAuto Demand: Level=$${((usaIa?.demandLevelUSD ?? 0) / 1e9).toFixed(2)}B, Growth=${((usaIa?.demandGrowthAnnual ?? 0) * 100).toFixed(2)}%, UnitPrice=$${usaIa?.unitPriceUSD ?? 80000}`);
    }
  } catch (e: any) {
    console.error(`FAILED at week ${w}:`, e.message);
    success = false;
    break;
  }
}

if (success) {
  console.log("\n==========================================");
  console.log("FULL 520-WEEK SWEEP COMPLETED SUCCESSFULLY!");
  console.log("==========================================");
}
