import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

# I will move the margin computation up before updatedProductLines.
target_margin = """      // Operating margins update (Wage-Push compression)
      const wageSensitivity = SECTOR_WAGE_SENSITIVITY[comp.sector] ?? 1.0;
      const wageCompression = Math.max(0, reg.householdState.wageGrowth - 0.025) * 0.15 * wageSensitivity;
      baseEbitdaMargin = comp.ebitda / Math.max(1, comp.annualRevenue);
      newEbitdaMargin = Math.min(0.65, Math.max(0.02, baseEbitdaMargin + (Math.random() - 0.5) * 0.004 - (wageCompression / 52)));"""

target_prod = """      let categoryDrivenGrowth = 0;
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
    const targetAnnualRevenue = baseRev * (1 + categoryDrivenGrowth + noise + reg.inflation * pricingPowerBeta);
      
      // Smooth transition to target revenue (no exponential weekly compounding)
      newRevenue = Math.max(10, (comp.annualRevenue * 0.90) + (targetAnnualRevenue * 0.10));"""

text = text.replace(target_prod + "\n\n" + target_margin, target_margin + "\n\n" + target_prod)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Fixed scope")
