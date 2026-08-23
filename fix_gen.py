import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

old = """        baselineDividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        beta: tmpl.beta,"""

new = """        baselineDividendYield: Number(((tmpl.initialRating === 'AAA' ? 0.025 : 0.015)).toFixed(3)),
        bankMarketShare: tmpl.bankMarketShare,
        beta: tmpl.beta,"""

text = text.replace(old, new)

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)

print("Fixed gen")
