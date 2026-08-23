import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = "const targetAnnualRevenue = baseRev * (1 + (reg.gdpGrowth * sectorGdpBeta) + consumerRevBoost + noise + reg.inflation * pricingPowerBeta + regimeTilt + financialsTilt);"

replacement = """let categoryDrivenGrowth = 0;
    const updatedProductLines = (comp.productLines || []).map((line) => {
      const catDemand = reg.categoryDemand[line.category as any];
      const categoryGrowth = catDemand?.demandGrowthAnnual ?? reg.gdpGrowth;
      const marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
      const targetCompetitiveness = Math.max(-1, Math.min(1, marginEdge * 10));
      const newCompetitiveness = Number((line.competitiveness * 0.98 + targetCompetitiveness * 0.02).toFixed(3));
      const shareGainRate = Math.max(-0.02, Math.min(0.02, newCompetitiveness * 0.04));
      const newCategoryMarketShare = Math.max(0.001, Math.min(0.6, line.categoryMarketShare * (1 + shareGainRate / 52)));
      const lineGrowth = categoryGrowth + shareGainRate;
      categoryDrivenGrowth += lineGrowth * line.revenueShare;
      return { ...line, competitiveness: newCompetitiveness, categoryMarketShare: newCategoryMarketShare };
    });
    const targetAnnualRevenue = baseRev * (1 + categoryDrivenGrowth + noise + reg.inflation * pricingPowerBeta);"""

text = text.replace(target, replacement)

# Add productLines: updatedProductLines to the return object
text = text.replace(
    "      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),\n      debtTranches: updatedTranches,",
    "      recoveryRate: Number(effectiveRecoveryRate.toFixed(3)),\n      debtTranches: updatedTranches,\n      productLines: updatedProductLines,"
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Updated simulation.ts for G4")
