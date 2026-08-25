import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';

let state = createInitialGameState();
const dump: any = { weeks: [] };

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
  } catch (err: any) {
    dump.firstBadWeek = w;
    dump.error = err.message;
    break;
  }
  const weekData: any = { week: w };
  (['UK', 'EUR', 'JPN'] as const).forEach(regionId => {
    const r = state.regions[regionId];
    weekData[regionId] = {
      governmentSpendingUSD: r.governmentSpendingUSD,
      governmentRevenueUSD: (r as any).governmentRevenueUSD,
      fiscalDeficitPctGdp: (r as any).fiscalDeficitPctGdp,
      estimatedNominalGdpUSD: (r as any).estimatedNominalGdpUSD,
      investmentComponentUSD: r.investmentComponentUSD,
      consumptionComponentUSD: r.consumptionComponentUSD,
      trackedInvestmentUSD_inputs: (state.companies.filter(c => c.region === regionId && !c.isDefaulted).some(c => isNaN(c.maintenanceCapex) || isNaN(c.growthCapex) || !isFinite(c.maintenanceCapex) || !isFinite(c.growthCapex)))
        ? state.companies.filter(c => c.region === regionId && !c.isDefaulted && (isNaN(c.maintenanceCapex) || isNaN(c.growthCapex) || !isFinite(c.maintenanceCapex) || !isFinite(c.growthCapex))).map(c => ({ ticker: c.ticker, maintenanceCapex: c.maintenanceCapex, growthCapex: c.growthCapex, annualRevenue: c.annualRevenue, ebitda: c.ebitda }))
        : 'none-NaN-or-infinite',
    };
  });
  dump.weeks.push(weekData);
  if (weekData.UK.governmentSpendingUSD !== undefined && (isNaN(weekData.UK.governmentSpendingUSD) || !isFinite(weekData.EUR.governmentSpendingUSD) || weekData.JPN.investmentComponentUSD > 1e15)) {
    dump.firstBadWeek = w;
    fs.writeFileSync('scripts/gi_deep_dump_output.json', JSON.stringify(dump, null, 2));
    console.log('First bad week:', w, '- dump written, stopping.');
    process.exit(0);
  }
}
fs.writeFileSync('scripts/gi_deep_dump_output.json', JSON.stringify(dump, null, 2));
