import { createInitialGameState } from '../src/engine/simulation/initialization.ts';
import { advanceWeeklyStep } from '../src/engine/simulation/core.ts';
import * as fs from 'fs';

let state = createInitialGameState();
const checkpoints = [1, 10, 52, 100, 150, 200, 250, 300, 350, 400, 450, 500, 520];
const report: any = { checkpoints: [], crashed: false, crashWeek: null, crashMessage: null };

// We want to track specific profiles
const profilesToTrack = ['STANDARD_OPERATING', 'INSURER', 'ASSET_MANAGER', 'BANK', 'REIT'];
const trackedTickers: Record<string, string> = {};

for (const prof of profilesToTrack) {
    const comp = state.companies.find(c => c.financialStatementProfile === prof);
    if (comp) trackedTickers[prof] = comp.ticker;
}

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
  } catch (e: any) {
    report.crashed = true;
    report.crashWeek = w;
    report.crashMessage = e.message;
    console.error(e);
    break;
  }
  if (checkpoints.includes(w)) {
    const entry: any = { week: w, regions: {}, profiles: {} };
    for (const rid of ['USA', 'EUR', 'UK', 'JPN']) {
      const reg = state.regions[rid];
      entry.regions[rid] = {
        gdpUSD: Math.round(reg.gdpUSD),
        inflation: Number(reg.inflation.toFixed(4)),
        unemployment: Number(reg.unemploymentRate.toFixed(4)),
        equityIndex: Number((rid === 'USA' ? state.compositeIndices.us500.value : rid === 'EUR' ? state.compositeIndices.euStoxx.value : rid === 'UK' ? state.compositeIndices.uk100.value : state.compositeIndices.jp225.value).toFixed(2)),
        creditSpread: Number((rid === 'USA' ? state.compositeIndices.usIgOas.value : rid === 'EUR' ? state.compositeIndices.euIgOas.value : rid === 'UK' ? state.compositeIndices.ukIgOas.value : state.compositeIndices.jpIgOas.value).toFixed(0)),
        centralBankRate: Number(reg.policyRate.toFixed(4))
      };
    }
    
    // Sample one entity from each profile
    for (const [prof, ticker] of Object.entries(trackedTickers)) {
        const c = state.companies.find(x => x.ticker === ticker);
        if (c) {
            entry.profiles[prof] = {
                ticker: c.ticker,
                annualRevenue: c.annualRevenue,
                eps: c.eps,
                aumUSD: c.aumUSD,
                technicalReservesUSD: c.technicalReservesUSD,
                insurancePremiumsWrittenUSD: c.insurancePremiumsWrittenUSD
            };
        }
    }
    
    // contract info
    const contracts = Object.values(state.regions).flatMap(r => r.activeContracts || []);
    entry.activeContracts = contracts.length;
    
    const bySubUnit: any = {};
    for (const c of contracts) {
      bySubUnit[c.subUnitId] = (bySubUnit[c.subUnitId] || 0) + 1;
    }
    entry.activeContractsBySubUnit = bySubUnit;
    
    report.checkpoints.push(entry);
    console.log(`Passed week ${w}`);
  }
}

fs.writeFileSync('mega_probe_output.json', JSON.stringify(report, null, 2));
console.log('Done!');
