import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

const initialState = createInitialGameState();
let state = initialState;

let totalSnapshotsChecked = 0;
let balanceSheetDiscrepancies = 0;
let cashFlowDiscrepancies = 0;

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  
  state.companies.forEach(c => {
    (c.historicalFundamentals || []).forEach(fund => {
      totalSnapshotsChecked++;
      const bs = fund.balanceSheet;
      if (bs) {
        const calculatedLiabAndEquity = bs.totalLiabilities + bs.shareholdersEquity;
        const diff = Math.abs(bs.totalAssets - calculatedLiabAndEquity);
        if (diff > 0.01) {
          balanceSheetDiscrepancies++;
          console.error(`Week ${w} Company ${c.ticker} BS mismatch: Assets=${bs.totalAssets}, Liab+Eq=${calculatedLiabAndEquity}, diff=${diff}`);
        }
      }

      const cf = fund.cashFlowStatement;
      if (cf) {
        const calculatedNetCashChange = cf.cashFromOperations + cf.cashFromInvesting + cf.cashFromFinancing;
        const diffCF = Math.abs(cf.netChangeInCash - calculatedNetCashChange);
        if (diffCF > 0.01) {
          cashFlowDiscrepancies++;
          console.error(`Week ${w} Company ${c.ticker} CF mismatch: NetCashChange=${cf.netChangeInCash}, Sum=${calculatedNetCashChange}, diff=${diffCF}`);
        }
      }
    });
  });
}

console.log(`Reconciliation Probe Results:`);
console.log(`Total Snapshots Checked: ${totalSnapshotsChecked}`);
console.log(`Balance Sheet Discrepancies: ${balanceSheetDiscrepancies}`);
console.log(`Cash Flow Discrepancies: ${cashFlowDiscrepancies}`);

if (balanceSheetDiscrepancies === 0 && cashFlowDiscrepancies === 0) {
  console.log('RECONCILIATION PROBE PASSED - Perfectly balanced financial statements!');
} else {
  console.error('RECONCILIATION PROBE FAILED - Discrepancies found.');
  process.exit(1);
}
