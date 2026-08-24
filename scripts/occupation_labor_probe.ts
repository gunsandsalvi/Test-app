import { createInitialGameState, advanceWeeklyStep } from '../src/engine/simulation';
import { OccupationType, SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX } from '../src/types';

let state = createInitialGameState();
const checkpoints = [1, 13, 26, 52, 104, 208, 364, 520];

console.log('=== OCCUPATION-SPECIFIC LABOR POOLS PROBE (USA) ===');

for (let w = 1; w <= 520; w++) {
  state = advanceWeeklyStep(state);
  if (checkpoints.includes(w)) {
    const r = state.regions.USA;
    const pools = r.occupationPools;
    const shares = r.occupationLaborForceShare;
    
    console.log(`\n--- Week ${w} (${r.cycleRegime}) ---`);
    console.log(`Labor Force: ${(r.totalPopulation * (1 - r.nonEmployablePct) * r.laborForceParticipation / 1e6).toFixed(2)}M, Overall Unemployment: ${(r.unemploymentRate * 100).toFixed(2)}%`);
    
    (Object.keys(pools) as OccupationType[]).forEach(occ => {
      const p = pools[occ];
      const share = shares[occ];
      console.log(`  ${occ.padEnd(26)} | WageIdx: ${p.wageIndex.toFixed(4)} | WageGrowth: ${(p.wageGrowthAnnual * 100).toFixed(2)}% | Employed: ${(p.employed / 1e6).toFixed(2)}M | LF Share: ${(share * 100).toFixed(2)}%`);
    });

    // Spot check: Tech company vs Retail segment blended wage growth
    const techOccMix = SECTOR_OCCUPATION_MIX['Tech']!;
    const retailOccMix = PRIVATE_SEGMENT_OCCUPATION_MIX['RETAIL_TRADE']!;
    const techWageGrowth = Object.entries(techOccMix).reduce((s, [occ, sh]) => s + pools[occ as OccupationType].wageGrowthAnnual * (sh ?? 0), 0);
    const retailWageGrowth = Object.entries(retailOccMix).reduce((s, [occ, sh]) => s + pools[occ as OccupationType].wageGrowthAnnual * (sh ?? 0), 0);
    console.log(`  >> Tech Sector Wage Cost: ${(techWageGrowth * 100).toFixed(2)}% vs Retail Segment Wage Cost: ${(retailWageGrowth * 100).toFixed(2)}% (Diff: ${((techWageGrowth - retailWageGrowth) * 100).toFixed(2)}%)`);
  }
}
