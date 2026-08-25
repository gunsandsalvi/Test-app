import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();

console.log("Starting full run stability probe...");

let clean = true;
for (let week = 1; week <= 520; week++) {
  try {
    state = advanceWeeklyStep(state);
  } catch (err: any) {
    console.error(`Week ${week}: thrown error ${err?.message || err}`);
    clean = false;
    break;
  }
  
  for (const regionId of Object.keys(state.regions)) {
    const r = state.regions[regionId as keyof typeof state.regions];
    if (!Number.isFinite(r.gdpGrowth)) {
      console.error(`Week ${week}: non-finite gdpGrowth in ${regionId}: ${r.gdpGrowth}`);
      clean = false;
      break;
    }
  }
  if (!clean) break;

  for (const comm of state.commodities) {
    if (!Number.isFinite(comm.spotPrice)) {
      console.error(`Week ${week}: non-finite spotPrice for commodity ${comm.id}: ${comm.spotPrice}`);
      clean = false;
      break;
    }
  }
  if (!clean) break;

  for (const c of state.companies) {
    if (!Number.isFinite(c.leverage)) {
      console.error(`Week ${week}: non-finite leverage for company ${c.ticker}: ${c.leverage}`);
      clean = false;
      break;
    }
    if (!Number.isFinite(c.oasSpreadBps)) {
      console.error(`Week ${week}: non-finite oasSpreadBps for company ${c.ticker}: ${c.oasSpreadBps}`);
      clean = false;
      break;
    }
  }
  if (!clean) break;
}

if (clean) {
  console.log("CLEAN THROUGH 520 WEEKS");
}
