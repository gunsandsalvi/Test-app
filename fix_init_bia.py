import re
with open('src/engine/simulation/initialization.ts', 'r') as f:
    c = f.read()

c = c.replace("entityType: role,", "entityType: role,\n        financialStatementProfile: comp.financialStatementProfile,")

with open('src/engine/simulation/initialization.ts', 'w') as f:
    f.write(c)

