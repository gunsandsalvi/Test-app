import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

# Insert logic after generateInitialCompanies
insert = """  const companies = generateInitialCompanies();

  Object.keys(regions).forEach(r => {
    const regComps = companies.filter(c => c.region === r);
    const cats = Object.keys(regions[r as any].categoryDemand);
    cats.forEach(cat => {
      let sum = 0;
      regComps.forEach(c => {
        (c.productLines || []).forEach(line => {
          if (line.category === cat) {
            sum += line.revenueShare * c.annualRevenue;
          }
        });
      });
      regions[r as any].categoryDemand[cat as any].demandLevelUSD = sum;
    });
  });
"""

text = text.replace("  const companies = generateInitialCompanies();", insert)

with open('src/engine/simulation.ts', 'w') as f:
    f.write(text)

print("Updated simulation.ts")
