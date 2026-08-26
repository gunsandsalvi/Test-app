const fs = require('fs');

let content = fs.readFileSync('src/engine/simulation/core.ts', 'utf8');

// The prologue ends before `// === STAGE 01-macro-feedback.ts ===`
let prologueEnd = content.indexOf('// === STAGE 01');
if (prologueEnd > -1) {
  let before = content.slice(0, prologueEnd);
  let body = content.slice(prologueEnd);
  
  const badDecls = [
    /const\s+diagnosticLogs:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+newsItems:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+rateChanges:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+rateChanges:\s*\{\s*region:\s*RegionId;\s*deltaBps:\s*number\s*\}\[\]\s*=\s*\[\];/g,
    /const\s+ratingChanges:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+earningsReportedThisTurn:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+defaultedTickers:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+mergerNews:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+recentIPOs:\s*any\[\]\s*=\s*\[\];/g,
    /const\s+recentMergers:\s*any\[\]\s*=\s*\[\];/g,
    /let\s+updatedRegions\s*=\s*\{\s*\.\.\.state\.regions\s*\};/g,
    /const\s+updatedRegions\s*=\s*\{\s*\.\.\.state\.regions\s*\};/g,
    /let\s+updatedFxPairs\s*=\s*\[\.\.\.state\.fxPairs\];/g,
    /let\s+updatedCompanies\s*=\s*\[\.\.\.state\.companies\];/g,
    /const\s+updatedCompanies\s*=\s*\[\.\.\.state\.companies\];/g,
    /let\s+updatedCommodities\s*=\s*\[\.\.\.state\.commodities\];/g,
    /let\s+updatedCompositeIndices\s*=\s*\{\s*\.\.\.state\.compositeIndices\s*\};/g,
    /const\s+prevActiveFirms\s*=\s*state\.companies\.filter\(\(c\) => isActiveCompany\(c\)\);/g,
    /const\s+prevActiveFirms\s*=\s*state\.companies\.filter\(isActiveCompany\);/g,
    /const\s+ratingChanges:\s*\{[^}]*\}\[\]\s*=\s*\[\];/g,
    /const\s+mergerNews:\s*NewsItem\[\]\s*=\s*\[\];/g,
    /const\s+defaultedTickers:\s*string\[\]\s*=\s*\[\];/g,
    /const\s+earningsReportedThisTurn:\s*EarningsReportEvent\[\]\s*=\s*\[\];/g,
    /const\s+newsItems:\s*NewsItem\[\]\s*=\s*\[\];/g,
    /let\s+newsItems:\s*NewsItem\[\]\s*=\s*\[\];/g
  ];

  for (const regex of badDecls) {
    body = body.replace(regex, '');
  }
  
  // also fix salesUnits, salesUSD, cashChange, purchasesUnits, purchasesUSD in companyUpdates
  body = body.replace(/companyUpdates\[([^\]]+)\]\.salesUnits/g, 'companyUpdates[$1].salesUnits'); // this won't fix TS, we need to cast or something
  // Wait, I can just replace `companyUpdates: Record<string, Partial<Company>>` with `Record<string, any>` in prologue.
  
  content = before + body;
}

fs.writeFileSync('src/engine/simulation/core.ts', content);
