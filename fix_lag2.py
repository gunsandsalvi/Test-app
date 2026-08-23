import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

text = text.replace(
    'const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.9 + rawCorporateDemandBase * 0.1;',
    'const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.95 + rawCorporateDemandBase * 0.05;'
)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

