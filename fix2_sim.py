import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = """    // Corporate demand (G3), tied to aggregate CapEx
    const corporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const corpTargets: Partial<Record<string, number>> = {
      CorporateIndustrial: corporateDemandBase * 0.6,
      CorporateTech: corporateDemandBase * 0.4,
    };"""

replacement = """    // Corporate demand (G3), tied to aggregate CapEx
    const rawCorporateDemandBase = prevActiveFirms.filter(f => f.region === regionId).reduce((s, f) => s + f.capex, 0);
    const newLaggedCorporateDemandBase = reg.laggedCorporateDemandBase * 0.9 + rawCorporateDemandBase * 0.1;
    reg.laggedCorporateDemandBase = newLaggedCorporateDemandBase;
    const corpTargets = { CorporateIndustrial: newLaggedCorporateDemandBase * 0.6, CorporateTech: newLaggedCorporateDemandBase * 0.4 };"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Replaced exact target")
else:
    print("Target not found")
