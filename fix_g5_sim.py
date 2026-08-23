import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

# Add import
text = text.replace(
    "import { generateInitialCompanies, FIXED_SHARE_BY_RATING } from './companyGenerator';",
    "import { generateInitialCompanies, FIXED_SHARE_BY_RATING, generateIPOCompany } from './companyGenerator';"
)

# Add checkForIPO function
insert_check = """
function checkForIPO(regionId: RegionId, reg: Region, companies: Company[], week: number): Company | null {
  if (week % 26 !== 0) return null;
  const categories = Object.keys(reg.categoryDemand) as string[];
  for (const cat of categories) {
    const demand = reg.categoryDemand[cat];
    if (!demand || demand.demandGrowthAnnual < 0.04) continue;
    const incumbents = companies.filter(c => c.region === regionId && !c.isDefaulted && (c.productLines || []).some(l => l.category === cat));
    const incumbentGrowthProxy = incumbents.length ? incumbents.reduce((s, c) => s + (c.annualRevenue - c.baselineAnnualRevenue) / Math.max(1, c.baselineAnnualRevenue), 0) / incumbents.length : 0;
    const supplyGap = demand.demandGrowthAnnual - incumbentGrowthProxy;
    if (supplyGap > 0.03 && Math.random() < 0.35) {
      return generateIPOCompany(regionId, cat, demand.demandLevelUSD, week);
    }
  }
  return null;
}
"""

text = text.replace("export function advanceWeeklyStep(state: GameState): GameState {", insert_check + "\nexport function advanceWeeklyStep(state: GameState): GameState {")

# Call checkForIPO
call_ipo = """
    // G5: IPO Mechanic
    const ipo = checkForIPO(regionId, reg, state.companies, nextWeek);
    if (ipo) {
      updatedCompanies.push(ipo);
      diagnosticLogs.push({ region: regionId, type: 'News', message: `New IPO: ${ipo.name} enters ${ipo.productLines?.[0]?.category} amid strong demand growth` });
    }
"""

text = text.replace(
    "    reg.categoryDemand[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };\n    });\n  });",
    "    reg.categoryDemand[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };\n    });\n" + call_ipo + "\n  });"
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)
    
print("Added G5 logic to simulation.ts")
