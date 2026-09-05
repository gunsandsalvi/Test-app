/**
 * §3.17e-ii-a — THE REGISTRY OF COMPARABLES, and the book that reads it.
 *
 * An arbitrage is not a flag. It is TWO PRICES FOR THE SAME RISK, and every such pair in this
 * world is already declared, because the audit measures them (§3 step 17f). A COMPARABLE is two
 * priced things and the relationship that should hold between them: a READ (what the two prices
 * disagree by, annualised, and what holding the pair costs), and two LEGS (what to buy and what
 * to sell, each at the price that keeps the edge). The relative-value book — a hedge fund with
 * the `RELATIVE_VALUE` strategy — reads the registry, sizes each pair by its edge net of carry
 * against the capital its broker will finance, and places BOTH legs in the markets that clear
 * them (rule 5). A new asset class joins by declaring its comparable, never by growing a flag.
 *
 * THE FIRST ENTRY is the government bond basis: the future against the cash bond carried at the
 * repo rate (`bond-future.ts:bondFuturesCarryPrice`). Future rich: long the deliverable, financed
 * on the prime-brokerage line, short the line. The book is CAPITAL-CONSTRAINED and can LOSE — the
 * position is what its cash and its broker's haircut carry, its futures post real margin, and its
 * legs clear against everyone else's — which is what makes it a mechanism and not a clamp: a
 * basis that survives it is a finding, and one that only survived because nobody could trade it
 * was never a price.
 */

import type { RegionId } from './geography';
import type { InstrumentId } from './ids';
import { bondFuturesCarryPrice } from './derivatives/classes/bond-future';

/** The markets a leg can clear in. A comparable joins by naming the two its legs need. */
export type ComparableMarket = 'SOVEREIGN_CASH' | 'BOND_FUTURE';

/** One leg of a pair, as the market that clears it reads it: a size (+ long / − short, in face),
 *  the price it is worth doing at (a long buys below it, a short sells above it), how far past
 *  that it takes to reach full size, and — for a cash leg — the money it may spend. */
export interface RelativeValueLeg {
  market: ComparableMarket;
  regionId: RegionId;
  instrumentId: InstrumentId;
  faceLocal: number;
  reservationPrice: number;
  fullSizePriceRange: number;
  budgetLocal: number;
  /** §3.17e-ii-b — a CUT: the leg comes off at whatever the book clears, not at a price of the
   *  fund's choosing (the line no longer carries it, or the pair has lost what it was margined for). */
  forced?: boolean;
}

/**
 * §3.17e-ii-b — WHAT THE PAIR HAS MADE OR LOST: the cash leg's mark over its lots' basis, plus
 * what the future leg has already settled to the fund as variation margin (a short is paid the
 * fall and pays the rise, so its settled mark is signed to it here).
 */
export const pairPnLLocal = (args: { cashValueLocal: number; cashBasisLocal: number; futuresSettledToFundLocal: number }): number =>
  (args.cashValueLocal - args.cashBasisLocal) + args.futuresSettledToFundLocal;

/**
 * §3.17e-ii-b — THE STOP. The pair is cut whole when it has lost more than the initial margin
 * its future leg posted: the house's own measure of the move the position can make before it can
 * be closed (§3.17-ii), so a loss past it is the pair moving further than it was carried for.
 * No tolerance of the fund's own — the limit to arbitrage is the margin identity.
 */
export const stoppedOut = (pnlLocal: number, marginPostedLocal: number): boolean =>
  marginPostedLocal > 0 && pnlLocal < -marginPostedLocal;

/** What a comparable reads this week: the disagreement, annualised in bps of the pair's face, and
 *  what carrying the pair costs per year in the same unit. */
export interface ComparableRead { deviationBps: number; carryBps: number }

/** The edge: what is left of the disagreement after carrying it. */
export const edgeBps = (r: ComparableRead): number => r.deviationBps - r.carryBps;

/** How much of its capacity the book commits: it scales in over the move the relationship can
 *  make in a week — past that the edge is plainly there and it takes all it can carry. */
export function arbSizeShare(edge: number, weeklyMoveBps: number): number {
  if (!(edge > 0)) return 0;
  return Math.max(0, Math.min(1, edge / Math.max(1e-9, weeklyMoveBps)));
}

/** The position the fund's capital carries: its own spendable cash plus what its broker will
 *  still lend against it — the broker's haircut is already in that number (HF1). */
export const arbCapacityLocal = (spendableLocal: number, primeBrokerageAvailableLocal: number | undefined): number =>
  Math.max(0, spendableLocal) + Math.max(0, primeBrokerageAvailableLocal ?? 0);

/**
 * THE BOND BASIS, READ. The net basis (print less carry, per unit of face) as a rate on the cash
 * price over the weeks to delivery; against it, the financing the fund pays ABOVE the repo rate
 * the carry price already assumes, and the return it needs on the margin the short posts.
 */
export function bondBasisRead(args: {
  netBasis: number; cashPrice: number; yearsToDelivery: number;
  financingRateAnnual: number; repoRateAnnual: number; marginRate: number; requiredReturnAnnual: number;
}): ComparableRead {
  const T = Math.max(1 / 52, args.yearsToDelivery);
  const deviationBps = (args.netBasis / Math.max(1e-9, args.cashPrice) / T) * 10000;
  const carryBps = Math.max(0, args.financingRateAnnual - args.repoRateAnnual) * 10000
    + Math.max(0, args.marginRate) * Math.max(0, args.requiredReturnAnnual) * 10000;
  return { deviationBps, carryBps };
}

/**
 * THE BOND BASIS, AS TWO LEGS. The cash leg buys the deliverable up to the price at which the
 * future still pays the carry; the future leg sells the line down to the carry price plus that
 * same cost. Both scale in over the line's own weekly move.
 */
export function bondBasisLegs(args: {
  regionId: RegionId; bondId: InstrumentId; futureId: InstrumentId; faceLocal: number;
  cashPrice: number; futurePrice: number; couponRate: number; repoRateAnnual: number; yearsToDelivery: number;
  carryBps: number; weeklyPriceMove: number; budgetLocal: number;
}): { cash: RelativeValueLeg; future: RelativeValueLeg } {
  const T = Math.max(1 / 52, args.yearsToDelivery);
  const carryCostPrice = (args.carryBps / 10000) * T * args.cashPrice;
  const cashMax = (args.futurePrice + Math.max(0, args.couponRate) * T - carryCostPrice) / (1 + Math.max(0, args.repoRateAnnual) * T);
  const futureMin = bondFuturesCarryPrice({ cashPrice: args.cashPrice, couponRate: args.couponRate, repoRateAnnual: args.repoRateAnnual, yearsToDelivery: T }) + carryCostPrice;
  const range = Math.max(1e-6, args.weeklyPriceMove);
  return {
    cash: { market: 'SOVEREIGN_CASH', regionId: args.regionId, instrumentId: args.bondId, faceLocal: args.faceLocal, reservationPrice: cashMax, fullSizePriceRange: range, budgetLocal: args.budgetLocal },
    future: { market: 'BOND_FUTURE', regionId: args.regionId, instrumentId: args.futureId, faceLocal: -args.faceLocal, reservationPrice: futureMin, fullSizePriceRange: range, budgetLocal: 0 },
  };
}
