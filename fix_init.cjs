const fs = require('fs');
let content = fs.readFileSync('src/engine/macro/initialization.ts', 'utf8');

// Match any existing segmentType objects, even if they have scale and debtUSD
content = content.replace(/\{ segmentType: '([^']+)', employment: ([^,]+), annualRevenueUSD: ([^,]+), marginPct: ([^,}]+)[^\}]*\}/g, (match, type, emp, rev, margin) => {
    // If it's something like "2_200_000_000_000", keep it.
    // Ensure we strip out any existing debtUSD etc.
    let revClean = rev.replace(/_/g, '').trim();
    if (revClean.includes('*')) {
       // if it has * scale, just use it
    }
    return `{ segmentType: '${type}', employment: ${emp}, annualRevenueUSD: ${rev}, marginPct: ${margin}, debtUSD: ${rev} * 2, defaultRateAnnualPct: 0.02, capexUSD: ${rev} * 0.05 }`;
});

fs.writeFileSync('src/engine/macro/initialization.ts', content);
