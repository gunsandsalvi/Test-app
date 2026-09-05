/**
 * §3.20-LLR-a — THE CENTRAL BANK'S LOAN TO A BANK IS A CONTRACT. The funding close lends a bank
 * what it is short of its buffer (`bank-funding-close.ts`); each such loan is a row of the
 * contract store — the central bank as lender, the bank as borrower, a principal, the rate it
 * was struck at (the window rate plus the unsecured penalty), overnight on the model's clock —
 * matured at the next open (`02b`): repaid from the bank's cash above its buffer, and what
 * cannot be repaid ROLLS as the same contract at that morning's rate. `loansToBanksLocal` on the
 * central bank's sheet and `centralBankLoanLocal` on the bank's are READS of this book.
 *
 * What the book does not yet have is Bagehot's four (`the-central-bank.md` D3): it is struck
 * unsecured, without a solvency test, and cannot be refused — that is §3 step 20-LLR's, which
 * replaces the loan with a seat in the close session and writes into these rows.
 */

import type { RegionId } from './geography';
import type { EntityId } from './ids';

export interface CentralBankLoan {
  id: string;
  regionId: RegionId;
  bankId: EntityId;
  principalLocal: number;
  /** Annualised decimal: the window rate plus the unsecured penalty, as struck or re-struck. */
  rateAnnual: number;
  struckWeek: number;
  /** Overnight on the model's clock: `struckWeek + 1`; a rolled loan moves it a week on. */
  maturityWeek: number;
}

export const centralBankLoanId = (regionId: RegionId, bankId: EntityId, week: number): string =>
  `CBL:${regionId}:${bankId}@${week}`;

/** One week's interest on a loan, at its own rate — what the bank pays the central bank at the open. */
export function centralBankLoanInterestWeeklyLocal(c: CentralBankLoan): number {
  return (c.principalLocal * c.rateAnnual) / 52;
}

export function centralBankLoansOwedLocal(book: readonly CentralBankLoan[], bankId: EntityId): number {
  return book.reduce((a, c) => a + (c.bankId === bankId ? c.principalLocal : 0), 0);
}

export function centralBankLoansLentLocal(book: readonly CentralBankLoan[]): number {
  return book.reduce((a, c) => a + c.principalLocal, 0);
}
