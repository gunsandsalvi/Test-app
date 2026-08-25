import re

with open("src/engine/macro/initialization.ts", "r") as f:
    text = f.read()
    
# Replace segment generation
def repl_seg(m):
    s = m.group(0)
    s = s.replace("marginPct: 0.12 }", "marginPct: 0.12, debtUSD: 5_000_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 125_000_000_000 * scale }")
    s = s.replace("marginPct: 0.18 }", "marginPct: 0.18, debtUSD: 7_600_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 190_000_000_000 * scale }")
    s = s.replace("marginPct: 0.08 }", "marginPct: 0.08, debtUSD: 3_800_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 95_000_000_000 * scale }")
    s = s.replace("marginPct: 0.15 }", "marginPct: 0.15, debtUSD: 2_400_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 60_000_000_000 * scale }")
    s = s.replace("marginPct: 0.14 }", "marginPct: 0.14, debtUSD: 6_200_000_000_000 * scale, defaultRateAnnualPct: 0.02, capexUSD: 155_000_000_000 * scale }")
    return s
                     
text = re.sub(r'\{ segmentType:.*?\}', repl_seg, text)
with open("src/engine/macro/initialization.ts", "w") as f:
    f.write(text)

with open("src/components/screens/CommoditiesScreen.tsx", "r") as f:
    c = f.read()
    if "COMMODITY_QUANTITY_UNIT" not in c:
        c = c.replace("import { GameState", "import { COMMODITY_QUANTITY_UNIT, GameState")
        with open("src/components/screens/CommoditiesScreen.tsx", "w") as f2:
            f2.write(c)
            
with open("src/engine/simulation/core.ts", "r") as f:
    c = f.read()
    
# Find where comp is returned and replace
c = c.replace("growthCapex: estNewGrowthCapex,", "growthCapex: finalGrowthCapex,\n      rndExpense: newRndExpense,")
with open("src/engine/simulation/core.ts", "w") as f:
    f.write(c)
    
with open("src/engine/macro/evolution.ts", "r") as f:
    c = f.read()
c = c.replace("newPrivateSectorSegments", "newPrivateSectorSegments as any")
c = c.replace("COMMODITY_QUANTITY_UNIT, ", "")
c = c.replace("weeklySupplyUnits: supplyUnits,\n    weeklyDemandUnits: demandUnits,", "weeklySupplyUnits: supplyUnits,\n    weeklyDemandUnits: demandUnits,")
# Actually, I can just leave it or pass it.
with open("src/engine/macro/evolution.ts", "w") as f:
    f.write(c)

