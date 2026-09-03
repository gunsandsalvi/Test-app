/**
 * IND16 — the distribution tier: what it costs to get a good from the factory gate onto a shelf a
 * household can reach.
 *
 * **What was missing, and the trap that kept it missing.** Between a producer and a household
 * there is a channel — wholesale, retail, local stocking — and this model had none: a household
 * bought at the factory gate and the sector that would have moved the goods earned nothing for
 * doing it. But the obvious fix was wrong, and finding out why is the design. A household today
 * buys `facilities_and_logistics` **as a good**, out of its own buyer-mix share, in that good's
 * own book — so the distribution service was already sold, priced and paid for, once. Putting a
 * channel margin on top of every other good would have credited the same sector for the same work
 * TWICE (rule 4), and neither number would have looked wrong: both are real revenue with a real
 * payer. **So this is a REFACTOR.** The household's distribution spend MOVES out of that book and
 * onto the goods it is actually spent distributing.
 *
 * **The margin is an outcome of the good's own physics, not a rate per category** (rule 2). A
 * channel holds stock, and what holding it costs is the only thing the margin can be:
 *
 *  - **How much cover it holds** is bounded from above by the good itself. It cannot stock past
 *    the shelf life — a dairy cannot hold a quarter's cover at any price — and it has no reason to
 *    stock more than the lead time it is bridging, which is what a channel is FOR. Both numbers
 *    are already in the registry.
 *  - **What that cover costs per dollar** is the good's own carrying cost — warehousing against
 *    its value density, plus spoilage against its shelf life, both already derived — plus the
 *    money tied up in it at the region's own short rate. A dollar of gravel costs more to hold
 *    than a dollar of watches, and nobody has to say so.
 *  - **A service has no channel at all.** Nothing is stocked, so the cover is zero and so is the
 *    margin. The physics does the exempting; there is no list of exempt categories.
 *
 * **What it changes.** The household bids the FACTORY-GATE price its willingness to pay leaves
 * after the channel takes its cut, so a costly channel means less reaches the producer — which is
 * the real transmission, and the reason the tier matters at all rather than being a bookkeeping
 * layer. And the channel's take is paid, by name, to the firms that run it.
 */

import { annualCarryingCostRateOf, productionLeadWeeksOf } from './industry-registry';
import { shelfLifeWeeksOf, deliveryModeOf } from './goods-physical';

/**
 * How many weeks of cover the channel carries for this good: the lead time it exists to bridge,
 * plus the week it is selling out of — capped by what the good will physically survive. Zero for
 * anything not delivered as a physical good, which has no stock to hold.
 */
export function channelCoverWeeks(subUnitId: string): number {
  if (deliveryModeOf(subUnitId) !== 'PHYSICAL') return 0;
  const bridge = Math.max(0, productionLeadWeeksOf(subUnitId)) + 1;
  const shelfLife = shelfLifeWeeksOf(subUnitId);
  return shelfLife === undefined ? bridge : Math.max(0, Math.min(bridge, shelfLife));
}

/**
 * The channel's margin on this good, as a fraction of the landed price: the cover it holds, at
 * what holding it costs — the good's own carrying cost plus the money tied up in it.
 */
export function channelMarginRate(subUnitId: string, shortRateAnnual: number): number {
  const coverWeeks = channelCoverWeeks(subUnitId);
  if (!(coverWeeks > 0)) return 0;
  const annualRate = annualCarryingCostRateOf(subUnitId) + Math.max(0, shortRateAnnual);
  return annualRate * (coverWeeks / 52);
}

/**
 * IND16 — WHAT A HOUSEHOLD PAYS, and the ONE definition of it (§1.4).
 *
 * Stage 05 writes this onto each category's demand state every week. The price index needs the
 * same number for a week the engine has not run yet — the seed — and reading the LANDED price
 * there instead was a 28% level error that read as inflation: the basket's base prices were what
 * a business pays and its current prices were what a household pays, so the index stepped by the
 * whole channel margin on week one and printed 30% inflation on a world where no price had moved.
 * Two price concepts in one ratio. One function now, called from both sides.
 */
export function shelfPriceUSD(landedUnitPriceUSD: number, subUnitId: string, shortRateAnnual: number): number {
  return landedUnitPriceUSD * (1 + channelMarginRate(subUnitId, shortRateAnnual));
}

/** The sub-unit whose firms run the channel — the same sector that sells the service. */
export const DISTRIBUTION_SUBUNIT_ID = 'facilities_and_logistics';
