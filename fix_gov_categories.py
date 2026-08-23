import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

target1 = """        } else if (sector === 'Energy' || sector === 'Industrials') {
          if (isTop) {
            lines = [
              { category: 'CorporateIndustrial', revenueShare: 0.7, competitiveness: 0 },
              { category: 'GovernmentInfrastructure', revenueShare: 0.3, competitiveness: 0 }
            ];
          } else {"""

replacement1 = """        } else if (sector === 'Energy' || sector === 'Industrials') {
          if (isTop) {
            lines = [
              { category: 'CorporateIndustrial', revenueShare: 0.55, competitiveness: 0 },
              { category: 'GovernmentInfrastructure', revenueShare: 0.25, competitiveness: 0 },
              { category: 'GovernmentDefense', revenueShare: 0.20, competitiveness: 0 }
            ];
          } else {"""

target2 = """        } else if (sector === 'Banks') {
          lines = [{ category: 'CorporateTech', revenueShare: 1.0, competitiveness: 0 }];
        }"""

replacement2 = """        } else if (sector === 'Financials') {
          if (isTop) {
            lines = [
              { category: 'CorporateTech', revenueShare: 0.6, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.25, competitiveness: 0 },
              { category: 'GovernmentHealthcare', revenueShare: 0.15, competitiveness: 0 }
            ];
          } else {
            lines = [
              { category: c.ebitda / Math.max(1, c.annualRevenue) > 0.3 ? 'CorporateTech' : 'StandardHousehold', revenueShare: 1.0, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Banks') {
          lines = [{ category: 'CorporateTech', revenueShare: 1.0, competitiveness: 0 }];
        }"""

if target1 in text:
    text = text.replace(target1, replacement1)
    print("Replaced Industrials/Energy")
else:
    print("Could not find Industrials/Energy")

if target2 in text:
    text = text.replace(target2, replacement2)
    print("Replaced Financials")
else:
    print("Could not find Financials")

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)

