const fs = require('fs');

let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

const regexes = [
  /let\s+updatedRegions\s*=/g,
  /let\s+updatedFxPairs\s*=/g,
  /let\s+updatedCommodities\s*=/g,
  /let\s+updatedCompanies\s*=/g,
  /let\s+updatedCompositeIndices\s*=/g,
  /let\s+recentIPOs\s*=/g,
  /let\s+recentMergers\s*=/g,
  /let\s+diagnosticLogs\s*=/g,
  /let\s+companyUpdates\s*=/g,
  /let\s+rateChanges\s*=/g,
  /let\s+ratingChanges\s*=/g,
  /let\s+earningsReportedThisTurn\s*=/g,
  /let\s+defaultedTickers\s*=/g,
  /let\s+mergerNews\s*=/g,
  /let\s+newsItems\s*=/g,
  /let\s+marketVolPremium\s*=/g,
  /let\s+workingPositions\s*=/g,
  /const\s+updatedRegions\s*=/g,
  /const\s+updatedFxPairs\s*=/g,
  /const\s+updatedCommodities\s*=/g,
  /const\s+updatedCompanies\s*=/g,
  /const\s+updatedCompositeIndices\s*=/g,
  /const\s+recentIPOs\s*=/g,
  /const\s+recentMergers\s*=/g,
  /const\s+diagnosticLogs\s*=/g,
  /const\s+companyUpdates\s*=/g,
  /const\s+rateChanges\s*=/g,
  /const\s+ratingChanges\s*=/g,
  /const\s+earningsReportedThisTurn\s*=/g,
  /const\s+defaultedTickers\s*=/g,
  /const\s+mergerNews\s*=/g,
  /const\s+newsItems\s*=/g,
  /const\s+marketVolPremium\s*=/g,
  /const\s+workingPositions\s*=/g,
];

// Let's just find the `advanceWeeklyStep` start, then replace all let/const of these vars inside it.
const funcStart = content.indexOf('export function advanceWeeklyStep');
if (funcStart > -1) {
  let prologueEnd = content.indexOf('// === STAGE 01');
  if (prologueEnd > -1) {
    let before = content.slice(0, prologueEnd);
    let body = content.slice(prologueEnd);
    
    for (const regex of regexes) {
      body = body.replace(regex, (match) => {
        return match.replace(/let\s+/, '').replace(/const\s+/, '');
      });
    }
    
    content = before + body;
  }
}

fs.writeFileSync('src/engine/simulation/core.ts', content);
