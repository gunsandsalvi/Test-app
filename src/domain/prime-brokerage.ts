/**
 * HF1 — leverage has a lender.
 *
 * What this replaces: `LEVERAGE_ALLOWANCE.HEDGE_FUND`, a constant share of a fund's assets it was
 * simply ALLOWED to borrow — by nobody, from nobody, at no price, and never withdrawable. It is
 * the same infinite-supply shape this project has deleted everywhere else, except the thing being
 * assumed away is a prime broker's balance sheet.
 *
 * The real thing: a NAMED BANK lends against posted collateral, at a haircut, for a fee, and can
 * pull the line. Three consequences the constant could not have.
 *
 *   1. **The haircut is the price**, and it is derived, not posted: the most the collateral can
 *      reprice before the broker could sell it — for which the honest measure is the largest
 *      one-week move that market's own clearing engine permits, plus what the fund's own
 *      CONCENTRATION does to how quickly it could be liquidated at all.
 *   2. **The line consumes the broker's balance sheet**, one-for-one, like any other loan. A
 *      broker short of capital cannot finance its clients, however much they want to borrow.
 *   3. **Withdrawal is the point.** When haircuts widen or the collateral falls, the line falls
 *      below what is drawn and the fund has to sell into the market that just moved against it —
 *      which moves it further. That cascade is a real mechanism, and a constant cannot produce it.
 */

import { RegionId } from './geography';
import type { EntityId } from './ids';

export interface PrimeBrokerageLine {
  id: string;
  regionId: RegionId;
  /** The named bank whose balance sheet this line sits on. */
  brokerId: EntityId;
  /** The fund borrowing on it. */
  /** §3.13-BOOK (c2b): the hedge fund this line is extended to. */
  fundId: EntityId;
  drawnLocal: number;
  /** The share of posted collateral the broker will not lend against, this week. */
  haircutRate: number;
  /** Annualised financing rate (rule 8), struck at the broker's own cost of money. */
  rateAnnual: number;
  struckWeek: number;
}

/**
 * How much a fund may have drawn, given its own capital and the haircut on its book.
 *
 * The standard margin identity: the fund's own equity has to cover the haircut on the whole
 * position, so `E >= h x P` and what it can borrow is `P - E = E x (1/h - 1)`. A widening haircut
 * therefore shrinks the permitted position faster than it shrinks the loan, which is exactly why
 * a margin call is violent.
 */
export function maxDrawnLocal(fundEquityLocal: number, haircutRate: number): number {
  // §3.18-iii: no 1% floor on the haircut (rule 6) — a broker with nothing measured to protect
  // itself with lends without limit of its own, and the limit that stands is its balance sheet
  // (`prime-brokerage.ts`: the line is the smaller of this and the broker's room). A haircut
  // above one is arithmetic: nothing is lent.
  const h = Math.min(1, haircutRate);
  if (!(h > 0)) return Number.POSITIVE_INFINITY;
  return Math.max(0, fundEquityLocal) * (1 / h - 1);
}

export function drawnByFund(book: PrimeBrokerageLine[], fundId: string): number {
  return book.reduce((a, l) => a + (l.fundId === fundId ? l.drawnLocal : 0), 0);
}

export function lentByBroker(book: PrimeBrokerageLine[], brokerId: EntityId): number {
  return book.reduce((a, l) => a + (l.brokerId === brokerId ? l.drawnLocal : 0), 0);
}

