import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

target_sig = """export function evolveBankingSector(
  prevBanking: BankingSector,
  businessLoanBookInputUSD: number,
  householdDebtToIncomeRatio: number,
  estimatedHouseholdIncomeUSD: number,
  savingsRate: number,
  policyRate: number,
  creditContagionBps: number,
  unemploymentRate: number,
  sovereign10YYield: number,
  balanceSheetStance: number
): BankingSector {"""

replacement_sig = """export function evolveBankingSector(
  prevBanking: BankingSector,
  businessLoanBookInputUSD: number,
  householdDebtToIncomeRatio: number,
  estimatedHouseholdIncomeUSD: number,
  savingsRate: number,
  policyRate: number,
  creditContagionBps: number,
  unemploymentRate: number,
  sovereign10YYield: number,
  balanceSheetStance: number,
  gdpGrowth: number
): BankingSector {"""

text = text.replace(target_sig, replacement_sig)

# Now fix the call site in evolveRegionMacro
target_call = """  const newBankingSector = evolveBankingSector(
    region.bankingSector,
    microFeedback.businessLoanBookInputUSD,
    prevHS.householdDebtToIncomeRatio,
    region.estimatedHouseholdIncomeUSD,
    newSavingsRate,
    newPolicyRate,
    microFeedback.creditContagionBps,
    newUnemployment,
    newZeroRates.tenor10Y,
    newBalanceSheetStance
  );"""

replacement_call = """  const newBankingSector = evolveBankingSector(
    region.bankingSector,
    microFeedback.businessLoanBookInputUSD,
    prevHS.householdDebtToIncomeRatio,
    region.estimatedHouseholdIncomeUSD,
    newSavingsRate,
    newPolicyRate,
    microFeedback.creditContagionBps,
    newUnemployment,
    newZeroRates.tenor10Y,
    newBalanceSheetStance,
    newGdpGrowth
  );"""

text = text.replace(target_call, replacement_call)

target_deposits = """  const newDeposits = prevBanking.depositsUSD * 0.999 + weeklySavingsInflow * 0.5;"""
replacement_deposits = """  const newDeposits = prevBanking.depositsUSD * (1 + gdpGrowth / 52) * 0.998 + weeklySavingsInflow * 0.3;"""

text = text.replace(target_deposits, replacement_deposits)

target_yield = """  const businessLoanYield = policyRate + 0.025;
  const consumerLoanYield = policyRate + 0.035;"""

replacement_yield = """  const priorNim = prevBanking.netInterestMarginPct;
  const nimDampingFactor = priorNim > 0.05 ? Math.max(0.85, 1 - (priorNim - 0.05) * 2) : 1.0;
  const businessLoanYield = (policyRate + 0.025) * nimDampingFactor;
  const consumerLoanYield = (policyRate + 0.035) * nimDampingFactor;"""

text = text.replace(target_yield, replacement_yield)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

print("Patched NIM logic")
