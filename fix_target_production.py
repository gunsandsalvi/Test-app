import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace('(comp.annualRevenue * 0.02 / 52)', '(comp.annualRevenue / 52)')
c = c.replace('(newRevenue * 0.02 / 52)', '(newRevenue / 52)')

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
