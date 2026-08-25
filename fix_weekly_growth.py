import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace("const weeklyGrowthRate = (annualGrowthRate / 52) + exportRevenueBoost;", "const weeklyGrowthRate = Math.max(-0.05, Math.min(0.05, (annualGrowthRate / 52) + exportRevenueBoost));")

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
