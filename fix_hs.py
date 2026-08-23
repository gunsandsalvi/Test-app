import sys
import re

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# For getInitialRegions
text = text.replace(
    "householdDebtToIncomeRatio: 0.85,",
    "householdDebtToIncomeRatio: 0.85,\n        stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)

text = text.replace(
    "householdDebtToIncomeRatio: 0.70,",
    "householdDebtToIncomeRatio: 0.70,\n        stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)

text = text.replace(
    "householdDebtToIncomeRatio: 0.65,",
    "householdDebtToIncomeRatio: 0.65,\n        stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)

# For evolveRegionMacro fallback
text = text.replace(
    "householdDebtToIncomeRatio: prevHS.householdDebtToIncomeRatio,",
    "householdDebtToIncomeRatio: prevHS.householdDebtToIncomeRatio,\n        stapleSpendShare: newStapleShare, standardSpendShare: newStandardShare, luxurySpendShare: newLuxuryShare,"
)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)
    
print("Patched macroEngine.ts")
