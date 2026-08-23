import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# restore to original
text = text.replace("householdDebtToIncomeRatio: 1.0, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15", "householdDebtToIncomeRatio: 1.0")
text = text.replace("householdDebtToIncomeRatio: 0.95, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,", "householdDebtToIncomeRatio: 0.95,")
text = text.replace("householdDebtToIncomeRatio: 1.1, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,", "householdDebtToIncomeRatio: 1.1,")
text = text.replace("householdDebtToIncomeRatio: 0.8, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,", "householdDebtToIncomeRatio: 0.8,")

text = text.replace(
    "householdDebtToIncomeRatio: 1.0,",
    "householdDebtToIncomeRatio: 1.0, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)
text = text.replace(
    "householdDebtToIncomeRatio: 1.0 }",
    "householdDebtToIncomeRatio: 1.0, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15 }"
)
text = text.replace(
    "householdDebtToIncomeRatio: 0.95,",
    "householdDebtToIncomeRatio: 0.95, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)
text = text.replace(
    "householdDebtToIncomeRatio: 1.1,",
    "householdDebtToIncomeRatio: 1.1, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)
text = text.replace(
    "householdDebtToIncomeRatio: 0.8,",
    "householdDebtToIncomeRatio: 0.8, stapleSpendShare: 0.35, standardSpendShare: 0.50, luxurySpendShare: 0.15,"
)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

