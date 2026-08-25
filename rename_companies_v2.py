import re

with open('src/engine/companyGenerator.ts', 'r') as f:
    content = f.read()

# Replace the clone generation logic using regex
pattern = r"let cloneIndex = 1;.*?cloneIndex\+\+;\s*\}"
match = re.search(pattern, content, re.DOTALL)
if match:
    new_clone_logic = """
    const existingNames = new Set(companies.map(c => c.name));
    while (companies.length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      
      const newTicker = generateUniqueTicker(existingTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingNames);
      
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + Math.random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      const newCompany: Company = {
        ...parent,
        id: generateId(),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        productLines: (parent.productLines || []).map((l: any) => ({ ...l, categoryMarketShare: l.categoryMarketShare * revenueScale }))
      };
      companies.push(newCompany);
    }
"""
    content = content[:match.start()] + new_clone_logic + content[match.end():]
    with open('src/engine/companyGenerator.ts', 'w') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Pattern not found")

