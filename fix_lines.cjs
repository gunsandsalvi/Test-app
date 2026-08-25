const fs = require('fs');

const lines = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8').split('\n');

// 1. Find the customer block: 
// let customers: Company[] = [];
// ... until '      // Suppliers submit unit offers'

let customerStart = -1, customerEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('let customers: Company[] = [];')) customerStart = i;
  if (lines[i].includes('// Suppliers submit unit offers')) {
    if (customerStart !== -1 && customerEnd === -1) customerEnd = i;
  }
}

if (customerStart !== -1 && customerEnd !== -1) {
  lines.splice(customerStart, customerEnd - customerStart, 
    "      const customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === subUnitId) && (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0) > 0);"
  );
} else {
  console.log("Could not find customer block!");
}

// 2. Find the demandUSD block
// let demandUSD = 0;
// if (subUnitId === 'industrial_automation') {
// ... until 'const demandUnits = demandUSD / currentUnitPrice;'

let demandStart = -1, demandEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('let demandUSD = 0;')) demandStart = i;
  if (lines[i].includes('const demandUnits = demandUSD / currentUnitPrice;')) {
    if (demandStart !== -1 && demandEnd === -1) demandEnd = i;
  }
}

if (demandStart !== -1 && demandEnd !== -1) {
  lines.splice(demandStart, demandEnd - demandStart, 
    "        let demandUSD = 0;",
    "        if (subUnitId === 'industrial_automation') {",
    "          const realCapexUSD = (comp.maintenanceCapex ?? 0) + (comp.growthCapex ?? 0);",
    "          demandUSD = (realCapexUSD / 52) * 0.35;",
    "        } else {",
    "          demandUSD = (comp.annualRevenue * (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0)) / 52;",
    "        }"
  );
} else {
  console.log("Could not find demandUSD block!");
}

// 3. Find duplicate government bid block
// // Government Aggregate Bid (PART AYA: pharmaceuticals 45%, passenger_vehicles 5%)
// ... until '      // Household Aggregate Bid' or similar.
// Wait, we already deleted it with python but it didn't work. Let's find it.
let govStart = -1, govEnd = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// Government Aggregate Bid (PART AYA')) govStart = i;
  if (lines[i].includes('// Household Aggregate Bid')) {
    if (govStart !== -1 && govEnd === -1) govEnd = i;
  }
}

if (govStart !== -1 && govEnd !== -1) {
  lines.splice(govStart, govEnd - govStart);
} else {
  console.log("Could not find gov bid block!");
}

// Add import
let text = lines.join('\n');
if (!text.includes('CORPORATE_DEMAND_INTENSITY')) {
  text = text.replace(
    /import \{ INDUSTRY_SUBUNITS, Industry/g,
    "import { INDUSTRY_SUBUNITS, Industry, CORPORATE_DEMAND_INTENSITY"
  );
  text = text.replace(
    /import \{ INDUSTRY_SUBUNITS \}/g,
    "import { INDUSTRY_SUBUNITS, CORPORATE_DEMAND_INTENSITY }"
  );
}

fs.writeFileSync('src/engine/simulation/core.ts', text);
