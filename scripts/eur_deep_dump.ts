import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';

let state = createInitialGameState();
const eurFirmsBefore = state.companies.filter(c => c.region === 'EUR' && !c.isDefaulted);

const dump: any = {
  week0_eurFirmCount: eurFirmsBefore.length,
  week0_eurFirms: eurFirmsBefore.map(c => ({
    ticker: c.ticker,
    productLines: c.productLines,
    maintenanceCapex: c.maintenanceCapex,
    growthCapex: c.growthCapex,
    capex: (c as any).capex,
    annualRevenue: c.annualRevenue,
    ebitda: c.ebitda,
    employeeCount: c.employeeCount,
    cash: c.cash,
    totalDebt: c.totalDebt,
  })),
};

try {
  state = advanceWeeklyStep(state);
  const eurFirmsAfter = state.companies.filter(c => c.region === 'EUR' && !c.isDefaulted);
  dump.week1_eurFirms = eurFirmsAfter.map(c => ({
    ticker: c.ticker,
    productLines: c.productLines,
    maintenanceCapex: c.maintenanceCapex,
    growthCapex: c.growthCapex,
    isNaN_maintCapex: isNaN(c.maintenanceCapex),
    isNaN_growthCapex: isNaN(c.growthCapex),
    annualRevenue: c.annualRevenue,
    ebitda: c.ebitda,
  }));
  dump.week1_investmentComponentUSD = state.regions.EUR.investmentComponentUSD;
  dump.week1_governmentSpendingUSD = state.regions.EUR.governmentSpendingUSD;
  dump.crashed = false;
} catch (e: any) {
  dump.crashed = true;
  dump.crashMessage = e.message;
  dump.crashStack = e.stack;
}

fs.writeFileSync('scripts/eur_deep_dump_output.json', JSON.stringify(dump, null, 2));
console.log('Dump written to scripts/eur_deep_dump_output.json');
console.log('Total size:', JSON.stringify(dump).length, 'bytes');
