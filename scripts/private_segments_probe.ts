import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';

let state = createInitialGameState();
const checkpoints = [1, 13, 26, 52, 104, 208, 364, 520];

console.log('=== PRIVATE SECTOR SEGMENTS PROBE (USA) ===');
for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    const segments = r.privateSectorSegments || [];
    const totalEmp = segments.reduce((s, seg) => s + seg.employment, 0);
    const totalRev = segments.reduce((s, seg) => s + seg.annualRevenueUSD, 0);
    
    console.log(`\n--- Week ${w} (${r.cycleRegime}) ---`);
    console.log(`Total Segment Employment: ${totalEmp.toLocaleString()}, Total Annual Revenue: $${(totalRev / 1e12).toFixed(2)}T`);
    segments.forEach(seg => {
      console.log(`  ${seg.segmentType.padEnd(25)} Emp: ${seg.employment.toLocaleString().padStart(11)} | Rev: $${(seg.annualRevenueUSD / 1e9).toFixed(1).padStart(7)}B | Margin: ${(seg.marginPct * 100).toFixed(2)}%`);
    });
  }
}
