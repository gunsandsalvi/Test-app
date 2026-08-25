import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
for (let w = 1; w <= 250; w++) {
  try {
    state = advanceWeeklyStep(state);
    if (w % 20 === 0 || (w >= 210 && w <= 240)) {
      console.log(`\n================ WEEK ${w} ================`);
      for (const [rid, r] of Object.entries(state.regions)) {
        const reg = r as any;
        console.log(`  ${rid}: derivedGdp=${reg.derivedNominalGdpUSD?.toExponential(3)}, gdpGrowth=${reg.gdpGrowth?.toFixed(4)}, deficitPct=${reg.fiscalDeficitPctGdp?.toFixed(4)}, govSpending=${reg.governmentSpendingUSD?.toExponential(3)}, govRev=${reg.governmentRevenueUSD?.toExponential(3)}`);
      }
      const wti = state.commodities.find(c => c.id === 'WTI');
      console.log(`  WTI: spot=${wti?.spotPrice}, supply=${wti?.weeklySupplyUnits?.toExponential(3)}, demand=${wti?.weeklyDemandUnits?.toExponential(3)}`);
      
      const badLev = state.companies.filter(c => !isFinite(c.leverage) || isNaN(c.leverage));
      const badSpread = state.companies.filter(c => !isFinite(c.oasSpreadBps) || isNaN(c.oasSpreadBps));
      if (badLev.length > 0) console.log(`  BAD LEV count: ${badLev.length}`);
      if (badSpread.length > 0) console.log(`  BAD SPREAD count: ${badSpread.length}`);
    }
  } catch (e: any) {
    console.log(`\nCRASH at week ${w}: ${e.message}`);
    for (const [rid, r] of Object.entries(state.regions)) {
      const reg = r as any;
      console.log(`  ${rid}: derivedGdp=${reg.derivedNominalGdpUSD}, gdpGrowth=${reg.gdpGrowth}, govSpending=${reg.governmentSpendingUSD}, govRev=${reg.governmentRevenueUSD}, deficitPct=${reg.fiscalDeficitPctGdp}`);
    }
    const comps = state.companies;
    const badComps = comps.filter(c => !isFinite(c.annualRevenue) || !isFinite(c.ebitda) || !isFinite(c.capex) || !isFinite(c.marketCap) || !isFinite(c.stockPrice));
    console.log(`Bad companies at crash: ${badComps.length}`);
    for (const bc of badComps.slice(0, 5)) {
      console.log(`  ${bc.ticker} (${bc.name}): rev=${bc.annualRevenue}, ebitda=${bc.ebitda}, capex=${bc.capex}, mcap=${bc.marketCap}, p=${bc.stockPrice}`);
    }
    break;
  }
}
