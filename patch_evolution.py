import re
import os

with open("src/engine/macro/evolution.ts", "r") as f:
    content = f.read()

# Add import for COMMODITY_CATEGORY_LINKAGE if missing
if "COMMODITY_CATEGORY_LINKAGE" not in content:
    content = content.replace("PRIVATE_SEGMENT_OCCUPATION_MIX, BASE_ANNUAL_WAGE_USD, Company }", "PRIVATE_SEGMENT_OCCUPATION_MIX, BASE_ANNUAL_WAGE_USD, Company, COMMODITY_CATEGORY_LINKAGE }")

# Replace computeCommodityClearingRatio
old_clearing = """function computeCommodityClearingRatio(commodityId: string, allCompanies: Company[], comm: Commodity): number {
  const producers = allCompanies.filter(c => c.producedCommodityId === commodityId && !c.isDefaulted);
  const totalWeeklySupplyUSD = producers.reduce((s, c) => s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52, 0);
  const impliedDemandUSD = comm.spotPrice * (comm as any).dailyConsumptionUnits * 7; 
  return totalWeeklySupplyUSD > 0 ? impliedDemandUSD / totalWeeklySupplyUSD : 1.0;
}"""

new_clearing = """function computeCommodityClearingRatio(commodityId: string, allCompanies: Company[], comm: Commodity, regions: Record<RegionId, Region>): { ratio: number; supplyUnits: number; demandUnits: number } {
  const producers = allCompanies.filter(c => c.producedCommodityId === commodityId && !c.isDefaulted);
  const weeklySupplyUSD = producers.reduce((s, c) => s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52, 0);
  const supplyUnits = comm.spotPrice > 0 ? weeklySupplyUSD / comm.spotPrice : 0;

  const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId] || COMMODITY_CATEGORY_LINKAGE[comm.symbol];
  const totalCategoryDemandUSD = linkage ? (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => {
    const catDemand = (regions[r].categoryDemand as any)[linkage.category];
    return s + (catDemand?.demandLevelUSD ?? 0);
  }, 0) : 0;
  const weeklyDemandUSD = (totalCategoryDemandUSD * (linkage?.intensityShare ?? 0)) / 52;
  const demandUnits = comm.spotPrice > 0 ? weeklyDemandUSD / comm.spotPrice : 0;

  const ratio = supplyUnits > 0 ? demandUnits / supplyUnits : 1.0;
  return { ratio, supplyUnits, demandUnits };
}"""
content = content.replace(old_clearing, new_clearing)

# Evolve commodity
content = content.replace("const clearingRatio = computeCommodityClearingRatio(comm.id || comm.symbol, allCompanies, comm);", "const { ratio: clearingRatio, supplyUnits, demandUnits } = computeCommodityClearingRatio(comm.id || comm.symbol, allCompanies, comm, regions);")
content = content.replace("const supplyDemandDrift = Math.max(-0.2, Math.min(0.2, (clearingRatio - 1.0) * 0.15));", "const supplyDemandDrift = (clearingRatio - 1.0) * 0.15;")
content = content.replace("const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(drift * 0.4 + supplyDemandDrift)).toFixed(2)));", """const rawDriftExponent = drift * 0.4 + supplyDemandDrift;
  const safeDriftExponent = isFinite(rawDriftExponent) ? rawDriftExponent : 0;
  const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(safeDriftExponent)).toFixed(2)));""")

content = content.replace("return {\n    ...comm,\n    spotPrice: newSpot,\n    drift: change1W,\n  };", "return {\n    ...comm,\n    spotPrice: newSpot,\n    drift: change1W,\n    weeklySupplyUnits: supplyUnits,\n    weeklyDemandUnits: demandUnits,\n  };")

with open("src/engine/macro/evolution.ts", "w") as f:
    f.write(content)

