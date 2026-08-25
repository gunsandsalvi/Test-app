import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace("const nextS = s + exportShareOfRev * (reg.gdpGrowth / 52);", "const nextS = s + Math.max(-0.02, Math.min(0.02, exportShareOfRev * (reg.gdpGrowth / 52)));")

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
