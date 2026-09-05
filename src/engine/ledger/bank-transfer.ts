/**
 * ONE BANK'S BOOKS ONTO ANOTHER'S. The two events that move a bank whole — a merger
 * and a resolution — share this transfer; it lives in the ledger because it writes every
 * balance line there is. Cash is the one line it never touches: reserves move only by a named
 * flow, and the caller posts that leg (a merger moves them directly at the sheet level, a
 * resolution as a payment between the two named accounts).
 */

import { BankingSector } from '../../domain/banking';
import type { V2World } from '../../engine2/world';
import type { EntityId } from '../../domain/ids';
import { bankPartyOf, bankSecuritiesPartyOf } from '../../domain/party';
import { transferHolding, lienUnitsOf, setLien, type HoldingSpec, type HoldingKind } from './holdings-ledger';
import { deskRowsOf } from '../desk-register';
import { bankSovereignPositions } from '../sovereign-register';
import { BankResolutionPlan, mergeHouseholdPool } from '../../domain/bank-resolution';

/**
 * Every non-cash line moves and the target's copy is zeroed. The central bank's loan moves by
 * the amount the caller says is assumed; equity is the caller's arithmetic (it depends on both
 * sides).
 */
export function absorbBankSheet(v2: V2World, acquirerId: EntityId, targetId: EntityId, acquirer: BankingSector, target: BankingSector, centralBankLoanAssumedLocal: number): void {
  // A3.6c: the deposit lines are the depositors' accounts — the household sector's and the
  // pools' rows move with `moveSectorRowsToBank` at the caller, the firms' and institutions'
  // accounts follow their house bank (`rekeyBankLinks`); nothing to move here.
  acquirer.centralBankLoanLocal = (acquirer.centralBankLoanLocal ?? 0) + centralBankLoanAssumedLocal; target.centralBankLoanLocal = 0;
  // Secured lines and the paper behind them.
  acquirer.srfBorrowingLocal = (acquirer.srfBorrowingLocal ?? 0) + (target.srfBorrowingLocal ?? 0); target.srfBorrowingLocal = 0;
  acquirer.repoBorrowedLocal = (acquirer.repoBorrowedLocal ?? 0) + (target.repoBorrowedLocal ?? 0); target.repoBorrowedLocal = 0;
  acquirer.repoLentLocal = (acquirer.repoLentLocal ?? 0) + (target.repoLentLocal ?? 0); target.repoLentLocal = 0;
  acquirer.onRrpLendingLocal = (acquirer.onRrpLendingLocal ?? 0) + (target.onRrpLendingLocal ?? 0); target.onRrpLendingLocal = 0;
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
  // The securities books. §3.13-BOOK d3b: the target's own sovereign book is register rows, and
  // it moves row by row, by wire, from the failed bank's book to the assuming bank's.
  // §3.13-BOOK d5a: a lien moves WITH the rows it binds — released on the failed bank's row so the
  // transfer is not a sale under it, and re-set on the assuming bank's; the novation that follows
  // (`rekeyBankLinks`) re-publishes the repo book and finds the register already agreeing.
  bankSovereignPositions(v2, targetId).forEach((p) => {
    if (!(p.faceLocal > 0) && !(p.valueLocal > 0)) return;
    const lienUnits = lienUnitsOf(v2, targetId, 'GOV_BOND', p.bondId);
    if (lienUnits > 0) setLien(v2, targetId, 'GOV_BOND', p.bondId, p.issuerRegion, 0);
    transferHolding(v2, bankPartyOf(targetId), bankPartyOf(acquirerId),
      { instrumentType: 'GOV_BOND', instrumentId: p.bondId, issuerRegion: p.issuerRegion, valueLocal: p.valueLocal, units: p.faceLocal },
      'bank resolution: sovereign book assumed');
    if (lienUnits > 0) setLien(v2, acquirerId, 'GOV_BOND', p.bondId, p.issuerRegion, lienUnitsOf(v2, acquirerId, 'GOV_BOND', p.bondId) + lienUnits);
  });
  acquirer.sovereignAccruedCouponLocal = (acquirer.sovereignAccruedCouponLocal ?? 0) + (target.sovereignAccruedCouponLocal ?? 0); target.sovereignAccruedCouponLocal = 0;
  // §3.13-BOOK d3d: the desks' inventory is register rows on the securities book and moves the
  // same way, row by row, by wire. A SHORT row (a market maker that sold what it did not have) is
  // assumed by the same |value| wired the other way: the failed desk ends flat and the assuming
  // desk carries the short.
  deskRowsOf(v2, targetId).forEach((p) => {
    const spec: HoldingSpec = {
      instrumentType: p.kind as HoldingKind, instrumentId: p.instrumentId, issuerRegion: p.issuerRegion,
      valueLocal: Math.abs(p.inventoryLocal), units: Math.abs(p.units),
      ...(p.shares !== undefined ? { shares: Math.abs(p.shares) } : {}),
    };
    const [from, to] = p.inventoryLocal < 0 || (p.inventoryLocal === 0 && p.units < 0)
      ? [bankSecuritiesPartyOf(acquirerId), bankSecuritiesPartyOf(targetId)]
      : [bankSecuritiesPartyOf(targetId), bankSecuritiesPartyOf(acquirerId)];
    transferHolding(v2, from, to, spec, 'bank resolution: desk assumed');
  });
  if (target.fxDealerBook) {
    const mine = acquirer.fxDealerBook ?? { netNotionalByRegion: {}, grossNotionalLocal: 0 };
    const net = { ...mine.netNotionalByRegion };
    Object.entries(target.fxDealerBook.netNotionalByRegion || {}).forEach(([k, v]) => { net[k] = (net[k] ?? 0) + v; });
    acquirer.fxDealerBook = {
      ...mine, netNotionalByRegion: net,
      grossNotionalLocal: mine.grossNotionalLocal + target.fxDealerBook.grossNotionalLocal,
    };
    target.fxDealerBook = undefined;
  }
}

/** A merger: everything moves, cash and equity included, at the sheet level. */
export function mergeBankSheets(v2: V2World, acquirerId: EntityId, targetId: EntityId, acquirer: BankingSector, target: BankingSector): void {
  absorbBankSheet(v2, acquirerId, targetId, acquirer, target, target.centralBankLoanLocal ?? 0);
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
export function assumeBankBooks(v2: V2World, acquirerId: EntityId, targetId: EntityId, acquirer: BankingSector, target: BankingSector, plan: BankResolutionPlan, cashLocal: number): void {
  absorbBankSheet(v2, acquirerId, targetId, acquirer, target, plan.centralBankLoanAssumedLocal);
  acquirer.bankEquityLocal += plan.netBookLocal - cashLocal;
  target.bankEquityLocal = cashLocal;
}
