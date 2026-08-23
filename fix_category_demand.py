import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = """    // Add Macro Diagnostic Telemetry to Log
    diagnosticLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });"""

replacement = """    // Add Macro Diagnostic Telemetry to Log
    diagnosticLogs.push({
      week: nextWeek,
      timestamp: new Date().toISOString(),
      category: 'MACRO',
      message: `[MACRO] ${regionId} GDP Breakdown:`,
      deltaText: diagnosticString,
      data: { regionId, isMeeting, rateDeltaBps }
    });
  });

  Object.keys(updatedRegions).forEach((regionIdKey) => {
    const regionId = regionIdKey as RegionId;
    const reg = updatedRegions[regionId];
    const hs = reg.householdState;

    // Household demand (G2)
    const aggregateConsumptionUSD = reg.estimatedHouseholdIncomeUSD * (1 - hs.savingsRate);
    const householdTargets: Partial<Record<string, number>> = {
      StapleHousehold: aggregateConsumptionUSD * hs.stapleSpendShare,
      StandardHousehold: aggregateConsumptionUSD * hs.standardSpendShare,
      LuxuryHousehold: aggregateConsumptionUSD * hs.luxurySpendShare,
    };

    // Government demand (G3), tied to fiscalStanceScore
    const govProcurementBase = reg.estimatedHouseholdIncomeUSD * 0.18;
    const fiscalMultiplier = 1 + Math.max(-0.3, Math.min(0.3, reg.fiscalStanceScore * 0.25));
    const govTargets: Partial<Record<string, number>> = {
      GovernmentDefense: govProcurementBase * 0.30 * fiscalMultiplier,
      GovernmentInfrastructure: govProcurementBase * 0.45 * fiscalMultiplier,
      GovernmentHealthcare: govProcurementBase * 0.25 * fiscalMultiplier,
    };

    // Corporate demand (G3), tied to aggregate CapEx
    const corporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const corpTargets: Partial<Record<string, number>> = {
      CorporateIndustrial: corporateDemandBase * 0.6,
      CorporateTech: corporateDemandBase * 0.4,
    };

    const allTargets = { ...householdTargets, ...govTargets, ...corpTargets };
    const smoothingByCategory: Partial<Record<string, number>> = {
      StapleHousehold: 0.1, StandardHousehold: 0.1, LuxuryHousehold: 0.1,
      GovernmentDefense: 0.05, GovernmentInfrastructure: 0.05, GovernmentHealthcare: 0.05,
      CorporateIndustrial: 0.08, CorporateTech: 0.08,
    };

    Object.keys(allTargets).forEach((cat) => {
      const target = (allTargets as any)[cat]!;
      const smoothing = (smoothingByCategory as any)[cat] ?? 0.1;
      const prevLevel = reg.categoryDemand[cat as keyof typeof reg.categoryDemand]?.demandLevelUSD ?? target;
      const newLevel = prevLevel * (1 - smoothing) + target * smoothing;
      const growthAnnual = prevLevel > 0 ? ((newLevel / prevLevel) - 1) * 52 : 0;
      (reg.categoryDemand as any)[cat] = { demandLevelUSD: newLevel, demandGrowthAnnual: growthAnnual };
    });
  });"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Patched category demand")
else:
    print("Could not find target block for category demand")

