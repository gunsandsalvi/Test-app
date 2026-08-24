import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { GameState } from '../src/types';

console.log('=== Starting Fiscal-Monetary Linkage Probe ===\n');

let state = createInitialGameState();

let totalMonetizedUSD = 0;
let maxMonetizedWeeklyUSD = 0;
let qeMonetizationCount = 0;
let qtCount = 0;

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);

  const usa = state.regions.USA;
  const stance = usa.balanceSheetStance ?? 0;
  const maturedTranches = (usa.govDebtTranches || []).filter(t => t.maturityWeek <= w);
  const maturedPrincipalUSD = maturedTranches.reduce((s, t) => s + t.principalUSD, 0);
  const weeklyDeficit = Math.max(0, usa.governmentSpendingUSD - usa.governmentRevenueUSD) + maturedPrincipalUSD;
  const monetizationShare = Math.max(0, Math.min(0.4, stance * 0.5));
  const monetizedAmount = weeklyDeficit * monetizationShare;

  totalMonetizedUSD += monetizedAmount;
  if (monetizedAmount > maxMonetizedWeeklyUSD) maxMonetizedWeeklyUSD = monetizedAmount;
  if (stance > 0.05 && monetizedAmount > 0) qeMonetizationCount++;
  if (stance < 0) {
    qtCount++;
    if (monetizedAmount > 0.01) {
      console.error(`ERROR: Monetization > 0 during QT at week ${w}! Stance=${stance}, Monetized=${monetizedAmount}`);
    }
  }

  if (w === 1 || w === 52 || w === 104 || w === 260 || w === 520) {
    const banking = usa.bankingSector;
    console.log(`Week ${w} (USA):`);
    console.log(`  Stance=${stance.toFixed(4)}, Deficit=$${(weeklyDeficit / 1e9).toFixed(2)}B, MonetizedWeekly=$${(monetizedAmount / 1e9).toFixed(3)}B`);
    console.log(`  Reserves=$${(banking.centralBankReservesUSD / 1e9).toFixed(1)}B, Deposits=$${(banking.depositsUSD / 1e9).toFixed(1)}B, M2=$${(banking.moneySupplyM2USD / 1e9).toFixed(1)}B`);
  }
}

console.log('\n=== Fiscal-Monetary Linkage Summary (520 Weeks) ===');
console.log(`Total cumulative debt monetized: $${(totalMonetizedUSD / 1e9).toFixed(2)}B`);
console.log(`Peak single-week monetization: $${(maxMonetizedWeeklyUSD / 1e9).toFixed(3)}B`);
console.log(`QE Monetization weeks: ${qeMonetizationCount}`);
console.log(`QT weeks with zero monetization: ${qtCount}`);

// Integrity checks
let errors = 0;
(['USA', 'EUR', 'UK', 'JPN'] as const).forEach(r => {
  const reg = state.regions[r];
  if (isNaN(reg.bankingSector.centralBankReservesUSD)) {
    console.error(`ERROR: Region ${r} centralBankReservesUSD is NaN`);
    errors++;
  }
  if (isNaN(reg.bankingSector.moneySupplyM2USD)) {
    console.error(`ERROR: Region ${r} moneySupplyM2USD is NaN`);
    errors++;
  }
});

if (errors === 0) {
  console.log('\nPROBE PASSED — Fiscal-monetary linkage successfully verified.');
  process.exit(0);
} else {
  console.error(`\nPROBE FAILED with ${errors} error(s).`);
  process.exit(1);
}
