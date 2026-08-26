const fs = require('fs');
let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

const vars = [
  'defaultedTickers', 'diagnosticLogs', 'earningsReportedThisTurn',
  'mergerNews', 'newsItems', 'prevActiveFirms', 'rateChanges',
  'ratingChanges', 'updatedCommodities', 'updatedCompanies',
  'updatedCompositeIndices', 'updatedFxPairs', 'updatedRegions'
];

for (let v of vars) {
  let count = 0;
  content = content.replace(new RegExp(`(?:const|let)\\s+${v}\\s*=`, 'g'), (match) => {
    count++;
    if (count === 1) return match; // keep the first one
    return `${v} =`; // replace subsequent ones
  });
}

fs.writeFileSync('src/engine/simulation/core.ts', content);
