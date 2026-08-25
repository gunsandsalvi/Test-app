import re
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()

price_logic = """
          let initialPrice = undefined;
          if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
          if (su.unitId === 'refined_products') initialPrice = 3.50;
          if (su.unitId === 'food_beverage') initialPrice = 10.0;
          if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
          if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
          if (su.unitId === 'semiconductors') initialPrice = 10.0;
          if (su.unitId === 'defense_systems') initialPrice = 2000000.0;
"""

old_logic = "unitPriceUSD: su.unitId === 'industrial_automation' ? 80000.0 : undefined,"
new_logic = price_logic + "          unitPriceUSD: initialPrice,"

c = c.replace(old_logic, new_logic)

with open('src/engine/simulation/initialization.ts', 'w') as f:
    f.write(c)
