/**
 * ONE BANK'S BOOKS ONTO ANOTHER'S. The two events that move a bank whole — a merger
 * and a resolution — share this transfer; it lives in the ledger because it writes every
 * balance line there is. Cash is the one line it never touches: reserves move only by a named
 * flow, and the caller posts that leg (a merger moves them directly at the sheet level, a
 * resolution as a payment between the two named accounts).
 */

import { BankingSector } from '../../domain/banking';
import { BankResolutionPlan, mergeDesks, mergeHouseholdPool } from '../../domain/bank-resolution';

/**
 * Every non-cash line moves and the target's copy is zeroed. The central bank's loan moves by
 * the amount the caller says is assumed; equity is the caller's arithmetic (it depends on both
 * sides).
 */
export function absorbBankSheet(acquirer: BankingSector, target: BankingSector, centralBankLoanAssumedUSD: number): void {
  // A3.6c: the deposit lines are the depositors' accounts — the household sector's and the
  // pools' rows move with `moveSectorRowsToBank` at the caller, the firms' and institutions'
  // accounts follow their house bank (`rekeyBankLinks`); nothing to move here.
  acquirer.centralBankLoanLocal = (acquirer.centralBankLoanLocal ?? 0) + centralBankLoanAssumedUSD; target.centralBankLoanLocal = 0;
  acquirer.clientMarginLocal = (acquirer.clientMarginLocal ?? 0) + (target.clientMarginLocal ?? 0); target.clientMarginLocal = 0;
  // Secured lines and the paper behind them.
  acquirer.srfBorrowingLocal = (acquirer.srfBorrowingLocal ?? 0) + (target.srfBorrowingLocal ?? 0); target.srfBorrowingLocal = 0;
  acquirer.repoBorrowedLocal = (acquirer.repoBorrowedLocal ?? 0) + (target.repoBorrowedLocal ?? 0); target.repoBorrowedLocal = 0;
  acquirer.repoLentLocal = (acquirer.repoLentLocal ?? 0) + (target.repoLentLocal ?? 0); target.repoLentLocal = 0;
  acquirer.onRrpLendingLocal = (acquirer.onRrpLendingLocal ?? 0) + (target.onRrpLendingLocal ?? 0); target.onRrpLendingLocal = 0;
  acquirer.repoEncumberedCollateralUSD = (acquirer.repoEncumberedCollateralUSD ?? 0) + (target.repoEncumberedCollateralUSD ?? 0); target.repoEncumberedCollateralUSD = 0;
  // The credit books.
  acquirer.businessLoans = [...(acquirer.businessLoans || []), ...(target.businessLoans || [])];
  target.businessLoans = [];
  const pools = [...(acquirer.householdLoans || [])];
  (target.householdLoans || []).forEach((pl) => {
    const i = pools.findIndex((x) => x.kind === pl.kind);
    if (i < 0) pools.push({ ...pl, vintages: pl.vintages ? [...pl.vintages] : undefined });
    else pools[i] = mergeHouseholdPool(pools[i], pl);
  });
  acquirer.householdLoans = pools;
  target.householdLoans = [];
  acquirer.primeBrokerageLoansLocal = (acquirer.primeBrokerageLoansLocal ?? 0) + (target.primeBrokerageLoansLocal ?? 0); target.primeBrokerageLoansLocal = 0;
  // The securities books.
  const tenors = { ...(acquirer.sovereignBondHoldingsByBond || {}) };
  Object.entries(target.sovereignBondHoldingsByBond || {}).forEach(([k, v]) => { tenors[k] = (tenors[k] ?? 0) + (Number(v) || 0); });
  acquirer.sovereignBondHoldingsByBond = tenors;
  acquirer.sovereignBondHoldingsLocal = Object.values(tenors).reduce((a, v) => a + v, 0);
  target.sovereignBondHoldingsByBond = {}; target.sovereignBondHoldingsLocal = 0;
  acquirer.sovereignAccruedCouponLocal = (acquirer.sovereignAccruedCouponLocal ?? 0) + (target.sovereignAccruedCouponLocal ?? 0); target.sovereignAccruedCouponLocal = 0;
  acquirer.dealerDeskInventory = mergeDesks(acquirer.dealerDeskInventory, target.dealerDeskInventory);
  target.dealerDeskInventory = undefined;
  if (target.fxDealerBook) {
    const mine = acquirer.fxDealerBook ?? { netNotionalByRegion: {}, initialMarginHeldUSD: 0, grossNotionalUSD: 0 };
    const net = { ...mine.netNotionalByRegion };
    Object.entries(target.fxDealerBook.netNotionalByRegion || {}).forEach(([k, v]) => { net[k] = (net[k] ?? 0) + v; });
    acquirer.fxDealerBook = {
      ...mine, netNotionalByRegion: net,
      initialMarginHeldUSD: mine.initialMarginHeldUSD + target.fxDealerBook.initialMarginHeldUSD,
      grossNotionalUSD: mine.grossNotionalUSD + target.fxDealerBook.grossNotionalUSD,
    };
    target.fxDealerBook = undefined;
  }
}

/** A merger: everything moves, cash and equity included, at the sheet level. */
export function mergeBankSheets(acquirer: BankingSector, target: BankingSector): void {
  absorbBankSheet(acquirer, target, target.centralBankLoanLocal ?? 0);
  // A3.6c: the reserves move on the accounts (`moveBankReserves`, at the caller).
  acquirer.bankEquityLocal += target.bankEquityLocal; target.bankEquityLocal = 0;
}

/**
 * A resolution: the plan's non-cash transfer. The assuming bank's equity ends the deal up by
 * exactly the capital the plan says it needs: the net it took over, plus the guarantee (a flow,
 * below), less what it paid the receivership (a flow, below). The failed bank keeps only its
 * cash, matched by its equity, until the reserve leg settles — the cash arrives on the acquirer
 * as a flow that credits equity too, so the direct equity part is the net LESS the cash.
 *
 * The whole central-bank loan moves with the books, so nothing is left on the shell for the
 * zeroing below to erase while the central bank still carries the asset.
 */
export function assumeBankBooks(acquirer: BankingSector, target: BankingSector, plan: BankResolutionPlan, cashLocal: number): void {
  absorbBankSheet(acquirer, target, plan.centralBankLoanAssumedUSD);
  acquirer.bankEquityLocal += plan.netBookUSD - cashLocal;
  target.bankEquityLocal = cashLocal;
}
