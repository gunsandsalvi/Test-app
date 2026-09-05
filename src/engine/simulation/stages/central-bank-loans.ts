/**
 * §3.20-LLR-a — THE CENTRAL BANK'S LOANS TO ITS BANKS, AS A BOOK: serviced and rolled at the open
 * (`02b`), re-seated when a bank is resolved. The two scalars that stood for this —
 * `CentralBank.loansToBanksLocal` and `BankingSector.centralBankLoanLocal` — are reads of it.
 *
 * §3.20-LLR-ii — NOTHING STRIKES A ROW ANY MORE. The funding close lent whatever the market left
 * unfunded, unsecured and unrefusable; that loan is deleted, the standing-facility seat in the
 * repo book is the window's only lending, and a bank that cannot fund ends the week short. The
 * kind and this service stay for what §3 step 20-LLR-iii may write into them.
 */

import { WeeklyStepContext } from './context';
import { RegionId, Region } from '../../../types';
import type { EntityId, Ticker } from '../../../domain/ids';
import { BankingSector } from '../../../domain/banking';
import { CentralBankLoan, centralBankLoanInterestWeeklyLocal, centralBankLoansOwedLocal, centralBankLoansLentLocal } from '../../../domain/central-bank-loan';
import { centralBankLoanBookOf, publishCentralBankLoanBook } from '../../ledger/contract-ledger';
import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { bankParty, bankSecuritiesParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { pay } from './settlement';
import { bankCashBufferRatioOf, SRF_SPREAD_BPS } from '../../macro/banking';

/** The penalty over the standing-facility rate an unsecured central-bank loan carries. */
export const CENTRAL_BANK_LOAN_PENALTY_BPS = 100;

type Bank = { id: EntityId; ticker: Ticker; region: RegionId; management?: import('../../../domain/preferences').Preferences; bankBalanceSheet?: BankingSector };

/** The window's unsecured rate this week: policy, the facility spread, the penalty. */
export const centralBankLoanRateAnnual = (reg: Pick<Region, 'policyRate'>): number =>
  Number((reg.policyRate + (SRF_SPREAD_BPS + CENTRAL_BANK_LOAN_PENALTY_BPS) / 10000).toFixed(6));

/** The sheets' derived lines, from the book — the one writer of both. */
export function syncCentralBankLoanSheets(ctx: WeeklyStepContext, regionId: RegionId, reg: Region, banks: readonly Bank[]): void {
  const book = centralBankLoanBookOf(ctx.v2, regionId);
  banks.forEach((b) => { if (b.bankBalanceSheet) b.bankBalanceSheet.centralBankLoanLocal = Math.round(centralBankLoansOwedLocal(book, b.id)); });
  if (reg.centralBankSheet) reg.centralBankSheet.loansToBanksLocal = Math.round(centralBankLoansLentLocal(book));
}

/**
 * The open: every loan due pays its week's interest at its own rate (the bank's own account,
 * so the settlement books it to equity) and repays what the bank holds above its buffer, oldest
 * first; what it cannot repay ROLLS — the same contract, a week on, at this morning's rate.
 */
export function serviceCentralBankLoans(ctx: WeeklyStepContext, regionId: RegionId, reg: Region, banks: readonly Bank[]): void {
  const week = ctx.nextWeek;
  const book = centralBankLoanBookOf(ctx.v2, regionId);
  if (book.length === 0) { syncCentralBankLoanSheets(ctx, regionId, reg, banks); return; }
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const money = currencyOf(regionId);
  const excessByBank = new Map<EntityId, number>();
  banks.forEach((b) => {
    const bufferLocal = Math.max(0, householdDepositsAt(ctx.v2, b.ticker, money)) * bankCashBufferRatioOf(b);
    excessByBank.set(b.id, Math.max(0, bankReservesOf(ctx.v2, b.id) - bufferLocal));
  });
  const kept: CentralBankLoan[] = [];
  let interestTotal = 0;
  [...book].sort((a, b) => a.struckWeek - b.struckWeek || (a.id < b.id ? -1 : 1)).forEach((c) => {
    const bank = bankById.get(c.bankId);
    if (!bank) { kept.push(c); return; } // a bank resolution re-seats rows before this runs; an unknown borrower is left standing
    const interestLocal = centralBankLoanInterestWeeklyLocal(c);
    if (interestLocal > 0) {
      pay(ctx, { payer: bankParty(bank), payee: { kind: 'CENTRAL_BANK', region: regionId }, amount: interestLocal, currency: money, reason: 'central bank loan interest' });
      interestTotal += interestLocal;
    }
    if (c.maturityWeek > week) { kept.push(c); return; }
    const excess = excessByBank.get(c.bankId) ?? 0;
    const repayLocal = Math.min(c.principalLocal, excess);
    if (repayLocal >= 1e6) {
      pay(ctx, { payer: bankSecuritiesParty(bank), payee: { kind: 'CENTRAL_BANK', region: regionId }, amount: repayLocal, currency: money, reason: 'central bank loan repaid' });
      excessByBank.set(c.bankId, excess - repayLocal);
    }
    const leftLocal = c.principalLocal - (repayLocal >= 1e6 ? repayLocal : 0);
    if (leftLocal > 1) kept.push({ ...c, principalLocal: Math.round(leftLocal), rateAnnual: centralBankLoanRateAnnual(reg), maturityWeek: week + 1 });
  });
  publishCentralBankLoanBook(ctx.v2, regionId, kept);
  if (reg.centralBankSheet) reg.centralBankSheet.lastLoanInterestLocal = (reg.centralBankSheet.lastLoanInterestLocal ?? 0) + interestTotal;
  syncCentralBankLoanSheets(ctx, regionId, reg, banks);
}

/** A resolved bank's loans are assumed by the bank that takes its book: the rows re-seat. */
export function reseatCentralBankLoans(ctx: WeeklyStepContext, regionId: RegionId, fromBankId: EntityId, toBankId: EntityId): void {
  const book = centralBankLoanBookOf(ctx.v2, regionId);
  if (!book.some((c) => c.bankId === fromBankId)) return;
  publishCentralBankLoanBook(ctx.v2, regionId, book.map((c) => (c.bankId === fromBankId ? { ...c, bankId: toBankId } : c)));
  const reg = ctx.updatedRegions[regionId];
  if (reg) syncCentralBankLoanSheets(ctx, regionId, reg, ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet && c.region === regionId));
}
