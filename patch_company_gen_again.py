import re
with open('src/engine/companyGenerator.ts', 'r') as f:
    c = f.read()

c = c.replace('const parent = baseTemplates[Math.floor(Math.random() * baseTemplates.length)];', 'const parent = companies[Math.floor(Math.random() * companies.length)];')

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(c)
