import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

insert = """  const newRealConsumptionGrowth = (1 - newSavingsRate) * (newWageGrowth - region.inflation) * (newCCI / 100) + equityWealthEffect - debtServiceBurden;

  const wealthSignal = Math.max(-0.02, Math.min(0.02, equityReturn * 0.3 + (newCCI - 100) / 100 * 0.01));
  const targetLuxuryShare = Math.max(0.05, Math.min(0.30, prevHS.luxurySpendShare + wealthSignal));
  const targetStapleShare = Math.max(0.25, Math.min(0.55, prevHS.stapleSpendShare - wealthSignal * 0.6));
  const newLuxuryShare = Number((prevHS.luxurySpendShare * 0.95 + targetLuxuryShare * 0.05).toFixed(4));
  const newStapleShare = Number((prevHS.stapleSpendShare * 0.95 + targetStapleShare * 0.05).toFixed(4));
  const newStandardShare = Number(Math.max(0.15, 1 - newLuxuryShare - newStapleShare).toFixed(4));"""

text = text.replace(
    "  const newRealConsumptionGrowth = (1 - newSavingsRate) * (newWageGrowth - region.inflation) * (newCCI / 100) + equityWealthEffect - debtServiceBurden;",
    insert
)

text = text.replace(
    "    householdDebtToIncomeRatio: prevHS.householdDebtToIncomeRatio,\n  };",
    "    householdDebtToIncomeRatio: prevHS.householdDebtToIncomeRatio,\n    stapleSpendShare: newStapleShare,\n    standardSpendShare: newStandardShare,\n    luxurySpendShare: newLuxuryShare,\n  };"
)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)
    
print("Updated macroEngine.ts for G2")
