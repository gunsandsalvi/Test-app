import re
with open('scripts/mega_probe.ts', 'r') as f:
    c = f.read()

c = c.replace("reg.centralBankRate.toFixed", "reg.policyRate.toFixed")
with open('scripts/mega_probe.ts', 'w') as f:
    f.write(c)
