import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

old_pe = """
    const newSentiment = Math.max(-1.0, Math.min(1.0, comp.sentiment * 0.85 + sentimentDelta));
    const newStockPrice = isDefaulted ? 0.0 : Number(priceEquity(newEps, comp.forwardPE, newSentiment, false).toFixed(2));
"""

new_pe = """
    const sectorPE = SECTOR_BENCHMARKS[comp.sector]?.basePE ?? 15;
    const realRate = reg.policyRate - reg.inflation;
    const rateEffect = -(realRate - reg.neutralRate) * 8;
    const growthEffect = (reg.gdpGrowth - reg.potentialGdpGrowth) * 4;
    const targetPE = sectorPE * (1 + Math.max(-0.5, Math.min(0.5, rateEffect + growthEffect)));
    const newForwardPE = Number((comp.forwardPE * 0.97 + Math.max(sectorPE * 0.5, Math.min(sectorPE * 1.6, targetPE)) * 0.03).toFixed(2));

    const newSentiment = Math.max(-1.0, Math.min(1.0, comp.sentiment * 0.85 + sentimentDelta));
    const newStockPrice = isDefaulted ? 0.0 : Number(priceEquity(newEps, newForwardPE, newSentiment, false).toFixed(2));
"""

old_recov = """
    const effectiveRecoveryRate = Math.max(0.10, (comp.baselineRecoveryRate ?? 0.40) * (1 - systemicStressFactor));
"""

new_recov = """
    const newBaselineRecoveryRate = Number(((comp.baselineRecoveryRate ?? 0.40) * 0.998 + comp.recoveryRate * 0.002).toFixed(4));
    const effectiveRecoveryRate = Math.max(0.10, newBaselineRecoveryRate * (1 - systemicStressFactor));
"""

old_div = """
    const targetDivYield = comp.baselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0));
"""

new_div = """
    const newBaselineDividendYield = Number((comp.baselineDividendYield * 0.998 + comp.dividendYield * 0.002).toFixed(4));
    const targetDivYield = newBaselineDividendYield * (newCash < 0 ? 0.4 : (newCash > 2 * comp.currentLiabilities ? 1.2 : 1.0));
"""

old_return = """
    return {
      ...comp,
      previousEmployeeCount: comp.employeeCount,
"""

new_return = """
    return {
      ...comp,
      forwardPE: newForwardPE,
      baselineRecoveryRate: newBaselineRecoveryRate,
      baselineDividendYield: newBaselineDividendYield,
      previousEmployeeCount: comp.employeeCount,
"""

if old_pe.strip() in text and old_recov.strip() in text and old_div.strip() in text and old_return.strip() in text:
    text = text.replace(old_pe.strip(), new_pe.strip())
    text = text.replace(old_recov.strip(), new_recov.strip())
    text = text.replace(old_div.strip(), new_div.strip())
    text = text.replace(old_return.strip(), new_return.strip())
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Done")
else:
    print("Not found")

