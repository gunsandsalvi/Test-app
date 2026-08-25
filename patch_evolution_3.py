import re
import os

with open("src/engine/macro/evolution.ts", "r") as f:
    content = f.read()

# Fix syntax errors
content = content.replace("const newPrivateSectorSegments as any =", "const newPrivateSectorSegments: any[] =")
content = content.replace("newPrivateSectorSegments as any.reduce", "newPrivateSectorSegments.reduce")

# Add PROJ-12 to newPrivateSectorSegments
old_seg = """    return {
      segmentType: seg.segmentType,
      employment: newEmployment,
      annualRevenueUSD: Number(newAnnualRevenueUSD.toFixed(0)),
      marginPct: Number(newMarginPct.toFixed(4)),
    };"""

new_seg = """    const segmentDebtServiceCoverage = newAnnualRevenueUSD * newMarginPct / Math.max(1, ((seg as any).debtUSD ?? (newAnnualRevenueUSD * 2)) * 0.08);
    const newDefaultRateAnnualPct = Math.max(0.005, Math.min(0.15, 0.02 + (1 / Math.max(0.5, segmentDebtServiceCoverage)) * 0.03 + region.bankingSector.creditConditionsIndex * 0.02));
    const formationRate = Math.max(-0.002, Math.min(0.002, (demandSignal - newDefaultRateAnnualPct) * 0.1));
    const finalEmployment = Math.max(1, Math.round(newEmployment * (1 + formationRate)));

    return {
      segmentType: seg.segmentType,
      employment: finalEmployment,
      annualRevenueUSD: Number(newAnnualRevenueUSD.toFixed(0)),
      marginPct: Number(newMarginPct.toFixed(4)),
      debtUSD: (seg as any).debtUSD ?? (newAnnualRevenueUSD * 2),
      defaultRateAnnualPct: newDefaultRateAnnualPct,
      capexUSD: newAnnualRevenueUSD * 0.05,
    };"""
content = content.replace(old_seg, new_seg)

with open("src/engine/macro/evolution.ts", "w") as f:
    f.write(content)

