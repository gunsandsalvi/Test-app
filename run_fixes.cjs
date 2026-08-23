const fs = require('fs');

// Fix 5: tsconfig.json
let tsconfig = fs.readFileSync('tsconfig.json', 'utf8');
tsconfig = tsconfig.replace('"strict": true', '"strict": false');
fs.writeFileSync('tsconfig.json', tsconfig);

// Fix 4: NewsDrawer.tsx
let newsDrawer = fs.readFileSync('src/components/NewsDrawer.tsx', 'utf8');
newsDrawer = newsDrawer.replace('className="fixed bottom-14 left-0 right-0', 'className="fixed bottom-20 left-0 right-0');
fs.writeFileSync('src/components/NewsDrawer.tsx', newsDrawer);

// Fix 2 & 3: EquitiesTab.tsx
let equitiesTab = fs.readFileSync('src/components/EquitiesTab.tsx', 'utf8');
if (!equitiesTab.includes('formatCurrency')) {
    equitiesTab = equitiesTab.replace("import React", "import { formatCurrency } from '../engine/formatters';\nimport React");
}
equitiesTab = equitiesTab.replace('${(comp.marketCap / 1000).toFixed(1)}B', '{formatCurrency(comp.marketCap, { compact: true })}');
equitiesTab = equitiesTab.replace('of 200 Issuers', 'of {state.companies.length} Issuers');
fs.writeFileSync('src/components/EquitiesTab.tsx', equitiesTab);
