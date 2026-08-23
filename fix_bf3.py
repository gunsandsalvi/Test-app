import sys

with open('src/engine/macroEngine.ts', 'r') as f:
    text = f.read()

import re

# USA
text = re.sub(
    r"estimatedHouseholdIncomeUSD: 12_000_000,\n\s+bankingSector: \{ businessLoanBookUSD: 800_000, consumerLoanBookUSD: 1_400_000, depositsUSD: 2_100_000, sovereignBondHoldingsUSD: 400_000, cashReservesUSD: 210_000, bankEquityUSD: 280_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.028, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0 \},",
    "estimatedHouseholdIncomeUSD: 12_000_000_000_000,\n      bankingSector: { businessLoanBookUSD: 800_000_000_000, consumerLoanBookUSD: 1_400_000_000_000, depositsUSD: 2_100_000_000_000, sovereignBondHoldingsUSD: 400_000_000_000, cashReservesUSD: 210_000_000_000, bankEquityUSD: 280_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.028, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0 },",
    text
)

# UK
text = re.sub(
    r"estimatedHouseholdIncomeUSD: 2_000_000,\n\s+bankingSector: \{ businessLoanBookUSD: 150_000, consumerLoanBookUSD: 260_000, depositsUSD: 400_000, sovereignBondHoldingsUSD: 80_000, cashReservesUSD: 40_000, bankEquityUSD: 55_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.025, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0 \},",
    "estimatedHouseholdIncomeUSD: 2_000_000_000_000,\n      bankingSector: { businessLoanBookUSD: 150_000_000_000, consumerLoanBookUSD: 260_000_000_000, depositsUSD: 400_000_000_000, sovereignBondHoldingsUSD: 80_000_000_000, cashReservesUSD: 40_000_000_000, bankEquityUSD: 55_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.025, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0 },",
    text
)

# JPN
text = re.sub(
    r"estimatedHouseholdIncomeUSD: 3_500_000,\n\s+bankingSector: \{ businessLoanBookUSD: 300_000, consumerLoanBookUSD: 420_000, depositsUSD: 900_000, sovereignBondHoldingsUSD: 260_000, cashReservesUSD: 90_000, bankEquityUSD: 90_000, bankCapitalRatio: 0.11, netInterestMarginPct: 0.012, loanLossProvisionRateAnnualPct: 0.004, creditConditionsIndex: 0 \},",
    "estimatedHouseholdIncomeUSD: 3_500_000_000_000,\n      bankingSector: { businessLoanBookUSD: 300_000_000_000, consumerLoanBookUSD: 420_000_000_000, depositsUSD: 900_000_000_000, sovereignBondHoldingsUSD: 260_000_000_000, cashReservesUSD: 90_000_000_000, bankEquityUSD: 90_000_000_000, bankCapitalRatio: 0.11, netInterestMarginPct: 0.012, loanLossProvisionRateAnnualPct: 0.004, creditConditionsIndex: 0 },",
    text
)

# EUR
text = re.sub(
    r"estimatedHouseholdIncomeUSD: 9_000_000,\n\s+bankingSector: \{ businessLoanBookUSD: 650_000, consumerLoanBookUSD: 1_000_000, depositsUSD: 1_600_000, sovereignBondHoldingsUSD: 350_000, cashReservesUSD: 160_000, bankEquityUSD: 200_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.022, loanLossProvisionRateAnnualPct: 0.007, creditConditionsIndex: 0 \},",
    "estimatedHouseholdIncomeUSD: 9_000_000_000_000,\n      bankingSector: { businessLoanBookUSD: 650_000_000_000, consumerLoanBookUSD: 1_000_000_000_000, depositsUSD: 1_600_000_000_000, sovereignBondHoldingsUSD: 350_000_000_000, cashReservesUSD: 160_000_000_000, bankEquityUSD: 200_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.022, loanLossProvisionRateAnnualPct: 0.007, creditConditionsIndex: 0 },",
    text
)

with open('src/engine/macroEngine.ts', 'w') as f:
    f.write(text)
    
print("Fixed BF3 seeds")
