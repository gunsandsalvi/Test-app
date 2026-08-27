/**
 * Stage 2b: Bank Diversification + Central Bank Facilities
 *
 * Wall Street Phase 1: evolves each region's real, individually-named banks (the isBankEntity
 * companies) as genuinely distinct balance sheets — their own loan book, deposits, capital
 * ratio, and central-bank reserves — instead of the single regional bankingSector aggregate
 * being the only real figure and each bank a cosmetic proportional slice of it. Runs after
 * stage 2 (region macro, which computes an aggregate via the same evolveBankingSector formula)
 * and overwrites that aggregate with the real sum of these per-bank sheets, so it stays a
 * genuine derived total rather than a second, parallel source of truth. Must run before stage 8
 * (company fundamentals), which prices each bank's stock off its own bankBalanceSheet.
 *
 * Wall Street Phase 2: real central bank facilities on top of each bank's own evolved sheet — a
 * bank short of its own target cash buffer borrows from the Standing Repo Facility (against
 * government-bond collateral, at policyRate + a spread); a bank with cash above its target
 * buffer places the excess at the reverse repo facility (earning policyRate - a spread) instead
 * of policyRate being an ambient parameter every formula reads directly.
 */

import { GameState, RegionId, Company } from '../../../types';
import { BankingSector } from '../../../domain/banking';
import { evolveBankingSector } from '../../macro/banking';
import { WeeklyStepContext } from './context';

function scaleBankingSector(bs: BankingSector, share: number): BankingSector {
  return {
    businessLoanBookUSD: bs.businessLoanBookUSD * share,
    consumerLoanBookUSD: bs.consumerLoanBookUSD * share,
    depositsUSD: bs.depositsUSD * share,
    sovereignBondHoldingsUSD: bs.sovereignBondHoldingsUSD * share,
    cashReservesUSD: bs.cashReservesUSD * share,
    bankEquityUSD: bs.bankEquityUSD * share,
    bankCapitalRatio: bs.bankCapitalRatio,
    netInterestMarginPct: bs.netInterestMarginPct,
    loanLossProvisionRateAnnualPct: bs.loanLossProvisionRateAnnualPct,
    creditConditionsIndex: bs.creditConditionsIndex,
    centralBankReservesUSD: bs.centralBankReservesUSD * share,
    moneySupplyM2USD: bs.moneySupplyM2USD * share,
    itemizedHoldings: [],
    srfBorrowingUSD: bs.srfBorrowingUSD * share,
    onRrpLendingUSD: bs.onRrpLendingUSD * share,
  };
}

// Real posted spreads over/under policyRate — mirrors how the real Fed's Standing Repo Facility
// and overnight reverse repo facility are priced relative to the policy rate, rather than an
// invented "emergency injection" formula reacting after the fact.
const SRF_SPREAD_BPS = 25;
const ON_RRP_SPREAD_BPS = 20;
// A bank wants to hold at least this share of its deposits as ready cash; short of that, it
// borrows the shortfall from the Standing Repo Facility rather than running cash negative.
const MIN_CASH_BUFFER_RATIO = 0.02;
// Above this share of deposits, cash is genuinely excess — placed at the reverse repo facility
// (a real, interest-bearing use) instead of sitting idle in the aggregate.
const EXCESS_CASH_RATIO = 0.15;

function applyCentralBankFacilities(sheet: BankingSector, policyRate: number): BankingSector {
  const targetMinCash = sheet.depositsUSD * MIN_CASH_BUFFER_RATIO;
  const targetMaxCash = sheet.depositsUSD * EXCESS_CASH_RATIO;

  let cashReservesUSD = sheet.cashReservesUSD;
  let bankEquityUSD = sheet.bankEquityUSD;
  let srfBorrowingUSD = 0;
  let onRrpLendingUSD = 0;

  if (cashReservesUSD < targetMinCash) {
    srfBorrowingUSD = targetMinCash - cashReservesUSD;
    cashReservesUSD += srfBorrowingUSD;
    const weeklyInterestCost = (srfBorrowingUSD * (policyRate + SRF_SPREAD_BPS / 10000)) / 52;
    bankEquityUSD = Math.max(0, bankEquityUSD - weeklyInterestCost);
  } else if (cashReservesUSD > targetMaxCash) {
    onRrpLendingUSD = cashReservesUSD - targetMaxCash;
    cashReservesUSD -= onRrpLendingUSD;
    const weeklyInterestIncome = (onRrpLendingUSD * Math.max(0, policyRate - ON_RRP_SPREAD_BPS / 10000)) / 52;
    bankEquityUSD += weeklyInterestIncome;
  }

  return {
    ...sheet,
    cashReservesUSD: Number(cashReservesUSD.toFixed(0)),
    bankEquityUSD: Number(bankEquityUSD.toFixed(0)),
    srfBorrowingUSD: Number(srfBorrowingUSD.toFixed(0)),
    onRrpLendingUSD: Number(onRrpLendingUSD.toFixed(0)),
  };
}

export function runBankDiversificationStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const banks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
    if (banks.length === 0) return;

    // The aggregate stage 2 just computed via evolveBankingSector is this week's fallback
    // seed for any bank that doesn't yet carry its own bankBalanceSheet (e.g. a company
    // generated before this phase existed) — scaled by that bank's own market share, exactly
    // how initial seeding works in companyGenerator.ts.
    const priorAggregate = reg.bankingSector;

    const newSheets: { bank: Company; sheet: BankingSector }[] = banks.map((bank) => {
      const share = bank.bankMarketShare ?? 1 / banks.length;
      const prevSheet = bank.bankBalanceSheet ?? scaleBankingSector(priorAggregate, share);
      const riskFactor = bank.bankRiskFactor ?? 1.0;

      const sheet = evolveBankingSector(
        prevSheet,
        ctx.regionFloatingPrincipal[regionId] * share,
        reg.householdState.householdDebtToIncomeRatio,
        reg.estimatedHouseholdIncomeUSD * share,
        reg.householdState.savingsRate,
        reg.policyRate,
        // A higher-risk bank's own business- AND consumer-loan-loss experience both scale with
        // its real, persistent concentration risk (see bankRiskFactor's doc comment in
        // domain/company.ts) — the actual reason two banks facing the identical regional credit
        // cycle diverge, rather than every bank sharing one identical region-wide loss rate on
        // both books. Consumer loss rate has no direct override in evolveBankingSector, so the
        // same riskFactor is applied to its own real driver (unemploymentRate) instead — a
        // higher-risk bank's book is more exposed to the SAME regional unemployment print, the
        // way a bank concentrated in subprime/regional consumer lending genuinely would be.
        ctx.creditContagionBps * riskFactor,
        reg.unemploymentRate * (0.6 + riskFactor * 0.4),
        reg.zeroRates.tenor10Y,
        reg.balanceSheetStance,
        reg.gdpGrowth,
        reg.creditConditionsSpilloverAdjustment ?? 0,
        0,
        reg.householdState.creditTierBooks
      );
      return { bank, sheet: applyCentralBankFacilities(sheet, reg.policyRate) };
    });

    newSheets.forEach(({ bank, sheet }) => {
      if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
      ctx.companyUpdates[bank.ticker].bankBalanceSheet = sheet;
    });

    // The region-level bankingSector every other stage reads becomes the real sum of these
    // named banks, replacing (not supplementing) the single-formula aggregate stage 2 computed
    // — one source of truth, now genuinely derived from real per-bank state instead of the
    // other way around.
    const sumField = (f: (s: BankingSector) => number) => newSheets.reduce((s, { sheet }) => s + f(sheet), 0);
    const totalAssets = sumField((s) => s.businessLoanBookUSD + s.consumerLoanBookUSD + s.sovereignBondHoldingsUSD + s.cashReservesUSD);
    const weightedAvg = (f: (s: BankingSector) => number) =>
      totalAssets > 0
        ? newSheets.reduce((s, { sheet }) => s + f(sheet) * (sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sheet.sovereignBondHoldingsUSD + sheet.cashReservesUSD), 0) / totalAssets
        : (newSheets.reduce((s, { sheet }) => s + f(sheet), 0) / Math.max(1, newSheets.length));

    reg.bankingSector = {
      businessLoanBookUSD: sumField((s) => s.businessLoanBookUSD),
      consumerLoanBookUSD: sumField((s) => s.consumerLoanBookUSD),
      depositsUSD: sumField((s) => s.depositsUSD),
      sovereignBondHoldingsUSD: sumField((s) => s.sovereignBondHoldingsUSD),
      cashReservesUSD: sumField((s) => s.cashReservesUSD),
      bankEquityUSD: sumField((s) => s.bankEquityUSD),
      bankCapitalRatio: Number(weightedAvg((s) => s.bankCapitalRatio).toFixed(4)),
      netInterestMarginPct: Number(weightedAvg((s) => s.netInterestMarginPct).toFixed(4)),
      loanLossProvisionRateAnnualPct: Number(weightedAvg((s) => s.loanLossProvisionRateAnnualPct).toFixed(4)),
      creditConditionsIndex: Number(weightedAvg((s) => s.creditConditionsIndex).toFixed(3)),
      centralBankReservesUSD: sumField((s) => s.centralBankReservesUSD),
      moneySupplyM2USD: sumField((s) => s.moneySupplyM2USD),
      itemizedHoldings: priorAggregate.itemizedHoldings || [],
      srfBorrowingUSD: sumField((s) => s.srfBorrowingUSD),
      onRrpLendingUSD: sumField((s) => s.onRrpLendingUSD),
    };
  });
}
