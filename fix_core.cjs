const fs = require('fs');

let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

// Replace ctx.* references with just the variable name
// First, find all ctx.varName and replace with varName
content = content.replace(/ctx\.([a-zA-Z0-9_]+)/g, '$1');

// Replace redeclarations of let/const from the stages.
// Specifically:
// let mergerNews
// let defaultedTickers
// let earningsReportedThisTurn
// let ratingChanges
// let newsItems
// let rateChanges
// let updatedCompanies
// let updatedCompositeIndices
// let workingPositions

const varsToRemoveDecl = [
  'mergerNews', 'defaultedTickers', 'earningsReportedThisTurn', 'ratingChanges', 
  'newsItems', 'rateChanges', 'updatedCompanies', 'updatedCompositeIndices', 
  'workingPositions', 'recentIPOs', 'recentMergers', 'diagnosticLogs', 'companyUpdates',
  'updatedRegions', 'updatedFxPairs', 'updatedCommodities'
];

for (let v of varsToRemoveDecl) {
  const regex1 = new RegExp(`const\\s+${v}\\s*=`, 'g');
  const regex2 = new RegExp(`let\\s+${v}\\s*=`, 'g');
  // replace with just assignment except if it's the very first declaration in prologue
  // Actually, wait, it's easier to just let TS complain and then fix them one by one, 
  // or I can just change all const/let inside the stages to assignments.
}

// Let's just fix it automatically using tsc logs.
fs.writeFileSync('src/engine/simulation/core.ts', content);
