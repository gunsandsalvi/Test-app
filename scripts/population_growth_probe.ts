import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log('=== Starting Population Growth Probe ===\n');

let state = createInitialGameState();

const initialPop: Record<string, number> = {
  USA: state.regions.USA.totalPopulation,
  EUR: state.regions.EUR.totalPopulation,
  UK: state.regions.UK.totalPopulation,
  JPN: state.regions.JPN.totalPopulation,
};

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);

  if (w === 1 || w === 52 || w === 104 || w === 260 || w === 520) {
    console.log(`Week ${w}:`);
    (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(r => {
      const reg = state.regions[r];
      const growthPct = ((reg.totalPopulation / initialPop[r] - 1) * 100).toFixed(2);
      console.log(`  ${r}: Pop=${(reg.totalPopulation / 1e6).toFixed(2)}M (${growthPct}%), Births=${(reg.birthRateAnnual * 100).toFixed(2)}%, Deaths=${(reg.deathRateAnnual * 100).toFixed(2)}%, NetMig=${(reg.netMigrationRateAnnual * 100).toFixed(2)}%`);
    });
  }
}

console.log('\n=== Population Growth 10-Year Summary ===');
let errors = 0;
(['USA', 'EUR', 'UK', 'JPN'] as const).forEach(r => {
  const reg = state.regions[r];
  const totalGrowth = reg.totalPopulation / initialPop[r] - 1;
  console.log(`${r}: Initial=${(initialPop[r] / 1e6).toFixed(2)}M -> Final=${(reg.totalPopulation / 1e6).toFixed(2)}M (10Y Total Growth: ${(totalGrowth * 100).toFixed(2)}%)`);
  if (isNaN(reg.totalPopulation) || reg.totalPopulation <= 0) {
    console.error(`ERROR: Invalid population for ${r}`);
    errors++;
  }
});

// Demographic sanity: USA and UK should grow, JPN should shrink or have lower growth due to higher death rate than birth rate
if (state.regions.USA.totalPopulation <= initialPop.USA) {
  console.error('ERROR: USA population failed to grow over 10 years');
  errors++;
}
if (state.regions.JPN.totalPopulation >= initialPop.JPN) {
  console.error('ERROR: JPN population was expected to decline due to demographic deficit');
  errors++;
}

if (errors === 0) {
  console.log('\nPROBE PASSED — Population growth dynamics behave realistically.');
  process.exit(0);
} else {
  console.error(`\nPROBE FAILED with ${errors} error(s).`);
  process.exit(1);
}
