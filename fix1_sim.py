import sys
import re

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = """  Object.keys(regions).forEach(r => {
    const regComps = companies.filter(c => c.region === r);
    const cats = Object.keys(regions[r as any].categoryDemand);
    cats.forEach(cat => {
      let sum = 0;
      regComps.forEach(c => {
        (c.productLines || []).forEach(line => {
          if (line.category === cat) {
            sum += line.revenueShare * c.annualRevenue;
          }
        });
      });
      regions[r as any].categoryDemand[cat as any].demandLevelUSD = sum;
    });
  });"""

replacement = """  Object.keys(regions).forEach(r => {
    const regionId = r as RegionId;
    const reg = regions[regionId];
    const hs = reg.householdState;
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const govBase = reg.estimatedHouseholdIncomeUSD * 0.18;
    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    const targets: Record<string, number> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
      GovernmentDefense: govBase * 0.30, 
      GovernmentInfrastructure: govBase * 0.45, 
      GovernmentHealthcare: govBase * 0.25,
      CorporateIndustrial: corpBase * 0.6, 
      CorporateTech: corpBase * 0.4,
    };
    Object.keys(targets).forEach(cat => {
      (regions[regionId].categoryDemand as any)[cat] = { demandLevelUSD: targets[cat], demandGrowthAnnual: 0 };
    });
  });"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Replaced exact target")
else:
    print("Target not found")
