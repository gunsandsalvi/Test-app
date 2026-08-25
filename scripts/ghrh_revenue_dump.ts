import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';
let state = createInitialGameState();
const dump: any = { weeks: [] };
for (let w = 1; w <= 4; w++) {
  state = advanceWeeklyStep(state);
  const c = state.companies.find(x => x.ticker === 'GHRH');
  if (c) {
    dump.weeks.push({
      week: w,
      annualRevenue: c.annualRevenue,
      ebitda: c.ebitda,
      cash: c.cash,
      totalDebt: c.totalDebt,
      maintenanceCapex: c.maintenanceCapex,
      growthCapex: c.growthCapex,
      productLines: (c.productLines || []).map((l: any) => ({ industry: l.industry, subUnitId: l.subUnitId, revenueShare: l.revenueShare, competitiveness: l.competitiveness, categoryMarketShare: l.categoryMarketShare, marginByUnit: l.marginByUnit })),
    });
  }
}
fs.writeFileSync('scripts/ghrh_revenue_dump_output.json', JSON.stringify(dump, null, 2));
console.log(JSON.stringify(dump, null, 2));
