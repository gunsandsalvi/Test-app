import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

old_str = """
  const updatedRegion: Region = {
    ...region,
"""

new_str = """
  const newBalanceSheetStance = -cbChangePct;
  const newBankingSector = evolveBankingSector(region.bankingSector, microFeedback.businessLoanBookInputUSD, prevHS.householdDebtToIncomeRatio, region.estimatedHouseholdIncomeUSD, newSavingsRate, newPolicyRate, microFeedback.creditContagionBps, newUnemployment, newZeroRates.tenor10Y, newBalanceSheetStance);
  const newEstimatedHouseholdIncomeUSD = Number((region.estimatedHouseholdIncomeUSD * (1 + newGdpGrowth / 52)).toFixed(0));

  const updatedRegion: Region = {
    ...region,
"""

if old_str.strip() in text:
    text = text.replace(old_str.strip(), new_str.strip())
    with open('src/engine/macroEngine.ts', 'w') as f:
        f.write(text)
    print("Done definition")
else:
    print("Not found definition")

