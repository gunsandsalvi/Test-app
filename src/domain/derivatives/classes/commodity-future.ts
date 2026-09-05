/**
 * DER4/DRV — the commodity futures CLASS. The market's shape (producers the natural short,
 * consumers the natural long, the storage desks' carry arbitrage holding the curve's top, the
 * convenience yield inferred from the traded curve) stays documented at the market stage (07i);
 * this module is the CONTRACT: no principal, a weekly exchange of the mark, cash settlement to
 * spot in the delivery week.
 *
 * strike: the price struck, per unit. units: the physical size. reference: the commodity.
 * termKey: '1M'|'3M'|'6M'.
 *
 * THE DEFECT THE REBUILD CLOSED (rule 5's class): the old book re-marked carried positions to
 * each week's print WITHOUT a cash leg, and its settle pass marked non-expiring positions at
 * their own last mark — so weekly variation margin was structurally ZERO and only the delivery
 * week's single move ever paid. A long that gained 50/unit over a contract's life and gave it
 * all back in the last week collected nothing, on every contract, for the book's whole life.
 * The mark is now cumulative-value-settled-as-delta like every mark-leg class (§7.241), so the
 * telescoping sums to (delivery spot − strike) in real cash, which is what a future IS.
 */

import { DerivativeClassProfile } from '../profile';
import { commodityReferenceOf } from '../contract';

export const FUTURES_TENOR_MONTHS = [1, 3, 6] as const;
export const futuresTermKey = (tenorMonths: number): string => `${tenorMonths}M`;

/**
 * The physical cost of holding a commodity for a year, as a fraction of its value — tankage,
 * warehousing, spoilage. A property of the SUBSTANCE, not of any price (rule 2 admits a
 * physical primitive): energy boils off, metal sits in a shed, grain rots.
 */
export const PHYSICAL_STORAGE_COST_ANNUAL: Record<'Energy' | 'Metals' | 'Agriculture', number> = {
  Energy: 0.10,
  Metals: 0.02,
  Agriculture: 0.06,
};

/** The no-arbitrage ceiling: spot, financed and stored to delivery. */
export function costOfCarryPrice(args: {
  spotPrice: number;
  financingRateAnnual: number;
  storageCostAnnual: number;
  tenorYears: number;
}): number {
  return args.spotPrice
    * Math.exp((args.financingRateAnnual + args.storageCostAnnual) * args.tenorYears);
}

/**
 * The convenience yield, INFERRED from the cleared curve rather than stated ahead of it: what
 * the market is paying to hold the physical instead of the paper, net of what carrying costs.
 */
export function impliedConvenienceYield(args: {
  spotPrice: number;
  futuresPrice: number;
  financingRateAnnual: number;
  storageCostAnnual: number;
  tenorYears: number;
}): number {
  if (!(args.spotPrice > 0) || !(args.futuresPrice > 0) || !(args.tenorYears > 0)) return 0;
  return args.financingRateAnnual + args.storageCostAnnual
    - Math.log(args.futuresPrice / args.spotPrice) / args.tenorYears;
}

export const COMMODITY_FUTURE_PROFILE: DerivativeClassProfile = {
  id: 'COMMODITY_FUTURE',
  roleA: 'LONG',
  roleB: 'SHORT',
  // Basel CEM commodity add-on, sub-year bucket — every tenor this book quotes.
  pfeAddOnRate: 0.10,
  /** §3.17-ii: the commodity's own weekly move, on the notional — a future marks one for one. */
  closeOutMoveOf: (c, m) => m.commodityWeeklyMove(commodityReferenceOf(c)),
  periodicLegUSDToB: () => null,
  /** The contract's value to the long at current prints: the print's move off the strike, on
   *  the size. In the delivery week the mark IS spot — that is what cash settlement means. */
  markToMarketUSDToA: (c, m) => {
    const atDelivery = c.maturityWeek <= m.week;
    const px = atDelivery ? m.commoditySpot(commodityReferenceOf(c)) : m.commodityPrint(commodityReferenceOf(c), c.termKey);
    if (!(px > 0)) return null; // no fresh print this week — nothing marks, nothing pays
    return (px - c.strike) * (c.units ?? 0);
  },
  markReasonLive: 'futures variation margin',
  markReasonFinal: 'futures settled to spot',
  /** A commodity that stopped existing leaves nothing to settle against: the contract ends flat,
   *  exactly as the old book dropped it. */
  eventTermination: (c, m) => (Number.isFinite(m.commoditySpot(commodityReferenceOf(c))) ? null : { usdToB: 0, reason: 'futures settled to spot' }),
  closeOutUSDToB: () => 0, // mark-leg class: the lifecycle closes out at the mark
};
