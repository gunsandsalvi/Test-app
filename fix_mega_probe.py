import re
with open('scripts/mega_probe.ts', 'r') as f:
    c = f.read()

c = c.replace("reg.unemployment.toFixed", "reg.unemploymentRate.toFixed")
with open('scripts/mega_probe.ts', 'w') as f:
    f.write(c)

