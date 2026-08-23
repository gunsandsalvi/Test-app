// scripts/capex_split_probe.ts
import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
let state = createInitialGameState();
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (w === 52 || w === 208 || w === 520) {
    const comps = Object.values(state.companies).slice(0, 5);
    console.log(`\n=== WEEK ${w} CAPEX SPLIT ===`);
    comps.forEach(c => {
      console.log(JSON.stringify({
        ticker: c.ticker, rating: c.creditRating, cash: Math.round(c.cash),
        totalCapex: Math.round(c.capex),
        maintCapex: Math.round(c.maintenanceCapex),
        growthCapex: Math.round(c.growthCapex),
        maintStreak: c.maintenanceShortfallStreak,
      }));
    });
  }
}
