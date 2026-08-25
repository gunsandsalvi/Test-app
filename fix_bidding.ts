import fs from 'fs';
import { INDUSTRY_SUBUNITS } from './src/types';

let text = fs.readFileSync('src/engine/simulation/core.ts', 'utf-8');

// 2a. Delete duplicate government bid block
const pattern = /\/\/ Government Aggregate Bid \(PART AYA: pharmaceuticals 45%, passenger_vehicles 5%\).*?bids\.push\(\{ isGovernmentAggregate: true[^}]+\}\);\n\s*\}/s;
text = text.replace(pattern, "");

// Replace customer selection
const oldCustomerBlock = `      let customers: typeof regionActiveFirms = [];
      if (subUnitId === 'industrial_automation') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'industrial_automation'));
      } else if (subUnitId === 'refined_products') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'refined_products') && c.sector !== 'Banks' && c.sector !== 'Financials');
      } else if (subUnitId === 'food_beverage') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'food_beverage') && c.sector !== 'Banks' && c.sector !== 'Tech');
      } else if (subUnitId === 'pharmaceuticals') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'pharmaceuticals') && c.sector !== 'Tech');
      } else if (subUnitId === 'passenger_vehicles') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'passenger_vehicles'));
      } else if (subUnitId === 'semiconductors') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'semiconductors'));
      } else if (subUnitId === 'defense_systems') {
        customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === 'defense_systems'));
      }`;

const newCustomerBlock = `      const customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === subUnitId) && (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0) > 0);`;

text = text.replace(oldCustomerBlock, newCustomerBlock);

// Replace demandUSD block
const oldDemandBlock = `        let demandUSD = 0;
        if (subUnitId === 'industrial_automation') {
          const realCapexUSD = comp.capex;
          demandUSD = (realCapexUSD / 52) * 0.35;
        } else if (subUnitId === 'refined_products') {
          demandUSD = (comp.annualRevenue * 0.025) / 52;
        } else if (subUnitId === 'food_beverage') {
          demandUSD = (comp.annualRevenue * 0.01) / 52;
        } else if (subUnitId === 'pharmaceuticals') {
          demandUSD = (comp.annualRevenue * 0.008) / 52;
        } else if (subUnitId === 'passenger_vehicles') {
          demandUSD = (comp.annualRevenue * 0.015) / 52;
        } else if (subUnitId === 'semiconductors') {
          demandUSD = (comp.annualRevenue * 0.02) / 52;
        } else if (subUnitId === 'defense_systems') {
          demandUSD = (comp.annualRevenue * 0.03) / 52;
        }`;

const newDemandBlock = `        let demandUSD = 0;
        if (subUnitId === 'industrial_automation') {
          const realCapexUSD = comp.capex;
          demandUSD = (realCapexUSD / 52) * 0.35;
        } else {
          demandUSD = (comp.annualRevenue * (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0)) / 52;
        }`;

text = text.replace(oldDemandBlock, newDemandBlock);

// Add import of CORPORATE_DEMAND_INTENSITY to core.ts
if (!text.includes('CORPORATE_DEMAND_INTENSITY')) {
  text = text.replace(
    /import \{ INDUSTRY_SUBUNITS, Industry/g,
    "import { INDUSTRY_SUBUNITS, Industry, CORPORATE_DEMAND_INTENSITY"
  );
  // Also try importing from domain/industry if the previous didn't work
  text = text.replace(
    /import \{ INDUSTRY_SUBUNITS \}/g,
    "import { INDUSTRY_SUBUNITS, CORPORATE_DEMAND_INTENSITY }"
  );
}

fs.writeFileSync('src/engine/simulation/core.ts', text);

// Now generate domain/industry.ts
let ind_text = fs.readFileSync('src/domain/industry.ts', 'utf-8');

if (!ind_text.includes('CORPORATE_DEMAND_INTENSITY')) {
  let entries = [];
  const hardcoded = {
    industrial_automation: 0.10,
    refined_products: 0.025,
    food_beverage: 0.01,
    pharmaceuticals: 0.008,
    passenger_vehicles: 0.015,
    semiconductors: 0.02,
    defense_systems: 0.03,
  };
  
  for (const group of Object.values(INDUSTRY_SUBUNITS)) {
    for (const su of group) {
      if (hardcoded[su.unitId]) {
        entries.push(\`  \${su.unitId}: \${hardcoded[su.unitId]},\`);
      } else {
        const defaultVal = 0.01 * su.buyerMix.CORPORATE / 0.5;
        entries.push(\`  \${su.unitId}: \${defaultVal},\`);
      }
    }
  }

  const code = \`\nexport const CORPORATE_DEMAND_INTENSITY: Record<string, number> = {\n\${entries.join('\\n')}\n};\n\`;
  fs.writeFileSync('src/domain/industry.ts', ind_text + code);
  
  // also add it to src/types.ts so we can export it properly if needed, but it's better to just import from domain/industry.ts.
  let types = fs.readFileSync('src/types.ts', 'utf-8');
  if (types.includes("export * from './domain/industry';")) {
    // it's already re-exported
  }
}
