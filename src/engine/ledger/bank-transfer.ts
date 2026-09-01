/**
 * §7.339 — ONE BANK'S BOOKS ONTO ANOTHER'S. The two events that move a bank whole — a merger
 * and a resolution — share this transfer; it lives in the ledger because it writes every
 * balance line there is. Cash is the one line it never touches: reserves move only by a named
 * flow, and the caller posts that leg (a merger moves them directly at the sheet level, a
 * resolution as a payment between the two named accounts).
 */

import { BankingSector } from '../../domain/banking';
import { BankResolutionPlan, mergeDesks, mergeHouseholdPool } from '../../domain/bank-resolution';

/**
 * Every non-cash line moves and the target's copy is zeroed. Wholesale money moves by the amount
 * the caller says survives; equity is the caller's arithmetic (it depends on both sides).
 */
export function absorbBankSheet(acquirer: BankingSector, target: BankingSector, wholesaleAssumedUSD: number): void {
  // Deposits, every class.
  acquirer.depositsUSD += target.depositsUSD; target.depositsUSD = 0;
  acquirer.corporateDepositsUSD = (acquirer.corporateDepositsUSD ?? 0) + (target.corporateDepositsUSD ?? 0); target.corporateDepositsUSD = 0;
  acquirer.institutionalDepositsUSD = (acquirer.institutionalDepositsUSD ?? 0) + (target.institutionalDepositsUSD ?? 0); target.institutionalDepositsUSD = 0;
  acquirer.unmodeledDepositsUSD = (acquirer.unmodeledDepositsUSD ?? 0) + (target.unmodeledDepositsUSD ?? 0); target.unmodeledDepositsUSD = 0;
  acquirer.smeDepositsUSD = (acquirer.smeDepositsUSD ?? 0) + (target.smeDepositsUSD ?? 0); target.smeDepositsUSD = 0;
  acquirer.wholesaleFundingUSD = (acquirer.wholesaleFundingUSD ?? 0) + wholesaleAssumedUSD; target.wholesaleFundingUSD = 0;
  // Secured lines and the paper behind them.
  acquirer.srfBorrowingUSD = (acquirer.srfBorrowingUSD ?? 0) + (target.srfBorrowingUSD ?? 0); target.srfBorrowingUSD = 0;
  acquirer.repoBorrowedUSD = (acquirer.repoBorrowedUSD ?? 0) + (target.repoBorrowedUSD ?? 0); target.repoBorrowedUSD = 0;
  acquirer.repoLentUSD = (acquirer.repoLentUSD ?? 0) + (target.repoLentUSD ?? 0); target.repoLentUSD = 0;
  acquirer.onRrpLendingUSD = (acquirer.onRrpLendingUSD ?? 0) + (target.onRrpLendingUSD ?? 0); target.onRrpLendingUSD = 0;
  acquirer.repoEncumberedCollateralUSD = (acquirer.repoEncumberedCollateralUSD ?? 0) + (target.repoEncumberedCollateralUSD ?? 0); target.repoEncumberedCollateralUSD = 0;
  // The credit books.
  acquirer.businessLoans = [...(acquirer.businessLoans || []), ...(target.businessLoans || [])];
  acquirer.businessLoanBookUSD += target.businessLoanBookUSD;
  target.businessLoans = []; target.businessLoanBookUSD = 0;
  const pools = [...(acquirer.householdLoans || [])];
  (target.householdLoans || []).forEach((pl) => {
    const i = pools.findIndex((x) => x.kind === pl.kind);
    if (i < 0) pools.push({ ...pl, vintages: pl.vintages ? [...pl.vintages] : undefined });
    else pools[i] = mergeHouseholdPool(pools[i], pl);
  });
  acquirer.householdLoans = pools;
  acquirer.consumerLoanBookUSD = pools.reduce((a, pl) => a + pl.principalUSD, 0);
  target.householdLoans = []; target.consumerLoanBookUSD = 0;
  acquirer.primeBrokerageLoansUSD = (acquirer.primeBrokerageLoansUSD ?? 0) + (target.primeBrokerageLoansUSD ?? 0); target.primeBrokerageLoansUSD = 0;
  // The securities books.
  const tenors = { ...(acquirer.sovereignBondHoldingsByTenor || {}) };
  Object.entries(target.sovereignBondHoldingsByTenor || {}).forEach(([k, v]) => { tenors[k] = (tenors[k] ?? 0) + (Number(v) || 0); });
  acquirer.sovereignBondHoldingsByTenor = tenors;
  acquirer.sovereignBondHoldingsUSD = Object.values(tenors).reduce((a, v) => a + v, 0);
  target.sovereignBondHoldingsByTenor = {}; target.sovereignBondHoldingsUSD = 0;
  acquirer.sovereignAccruedCouponUSD = (acquirer.sovereignAccruedCouponUSD ?? 0) + (target.sovereignAccruedCouponUSD ?? 0); target.sovereignAccruedCouponUSD = 0;
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
  absorbBankSheet(acquirer, target, target.wholesaleFundingUSD ?? 0);
  acquirer.cashReservesUSD += target.cashReservesUSD; target.cashReservesUSD = 0;
  acquirer.bankEquityUSD += target.bankEquityUSD; target.bankEquityUSD = 0;
}

/**
 * A resolution: the plan's non-cash transfer. The assuming bank's equity ends the deal up by
 * exactly the capital the plan says it needs: the net it took over, plus the haircut it did not
 * assume, plus the guarantee (a flow, below), less what it paid the receivership (a flow, below).
 * The failed bank keeps only its cash, matched by its equity, until the reserve leg settles — the
 * cash arrives on the acquirer as a flow that credits equity too, so the direct equity part is
 * the net plus the haircut, LESS the cash.
 */
export function assumeBankBooks(acquirer: BankingSector, target: BankingSector, plan: BankResolutionPlan): void {
  const cashUSD = target.cashReservesUSD;
  absorbBankSheet(acquirer, target, plan.wholesaleAssumedUSD);
  acquirer.bankEquityUSD += plan.netBookUSD + plan.wholesaleHaircutUSD - cashUSD;
  target.bankEquityUSD = cashUSD;
  target.wholesaleFundingUSD = 0;
}
