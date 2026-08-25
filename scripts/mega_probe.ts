import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import * as fs from 'fs';

let state = createInitialGameState();
const checkpoints = [1, 10, 52, 100, 150, 200, 250, 300, 350, 400, 450, 500, 520];
const report: any = { checkpoints: [], crashed: false, crashWeek: null, crashMessage: null };

for (let w = 1; w <= 520; w++) {
  try {
    state = advanceWeeklyStep(state);
  } catch (e: any) {
    report.crashed = true;
    report.crashWeek = w;
    report.crashMessage = e.message;
    break;
  }
  if (checkpoints.includes(w)) {
    const entry: any = { week: w, regions: {} };
    for (const rid of ['USA', 'EUR', 'UK', 'JPN'] as const) {
      const reg = state.regions[rid] as any;
      entry.regions[rid] = {
        gdpGrowth: reg.gdpGrowth,
        consumptionComponentUSD: reg.consumptionComponentUSD,
        investmentComponentUSD: reg.investmentComponentUSD,
        governmentSpendingUSD: reg.governmentSpendingUSD,
        fiscalDeficitPctGdp: reg.fiscalDeficitPctGdp,
        governmentEmployment: reg.governmentEmployment,
        totalPrivateEmployment: reg.privateSectorSegments?.reduce((s: number, seg: any) => s + seg.employment, 0),
        totalOccupationEmployed: Object.values(reg.occupationPools || {}).reduce((s: number, p: any) => s + p.employed, 0),
        estimatedHouseholdIncomeUSD: reg.estimatedHouseholdIncomeUSD,
        activeContractsCount: reg.activeContracts?.length ?? 0,
        activeContractsBySubUnit: (reg.activeContracts || []).reduce((acc: any, c: any) => { acc[c.subUnitId] = (acc[c.subUnitId]||0)+1; return acc; }, {}),
        categoryDemandSample: ['industrial_automation','refined_products','food_beverage','pharmaceuticals','passenger_vehicles','semiconductors','defense_systems'].reduce((acc: any, k) => { acc[k] = { demandLevelUSD: reg.categoryDemand?.[k]?.demandLevelUSD, demandGrowthAnnual: reg.categoryDemand?.[k]?.demandGrowthAnnual, unitPriceUSD: reg.categoryDemand?.[k]?.unitPriceUSD }; return acc; }, {}),
        durableGoodsStockUnits: reg.householdState?.durableGoodsStockUnits,
      };
    }
    entry.commodities = Object.values(state.commodities as any).map((c: any) => ({ id: c.id, spotPrice: c.spotPrice, weeklySupplyUnits: c.weeklySupplyUnits, weeklyDemandUnits: c.weeklyDemandUnits }));
    entry.companyHealth = {
      totalCompanies: state.companies.length,
      badRevenue: state.companies.filter(c => !isFinite(c.annualRevenue)).length,
      badLeverage: state.companies.filter(c => !isFinite((c as any).leverage)).length,
      badOas: state.companies.filter(c => !isFinite((c as any).oasSpreadBps)).length,
      badCapex: state.companies.filter(c => !isFinite(c.maintenanceCapex) || !isFinite(c.growthCapex)).length,
      extremeTobinsQ: state.companies.filter(c => { const q = c.marketCap / Math.max(1, c.totalDebt + c.annualRevenue*1.5); return q > 50 || q < 0; }).length,
      worstTobinsQ: state.companies.reduce((max, c) => { const q = c.marketCap / Math.max(1, c.totalDebt + c.annualRevenue*1.5); return q > max.q ? { q, ticker: c.ticker } : max; }, { q: -Infinity, ticker: '' }),
      rawCloneNamesFound: state.companies.filter(c => /clone \d+/i.test((c as any).name || '')).length,
    };
    entry.institutionalHoldingsSample = (state as any).institutionalEntities?.slice(0, 3).map((e: any) => ({ name: e.name, totalAssetsUSD: e.totalAssetsUSD, holdingsCount: e.itemizedHoldings?.length })) ?? 'NOT FOUND ON STATE';
    entry.pmi = (state as any).compositeIndices?.pmiComposite;
    report.checkpoints.push(entry);
  }
}
fs.writeFileSync('scripts/mega_probe_output.json', JSON.stringify(report, null, 2));
console.log('Wrote scripts/mega_probe_output.json —', report.crashed ? `CRASHED at week ${report.crashWeek}: ${report.crashMessage}` : 'COMPLETED 520 WEEKS');
console.log('Full report:');
console.log(JSON.stringify(report, null, 2));
