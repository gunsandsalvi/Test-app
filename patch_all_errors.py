import re
import os

# Fix types.ts import in evolution.ts and core.ts
with open("src/engine/macro/evolution.ts", "r") as f:
    content = f.read()

if "COMMODITY_QUANTITY_UNIT" not in content:
    content = content.replace("COMMODITY_CATEGORY_LINKAGE }", "COMMODITY_CATEGORY_LINKAGE, COMMODITY_QUANTITY_UNIT }")
    
# Fix 3 args given to computeCommodityClearingRatio in evolution.ts
content = re.sub(r'const clearingRatio = computeCommodityClearingRatio\(([^,]+), ([^,]+), ([^\)]+)\);', r'const { ratio: clearingRatio, supplyUnits, demandUnits } = computeCommodityClearingRatio(\1, \2, \3, regions);', content)

# Fix newPrivateSectorSegments assigning back to Region
# wait, actually the new properties are present but I need to make sure they are preserved or generated
# Let's just suppress or fix the mapped types

with open("src/engine/macro/evolution.ts", "w") as f:
    f.write(content)

with open("src/engine/macro/initialization.ts", "r") as f:
    init_content = f.read()

# Fix dailyConsumptionUnits
init_content = re.sub(r'dailyConsumptionUnits:\s*[^,]+,', '', init_content)

# Fix generatePrivateSectorSegments if it didn't get patched properly
old_segments = [
    "{ segmentType: 'MANUFACTURING', employment: 15_000_000 * scale, annualRevenueUSD: 2_500_000_000_000 * scale, marginPct: 0.12 }",
    "{ segmentType: 'PROFESSIONAL_SERVICES', employment: 22_000_000 * scale, annualRevenueUSD: 3_800_000_000_000 * scale, marginPct: 0.18 }",
    "{ segmentType: 'RETAIL_TRADE', employment: 18_000_000 * scale, annualRevenueUSD: 1_900_000_000_000 * scale, marginPct: 0.08 }",
    "{ segmentType: 'CONSTRUCTION_REALESTATE', employment: 10_000_000 * scale, annualRevenueUSD: 1_200_000_000_000 * scale, marginPct: 0.15 }",
    "{ segmentType: 'HEALTHCARE_SERVICES', employment: 20_000_000 * scale, annualRevenueUSD: 3_100_000_000_000 * scale, marginPct: 0.14 }"
]
new_segments = [
    "{ segmentType: 'MANUFACTURING', employment: 15_000_000 * scale, annualRevenueUSD: 2_500_000_000_000 * scale, marginPct: 0.12, debtUSD: 5_000_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 125_000_000_000 * scale }",
    "{ segmentType: 'PROFESSIONAL_SERVICES', employment: 22_000_000 * scale, annualRevenueUSD: 3_800_000_000_000 * scale, marginPct: 0.18, debtUSD: 7_600_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 190_000_000_000 * scale }",
    "{ segmentType: 'RETAIL_TRADE', employment: 18_000_000 * scale, annualRevenueUSD: 1_900_000_000_000 * scale, marginPct: 0.08, debtUSD: 3_800_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 95_000_000_000 * scale }",
    "{ segmentType: 'CONSTRUCTION_REALESTATE', employment: 10_000_000 * scale, annualRevenueUSD: 1_200_000_000_000 * scale, marginPct: 0.15, debtUSD: 2_400_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 60_000_000_000 * scale }",
    "{ segmentType: 'HEALTHCARE_SERVICES', employment: 20_000_000 * scale, annualRevenueUSD: 3_100_000_000_000 * scale, marginPct: 0.14, debtUSD: 6_200_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 155_000_000_000 * scale }"
]

for o, n in zip(old_segments, new_segments):
    init_content = init_content.replace(o, n)
    
with open("src/engine/macro/initialization.ts", "w") as f:
    f.write(init_content)

# Fix core.ts
with open("src/engine/simulation/core.ts", "r") as f:
    core_content = f.read()

core_content = core_content.replace("import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche } from '../../types';", "import { CreditRating, NewsItem, Portfolio, ReturnAttribution, DebtTranche, GovDebtTranche, SupplyRelationship } from '../../types';")
# Remove any duplicate SupplyRelationship imports just in case

# Fix the unused variables
# I did:
# growthCapex: finalGrowthCapex,
# rndExpense: newRndExpense,
# maintenanceCapex: estNewMaintCapex,
# But wait, finalGrowthCapex was inside `estNewGrowthCapex` block but maybe out of scope for the return object?
# Let's find where they are returned.
with open("src/engine/simulation/core.ts", "w") as f:
    f.write(core_content)

