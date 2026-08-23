import sys

with open('src/engine/companyGenerator.ts', 'r') as f:
    text = f.read()

# Add to CompanyTemplate interface
text = text.replace(
    "  bankMarketShare?: number;\n  beta: number;\n}",
    "  bankMarketShare?: number;\n  beta: number;\n  productLines?: { category: string; revenueShare: number; competitiveness: number }[];\n}"
)

# Insert logic at the end of generateInitialCompanies
insert_logic = """
  // G1: Assign Product Lines & Category Market Share
  const categories = [
    'StapleHousehold', 'StandardHousehold', 'LuxuryHousehold',
    'CorporateIndustrial', 'CorporateTech',
    'GovernmentDefense', 'GovernmentInfrastructure', 'GovernmentHealthcare'
  ];

  const regionMap = new Map<string, Company[]>();
  companies.forEach(c => {
    if (!regionMap.has(c.region)) regionMap.set(c.region, []);
    regionMap.get(c.region)!.push(c);
  });

  regionMap.forEach((regionComps, regionId) => {
    const sectorComps = new Map<string, Company[]>();
    regionComps.forEach(c => {
      if (!sectorComps.has(c.sector)) sectorComps.set(c.sector, []);
      sectorComps.get(c.sector)!.push(c);
    });

    sectorComps.forEach((comps, sector) => {
      comps.sort((a, b) => b.baselineAnnualRevenue - a.baselineAnnualRevenue);
      comps.forEach((c, idx) => {
        let lines: any[] = [];
        const isTop = idx < 2;
        
        if (sector === 'Tech' || sector === 'Financials') {
          if (isTop) {
            lines = [
              { category: 'CorporateTech', revenueShare: 0.6, competitiveness: 0 },
              { category: 'StandardHousehold', revenueShare: 0.4, competitiveness: 0 }
            ];
          } else {
            lines = [
              { category: c.ebitda / Math.max(1, c.annualRevenue) > 0.3 ? 'CorporateTech' : 'StandardHousehold', revenueShare: 1.0, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Energy' || sector === 'Industrials') {
          if (isTop) {
            lines = [
              { category: 'CorporateIndustrial', revenueShare: 0.7, competitiveness: 0 },
              { category: 'GovernmentInfrastructure', revenueShare: 0.3, competitiveness: 0 }
            ];
          } else {
            lines = [
              { category: c.ebitda / Math.max(1, c.annualRevenue) > 0.15 ? 'CorporateIndustrial' : 'GovernmentInfrastructure', revenueShare: 1.0, competitiveness: 0 }
            ];
          }
        } else if (sector === 'Consumer') {
          const mgn = c.ebitda / Math.max(1, c.annualRevenue);
          if (isTop) {
            if (mgn > 0.3) {
              lines = [{ category: 'LuxuryHousehold', revenueShare: 0.7, competitiveness: 0 }, { category: 'StandardHousehold', revenueShare: 0.3, competitiveness: 0 }];
            } else if (mgn < 0.15) {
              lines = [{ category: 'StapleHousehold', revenueShare: 0.8, competitiveness: 0 }, { category: 'StandardHousehold', revenueShare: 0.2, competitiveness: 0 }];
            } else {
              lines = [{ category: 'StandardHousehold', revenueShare: 0.6, competitiveness: 0 }, { category: 'StapleHousehold', revenueShare: 0.4, competitiveness: 0 }];
            }
          } else {
            if (mgn > 0.25) lines = [{ category: 'LuxuryHousehold', revenueShare: 1.0, competitiveness: 0 }];
            else if (mgn < 0.15) lines = [{ category: 'StapleHousehold', revenueShare: 1.0, competitiveness: 0 }];
            else lines = [{ category: 'StandardHousehold', revenueShare: 1.0, competitiveness: 0 }];
          }
        } else if (sector === 'Banks') {
          lines = [{ category: 'CorporateTech', revenueShare: 1.0, competitiveness: 0 }];
        }

        c.productLines = lines;
      });
    });

    // Compute category market shares and initialize Region category demand
    const catTotals: Record<string, number> = {};
    categories.forEach(cat => catTotals[cat] = 0);

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        catTotals[line.category] += line.revenueShare * c.annualRevenue;
      });
    });

    regionComps.forEach(c => {
      (c.productLines || []).forEach(line => {
        const catTotal = catTotals[line.category];
        line.categoryMarketShare = catTotal > 0 ? (line.revenueShare * c.annualRevenue) / catTotal : 0;
      });
    });
    
    // Note: Region categoryDemand is initialized in getInitialRegions but we'll populate it there.
    // So we don't do it here because macroEngine initializes regions.
    // Wait, macroEngine creates regions, then simulation creates companies. 
    // We can just export a function to patch regions with category demands, or do it in createInitialGameState.
  });

"""

text = text.replace("return companies;\n}", insert_logic + "  return companies;\n}")

with open('src/engine/companyGenerator.ts', 'w') as f:
    f.write(text)
    
print("Updated companyGenerator.ts")
