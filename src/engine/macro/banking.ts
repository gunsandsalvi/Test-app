import { BankingSector } from '../../types';

export function evolveBankingSector(
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
): BankingSector {
  const newBusinessLoanBook = businessLoanBookInputUSD;
  const bankedConsumerDebtShare = 0.1167; // Share of total household debt held as bank consumer loans
  const newConsumerLoanBook = householdDebtToIncomeRatio * estimatedHouseholdIncomeUSD * bankedConsumerDebtShare;
  const weeklySavingsInflow = (savingsRate * estimatedHouseholdIncomeUSD) / 52;
  const newDeposits = prevBanking.depositsUSD * (1 + gdpGrowth / 52) * 0.998 + weeklySavingsInflow * 0.3;
  const totalAssetsProxy = newBusinessLoanBook + newConsumerLoanBook + prevBanking.sovereignBondHoldingsUSD + prevBanking.cashReservesUSD;
  const targetSovHoldings = totalAssetsProxy * 0.15;
  const newSovHoldings = prevBanking.sovereignBondHoldingsUSD * 0.98 + targetSovHoldings * 0.02;
  const newCashReserves = Math.max(0, newDeposits * 0.10 + Math.max(0, -balanceSheetStance) * totalAssetsProxy * 0.01);
  const depositBeta = 0.45;
  const depositRate = policyRate * depositBeta;
  const priorNim = prevBanking.netInterestMarginPct;
  const nimDampingFactor = priorNim > 0.05 ? Math.max(0.85, 1 - (priorNim - 0.05) * 2) : 1.0;
  const businessLoanYield = (policyRate + 0.025) * nimDampingFactor;
  const consumerLoanYield = (policyRate + 0.035) * nimDampingFactor;
  const weeklyInterestIncome = (newBusinessLoanBook * businessLoanYield + newConsumerLoanBook * consumerLoanYield + newSovHoldings * sovereign10YYield) / 52;
  const weeklyInterestExpense = (newDeposits * depositRate) / 52;
    if (weeklyInterestIncome * 52 / totalAssetsProxy > 0.4) console.log(`DEBUG: policy=${policyRate} busYield=${businessLoanYield} consYield=${consumerLoanYield} sovYield=${sovereign10YYield} nimDamping=${nimDampingFactor} prevNIM=${priorNim} totalAst=${totalAssetsProxy} newCons=${newConsumerLoanBook} weeklyInc=${weeklyInterestIncome} weeklyExp=${weeklyInterestExpense} deposits=${newDeposits} depRate=${depositRate}`);
  const netInterestMarginPct = totalAssetsProxy > 0 ? ((weeklyInterestIncome - weeklyInterestExpense) * 52) / totalAssetsProxy : 0;
  const businessLossRateAnnual = Math.min(0.12, (creditContagionBps / 10000) * 1.8);
  const consumerLossRateAnnual = Math.min(0.09, Math.max(0, unemploymentRate - 0.045) * 1.4);
  const weeklyLoanLossProvision = (newBusinessLoanBook * businessLossRateAnnual + newConsumerLoanBook * consumerLossRateAnnual) / 52;
  const weeklyNetIncome = weeklyInterestIncome - weeklyInterestExpense - weeklyLoanLossProvision;
  const riskWeightedAssets = newBusinessLoanBook * 1.0 + newConsumerLoanBook * 0.75 + newSovHoldings * 0.0;
  const priorCapitalRatioForPayout = prevBanking.bankCapitalRatio;
  const targetPayoutRatio = priorCapitalRatioForPayout > 0.14 ? 0.6 : priorCapitalRatioForPayout < 0.11 ? 0 : 0.25;
  const weeklyPayout = Math.max(0, weeklyNetIncome) * targetPayoutRatio;
  const recapitalization = priorCapitalRatioForPayout < 0.08 ? (0.10 * riskWeightedAssets - prevBanking.bankEquityUSD) * 0.02 : 0;
  const newBankEquity = Math.max(0, prevBanking.bankEquityUSD + weeklyNetIncome - weeklyPayout + recapitalization);
  const newBankCapitalRatio = riskWeightedAssets > 0 ? newBankEquity / riskWeightedAssets : 0.15;
  const capitalGap = 0.12 - newBankCapitalRatio;
  const newCreditConditionsIndex = Math.max(-1, Math.min(1, capitalGap * 8 + Math.max(0, -netInterestMarginPct) * 5));
  return {
    businessLoanBookUSD: Number(newBusinessLoanBook.toFixed(0)),
    consumerLoanBookUSD: Number(newConsumerLoanBook.toFixed(0)),
    depositsUSD: Number(newDeposits.toFixed(0)),
    sovereignBondHoldingsUSD: Number(newSovHoldings.toFixed(0)),
    cashReservesUSD: Number(newCashReserves.toFixed(0)),
    bankEquityUSD: Number(newBankEquity.toFixed(0)),
    bankCapitalRatio: Number(newBankCapitalRatio.toFixed(4)),
    netInterestMarginPct: Number(netInterestMarginPct.toFixed(4)),
    loanLossProvisionRateAnnualPct: Number(businessLossRateAnnual.toFixed(4)),
    creditConditionsIndex: Number(newCreditConditionsIndex.toFixed(3)),
  };
}
