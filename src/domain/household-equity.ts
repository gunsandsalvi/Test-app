/**
 * §3.13 C2.a — THE HOUSEHOLD SECTOR BUYS ITS OWN EQUITY.
 *
 * The sector holds a register book of listed shares per region (§9.13-EQUITY) and could only ever
 * SELL it: the liquidity ladder's last rung (§7.281) put a slice into the float when deposits and
 * fund shares were exhausted, and nothing ever bid the other way — the largest holder class in
 * the model was a one-way participant. These three reads are the buy side, and none of them is a
 * stated number:
 *
 *   · the SPLIT of the week's equity saving between the broad fund and the direct book is the mix
 *     the sector already holds, read off the register and the fund shares. A sector holding
 *     nothing directly is the 100% indexer the coverage rule already makes it; one that holds a
 *     third of its equity directly keeps holding a third of it directly;
 *   · the BUDGET a purchase may claim is the announced slice bounded by the deposits above the
 *     buffer floor the saving decision itself keeps — a bid is a claim on money (§7.19);
 *   · the SCHEDULE is an indexer's: no research desk, so no reservation (`etf-demand.ts`), the
 *     budget spread across the region's float by value and struck at the reference price.
 *
 * Announced by `etf-flows.ts` (the ladder's owner) and bid by the next week's 07e session, the
 * one-week announce-then-price rhythm every flow in that stage follows.
 */

import type { InstrumentId } from './ids';

/** The share of this week's equity saving that goes to the sector's own book: its current mix. */
export function directShareOfEquitySaving(directLocal: number, etfLocal: number): number {
  const direct = Math.max(0, directLocal);
  const funds = Math.max(0, etfLocal);
  return direct + funds > 0 ? direct / (direct + funds) : 0;
}

/**
 * What the purchase may spend: the slice announced last week, and never more than the deposits
 * standing above the buffer floor — the money is the deposits stage 02 credited, and the buffer
 * is the one the saving decision was taken against (rule 4: the same buffer, the same number).
 */
export function householdDirectBudgetLocal(args: { announcedLocal: number; depositsLocal: number; bufferFloorLocal: number }): number {
  return Math.max(0, Math.min(args.announcedLocal, args.depositsLocal - args.bufferFloorLocal));
}

export interface DirectEquityName {
  id: InstrumentId;
  /** The reference price this session opened on. */
  refPrice: number;
  /** The value of the name's tradable float at that price: the weight an indexer buys it at. */
  floatValueLocal: number;
}

/**
 * The shares the sector bids for, name by name: the budget across the float by value, struck at
 * the reference price. A name with no float or no price is not for sale and gets nothing.
 */
export function householdDirectPurchaseShares(budgetLocal: number, names: readonly DirectEquityName[]): Map<InstrumentId, number> {
  const out = new Map<InstrumentId, number>();
  const investable = names.filter((n) => n.refPrice > 0 && n.floatValueLocal > 0);
  const totalFloatLocal = investable.reduce((s, n) => s + n.floatValueLocal, 0);
  if (!(budgetLocal > 0) || !(totalFloatLocal > 0)) return out;
  investable.forEach((n) => { out.set(n.id, (budgetLocal * (n.floatValueLocal / totalFloatLocal)) / n.refPrice); });
  return out;
}
