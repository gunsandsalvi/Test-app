import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';
let state = createInitialGameState();
const dump: any = { weeks: [] };
for (let w = 1; w <= 6; w++) {
  try {
    state = advanceWeeklyStep(state);
    const eurFirms = state.companies.filter(c => c.region === 'EUR' && !c.isDefaulted);
    const badFirms = eurFirms.filter(c => !isFinite(c.maintenanceCapex) || !isFinite(c.growthCapex) || Math.abs(c.maintenanceCapex) > 1e12 || Math.abs(c.growthCapex) > 1e12);
    dump.weeks.push({
      week: w,
      investmentComponentUSD: (state.regions.EUR as any).investmentComponentUSD,
      totalTrackedInvestmentUSD: eurFirms.reduce((s, c) => s + c.maintenanceCapex + c.growthCapex, 0),
      badFirmCount: badFirms.length,
      badFirms: badFirms.slice(0, 5).map(c => ({ ticker: c.ticker, maintenanceCapex: c.maintenanceCapex, growthCapex: c.growthCapex, annualRevenue: c.annualRevenue, debtTranches: (c.debtTranches||[]).length, activeContracts: 'check-region-level' })),
    });
  } catch (err: any) {
    dump.weeks.push({
      week: w,
      status: "CRASHED",
      error: err.message || err.toString()
    });
    break;
  }
}
fs.writeFileSync('scripts/investment_explosion_dump_output.json', JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
