import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace('_targetProductionUSD: targetProductionUSD,', '_targetProductionUSD: (companyUpdates[comp.ticker]?._targetProductionUSD ?? targetProductionUSD),')
with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
