import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log("Starting full 520-week sweep...");
let state = createInitialGameState();
let success = true;

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w % 52 === 0 || w === 1 || w === 10) {
      console.log(`\n=== Year ${Math.floor(w / 52)} (Week ${w}) ===`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`  ${rid}: GDP=$${(reg.derivedNominalGdpUSD / 1e12).toFixed(2)}T, gdpGrowth=${(reg.gdpGrowth * 100).toFixed(2)}%, unemp=${(reg.unemploymentRate * 100).toFixed(2)}%, inf=${(reg.inflation * 100).toFixed(2)}%, rate=${(reg.policyRate * 100).toFixed(2)}%`);
      }
      const wti = state.commodities.find(c => c.symbol === 'WTI');
      const brent = state.commodities.find(c => c.symbol === 'BRENT');
      const gold = state.commodities.find(c => c.symbol === 'GOLD');
      console.log(`  Commodities: WTI=$${wti?.spotPrice}, BRENT=$${brent?.spotPrice}, GOLD=$${gold?.spotPrice}`);
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
