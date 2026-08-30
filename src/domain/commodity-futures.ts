/**
 * DER4 — commodity futures, and the end of a curve that was drawn rather than traded.
 *
 * **What this replaces.** `futures1M/3M/6M` were `spot x exp((r − convenienceYield) x T)` with the
 * convenience yield a number seeded once and never touched again. So the curve was spot times a
 * constant: it could not go into backwardation when the model's own commodity market went short,
 * it could not go into contango when inventories built, and nobody was on either side of it. Three
 * prices with no market behind them (rule 1), and a shape stated in advance rather than produced
 * (rule 13). The convenience yield is the thing that is supposed to be INFERRED from a traded
 * curve, and here it was the input.
 *
 * **The market.** A commodity future is the one book in this model whose two sides are both
 * industrial rather than financial, and they are already in the world:
 *
 *  - **The producers are the natural short.** A firm tagged with this commodity sells forward the
 *    production it will have; locking in revenue is worth giving something up for, and what it
 *    will give up is the capital its unhedged revenue swing consumes at its own cost of capital.
 *    That is its walk-away — below it the hedge costs more than the risk.
 *  - **The consumers are the natural long,** by exactly the same arithmetic from the other side: a
 *    firm whose recipe draws this commodity will pay over expected spot to remove the swing, up to
 *    what the unhedged exposure costs it. Same formula, opposite sign, no new parameter.
 *  - **Which side is bigger sets the SHAPE.** More producer hedging than consumer hedging and the
 *    curve clears below spot; more consumer hedging and it clears above. Backwardation and
 *    contango stop being labels and become the outcome of who needed the hedge more, which is what
 *    they are.
 *  - **The storage desk is the arbitrage.** A future above spot plus the cost of carrying the
 *    physical — financing plus real storage — is free money to anyone who can hold the commodity:
 *    sell the future, buy the spot, store it, deliver. So the desks bring supply into any contract
 *    trading above that bound, and the bound holds the curve without a clamp anywhere (rule 15: it
 *    is a participant's price, not a bracket around someone else's).
 *
 * **And the convenience yield falls out of it**, where it belongs: whatever the cleared curve says
 * the market will pay to hold the physical rather than the paper.
 */

/** The tenors this model quotes. The same three the curve has always carried (rule 3). */
export const FUTURES_TENOR_MONTHS = [1, 3, 6] as const;
export type FuturesTenorMonths = typeof FUTURES_TENOR_MONTHS[number];

export type FuturesParty =
  | { kind: 'COMPANY'; ticker: string }
  | { kind: 'BANK'; ticker: string }
  | { kind: 'INSTITUTION'; id: string };

export interface FuturesPosition {
  id: string;
  commodityId: string;
  tenorMonths: FuturesTenorMonths;
  /** Pays the struck price, receives the commodity's value — long the commodity. */
  long: FuturesParty;
  /** The other side. */
  short: FuturesParty;
  units: number;
  /** The price the contract was struck at, per unit. */
  strikePrice: number;
  /** What it was last marked at; variation margin is the move from here. */
  lastMarkPrice: number;
  struckWeek: number;
  /** Cash-settles to spot in this week. */
  deliveryWeek: number;
}

/**
 * The physical cost of holding a commodity for a year, as a fraction of its value — tankage,
 * warehousing, spoilage. A property of the SUBSTANCE, not of any price: energy has to be kept in
 * pressure vessels and boils off, metal sits in a shed and does not, grain rots. Rule 4 admits a
 * physical primitive; what it forbids is a real-world OUTCOME, and none of these is one.
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
 * What a hedger will give up to remove the swing: the capital its unhedged exposure consumes over
 * the horizon, at its own cost of capital. A consumer pays this much OVER expected spot, a
 * producer accepts this much UNDER it — one arithmetic, two signs, and the same shape every other
 * book in this model prices risk with.
 */
export function hedgeConcessionPerUnit(args: {
  spotPrice: number;
  annualVol: number;
  costOfCapital: number;
  tenorYears: number;
}): number {
  const oneSigma = Math.max(0, args.annualVol) * Math.sqrt(Math.max(0, args.tenorYears));
  return Math.max(0, args.spotPrice) * Math.max(0, args.costOfCapital) * oneSigma;
}

/**
 * The convenience yield, INFERRED from the cleared curve rather than stated ahead of it: what the
 * market is paying to hold the physical instead of the paper, net of what carrying it costs.
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

/** This week's variation margin on one position: the mark's move, on the size. */
export function variationMarginUSD(pos: FuturesPosition, markPrice: number): number {
  return (markPrice - pos.lastMarkPrice) * pos.units;
}
