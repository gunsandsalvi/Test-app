/**
 * §3.17e-i — THE GOVERNMENT BOND FUTURE CLASS. A future on the region's benchmark sovereign
 * bond: the DELIVERABLE is a named rung of the sovereign ladder (the one nearest ten years from
 * delivery when the line is struck), the price is per unit of face, and at delivery the contract
 * settles to the deliverable's own cleared cash price — cash settlement to the bond the short
 * would otherwise have delivered, which is what a deliverable future is worth on the day. Between
 * strike and delivery it marks to the line's own print, and the mark is variation margin like
 * every mark-leg class.
 *
 * THE CARRY is what ties the future to the cash bond: a long in the bond, financed in repo to
 * delivery, earns the coupon and pays the financing, so the future's fair price is the cash price
 * carried forward at the repo rate less the coupon accrued — and the difference between the print
 * and that is the NET BASIS, a measured number (`bondFuturesCarryPrice`, the market's basis). The
 * basis trader who arbitrages it — long the bond in repo, short the future — is the demand the
 * repo book is missing, and it is §3 step 17f's first comparable.
 *
 * strike: price per 1 of face. units: the face. reference: the deliverable (`SOVEREIGN`).
 * termKey: 'F' (the front contract; each delivery is its own line).
 */

import { DerivativeClassProfile } from '../profile';
import { sovereignReferenceOf } from '../contract';
import type { RegionId } from '../../geography';

/** Deliveries are quarterly, on the market convention's clock: the next multiple of 13 weeks. */
export const BOND_FUTURE_DELIVERY_WEEKS = 13;
export const nextDeliveryWeek = (week: number): number => (Math.floor(week / BOND_FUTURE_DELIVERY_WEEKS) + 1) * BOND_FUTURE_DELIVERY_WEEKS;
/** The benchmark: the rung nearest this many years from delivery is the deliverable. */
export const BOND_FUTURE_BENCHMARK_YEARS = 10;
export const BOND_FUTURE_TERM_KEY = 'F';

/** The bond whose maturity from delivery is nearest the benchmark; undefined with no ladder. */
export function deliverableOf<T extends { maturityWeek: number }>(rungs: readonly T[], deliveryWeek: number): T | undefined {
  let best: T | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  rungs.forEach((r) => {
    if (r.maturityWeek <= deliveryWeek) return;
    const gap = Math.abs((r.maturityWeek - deliveryWeek) / 52 - BOND_FUTURE_BENCHMARK_YEARS);
    if (gap < bestGap) { best = r; bestGap = gap; }
  });
  return best;
}

/** A fixed-coupon bond's modified duration at a flat yield — how far its price moves per unit of yield. */
export function bondDurationYears(yieldAnnual: number, yearsToMaturity: number): number {
  const T = Math.max(0, yearsToMaturity);
  if (!(yieldAnnual > 1e-9)) return T;
  return (1 - Math.pow(1 + yieldAnnual, -T)) / yieldAnnual;
}

/**
 * THE CARRY PRICE: the cash price financed at the repo rate to delivery, less the coupon the cash
 * holder accrues over the same weeks — per 1 of face. The no-arbitrage level a desk quotes at.
 */
export function bondFuturesCarryPrice(args: { cashPrice: number; couponRate: number; repoRateAnnual: number; yearsToDelivery: number }): number {
  const T = Math.max(0, args.yearsToDelivery);
  return args.cashPrice * (1 + Math.max(0, args.repoRateAnnual) * T) - Math.max(0, args.couponRate) * T;
}

/** The net basis: what the print pays over carrying the bond, per 1 of face. Measured, never set. */
export const bondFuturesNetBasis = (futurePrice: number, carryPrice: number): number => futurePrice - carryPrice;

/**
 * §3.17e-i — A HOLDER'S QUOTE ON THE LINE, from its duration gap, in a PRICE-LIKE book (demand
 * falls as the price rises). Short of duration it goes LONG the future for the gap, buying
 * below the carry price — the bond financed would cost it more; long of the class beyond its
 * target it SHORTS for the excess, selling above carry. One side each; a seller opens holding
 * its excess and sells it down as the print rises past carry.
 */
export function bondFutureHolderQuote(args: { carryPrice: number; rangePrice: number; gapLocal: number }): {
  reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number;
} {
  const range = Math.max(1e-9, args.rangePrice);
  if (args.gapLocal >= 0) return { reservationStat: args.carryPrice, fullSizeStatRange: range, maxHoldingLocal: args.gapLocal, currentHoldingLocal: 0 };
  const excess = -args.gapLocal;
  return { reservationStat: args.carryPrice + range, fullSizeStatRange: range, maxHoldingLocal: excess, currentHoldingLocal: excess };
}

/** A dealer's two-way quote at carry in a price-like book: flat at carry, long below, short above. */
export function twoWayPriceQuote(args: { carryPrice: number; rangePrice: number; sizeLocal: number }): {
  reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number;
} {
  const size = Math.max(0, args.sizeLocal);
  const range = Math.max(1e-9, args.rangePrice);
  return { reservationStat: args.carryPrice + range, fullSizeStatRange: 2 * range, maxHoldingLocal: 2 * size, currentHoldingLocal: size };
}

/** The move a line can make in a session: the benchmark rate's own weekly move on the deliverable's duration. */
export function bondFutureWeeklyMoveOf(m: { rateWeeklyMoveBps(regionId: RegionId, termKey: string): number | undefined }, regionId: RegionId, durationYears: number): number | undefined {
  const bps = m.rateWeeklyMoveBps(regionId, 's10');
  return bps === undefined ? undefined : (bps / 10000) * Math.max(0, durationYears);
}

export const BOND_FUTURE_PROFILE: DerivativeClassProfile = {
  id: 'BOND_FUTURE',
  roleA: 'LONG',
  roleB: 'SHORT',
  // Basel CEM interest-rate add-on beyond five years: the deliverable is the ten-year.
  pfeAddOnRate: 0.015,
  /** §3.17-ii: the benchmark rate's weekly move on the deliverable's duration — the price move
   *  the line can make in a session, per unit of face. */
  closeOutMoveOf: (c, m) => {
    const ref = sovereignReferenceOf(c);
    const terms = m.sovereignBondTerms(ref.regionId, ref.bondId);
    if (!terms) return undefined;
    return bondFutureWeeklyMoveOf(m, ref.regionId, bondDurationYears(m.overnightRateAnnual(ref.regionId), (terms.maturityWeek - m.week) / 52));
  },
  periodicLegUSDToB: () => null,
  /** The long's value at current prints: the print's move off the strike on the face. In the
   *  delivery week the print IS the deliverable's cleared cash price — cash settlement. */
  markToMarketUSDToA: (c, m) => {
    const ref = sovereignReferenceOf(c);
    const px = c.maturityWeek <= m.week ? m.sovereignBondPrice(ref.regionId, ref.bondId) : m.bondFuturePrint(ref.regionId, c.termKey, c.maturityWeek);
    if (!(px > 0)) return null; // no fresh print this week — nothing marks, nothing pays
    return (px - c.strike) * (c.units ?? 0);
  },
  markReasonLive: 'bond futures variation margin',
  markReasonFinal: 'bond futures settled to cash',
  /** A deliverable that stopped existing before delivery leaves nothing to settle against. */
  eventTermination: (c, m) => {
    const ref = sovereignReferenceOf(c);
    return m.sovereignBondTerms(ref.regionId, ref.bondId) ? null : { usdToB: 0, reason: 'bond futures deliverable gone' };
  },
  closeOutUSDToB: () => 0, // mark-leg class: the lifecycle closes out at the mark
};
