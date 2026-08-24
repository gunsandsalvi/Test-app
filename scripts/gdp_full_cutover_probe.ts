import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

console.log('=== Starting GDP Full Cutover Probe ===\n');

let state = createInitialGameState();

let pinCounts: Record<string, { topPins: number; bottomPins: number; consecutivePins: number; maxConsecutivePins: number }> = {
  USA: { topPins: 0, bottomPins: 0, consecutivePins: 0, maxConsecutivePins: 0 },
  EUR: { topPins: 0, bottomPins: 0, consecutivePins: 0, maxConsecutivePins: 0 },
  UK: { topPins: 0, bottomPins: 0, consecutivePins: 0, maxConsecutivePins: 0 },
  JPN: { topPins: 0, bottomPins: 0, consecutivePins: 0, maxConsecutivePins: 0 },
};

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);

  (['USA', 'EUR', 'UK', 'JPN'] as const).forEach(r => {
    const reg = state.regions[r];
    const gdp = reg.gdpGrowth;
    const isTop = Math.abs(gdp - 0.045) < 0.0001;
    const isBottom = Math.abs(gdp - (-0.02)) < 0.0001;

    if (isTop) pinCounts[r].topPins++;
    if (isBottom) pinCounts[r].bottomPins++;

    if (isTop || isBottom) {
      pinCounts[r].consecutivePins++;
      if (pinCounts[r].consecutivePins > pinCounts[r].maxConsecutivePins) {
        pinCounts[r].maxConsecutivePins = pinCounts[r].consecutivePins;
      }
    } else {
      pinCounts[r].consecutivePins = 0;
    }
  });

  if (w === 1 || w === 52 || w === 104 || w === 260 || w === 520) {
    const usa = state.regions.USA;
    console.log(`Week ${w} (USA): GDP=${(usa.gdpGrowth * 100).toFixed(2)}%, GDP_BottomUp=${(usa.gdpGrowthBottomUp * 100).toFixed(2)}%, Unemp=${(usa.unemploymentRate * 100).toFixed(2)}%, Policy=${(usa.policyRate * 100).toFixed(2)}%, Regime=${usa.cycleRegime}`);
  }
}

console.log('\n=== GDP Full Cutover Summary (520 Weeks) ===');
let failed = false;
(['USA', 'EUR', 'UK', 'JPN'] as const).forEach(r => {
  const p = pinCounts[r];
  console.log(`Region ${r}: maxConsecutivePins=${p.maxConsecutivePins}, topPins=${p.topPins}, bottomPins=${p.bottomPins}`);
  if (p.maxConsecutivePins >= 100) {
    console.error(`ERROR: Region ${r} pinned at clamp edge for ${p.maxConsecutivePins} consecutive weeks!`);
    failed = true;
  }
});

if (!failed) {
  console.log('\nPROBE PASSED — Full GDP cutover operates smoothly with no clamp pinning.');
  process.exit(0);
} else {
  console.error('\nPROBE FAILED.');
  process.exit(1);
}
