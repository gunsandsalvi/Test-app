import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = """    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);"""
replacement = """    const corpBase = companies.filter(c => c.region === regionId).reduce((s, c) => s + c.capex, 0);
    reg.laggedCorporateDemandBase = corpBase;"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Replaced exact target")
else:
    print("Target not found")
