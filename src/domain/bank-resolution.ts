/**
 * HOW A FAILED BANK IS RESOLVED, as pure rules over its own sheet.
 *
 * A bank does not default the way a firm does (cash out and coverage under the floor); it is
 * CLOSED by its supervisor when its capital is gone, and its books do not go through a workout —
 * they go, whole, to a surviving peer the same weekend (purchase and assumption). The rules here
 * decide the two things that matter about that weekend: WHEN a bank is closed, and WHO EATS THE
 * HOLE when the books it hands over are worth less than the deposits that come with them.
 *
 * The loss order is the real one. The shell's own bond ladder stays behind as claims on the
 * receivership (its holders are bailed in — they are the one class that lent knowing this), the
 * unmodeled wholesale lenders take the next slice as a haircut on what they are owed, and only
 * what is left after both is a public cost: the treasury pays the assuming bank the difference,
 * because deposits are guaranteed and the guarantee is the government's. Depositors never lose a
 * dollar and the assuming bank never gains or loses one — it takes the net at book, and the
 * difference between that and zero moves as a named flow.
 */

import { BankingSector, HouseholdLoanPool , loanBooksOf, DepositLines } from './banking';
import { bankRwaLocal, BANK_WORKING_CAPITAL_RATIO } from './bank-pricing';

/** Prompt corrective action: the ratio at which a bank is closed — well above zero, because a
 *  bank at zero book capital has long been insolvent at market values. Real supervision closes
 *  at 2% ("critically undercapitalised"). */
export const PCA_CAPITAL_RATIO = 0.02;

/** What an assuming bank must hold against a book it takes on: the ratio a bank's treasury
 *  actually runs at, on the book's own risk weight. */
export function assumingCapitalLocal(sheet: BankingSector, facilityBookLocal: number): number {
  return bankRwaLocal(sheet, facilityBookLocal) * BANK_WORKING_CAPITAL_RATIO;
}

/** Under prompt corrective action: capital below the closure ratio, or no capital at all. */
export function isBankUnderPca(sheet: BankingSector, facilityBookLocal: number): boolean {
  const rwaLocal = bankRwaLocal(sheet, facilityBookLocal);
  if (rwaLocal > 0) return sheet.bankEquityLocal < rwaLocal * PCA_CAPITAL_RATIO;
  return sheet.bankEquityLocal < 0;
}

/** Every asset on the sheet, cash included — the one asset side the identity counts. */
export function bankSheetAssetsLocal(sheet: BankingSector, cashLocal: number, facilityBookLocal: number, bookAssetsLocal: number): number {
  // §3.13-BOOK d3b/d3d: the register books — the sovereign book at the mark plus the desks'
  // gross (`bankBookAssetsLocal`) — are handed in like the facility book.
  return loanBooksOf(sheet, facilityBookLocal) + bookAssetsLocal + cashLocal
    + (sheet.repoLentLocal ?? 0) + (sheet.onRrpLendingLocal ?? 0)
    + (sheet.sovereignAccruedCouponLocal ?? 0)
    + (sheet.primeBrokerageLoansLocal ?? 0);
}

/** The liabilities an assuming bank takes on whole: every deposit class and the secured lines.
 *  Wholesale money and equity are the two the plan decides. */
export function bankAssumedLiabilitiesLocal(sheet: BankingSector, lines: DepositLines, /** §3.17b-v: the swap-line draws, in the bank's money (`banking.ts:swapLineDrawnLocal`). */ swapLineLocal = 0): number {
  return lines.householdLocal + lines.corporateLocal + lines.institutionalLocal
    + lines.smeLocal + lines.ccpLocal
    + (sheet.repoBorrowedLocal ?? 0) + (sheet.srfBorrowingLocal ?? 0) + swapLineLocal;
}

export interface BankResolutionPlan {
  /** The shell's own traded ladder, which stays on its rows as receivership claims. Its holders
   *  take their loss through the estate; nothing here nets it against another liability. */
  ladderBailedInLocal: number;
  /** The central bank's loan the assuming bank takes on — all of it. The central bank is never
   *  haircut: a loss with no equity behind it would be money from nowhere. */
  centralBankLoanAssumedLocal: number;
  /** Assets minus everything assumed, before any loss is allocated: what the books are worth
   *  to whoever takes them, at book. */
  netBookLocal: number;
  /** The capital the assuming bank must hold against the book it takes on — its bid is the net
   *  less this, and this is what its equity gains from the deal, in every case. */
  acquirerCapitalLocal: number;
  /** The public cost: what the net book could not cover. */
  guaranteeLocal: number;
  /** What the assuming bank pays the receivership: the net above the capital it needs. */
  estateLocal: number;
}

/**
 * The least-cost bid. The assuming bank takes the books at book value and needs capital to carry
 * them — `acquirerCapitalLocal`, the working ratio on the risk it takes on. Its bid for the net is
 * whatever exceeds that; when the net falls short, the treasury pays the difference under the
 * deposit guarantee.
 *
 * THE CENTRAL BANK'S LOAN MOVES WHOLE. It used to be netted against the failed bank's own bond
 * ladder — `min(cbLoan, ownLadder)` stayed behind — and only the remainder was transferred,
 * while the transfer then zeroed the shell's balance outright and the central bank kept the
 * asset on `loansToBanksLocal`. A liability was deleted with no counterparty, and two different
 * things (a traded ladder on the tranche ledger, an unsecured loan from the central bank) were
 * treated as one. The ladder is bailed in where it lives: it stays on the shell's own rows and
 * its holders take their loss through the estate, like any other issuer's bondholders.
 */
export function planBankResolution(
  sheet: BankingSector, ownLadderPrincipalLocal: number, acquirerCapitalLocal: number, cashLocal: number, lines: DepositLines, facilityBookLocal: number, bookAssetsLocal: number, swapLineLocal = 0,
): BankResolutionPlan {
  const centralBankLoanLocal = Math.max(0, sheet.centralBankLoanLocal ?? 0);
  const netBookLocal = bankSheetAssetsLocal(sheet, cashLocal, facilityBookLocal, bookAssetsLocal) - bankAssumedLiabilitiesLocal(sheet, lines, swapLineLocal) - centralBankLoanLocal;
  const capitalLocal = Math.max(0, acquirerCapitalLocal);
  const estateLocal = Math.max(0, netBookLocal - capitalLocal);
  const shortfallLocal = Math.max(0, capitalLocal - netBookLocal);
  return {
    ladderBailedInLocal: Math.max(0, ownLadderPrincipalLocal),
    centralBankLoanAssumedLocal: centralBankLoanLocal,
    netBookLocal,
    acquirerCapitalLocal: capitalLocal,
    guaranteeLocal: shortfallLocal,
    estateLocal,
  };
}

/**
 * The strongest live peer takes the books: the best-capitalised bank that clears the regulatory
 * floor, by equity among those (size is what lets it carry the deposits), and failing any at the
 * floor, the largest equity that is not itself under PCA. Nobody → no resolution this week.
 */
export function chooseAssumingBank<T extends { sheet: BankingSector; facilityBookLocal: number }>(candidates: T[], minCapitalRatio: number): T | undefined {
  const live = candidates.filter((c) => !isBankUnderPca(c.sheet, c.facilityBookLocal));
  const ratioOf = (c: T) => { const rwa = bankRwaLocal(c.sheet, c.facilityBookLocal); return rwa > 0 ? c.sheet.bankEquityLocal / rwa : Infinity; };
  const atFloor = live.filter((c) => ratioOf(c) >= minCapitalRatio);
  const pool = atFloor.length > 0 ? atFloor : live;
  if (pool.length === 0) return undefined;
  return pool.reduce((best, c) => (c.sheet.bankEquityLocal > best.sheet.bankEquityLocal ? c : best));
}

/** Two household pools of one kind become one: the mortgage book by its vintages (the principal
 *  IS their sum — rule 4), the floating books by principal with their terms blended. */
export function mergeHouseholdPool(mine: HouseholdLoanPool, theirs: HouseholdLoanPool): HouseholdLoanPool {
  const total = mine.principalLocal + theirs.principalLocal;
  const blend = (a: number | undefined, b: number | undefined) => (
    a === undefined && b === undefined ? undefined
      : total > 0 ? ((a ?? b ?? 0) * mine.principalLocal + (b ?? a ?? 0) * theirs.principalLocal) / total
        : (a ?? b)
  );
  const out: HouseholdLoanPool = { ...mine, principalLocal: total };
  if (mine.vintages || theirs.vintages) out.vintages = [...(mine.vintages ?? []), ...(theirs.vintages ?? [])];
  const wac = blend(mine.wacAnnual, theirs.wacAnnual);
  if (wac !== undefined) out.wacAnnual = Number(wac.toFixed(4));
  const margin = blend(mine.marginBps, theirs.marginBps);
  if (margin !== undefined) out.marginBps = Math.round(margin);
  const wam = blend(mine.wamWeeks, theirs.wamWeeks);
  if (wam !== undefined) out.wamWeeks = Math.round(wam);
  return out;
}

/** The statistics a sheet reports, re-read after its lines moved (readings, never drivers). */
export function restateBankSheetStatistics(sheet: BankingSector, cashLocal: number, lines: DepositLines, facilityBookLocal: number): void {
  const rwaLocal = bankRwaLocal(sheet, facilityBookLocal);
  sheet.bankCapitalRatio = Number((rwaLocal > 0 ? sheet.bankEquityLocal / rwaLocal : 0.13).toFixed(4));
  // §3.18-iii: an overdrawn reserve account reads as overdrawn (rule 6); the overdraft sweep is
  // the mechanism that answers it, and `max(0, …)` hid what it had to answer.
  sheet.centralBankReservesLocal = cashLocal;
  sheet.moneySupplyM2Local = lines.householdLocal + lines.corporateLocal;
}
