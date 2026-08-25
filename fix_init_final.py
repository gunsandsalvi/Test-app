import re
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()

# First let's remove the broken `unitPriceUSD: initialPrice`
c = c.replace("          unitPriceUSD: initialPrice,", "          unitPriceUSD: su.unitId === 'industrial_automation' ? 80000.0 : undefined,")

# Now let's inject correctly
good_logic = """
        let initialPrice = undefined;
        if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
        if (su.unitId === 'refined_products') initialPrice = 3.50;
        if (su.unitId === 'food_beverage') initialPrice = 10.0;
        if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
        if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
        if (su.unitId === 'semiconductors') initialPrice = 10.0;
        if (su.unitId === 'defense_systems') initialPrice = 2000000.0;

        return {
          unitId: su.unitId,
          demandLevelUSD,
          demandGrowthAnnual: reg.gdpGrowth ?? 0.02,
          demandHistory: [demandLevelUSD],
          crowdingIntensity: 0.1,
          inventoryLevelUSD: demandLevelUSD * 0.10,
          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,
          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          unitPriceUSD: initialPrice,
        };"""
        
# Find the specific block to replace
target = """        return {
          unitId: su.unitId,
          demandLevelUSD,
          demandGrowthAnnual: reg.gdpGrowth ?? 0.02,
          demandHistory: [demandLevelUSD],
          crowdingIntensity: 0.1,
          inventoryLevelUSD: demandLevelUSD * 0.10,
          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,
          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          unitPriceUSD: su.unitId === 'industrial_automation' ? 80000.0 : undefined,
        };"""
        
c = c.replace(target, good_logic)
with open('src/engine/simulation/initialization.ts', 'w') as f:
    f.write(c)

