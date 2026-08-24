// scripts/generation_concentration_probe.ts
import { createInitialGameState } from '../src/engine/simulation';

const state = createInitialGameState();
const regionIds = ['USA', 'EUR', 'UK', 'JPN'] as const;
const categories = [
  'StapleHousehold', 'StandardHousehold', 'LuxuryHousehold',
  'CorporateIndustrial', 'CorporateTech',
  'GovernmentDefense', 'GovernmentInfrastructure', 'GovernmentHealthcare'
] as const;

console.log('=== Generation Concentration Probe ===\n');

let maxShareOverall = 0;
let violations = 0;

regionIds.forEach(r => {
  console.log(`--- Region: ${r} ---`);
  const comps = state.companies.filter(c => c.region === r);
  
  categories.forEach(cat => {
    let maxShare = 0;
    let maxComp = '';
    let compCount = 0;
    
    comps.forEach(c => {
      const pl = (c.productLines || []).find(l => l.category === cat);
      if (pl && pl.categoryMarketShare > 0) {
        compCount++;
        if (pl.categoryMarketShare > maxShare) {
          maxShare = pl.categoryMarketShare;
          maxComp = `${c.name} (${c.ticker})`;
        }
      }
    });

    if (maxShare > maxShareOverall) maxShareOverall = maxShare;

    const flag = maxShare > 0.40 ? ' [VIOLATION > 40%]' : '';
    if (maxShare > 0.40) violations++;

    console.log(`  ${cat.padEnd(26)}: Max=${(maxShare * 100).toFixed(1)}% by ${maxComp || 'None'} (Total comps: ${compCount})${flag}`);
  });
});

console.log(`\nMax single company category market share at generation: ${(maxShareOverall * 100).toFixed(1)}%`);
console.log(`Violations (>40%): ${violations}`);

if (violations === 0) {
  console.log('\nPROBE PASSED — Concentration at generation is balanced (all <= 40%).');
  process.exit(0);
} else {
  console.log(`\nPROBE FAILED with ${violations} violation(s).`);
  process.exit(1);
}
