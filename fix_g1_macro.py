import sys
import re

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# Add CategoryDemand to Region
# But we can just initialize it to an empty object, and then in `createInitialGameState`, populate it properly.
# Actually, typescript requires all fields.
empty_cat = """categoryDemand: {
        StapleHousehold: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        StandardHousehold: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        LuxuryHousehold: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        CorporateIndustrial: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        CorporateTech: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        GovernmentDefense: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        GovernmentInfrastructure: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
        GovernmentHealthcare: { demandLevelUSD: 0, demandGrowthAnnual: 0 },
      },"""

# Add it after `name:` in region creation
text = re.sub(r"(name: 'United States',)", r"\1\n      " + empty_cat, text)
text = re.sub(r"(name: 'United Kingdom',)", r"\1\n      " + empty_cat, text)
text = re.sub(r"(name: 'Japan',)", r"\1\n      " + empty_cat, text)
text = re.sub(r"(name: 'Eurozone',)", r"\1\n      " + empty_cat, text)

# Add household shares
shares = "stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15, "
text = re.sub(r"(householdDebtToIncomeRatio: 1.5,)", r"\1\n        " + shares, text)
text = re.sub(r"(householdDebtToIncomeRatio: 1.3,)", r"\1\n        " + shares, text)
text = re.sub(r"(householdDebtToIncomeRatio: 1.8,)", r"\1\n        " + shares, text)
text = re.sub(r"(householdDebtToIncomeRatio: 0.9,)", r"\1\n        " + shares, text)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

print("Updated macroEngine.ts")
