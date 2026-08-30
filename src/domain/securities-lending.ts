/**
 * HF — the securities-lending market, and with it the model's first real equity SHORT.
 *
 * **What was missing.** `HedgeFundStrategy` has carried `'LONG_SHORT_EQUITY'` since the funds were
 * introduced, and the comment beside it has said the same thing the whole time: it needs a real
 * short to be whole. It never had one. A "long-short" fund in this model held longs, and the short
 * half of its name was a label on an enum — the exact shape rule 3 exists to forbid, one real thing
 * (a paired book) with no representation at all. Nothing in the model could express a participant
 * who profits when a price falls, so every equity schedule sloped the same way and the only bearish
 * act available to anyone was to own less.
 *
 * **A short is three obligations, not a negative number.** Selling a share you do not own means
 * finding somebody who owns it and will lend it, delivering their share to your buyer, and owing
 * that lender a share back. Each of those is a real leg and each has to be somewhere:
 *
 *  - **BORROW.** The lender's shares move to the borrower against cash collateral at the market
 *    value, and the borrower pays a fee for the loan. Both legs are real money between two named
 *    parties, so a fund cannot short what it cannot collateralise (rule 14).
 *  - **LOCATE.** The borrow is an auction, not an entitlement. The float this book prices is the
 *    borrow DEMAND; the participants are the holders who will lend. A borrow the auction does not
 *    fill is a short that does not happen — which is what "hard to borrow" means when it is a
 *    measured outcome rather than a flag.
 *  - **RECALL and BUY-IN.** A lender that sells more of the name than it still holds unlent has, by
 *    that act, recalled its loan. The borrower then has to buy the shares back at whatever the
 *    market is asking — a purchase with no reservation price, because the obligation is to deliver
 *    shares, not to get a good price. That is the SQUEEZE, and it is emergent: forced buying lifts
 *    the price in 07e, which widens every remaining short's loss, while the borrow auction reprices
 *    against a lendable base that just got smaller.
 *
 * **The price this book sets** is the borrow FEE, in bps of market value per year (rule 9). It is
 * YIELD_LIKE: a lender supplies more of its inventory the higher the fee, so a large borrow demand
 * against a small lendable base clears dear. A lender's reservation is what the loan costs it to
 * carry — the capital consumed by the one-week gap the collateral would have to cover, at the
 * lender's own required return — which is the identical arithmetic the bond and CDS books price
 * with, and it makes a volatile name dearer to borrow than a quiet one without anybody saying so.
 */

import { RegionId } from './geography';

export type LendingParty = { kind: 'INSTITUTION'; id: string };

export interface SecurityLoan {
  id: string;
  regionId: RegionId;
  /** The company whose shares are on loan — the same key 07e's equity book prices. */
  instrumentId: string;
  lender: LendingParty;
  borrower: LendingParty;
  shares: number;
  /** The fee the loan was struck at, in bps of market value per year (rule 9). */
  feeBps: number;
  /** What the borrower posted, and what comes back when the shares do. */
  collateralUSD: number;
  /**
   * The lender's WHOLE position in the name the week this loan was struck — shares it could still
   * deliver plus everything it already had out. A recall is the lender selling out from under the
   * loan, and this is what makes that observable: lending does not shrink the position, selling
   * does, so a fall below this is a sale and the difference is what has to come back.
   */
  lenderPositionAtStrike: number;
  struckWeek: number;
  /** Set the week the lender sold out from under the loan; the borrower owes a buy-in. */
  recalledWeek?: number;
}

/** One week of the borrow fee, on what the position is worth now. */
export function loanWeeklyFeeUSD(loan: SecurityLoan, pricePerShare: number): number {
  return (loan.shares * Math.max(0, pricePerShare) * (loan.feeBps / 10000)) / 52;
}

/** Everything one party has out on loan in one name, whichever side it is on. */
export function sharesOnLoan(
  book: SecurityLoan[],
  side: 'lender' | 'borrower',
  entityId: string,
  instrumentId: string
): number {
  return book.reduce((a, l) => (
    l.instrumentId === instrumentId && l[side].id === entityId ? a + l.shares : a
  ), 0);
}

/**
 * The one-week price gap a stock loan's collateral has to cover — the lender's real exposure to
 * the borrower between two marks. Measured from the name's own realised volatility where there is
 * enough history for one, and otherwise from the most the equity book itself will let a price move
 * in a week, which is the honest upper bound that book states about itself.
 */
export function loanOneWeekGap(args: { annualVol: number | undefined; bookWeeklyMoveCap: number }): number {
  const fromVol = args.annualVol === undefined ? undefined : args.annualVol / Math.sqrt(52);
  if (fromVol === undefined) return args.bookWeeklyMoveCap;
  return Math.min(args.bookWeeklyMoveCap, fromVol);
}

/**
 * What a holder must earn to lend: the capital the loan's gap risk consumes, at its own required
 * return. Annual bps of market value, because that is the unit the fee is quoted in.
 */
export function lendingReservationFeeBps(args: { requiredReturn: number; oneWeekGap: number }): number {
  return Math.max(0, args.requiredReturn) * Math.max(0, args.oneWeekGap) * 10000;
}

/**
 * How large a short a fund wants in one name: the mirror image of the long schedule it already
 * runs. A long takes full size at `fullSizeDiscount` BELOW the holder's own fair value; a short
 * takes full size at the same distance ABOVE it. No new parameter — the same disagreement about
 * value that gives the equity book's demand curve its slope, read from the other end.
 */
export function shortSizeShares(args: {
  pricePerShare: number;
  fairValuePerShare: number;
  structuralShares: number;
  maxOverweightMultiple: number;
  fullSizeDiscount: number;
}): number {
  const { pricePerShare, fairValuePerShare: fair, fullSizeDiscount } = args;
  if (!(fair > 0) || !(pricePerShare > fair)) return 0;
  const premium = pricePerShare / fair - 1;
  const conviction = Math.min(1, premium / Math.max(0.0001, fullSizeDiscount));
  return Math.max(0, args.structuralShares) * args.maxOverweightMultiple * conviction;
}

/**
 * What a party's stock-loan positions are worth to it, net, as one balance-sheet number — the
 * same shape `repoLentUSD` takes for the repo book: the contracts are the one representation, this
 * is the scalar derived from them.
 *
 * A LENDER has parted with shares and holds cash against them, so its position is the shares it
 * is owed back less the collateral it must return. A BORROWER is the mirror: the collateral it is
 * owed back less the shares it must deliver. The two net to zero at the strike price and diverge
 * with the mark — which is precisely the short's profit and loss, and the reason it has to be
 * carried at all.
 */
export function stockLoanNetUSD(
  book: SecurityLoan[],
  entityId: string,
  priceOf: (instrumentId: string) => number
): number {
  return book.reduce((a, l) => {
    const markUSD = l.shares * Math.max(0, priceOf(l.instrumentId));
    if (l.lender.id === entityId) return a + markUSD - l.collateralUSD;
    if (l.borrower.id === entityId) return a + l.collateralUSD - markUSD;
    return a;
  }, 0);
}
