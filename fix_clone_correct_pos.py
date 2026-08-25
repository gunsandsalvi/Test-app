import re
with open('src/engine/companyGenerator.ts', 'r') as f:
    c = f.read()

# I will find the exact spot using regex
pattern = r"      companies\.push\(company\);\n    \}\);\n  \}\);"
match = re.search(pattern, c, re.DOTALL)
if match:
    # We want to insert right after the templates loop ends, but BEFORE the regions loop ends.
    # Wait, the matching pattern ends with the regions loop closing `});`.
    print("Found insertion point")
    
    clone_logic = """
    const targetCount = 200;
    const baseCompanies = companies.filter(c => c.region === region);
    const existingTickers = new Set(companies.map(c => c.ticker));
    const existingNames = new Set(companies.map(c => c.name));
    while (companies.filter(c => c.region === region).length < targetCount) {
      const parent = baseCompanies[Math.floor(Math.random() * baseCompanies.length)];
      const newTicker = generateUniqueTicker(existingTickers);
      const newName = generateUniqueName(parent.name, parent.sector, existingNames);
      const newEmployeeCount = Math.max(10, Math.floor(parent.employeeCount * (0.3 + Math.random() * 1.4)));
      const revenueScale = newEmployeeCount / Math.max(1, parent.employeeCount);

      const newCompany = {
        ...parent,
        id: parent.id + "-" + Math.random().toString(36).substring(2, 9),
        ticker: newTicker,
        name: newName,
        annualRevenue: parent.annualRevenue * revenueScale,
        baselineAnnualRevenue: parent.baselineAnnualRevenue * revenueScale,
        totalDebt: parent.totalDebt * revenueScale,
        cash: parent.cash * revenueScale,
        marketCap: parent.marketCap * revenueScale,
        employeeCount: newEmployeeCount,
        historicalPrices: [...parent.historicalPrices],
        historicalFundamentals: [...parent.historicalFundamentals]
      };
      companies.push(newCompany as any);
    }
"""
    new_text = "      companies.push(company);\n    });" + clone_logic + "\n  });"
    c = c[:match.start()] + new_text + c[match.end():]
    with open('src/engine/companyGenerator.ts', 'w') as f:
        f.write(c)
else:
    print("Did not find insertion point!")
