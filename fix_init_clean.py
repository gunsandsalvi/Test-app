import re
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()

# Fix the main return block
c = c.replace("""        let initialPrice = undefined;
        if (su.unitId === 'industrial_automation') initialPrice = 80000.0;
        if (su.unitId === 'refined_products') initialPrice = 3.50;
        if (su.unitId === 'food_beverage') initialPrice = 10.0;
        if (su.unitId === 'pharmaceuticals') initialPrice = 120.0;
        if (su.unitId === 'passenger_vehicles') initialPrice = 35000.0;
        if (su.unitId === 'semiconductors') initialPrice = 10.0;
        if (su.unitId === 'defense_systems') initialPrice = 2000000.0;

        return {""", "  return {")

with open('src/engine/simulation/initialization.ts', 'w') as f:
    f.write(c)

