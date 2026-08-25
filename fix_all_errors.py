import re

# 1. CompanyDeepDive
with open('src/components/company/CompanyDeepDive.tsx', 'r') as f:
    c = f.read()
c = c.replace('gameState.institutionalEntities', 'state.institutionalEntities')
with open('src/components/company/CompanyDeepDive.tsx', 'w') as f:
    f.write(c)

# 2. companyGenerator
with open('src/engine/companyGenerator.ts', 'r') as f:
    c = f.read()
# The sector parameter is unused, that's fine, we can rename it to _sector
c = c.replace('function generateUniqueName(baseName: string, sector: string,', 'function generateUniqueName(baseName: string, _sector: string,')
# existingTickers vs generateUniqueTicker
# Let's see what baseCompanies is called
c = c.replace('const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];', 'const parent = baseTemplates[Math.floor(Math.random() * baseTemplates.length)];')
# generateId is not available. Wait, what is the ID generation logic?
# Before my patch, the clone logic had `id: generateId()` ?
# Let's check the original code! It was `id: parent.id + '-clone-' + cloneIndex` or something.
# We can just use `crypto.randomUUID()` or `parent.id + '-' + Math.random().toString(36).substring(2)`
c = c.replace('id: generateId(),', 'id: parent.id + "-" + Math.random().toString(36).substring(2, 9),')

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(c)

# 3. core.ts
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

old_interface = "const companyUpdates: Record<string, { finishedGoodsUnits?: number; finishedGoodsInventoryUSD?: number; cashChange?: number; salesUnits?: number; salesUSD?: number; purchasesUnits?: number; purchasesUSD?: number; inputSupplyConstraintFactor?: number }> = {};"
new_interface = "const companyUpdates: Record<string, { finishedGoodsUnits?: number; finishedGoodsInventoryUSD?: number; cashChange?: number; salesUnits?: number; salesUSD?: number; purchasesUnits?: number; purchasesUSD?: number; inputSupplyConstraintFactor?: number; _targetProductionUSD?: number }> = {};"
c = c.replace(old_interface, new_interface)

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
