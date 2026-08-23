import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

insert = """  (Object.keys(state.regions) as string[]).forEach((regionId) => {
    const reg = updatedRegions[regionId as any];
    const hs = reg.householdState;
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const categoryTargets: Partial<Record<string, number>> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
    };
    (Object.keys(categoryTargets) as string[]).forEach((cat) => {
      const prevLevel = reg.categoryDemand[cat]?.demandLevelUSD ?? categoryTargets[cat as keyof typeof categoryTargets]!;
      const newLevel = prevLevel * 0.9 + categoryTargets[cat as keyof typeof categoryTargets]! * 0.1;
      const growthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      reg.categoryDemand[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };
    });

    const govProcurementBase = reg.estimatedHouseholdIncomeUSD * 0.18;
    const fiscalMultiplier = 1 + Math.max(-0.3, Math.min(0.3, reg.fiscalStanceScore * 0.25));
    const govCategoryTargets: Partial<Record<string, number>> = {
      GovernmentDefense: govProcurementBase * 0.30 * fiscalMultiplier,
      GovernmentInfrastructure: govProcurementBase * 0.45 * fiscalMultiplier,
      GovernmentHealthcare: govProcurementBase * 0.25 * fiscalMultiplier,
    };
    (Object.keys(govCategoryTargets) as string[]).forEach((cat) => {
      const prevLevel = reg.categoryDemand[cat]?.demandLevelUSD ?? govCategoryTargets[cat as keyof typeof govCategoryTargets]!;
      const newLevel = prevLevel * 0.95 + govCategoryTargets[cat as keyof typeof govCategoryTargets]! * 0.05;
      const growthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      reg.categoryDemand[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };
    });

    const corporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const corpCategoryTargets: Partial<Record<string, number>> = {
      CorporateIndustrial: corporateDemandBase * 0.6,
      CorporateTech: corporateDemandBase * 0.4,
    };
    (Object.keys(corpCategoryTargets) as string[]).forEach((cat) => {
      const prevLevel = reg.categoryDemand[cat]?.demandLevelUSD ?? corpCategoryTargets[cat as keyof typeof corpCategoryTargets]!;
      const newLevel = prevLevel * 0.92 + corpCategoryTargets[cat as keyof typeof corpCategoryTargets]! * 0.08;
      const growthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      reg.categoryDemand[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };
    });
  });"""

text = text.replace(
    "  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {\n    const boundedGdpContribution",
    insert + "\n  (Object.keys(state.regions) as RegionId[]).forEach((regionId) => {\n    const boundedGdpContribution"
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Updated simulation.ts for G2 and G3")
