import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
console.log("=== GDP & PMI VOLATILITY CHECK (WEEK 1 TO 100) ===");

let allPmiValid = true;
const gdpValues: number[] = [];

for (let w = 1; w <= 100; w++) {
  try {
    state = advanceWeeklyStep(state);
    const usa = state.regions.USA;
    const pmi = state.compositeIndices.pmiComposite;
    gdpValues.push(usa.gdpGrowth);

    // Verify all components are bounded between 0 and 100
    const components = [pmi.headline, pmi.demandComponent, pmi.capexComponent, pmi.employmentComponent];
    const invalid = components.some(val => isNaN(val) || val < 0 || val > 100);
    if (invalid) {
      allPmiValid = false;
      console.log(`[ALERT] PMI out of bounds at week ${w}:`, pmi);
    }

    if (w % 10 === 0 || w <= 5) {
      console.log(`Week ${w}: GDP Growth = ${(usa.gdpGrowth * 100).toFixed(4)}%, PMI Headline = ${pmi.headline} (Demand: ${pmi.demandComponent}, Capex: ${pmi.capexComponent}, Employment: ${pmi.employmentComponent})`);
    }
  } catch (err: any) {
    console.log(`Simulation halted at week ${w} with error: ${err.message}`);
    break;
  }
}

console.log("\n=== SUMMARY ===");
console.log("All PMI metrics stayed within [0, 100] bounds:", allPmiValid ? "PASS" : "FAIL");

// Verify there are no exact repeated pinned values in GDP growth (e.g., -0.25 or 0.25)
const distinctGdpValues = new Set(gdpValues.map(v => v.toFixed(6)));
console.log(`Total simulated weeks: ${gdpValues.length}`);
console.log(`Unique GDP growth values: ${distinctGdpValues.size}`);
const hasRepeatedPinnedValue = gdpValues.some(v => Math.abs(v - 0.25) < 1e-9 || Math.abs(v + 0.25) < 1e-9);
console.log("GDP growth shows real, unclamped variation (no repeated ±25% pinning):", !hasRepeatedPinnedValue ? "PASS" : "FAIL");
