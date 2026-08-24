import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { RegionId } from '../src/types';

console.log('=== RUNNING 520-WEEK MONEY CREATION EXPANSION PROBE ===\n');

let state = createInitialGameState();

const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

const constraintCounts: Record<RegionId, { reserves: number; capital: number; deposits: number; none: number }> = {
  USA: { reserves: 0, capital: 0, deposits: 0, none: 0 },
  EUR: { reserves: 0, capital: 0, deposits: 0, none: 0 },
  UK: { reserves: 0, capital: 0, deposits: 0, none: 0 },
  JPN: { reserves: 0, capital: 0, deposits: 0, none: 0 },
};

let emergencyEventsCount = 0;
const emergencyLog: { week: number; region: string; reservesBefore: number; reservesAfter: number }[] = [];

let minVelocity = 999;
let maxVelocity = -999;
let minSpillover = 999;
let maxSpillover = -999;

for (let week = 1; week <= 520; week++) {
  const prevState = state;
  state = advanceWeeklyStep(state);

  for (const r of regionIds) {
    const prevReg = prevState.regions[r];
    const newReg = state.regions[r];
    const prevBk = prevReg.bankingSector;
    const newBk = newReg.bankingSector;

    // Check which constraint was binding
    const reserveRequirementRatio = 0.10;
    const maxLendingRes = (newBk.centralBankReservesUSD ?? 1e12) / reserveRequirementRatio;
    const curLoans = prevBk.businessLoanBookUSD + prevBk.consumerLoanBookUSD;
    const resHead = Math.max(0, maxLendingRes - curLoans);

    const minCapitalRatio = 0.08;
    const capHead = prevBk.bankCapitalRatio > minCapitalRatio
      ? (prevBk.bankEquityUSD / minCapitalRatio - curLoans * 1.0)
      : 0;

    const depRatio = 0.85;
    const depHead = Math.max(0, prevBk.depositsUSD * depRatio - curLoans);

    const tightest = Math.min(resHead, capHead, depHead);
    if (tightest === capHead && capHead < resHead && capHead < depHead) {
      constraintCounts[r].capital++;
    } else if (tightest === resHead && resHead < capHead && resHead < depHead) {
      constraintCounts[r].reserves++;
    } else if (tightest === depHead) {
      constraintCounts[r].deposits++;
    } else {
      constraintCounts[r].none++;
    }

    // Check emergency reserve injection
    const reserveInjectionRate = prevReg.balanceSheetStance * 0.002;
    const expectedNormalReserves = Math.max(0, (prevBk.centralBankReservesUSD ?? 1e12) * (1 + reserveInjectionRate));
    const actualReserves = newBk.centralBankReservesUSD;
    const emergencyInjected = actualReserves > expectedNormalReserves * 1.005;
    if (emergencyInjected) {
      emergencyEventsCount++;
      emergencyLog.push({
        week,
        region: r,
        reservesBefore: prevBk.centralBankReservesUSD,
        reservesAfter: newBk.centralBankReservesUSD,
      });
    }

    // Track spillover
    const sp = newReg.creditConditionsSpilloverAdjustment ?? 0;
    if (sp < minSpillover) minSpillover = sp;
    if (sp > maxSpillover) maxSpillover = sp;

    // Track velocity factor
    const cci = newReg.householdState.consumerConfidence;
    const vf = Math.max(0.5, Math.min(1.2, 1.0 - Math.max(0, (100 - cci) / 100) * 0.6));
    if (vf < minVelocity) minVelocity = vf;
    if (vf > maxVelocity) maxVelocity = vf;
  }

  if (week === 104 || week === 260 || week === 520) {
    console.log(`--- WEEK ${week} (Year ${(week / 52).toFixed(1)}) SNAPSHOT ---`);
    for (const r of regionIds) {
      const reg = state.regions[r];
      const bk = reg.bankingSector;
      console.log(`[${r}] Stance: ${reg.balanceSheetStance.toFixed(3)} | Reserves: $${(bk.centralBankReservesUSD / 1e12).toFixed(2)}T | CapRatio: ${(bk.bankCapitalRatio * 100).toFixed(2)}% | Deposits: $${(bk.depositsUSD / 1e12).toFixed(2)}T | Loans: $${((bk.businessLoanBookUSD + bk.consumerLoanBookUSD) / 1e12).toFixed(2)}T | M2: $${(bk.moneySupplyM2USD / 1e12).toFixed(2)}T | Spillover: ${(reg.creditConditionsSpilloverAdjustment ?? 0).toFixed(4)}`);
    }
    console.log('');
  }
}

console.log('=== 520-WEEK PROBE SUMMARY ===');
console.log('Constraint Binding Frequencies (Weeks binding as tightest constraint):');
for (const r of regionIds) {
  console.log(`  [${r}] Deposits: ${constraintCounts[r].deposits}w | Capital: ${constraintCounts[r].capital}w | Reserves: ${constraintCounts[r].reserves}w`);
}
console.log(`\nEmergency Injection Events: ${emergencyEventsCount}`);
if (emergencyLog.length > 0) {
  emergencyLog.slice(0, 5).forEach(e => {
    console.log(`  W${e.week} [${e.region}] Reserves: $${(e.reservesBefore/1e12).toFixed(2)}T -> $${(e.reservesAfter/1e12).toFixed(2)}T`);
  });
}
console.log(`\nVelocity Factor Range: [${minVelocity.toFixed(3)}, ${maxVelocity.toFixed(3)}]`);
console.log(`Credit Spillover Range: [${minSpillover.toFixed(4)}, ${maxSpillover.toFixed(4)}]`);
