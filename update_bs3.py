import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old1 = """
  // 1. Calculate Micro -> Macro Feedback metrics from previous corporate state
  const prevActiveFirms = state.companies.filter((c) => !c.isDefaulted);
  const totalCapex = prevActiveFirms.reduce((sum, c) => sum + c.capex, 0);
"""

new1 = """
  // 1. Calculate Micro -> Macro Feedback metrics from previous corporate state
  const prevActiveFirms = state.companies.filter((c) => !c.isDefaulted);
  
  const regionFloatingPrincipal: Record<RegionId, number> = { USA: 0, EUR: 0, UK: 0, JPN: 0 };
  prevActiveFirms.forEach(f => {
    const floatingSum = (f.debtTranches || []).filter(t => t.rateType === 'FLOATING').reduce((s, t) => s + t.principalUSD, 0);
    regionFloatingPrincipal[f.region] += floatingSum;
  });

  const totalCapex = prevActiveFirms.reduce((sum, c) => sum + c.capex, 0);
"""

old2 = """
    const { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      { capexGdpContribution: boundedGdpContribution, marginCompression, creditContagionBps, bottomUpUnemploymentDelta },
      nextWeek,
      equityRet,
      state.commodities
    );
"""

new2 = """
    const { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString } = evolveRegionMacro(
      state.regions[regionId],
      { gdpShock: globalGdpShock, inflationShock: globalInflationShock },
      { capexGdpContribution: boundedGdpContribution, marginCompression, creditContagionBps, bottomUpUnemploymentDelta, businessLoanBookInputUSD: regionFloatingPrincipal[regionId] },
      nextWeek,
      equityRet,
      state.commodities
    );
"""

if old1.strip() in text and old2.strip() in text:
    text = text.replace(old1.strip(), new1.strip())
    text = text.replace(old2.strip(), new2.strip())
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Done")
else:
    print("Not found")

