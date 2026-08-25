import { BankingSector, CreditTierBook } from '../../types';

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
  _gdpGrowth: number,
  spilloverAdjustment: number = 0,
  monetizedAmountUSD: number = 0,
  creditTierBooks?: CreditTierBook[]
): BankingSector {
  const bankedConsumerDebtShare = 0.1167; // Share of total household debt held as bank consumer loans
  const newConsumerLoanBook = householdDebtToIncomeRatio * estimatedHouseholdIncomeUSD * bankedConsumerDebtShare;
  const weeklySavingsInflow = (savingsRate * estimatedHouseholdIncomeUSD) / 52;

  // U3. Reserves respond mechanically to QE/QT
  const reserveInjectionRate = balanceSheetStance * 0.002; // positive stance = QE, expands reserves; negative = QT, contracts
  const newCentralBankReserves = Math.max(0, (prevBanking.centralBankReservesUSD ?? 1e12) * (1 + reserveInjectionRate));

  // V2. Reserve constraint on lending
  const reserveRequirementRatio = 0.10;
  const maxLendingCapacityFromReserves = newCentralBankReserves / reserveRequirementRatio;
  const currentTotalLoanBook = prevBanking.businessLoanBookUSD + prevBanking.consumerLoanBookUSD;
  const reserveLendingHeadroom = Math.max(0, maxLendingCapacityFromReserves - currentTotalLoanBook);

  // V4. Capital constraint on lending (Basel-style dynamic)
  const minCapitalRatio = 0.08; // floor below which lending stops expanding
  const capitalLendingHeadroom = prevBanking.bankCapitalRatio > minCapitalRatio
    ? (prevBanking.bankEquityUSD / minCapitalRatio - currentTotalLoanBook * 1.0)
    : 0;

  // V5. Deposit recycling constraint on lending
  const depositFundingRatio = 0.85; // banks lend against roughly this share of deposit base
  const depositLendingCapacity = prevBanking.depositsUSD * depositFundingRatio;
  const depositLendingHeadroom = Math.max(0, depositLendingCapacity - currentTotalLoanBook);

  // Binding constraint is the tightest of all three
  const lendingHeadroom = Math.max(0, Math.min(reserveLendingHeadroom, Math.min(capitalLendingHeadroom, depositLendingHeadroom)));
  const businessLoanBookConstrained = Math.min(businessLoanBookInputUSD, prevBanking.businessLoanBookUSD + lendingHeadroom);
  const newBusinessLoanBook = businessLoanBookConstrained;

  // U4. Loans create deposits, repayment destroys them — the actual mechanism
  const netNewLending = Math.max(0, (newBusinessLoanBook - prevBanking.businessLoanBookUSD)) + Math.max(0, (newConsumerLoanBook - prevBanking.consumerLoanBookUSD));
  const netLoanRepayment = Math.max(0, (prevBanking.businessLoanBookUSD - newBusinessLoanBook)) + Math.max(0, (prevBanking.consumerLoanBookUSD - newConsumerLoanBook));

  const newDeposits = prevBanking.depositsUSD * 0.999 + weeklySavingsInflow * 0.3 + netNewLending - netLoanRepayment + (monetizedAmountUSD ?? 0);

  const targetSovHoldings = (newBusinessLoanBook + newConsumerLoanBook + prevBanking.sovereignBondHoldingsUSD) * 0.18;
  const newSovHoldings = prevBanking.sovereignBondHoldingsUSD * 0.98 + targetSovHoldings * 0.02;
  const newCashReserves = Math.max(newDeposits * 0.08, newDeposits + prevBanking.bankEquityUSD - newBusinessLoanBook - newConsumerLoanBook - newSovHoldings);
  const totalAssetsProxy = newBusinessLoanBook + newConsumerLoanBook + newSovHoldings + newCashReserves;
  const depositBeta = 0.45;
  const depositRate = policyRate * depositBeta;
  const priorNim = prevBanking.netInterestMarginPct;
  const nimDampingFactor = priorNim > 0.05 ? Math.max(0.85, 1 - (priorNim - 0.05) * 2) : 1.0;
  const businessLoanYield = (policyRate + 0.025) * nimDampingFactor;
  const consumerLoanYield = (policyRate + 0.035) * nimDampingFactor;
  const reserveYield = policyRate >= 0 ? policyRate * 0.85 : policyRate * 0.15; // with reserve tiering, negative policy rates do not fully pass through to reserve charges
  const weeklyInterestIncome = (newBusinessLoanBook * businessLoanYield + newConsumerLoanBook * consumerLoanYield + newSovHoldings * sovereign10YYield + newCashReserves * reserveYield) / 52;
  const weeklyInterestExpense = (newDeposits * depositRate) / 52;
  const rawNim = totalAssetsProxy > 0 ? ((weeklyInterestIncome - weeklyInterestExpense) * 52) / totalAssetsProxy : 0.025;
  const netInterestMarginPct = rawNim;
  const businessLossRateAnnual = Math.min(0.12, (creditContagionBps / 10000) * 1.8);
  let consumerLossRateAnnual = Math.min(0.09, Math.max(0, unemploymentRate - 0.045) * 1.4);
  if (creditTierBooks && creditTierBooks.length > 0) {
    const superPrimeShare = creditTierBooks.find(t => t.tier === 'SUPER_PRIME')?.shareOfHouseholds ?? 0.25;
    const primeShare = creditTierBooks.find(t => t.tier === 'PRIME')?.shareOfHouseholds ?? 0.50;
    const nearPrimeShare = creditTierBooks.find(t => t.tier === 'NEAR_PRIME')?.shareOfHouseholds ?? 0.15;
    const subprimeShare = creditTierBooks.find(t => t.tier === 'SUBPRIME')?.shareOfHouseholds ?? 0.10;

    const baselineConsumerLossRate = Math.max(0.005, Math.min(0.12, Math.max(0, unemploymentRate - 0.03) * 1.2));
    const weightedMultiplier = (superPrimeShare * 0.2) + (primeShare * 1.0) + (nearPrimeShare * 3.0) + (subprimeShare * 10.0);
    consumerLossRateAnnual = baselineConsumerLossRate * weightedMultiplier;
  }
  const weeklyLoanLossProvision = (newBusinessLoanBook * businessLossRateAnnual + newConsumerLoanBook * consumerLossRateAnnual) / 52;
  const weeklyNetIncome = (netInterestMarginPct * totalAssetsProxy / 52) - weeklyLoanLossProvision;
  const riskWeightedAssets = newBusinessLoanBook * 1.0 + newConsumerLoanBook * 0.75 + newSovHoldings * 0.0;
  const priorCapitalRatioForPayout = prevBanking.bankCapitalRatio;
  const targetPayoutRatio = priorCapitalRatioForPayout > 0.14 ? 0.90 : priorCapitalRatioForPayout < 0.11 ? 0.05 : 0.40;
  const weeklyPayout = Math.max(0, weeklyNetIncome) * targetPayoutRatio;
  const recapitalization = priorCapitalRatioForPayout < 0.08 ? (0.10 * riskWeightedAssets - prevBanking.bankEquityUSD) * 0.02 : 0;
  let newBankEquity = Math.max(0, prevBanking.bankEquityUSD + weeklyNetIncome - weeklyPayout + recapitalization);
  // Return excess equity above 15% CET1 ratio to shareholders
  if (riskWeightedAssets > 0 && newBankEquity / riskWeightedAssets > 0.145) {
    newBankEquity = riskWeightedAssets * 0.140;
  }
  const newBankCapitalRatio = riskWeightedAssets > 0 ? newBankEquity / riskWeightedAssets : 0.13;
  const capitalGap = 0.12 - newBankCapitalRatio;
  const newCreditConditionsIndex = (capitalGap * 8 + (0.025 - netInterestMarginPct) * 10 + spilloverAdjustment);

  // V6. Lender of last resort: emergency reserve injection during genuine systemic stress
  const systemicLiquidityStress = (prevBanking.bankCapitalRatio < 0.082 && newCreditConditionsIndex > 0.22) || (prevBanking.bankCapitalRatio < 0.075);
  const emergencyReserveCap = Math.max(1.5e12, prevBanking.depositsUSD * 0.60);
  const emergencyReserveInjection = (systemicLiquidityStress && newCentralBankReserves < emergencyReserveCap)
    ? Math.min(newCentralBankReserves * 0.015, 15e9)
    : 0;
  const newCentralBankReservesFinal = newCentralBankReserves + emergencyReserveInjection;
  const newCentralBankReservesWithMonetization = newCentralBankReservesFinal + (monetizedAmountUSD ?? 0);
  const newMoneySupplyM2USD = newDeposits + newCentralBankReservesWithMonetization * 0.1;

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
    centralBankReservesUSD: Number(newCentralBankReservesWithMonetization.toFixed(0)),
    moneySupplyM2USD: Number(newMoneySupplyM2USD.toFixed(0)),
    itemizedHoldings: prevBanking.itemizedHoldings || [],
  };
}
