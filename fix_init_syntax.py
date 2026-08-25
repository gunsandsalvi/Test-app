import re
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()

bad_logic = """          lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
          
          let initialPrice = undefined;
          if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
          if (su.unitId === 'refined_products') initialPrice = 3.50;
          if (su.unitId === 'food_beverage') initialPrice = 10.0;
          if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
          if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
          if (su.unitId === 'semiconductors') initialPrice = 10.0;
          if (su.unitId === 'defense_systems') initialPrice = 2000000.0;
          unitPriceUSD: initialPrice,
        };"""

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

c = c.replace("""        return {
          unitId: su.unitId,
          demandLevelUSD,
          demandGrowthAnnual: reg.gdpGrowth ?? 0.02,
          demandHistory: [demandLevelUSD],
          crowdingIntensity: 0.1,
          inventoryLevelUSD: demandLevelUSD * 0.10,
          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,""", good_logic.split("""          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,""")[0] + """          inputCostPressure: 0,
          clearedInputPriceIndex: 1.0,""")

# Actually let me just replace the exact block.
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()
    
# Remove the bad logic from where it is
c = c.replace("""          let initialPrice = undefined;
          if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
          if (su.unitId === 'refined_products') initialPrice = 3.50;
          if (su.unitId === 'food_beverage') initialPrice = 10.0;
          if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
          if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
          if (su.unitId === 'semiconductors') initialPrice = 10.0;
          if (su.unitId === 'defense_systems') initialPrice = 2000000.0;
""", "")

new_return = """
        let initialPrice = undefined;
        if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
        if (su.unitId === 'refined_products') initialPrice = 3.50;
        if (su.unitId === 'food_beverage') initialPrice = 10.0;
        if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
        if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
        if (su.unitId === 'semiconductors') initialPrice = 10.0;
        if (su.unitId === 'defense_systems') initialPrice = 2000000.0;

        return {"""
        
c = c.replace("return {", new_return)

with open('src/engine/simulation/initialization.ts', 'w') as f:
    f.write(c)
