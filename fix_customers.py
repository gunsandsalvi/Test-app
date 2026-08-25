import re

with open('src/engine/simulation/core.ts', 'r') as f:
    text = f.read()

# Replace the customer selection block
old_customers = """      let customers: typeof regionActiveFirms = [];
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
      }"""

new_customers = "      const customers = regionActiveFirms.filter(c => !(c.productLines || []).some(l => l.subUnitId === subUnitId) && (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0) > 0);"

text = text.replace(old_customers, new_customers)

old_demand = """        let demandUSD = 0;
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
        }"""

new_demand = """        let demandUSD = 0;
        if (subUnitId === 'industrial_automation') {
          const realCapexUSD = comp.capex;
          demandUSD = (realCapexUSD / 52) * 0.35;
        } else {
          demandUSD = (comp.annualRevenue * (CORPORATE_DEMAND_INTENSITY[subUnitId] ?? 0)) / 52;
        }"""

text = text.replace(old_demand, new_demand)

if 'CORPORATE_DEMAND_INTENSITY' not in text:
    text = text.replace("import { INDUSTRY_SUBUNITS, Industry", "import { INDUSTRY_SUBUNITS, Industry, CORPORATE_DEMAND_INTENSITY")
    text = text.replace("import { INDUSTRY_SUBUNITS }", "import { INDUSTRY_SUBUNITS, CORPORATE_DEMAND_INTENSITY }")

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(text)

