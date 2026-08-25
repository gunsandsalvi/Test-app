import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace('state.compositeIndices.globalEquity.level', 'state.compositeIndices[comp.region].level')
c = c.replace('state.compositeIndices.globalEquity.previousLevel', 'state.compositeIndices[comp.region].previousLevel')

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
