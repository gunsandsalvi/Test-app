import re
with open('src/engine/companyGenerator.ts', 'r') as f:
    c = f.read()
c = c.replace('const existingNames = new Set(companies.map(c => c.name));', 'const existingTickers = new Set(companies.map(c => c.ticker));\n    const existingNames = new Set(companies.map(c => c.name));')
with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(c)
