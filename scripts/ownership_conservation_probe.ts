// scripts/ownership_conservation_probe.ts
import { createInitialGameState, advanceWeeklyStep, computeOwnershipConservation } from '../src/engine/simulation';
import { RegionId } from '../src/types';

const state = createInitialGameState();
const conservation = computeOwnershipConservation(state);

console.log('=== Balance-Sheet Ownership Conservation Check (Week 1) ===');
let allValid = true;

conservation.forEach(row => {
  const isValid = row.householdShareImplied > 0 && row.householdShareImplied < 1 && row.totalShareAccounted > 0 && row.totalShareAccounted < 1;
  if (!isValid) allValid = false;
  console.log(
    `[${row.region}] ${row.assetClass.padEnd(18)}: Accounted=${(row.totalShareAccounted * 100).toFixed(2)}%, Implied Household=${(row.householdShareImplied * 100).toFixed(2)}% | ${isValid ? 'PASS' : 'FAIL'}`
  );
});

console.log('\n=== Institutional Companies Tagging Check ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(rid => {
  const regionCompanies = state.companies.filter(c => c.region === rid);
  const insurers = regionCompanies.filter(c => c.institutionalRole === 'INSURER');
  const assetManagers = regionCompanies.filter(c => c.institutionalRole === 'ASSET_MANAGER');
  
  console.log(`[${rid}] Insurers: ${insurers.map(c => `${c.ticker} (${c.name}, share=${c.institutionalMarketShare})`).join(', ')}`);
  console.log(`[${rid}] Asset Managers: ${assetManagers.map(c => `${c.ticker} (${c.name}, share=${c.institutionalMarketShare})`).join(', ')}`);

  if (insurers.length !== 1 || insurers[0].institutionalMarketShare !== 0.55) {
    console.error(`FAIL: ${rid} insurer count or share mismatch`);
    allValid = false;
  }
  if (assetManagers.length !== 1 || assetManagers[0].institutionalMarketShare !== 0.45) {
    console.error(`FAIL: ${rid} asset manager count or share mismatch`);
    allValid = false;
  }
});

console.log('\n=== Institutional Sector Dollar Holdings (Week 1) ===');
(['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach(rid => {
  const reg = state.regions[rid];
  const inst = reg.institutionalSector;
  const totalAssets = inst.equityHoldingsUSD + inst.corpBondHoldingsUSD + inst.sovBondHoldingsUSD + inst.cashUSD;
  const leverage = totalAssets / inst.sectorEquityUSD;
  console.log(`[${rid}] Assets: Total=$${(totalAssets / 1e9).toFixed(1)}B (Eq=$${(inst.equityHoldingsUSD / 1e9).toFixed(1)}B, Corp=$${(inst.corpBondHoldingsUSD / 1e9).toFixed(1)}B, Sov=$${(inst.sovBondHoldingsUSD / 1e9).toFixed(1)}B, Cash=$${(inst.cashUSD / 1e9).toFixed(1)}B) | Sector Equity=$${(inst.sectorEquityUSD / 1e9).toFixed(1)}B | Implied Assets/Equity=${leverage.toFixed(1)}x`);
});

console.log('\n=== Running 520-week Simulation Stability Test ===');
let simState = state;
for (let w = 1; w <= 520; w++) {
  simState = advanceWeeklyStep(simState);
}
console.log(`Completed 520 weeks. Current week: ${simState.currentWeek}. isGameOver: ${simState.isGameOver}`);

if (allValid && !simState.isGameOver) {
  console.log('\n>>> ALL OWNERSHIP CONSERVATION TESTS PASSED <<<');
} else {
  console.error('\n>>> TEST FAILED <<<');
  process.exit(1);
}
