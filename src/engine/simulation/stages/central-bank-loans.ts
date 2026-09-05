/**
 * §3.20-LLR-a — THE CENTRAL BANK'S LOANS TO ITS BANKS, AS A BOOK. Struck at the funding close for
 * what the interbank market left unfunded (`bank-funding-close.ts`), serviced and rolled at the
 * open (`02b`), re-seated when a bank is resolved. The two scalars that stood for this —
 * `CentralBank.loansToBanksLocal` and `BankingSector.centralBankLoanLocal` — are reads of it.
 */

import { WeeklyStepContext } from './context';
import { RegionId, Region } from '../../../types';
import type { EntityId, Ticker } from '../../../domain/ids';
import { BankingSector } from '../../../domain/banking';
import { CentralBankLoan, centralBankLoanId, centralBankLoanInterestWeeklyLocal, centralBankLoansOwedLocal, centralBankLoansLentLocal } from '../../../domain/central-bank-loan';
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

/** The close: a bank short of its buffer after the market is lent the shortfall, overnight, as a row. */
export function strikeCentralBankLoan(ctx: WeeklyStepContext, regionId: RegionId, reg: Region, bank: Bank, principalLocal: number): CentralBankLoan | undefined {
  if (!(principalLocal > 0) || !bank.bankBalanceSheet) return undefined;
  const week = ctx.nextWeek;
  const loan: CentralBankLoan = {
    id: centralBankLoanId(regionId, bank.id, week), regionId, bankId: bank.id,
    principalLocal: Math.round(principalLocal), rateAnnual: centralBankLoanRateAnnual(reg), struckWeek: week, maturityWeek: week + 1,
  };
  const book = centralBankLoanBookOf(ctx.v2, regionId);
  const same = book.find((c) => c.id === loan.id);
  // A second round of the same close adds to the same overnight row.
  publishCentralBankLoanBook(ctx.v2, regionId, same
    ? book.map((c) => (c.id === loan.id ? { ...c, principalLocal: c.principalLocal + loan.principalLocal } : c))
    : [...book, loan]);
  // The lender of last resort pays with reserves it creates; the loan is its asset.
  pay(ctx, {
    payer: { kind: 'CENTRAL_BANK', region: regionId }, payee: bankSecuritiesParty(bank),
    amount: loan.principalLocal, currency: currencyOf(regionId), reason: 'central bank loan drawn',
  });
  return loan;
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
