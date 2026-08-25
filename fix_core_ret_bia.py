import re
with open('src/engine/simulation/core.ts', 'r') as f:
    c = f.read()

c = c.replace("      sharesOutstanding: Number(updatedSharesOutstanding.toFixed(3)),", """      sharesOutstanding: Number(updatedSharesOutstanding.toFixed(3)),
      technicalReservesUSD: comp.technicalReservesUSD,
      aumUSD: comp.aumUSD,
      managementFeeRate: comp.managementFeeRate,
      insurancePremiumsWrittenUSD: comp.insurancePremiumsWrittenUSD,
      insuranceClaimsPaidUSD: comp.insuranceClaimsPaidUSD,""")

with open('src/engine/simulation/core.ts', 'w') as f:
    f.write(c)
