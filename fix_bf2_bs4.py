import sys

def replace_in_file(filepath, old, new):
    with open(filepath, 'r') as f:
        content = f.read()
    if old in content:
        with open(filepath, 'w') as f:
            f.write(content.replace(old, new))
        print(f"Replaced in {filepath}")
    else:
        print(f"Not found in {filepath}: {old.strip()[:30]}")

replace_in_file('src/engine/macroEngine.ts', 
"""  const weeklyNetIncome = weeklyInterestIncome - weeklyInterestExpense - weeklyLoanLossProvision;
  const newBankEquity = Math.max(0, prevBanking.bankEquityUSD + weeklyNetIncome);""", 
"""  const weeklyNetIncome = weeklyInterestIncome - weeklyInterestExpense - weeklyLoanLossProvision;
  const priorCapitalRatioForPayout = prevBanking.bankCapitalRatio;
  const targetPayoutRatio = priorCapitalRatioForPayout > 0.14 ? 0.6 : priorCapitalRatioForPayout < 0.09 ? 0 : 0.3;
  const weeklyPayout = Math.max(0, weeklyNetIncome) * targetPayoutRatio;
  const newBankEquity = Math.max(0, prevBanking.bankEquityUSD + weeklyNetIncome - weeklyPayout);""")

replace_in_file('src/engine/macroEngine.ts', 
"""  const newNairu = week % 52 === 0
    ? Math.max(0.02, Math.min(0.09, Number((region.nairu + (newParticipation - region.laborForceParticipation) * 0.15).toFixed(4))))
    : region.nairu;""", 
"""  const newNairu = week % 52 === 0
    ? Math.max(0.02, Math.min(0.09, Number((region.nairu + (newParticipation - region.laborForceParticipation) * 52 * 0.15).toFixed(4))))
    : region.nairu;""")

replace_in_file('src/engine/macroEngine.ts', 
"""    const capexIntensityTrend = Math.max(-0.002, Math.min(0.002, microFeedback.capexGdpContribution * 0.3));""", 
"""    const capexIntensityTrend = Math.max(-0.0015, Math.min(0.0015, microFeedback.capexGdpContribution * 0.15));""")

replace_in_file('src/engine/macroEngine.ts', 
"""  const debtServiceBurden = prevHS.householdDebtToIncomeRatio * region.laggedPolicyRateEMA * 0.04;""", 
"""  const creditTighteningConsumerAddOn = Math.max(0, region.bankingSector.creditConditionsIndex) * 0.02;
  const debtServiceBurden = prevHS.householdDebtToIncomeRatio * (region.laggedPolicyRateEMA + creditTighteningConsumerAddOn) * 0.04;""")

