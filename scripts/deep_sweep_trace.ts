import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
console.log('Starting 250-week simulation...');

for (let w = 1; w <= 250; w++) {
  try {
    state = advanceWeeklyStep(state);
    
    // Check WTI every 10 weeks
    if (w % 10 === 0 || (w >= 70 && w <= 130 && w % 5 === 0)) {
      const wti = state.commodities.find(c => c.id === 'WTI' || c.symbol === 'WTI') as any;
      console.log(`[WTI Week ${w}] spotPrice=${wti.spotPrice}, supplyUnits=${wti.weeklySupplyUnits?.toExponential(3)}, demandUnits=${wti.weeklyDemandUnits?.toExponential(3)}, balance=${wti.supplyDemandBalance}`);
    }

    if (w >= 220) {
      console.log(`\n--- WEEK ${w} MACRO CHECK ---`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`  ${rid}: derivedNominal=${reg.derivedNominalGdpUSD?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toExponential(3)}, govSpending=${reg.governmentSpendingUSD?.toExponential(3)}, govRev=${reg.governmentRevenueUSD?.toExponential(3)}, deficitPct=${reg.fiscalDeficitPctGdp?.toFixed(4)}, debtUSD=${reg.totalGovDebtUSD?.toExponential(3)}`);
      }

      // Check company leverage and oasSpreadBps
      const badLeverage = state.companies.filter(c => !isFinite(c.leverage) || c.leverage > 100 || c.leverage < -100);
      const badSpread = state.companies.filter(c => !isFinite(c.oasSpreadBps) || c.oasSpreadBps > 50000 || c.oasSpreadBps < -5000);
      if (badLeverage.length > 0) {
        console.log(`  BAD LEVERAGE count=${badLeverage.length}: ${badLeverage.slice(0, 3).map(c => `${c.ticker}: lev=${c.leverage}, debt=${c.totalDebt}, ebitda=${c.ebitda}`).join('; ')}`);
      }
      if (badSpread.length > 0) {
        console.log(`  BAD SPREAD count=${badSpread.length}: ${badSpread.slice(0, 3).map(c => `${c.ticker}: spread=${c.oasSpreadBps}`).join('; ')}`);
      }
    }
  } catch (e: any) {
    console.log(`\nCRASH at week ${w}: ${e.message}`);
    console.log(e.stack);

    // Dump diagnostics
    console.log('\n--- REGIONS AT CRASH ---');
    for (const [rid, r] of Object.entries(state.regions)) {
      const reg = r as any;
      console.log(`  ${rid}: derivedNominal=${reg.derivedNominalGdpUSD}, gdpGrowth=${reg.gdpGrowth}, lastWeek=${reg.lastWeekNominalGdpUSD}, smoothedRate=${reg.smoothedWeeklyGrowthRate}`);
    }
    break;
  }
}
