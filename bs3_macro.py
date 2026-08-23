import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

# 1. Update microFeedback type
old1 = "microFeedback: { capexGdpContribution: number; marginCompression: number; creditContagionBps: number; bottomUpUnemploymentDelta: number },"
new1 = "microFeedback: { capexGdpContribution: number; marginCompression: number; creditContagionBps: number; bottomUpUnemploymentDelta: number; businessLoanBookInputUSD: number },"

# 2. Add newBankingSector logic
old2 = """
  // Household State Update
  const newHouseholdState = {
    consumerConfidence: newCCI,
    wageGrowth: newWageGrowth,
    savingsRate: newSavingsRate,
    realConsumptionGrowth: newRealConsumptionGrowth,
    householdDebtToIncomeRatio: newDebtToGdpPct * 0.8, // simplified proxy
  };

  const updatedRegion: Region = {
"""

new2 = """
  // Household State Update
  const newHouseholdState = {
    consumerConfidence: newCCI,
    wageGrowth: newWageGrowth,
    savingsRate: newSavingsRate,
    realConsumptionGrowth: newRealConsumptionGrowth,
    householdDebtToIncomeRatio: newDebtToGdpPct * 0.8, // simplified proxy
  };

  const newBalanceSheetStance = -cbChangePct;
  const newBankingSector = evolveBankingSector(region.bankingSector, microFeedback.businessLoanBookInputUSD, newHouseholdState.householdDebtToIncomeRatio, region.estimatedHouseholdIncomeUSD, newSavingsRate, newPolicyRate, microFeedback.creditContagionBps, newUnemployment, newZeroRates.tenor10Y, newBalanceSheetStance);
  const newEstimatedHouseholdIncomeUSD = Number((region.estimatedHouseholdIncomeUSD * (1 + newGdpGrowth / 52)).toFixed(0));

  const updatedRegion: Region = {
"""

# 3. Update returned updatedRegion
old3 = """
    centralBankBalanceSheet: newCbBalance,
    structuralDeficitPctGdp: newStructuralDeficitPctGdp,
"""
new3 = """
    centralBankBalanceSheet: newCbBalance,
    balanceSheetStance: newBalanceSheetStance,
    structuralDeficitPctGdp: newStructuralDeficitPctGdp,
"""

old4 = """
    householdState: newHouseholdState,
  };
"""
new4 = """
    householdState: newHouseholdState,
    bankingSector: newBankingSector,
    estimatedHouseholdIncomeUSD: newEstimatedHouseholdIncomeUSD,
  };
"""

text = text.replace(old1.strip(), new1.strip())
text = text.replace(old2.strip(), new2.strip())
text = text.replace(old3.strip(), new3.strip())
text = text.replace(old4.strip(), new4.strip())

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)

