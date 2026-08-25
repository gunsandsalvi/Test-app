import re
with open('scripts/mega_probe.ts', 'r') as f:
    c = f.read()

c = c.replace("const contracts = state.marketState?.activeContracts || [];", "const contracts = Object.values(state.regions).flatMap(r => r.activeContracts || []);")
with open('scripts/mega_probe.ts', 'w') as f:
    f.write(c)

