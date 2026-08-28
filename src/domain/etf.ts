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
   * This is the PRESSURE that produces a premium or discount, deliberately not called one: a real
   * premium is a price, and pricing ETF shares means clearing them in a book of their own against
   * the float the APs are willing to create. That book is the next slice. Reporting unmet flow as
   * if it were a price would be a made-up number wearing a real name — and an early version that
   * divided the unabsorbed flow by the fund's own NAV printed a 173% "premium" on a fund whose
   * NAV was smaller than one week of inflow, which is what that mistake looks like.
   */
  unmetFlowShare: number;
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
 * How much basket a region's dealers can intermediate in a week, as a multiple of their equity.
 *
 * An AP does not WAREHOUSE a creation basket — it buys and delivers inside the settlement cycle,
 * so what its capital limits is turnover, not inventory, and a dealer turns over a large multiple
 * of its equity. Sizing this as a small FRACTION of equity (the first attempt, 2%) made the
 * arbitrage the dominant fact of the whole mechanism: 95-98% of flow went unabsorbed every week
 * forever and the funds never reached their target size.
 *
 * It is also not the constraint that decides where the money actually lands. The fund's basket
 * purchase is executed in the constituent books, where it is already rationed against real float
 * by the clearing engine — so this cap is a second-order friction that should bite in stress and
 * not otherwise, which is exactly what a real AP constraint does.
 */
export const AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY = 0.25;

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
 * Stated here with one owner, in the same sense as the underwriting fee schedule; it becomes an
 * outcome when BP2's industry profiles give firms real cost structures.
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
