/**
 * ETFs — index funds that hold their basket for real, and the dealers who arbitrage their shares.
 *
 * Every institution in this model expresses every view as a direct line: it owns names, one
 * position at a time. That is not how most of the money actually reaches a market. A large share
 * is intermediated — the buyer chooses an EXPOSURE, a fund holds the basket, and a dealer stands
 * between the fund's shares and its underlying. Three things become expressible once that exists:
 *
 *   - **A price-insensitive buyer.** An index fund buys its weight at whatever the market is
 *     asking; it has no reservation level, only a size. That is a real and large force, and no
 *     participant in this engine could previously express it.
 *   - **Flow that reaches every constituent at once**, in index proportion — which is what makes
 *     a market move together rather than name by name.
 *   - **A premium or discount that exists only because the arbitrage can be constrained.** When
 *     the authorised participants can absorb the week's flow it is zero, which is the ordinary
 *     case. When they cannot it persists, which is the interesting one.
 */

import { RegionId } from './geography';

export interface EtfFund {
  /** The index this fund tracks — its constituents and weights are that index's. */
  indexId: string;
  /** The asset manager that runs it and collects the fee. */
  sponsorEntityId: string;
  /** Shares in issue. Creations and redemptions are the ONLY things that change this. */
  sharesOutstanding: number;
  /** Annual expense ratio, accrued weekly out of fund assets to the sponsor. */
  expenseRatioAnnual: number;
  /**
   * Last week's residual: the share of creation/redemption demand the authorised participants
   * could NOT absorb, signed the way the market would feel it (positive = unmet buying). Zero
   * whenever the arbitrage is unconstrained, which is most weeks.
   *
   * This is the PRESSURE that produces a premium, and it is still not the premium itself — the
   * premium is `premiumToNavBps` below, cleared in the share book. The two are a quantity and a
   * price about the same fact and both are worth having: unmet flow says how much of the week's
   * demand the arbitrage could not carry, the premium says what that cost. Reporting the first as
   * if it were the second would be a made-up number wearing a real name — an early version that
   * divided unabsorbed flow by the fund's own NAV printed a 173% "premium" on a fund whose NAV was
   * smaller than one week of inflow, which is what that mistake looks like.
   */
  unmetFlowShare: number;
  /**
   * ETF2 — WHAT A SHARE ACTUALLY TRADES AT. Cleared in a book of its own (stages/etf-flows.ts):
   * the float is what the fund's investors hold between them, the primary offering is what the
   * APs will create, and no AP creates below net asset value — which is what holds the top of the
   * discount without a bound anywhere (rule 15: a participant's price, not a bracket).
   *
   * Undefined before the book has run for this fund.
   */
  marketPricePerShare?: number;
  /**
   * ...and the PREMIUM, which `unmetFlowShare` above was deliberately not: the cleared price
   * against the fund's own net asset value, in bps. Positive when the arbitrage could not create
   * fast enough to meet the buying, which is exactly when a real ETF trades rich.
   */
  premiumToNavBps?: number;
}

/**
 * What an investor would pay to hold the fund rather than assemble the index itself — the
 * indifference point that gives the share book its demand curve, and the reason a premium is
 * bounded by something real rather than by a number.
 *
 * Buying the basket directly costs the constituent books' dealer spread on every name in it. An
 * investor will therefore pay up to that same cost as a premium over net asset value and not a
 * basis point more, because past it the cheaper route is to go and buy the shares. One input, and
 * it is a price the model already sets.
 */
export function basketAssemblyCostRate(bookSpreadBps: number): number {
  return Math.max(0, bookSpreadBps) / 10000;
}

/**
 * Fee by asset class, in annual bps of assets. Broad equity index exposure is the cheapest thing
 * a fund complex sells and credit is dearer to run — a bond index has to be sampled rather than
 * replicated, because most of its constituents do not trade in a given week. Structural
 * primitives with one owner, in the same sense as the underwriting fee schedule.
 */
export const ETF_EXPENSE_RATIO_ANNUAL: Record<'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN', number> = {
  EQUITY: 0.0005,
  CORP_BOND: 0.0015,
  LEVERAGED_LOAN: 0.0050,
};

/**
 * How much basket a region's dealers can intermediate in a week.
 *
 * **This was a number, and the number argued with its own name.** `AP_WEEKLY_CAPACITY_MULTIPLE_
 * OF_EQUITY = 0.25` is a QUARTER of equity, while the paragraph beside it argued that a desk
 * turning baskets over inside the settlement cycle should move several times its equity. Either
 * the value was an order of magnitude low or the reasoning was wrong, and picking between them by
 * hand would have been choosing the answer (rule 13).
 *
 * **So it is derived, and the reasoning wins.** An AP does not WAREHOUSE a creation basket — it
 * buys and delivers it, so what its capital has to cover is not the notional but the PRICE MOVE
 * over the time it is holding the thing. The most a basket can move against it while it holds it
 * is what the equity book itself says a price can move in a week, which that book states about
 * itself and which the prime brokers already read their equity haircut off. Capacity is therefore
 * equity divided by that move: the same "capital over the risk a unit of the position consumes"
 * every desk in this model is sized by.
 *
 * At the equity book's own 18% weekly cap that is about 5.6x equity — several times over, as the
 * reasoning said, and it moves on its own if the book's volatility does.
 *
 * It is also not the constraint that decides where the money actually lands. The fund's basket
 * purchase is executed in the constituent books, where it is already rationed against real float
 * by the clearing engine — so this cap is a second-order friction that should bite in stress and
 * not otherwise, which is exactly what a real AP constraint does.
 */
export function apWeeklyCapacityUSD(args: { dealerEquityUSD: number; bookWeeklyMove: number }): number {
  // §5-CLOSE: the equity book's MEASURED weekly move (its median realised volatility), not a cap.
  const move = Math.max(0.0001, args.bookWeeklyMove);
  return Math.max(0, args.dealerEquityUSD) / move;
}

/** A fund's shares are struck at this NAV when it first issues them. */
export const ETF_INCEPTION_NAV_PER_SHARE = 100;

/**
 * How many names an institution can genuinely cover with its own research, as a function of the
 * money it runs — the primitive behind who buys the index and who buys the name.
 *
 * The important property is that capacity scales SUBLINEARLY with assets, and steeply so. A
 * billion-dollar boutique with three analysts covering fifteen names each reaches forty-five
 * names; the largest managers in the world run four orders of magnitude more money and cover
 * perhaps twenty times as many names, because analysts are the scarce input and assets are not.
 * Those two anchors put the exponent at about a third, so coverage goes as the cube root.
 *
 * A first version made this LINEAR at twelve names per billion, and the consequence was that
 * every institution in the world could research every name that existed: nothing indexed the
 * broad market, and the total-market and large-cap funds had no possible buyer. Linear research
 * capacity is not a small error — it says a firm with a hundred times the assets has a hundred
 * times the analysts, which no fund complex has ever managed.
 *
 * One owner, in the same sense as the underwriting fee schedule; it becomes an outcome when
 * IND's profiles give firms real cost structures.
 */
export const NAMES_COVERED_AT_ONE_BILLION_AUM = 45;
export const RESEARCH_COVERAGE_SCALING_EXPONENT = 1 / 3;

/** Every ETF this world lists, as (index, expense class). Sponsors are assigned at seeding. */
export interface EtfSeed {
  id: string;
  name: string;
  ticker: string;
  indexId: string;
  region?: RegionId;
  expenseClass: 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN';
}
