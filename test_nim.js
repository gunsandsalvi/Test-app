const businessLoanBookInputUSD = 500e9;
const estimatedHouseholdIncomeUSD = 12e12;
const householdDebtToIncomeRatio = 1.5;
const prevDeposits = 2.1e12;
const prevSov = 400e9;
const prevCash = 210e9;
const savingsRate = 0.05;
const policyRate = 0.04;
const sovYield = 0.04;

const newBusinessLoanBook = businessLoanBookInputUSD;
const newConsumerLoanBook = householdDebtToIncomeRatio * estimatedHouseholdIncomeUSD;
const weeklySavingsInflow = (savingsRate * estimatedHouseholdIncomeUSD) / 52;
const newDeposits = prevDeposits * 0.999 + weeklySavingsInflow * 0.5;

const totalAssetsProxy = newBusinessLoanBook + newConsumerLoanBook + prevSov + prevCash;
const targetSovHoldings = totalAssetsProxy * 0.15;
const newSovHoldings = prevSov * 0.98 + targetSovHoldings * 0.02;

const depositBeta = 0.45;
const depositRate = policyRate * depositBeta;
const businessLoanYield = policyRate + 0.025;
const consumerLoanYield = policyRate + 0.035;

const weeklyInterestIncome = (newBusinessLoanBook * businessLoanYield + newConsumerLoanBook * consumerLoanYield + newSovHoldings * sovYield) / 52;
const weeklyInterestExpense = (newDeposits * depositRate) / 52;
const netInterestMarginPct = totalAssetsProxy > 0 ? ((weeklyInterestIncome - weeklyInterestExpense) * 52) / totalAssetsProxy : 0;

console.log({
  newConsumerLoanBook, newBusinessLoanBook, newDeposits,
  totalAssetsProxy, weeklyInterestIncome: weeklyInterestIncome*52, weeklyInterestExpense: weeklyInterestExpense*52,
  NIM: netInterestMarginPct
});
