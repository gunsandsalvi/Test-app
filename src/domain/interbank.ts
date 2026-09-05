/**
 * §3.20b — THE INTERBANK UNSECURED LOAN. One bank lends another its reserves overnight (a week,
 * on this model's clock) against nothing but the borrower's name, at policy plus what the market
 * charges that name. Struck at the funding close (`stages/interbank.ts`), where the week's flows
 * have made the position knowable; matured at the next open, principal and interest as
 * payments between the two named banks. What no bank will lend reaches the window.
 */

import type { RegionId } from './geography';
import type { EntityId } from './ids';

export interface InterbankLoan {
  id: string;
  regionId: RegionId;
  lenderId: EntityId;
  borrowerId: EntityId;
  principalLocal: number;
  /** Annualised decimal: policy plus the cleared spread on the borrower's name (rule 8). */
  rateAnnual: number;
  struckWeek: number;
  /** Overnight on the model's clock: `struckWeek + 1`. */
  maturityWeek: number;
}

export const interbankLoanId = (regionId: RegionId, lenderId: EntityId, borrowerId: EntityId, week: number): string =>
  `IB:${regionId}:${lenderId}>${borrowerId}@${week}`;

/** Interest owed over the loan's life — what settles at maturity, to the lender's own account. */
export function interbankInterestToMaturityLocal(c: InterbankLoan): number {
  const weeks = Math.max(1, c.maturityWeek - c.struckWeek);
  return (c.principalLocal * c.rateAnnual * weeks) / 52;
}

export function interbankBorrowedLocal(book: readonly InterbankLoan[], bankId: EntityId): number {
  return book.reduce((a, c) => a + (c.borrowerId === bankId ? c.principalLocal : 0), 0);
}

export function interbankLentLocal(book: readonly InterbankLoan[], bankId: EntityId): number {
  return book.reduce((a, c) => a + (c.lenderId === bankId ? c.principalLocal : 0), 0);
}
