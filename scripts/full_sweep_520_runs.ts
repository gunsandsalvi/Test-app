import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

async function runSweep() {
  for (let run = 1; run <= 3; run++) {
    console.log(`\n================ RUN ${run} (520 WEEKS) ================`);
    let state = createInitialGameState();
    let clean = true;
    let crashWeek = -1;
    let crashMsg = '';

    for (let week = 1; week <= 520; week++) {
      try {
        state = advanceWeeklyStep(state);
      } catch (err: any) {
        clean = false;
        crashWeek = week;
        crashMsg = err?.message || String(err);
        console.error(`Run ${run} failed at week ${week}: ${crashMsg}`);
        break;
      }

      for (const [regionId, r] of Object.entries(state.regions)) {
        const reg = r as any;
        if (!Number.isFinite(reg.gdpGrowth) || !Number.isFinite(reg.derivedNominalGdpUSD)) {
          clean = false;
          crashWeek = week;
          crashMsg = `non-finite GDP in ${regionId}: gdpGrowth=${reg.gdpGrowth}, derivedNominalGdpUSD=${reg.derivedNominalGdpUSD}`;
          console.error(`Run ${run} failed at week ${week}: ${crashMsg}`);
          break;
        }
      }
      if (!clean) break;
    }

    if (clean) {
      console.log(`Run ${run}: CLEAN THROUGH 520 WEEKS`);
    } else {
      console.log(`Run ${run}: CRASHED at week ${crashWeek}: ${crashMsg}`);
    }
  }
}

runSweep();
