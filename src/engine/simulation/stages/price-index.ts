/**
 * Consumer Price Index — measured, not assumed
 *
 * Inflation used to be a formula: an AR(1) series anchored on the inflation target, nudged every
 * week by a wage-push term and a money-growth term. It was not connected to any price anyone in
 * this simulation actually paid, and it ran away — measured at ~10% by week 40 and ~11% before
 * the national-accounts fix, never mean-reverting, with the Taylor rule unable to contain it
 * because the thing it was reacting to was not a real price level. Since headline real growth is
 * nominal growth less inflation, that one formula dragged reported real growth to -20%.
 *
 * This module replaces it with the real thing. Every week, stage 05's auction clears a real unit
 * price for every sub-unit against real bids from real buyers (`CategoryDemandState.unitPriceLocal`)
 * the prices households genuinely transact at. A consumer price index is nothing more than
 * those prices, weighted by how much households actually spend on each of them:
 *
 *     CPI_t = 100 * sum_i ( w_i * p_i,t / p_i,base )
 *
 * with the weights fixed within a basket period (a Laspeyres index, as real statistical agencies
 * publish) and rebased annually onto current spending patterns, chain-linked so the level is
 * continuous across the rebase. Inflation is then the 52-week change in that index, and core
 * inflation the same computation over the basket excluding food and energy — the two components
 * real statistical agencies strip out precisely because their prices are set in volatile
 * commodity markets rather than by domestic demand.
 *
 * Wage-push and monetary pressure are not modelled here and deliberately have no term: if higher
 * wages or faster money growth genuinely raise prices, they do so by raising what buyers bid in
 * the real auction, and this index will measure the result. Adding a separate formula term for
 * them would be counting the same economics twice — once through the market and once around it.
 */

import { INDUSTRY_SUBUNITS } from '../../../domain/industry';
import { Region } from '../../../types';
import { shelfPriceLocal } from '../../../domain/distribution';

/**
 * THE PRICE THIS INDEX IS BUILT ON, ON BOTH SIDES OF EVERY RATIO.
 *
 * A CPI prices what a consumer pays — the shelf price. Stage 05 writes one each week; before it
 * has run (the seed builds the opening basket) there is none, and the code here fell back to the
 * LANDED price with `??`. That made the basket's BASE the price a business pays and its CURRENT
 * the price a household pays, so week one printed the entire channel margin as inflation: CPI
 * 100 -> 127.78 with no price in the economy having moved, 30% headline, and every downstream
 * reader — the Taylor rule, real growth, the labour market's real-revenue signal — took it as
 * real. Deriving the missing one keeps a single concept on both sides.
 *
 * `??` was also the wrong guard: `shelfUnitPriceLocal` is NaN on a category the auction has not
 * cleared, and NaN is neither null nor undefined, so the fallback did not fire and the category
 * dropped out of the basket entirely.
 */
function shelfPriceFor(
  demand: { shelfUnitPriceLocal?: number; unitPriceLocal?: number } | undefined,
  subUnitId: string,
  region: Region
): number {
  if (!demand) return 0;
  const written = demand.shelfUnitPriceLocal;
  if (typeof written === 'number' && isFinite(written) && written > 0) return written;
  const landed = demand.unitPriceLocal;
  if (!(typeof landed === 'number' && isFinite(landed) && landed > 0)) return 0;
  const shortRate = region.zeroRates?.tenor3M ?? region.policyRate ?? 0;
  return shelfPriceLocal(landed, subUnitId, shortRate);
}

/**
 * Food and energy. Excluded from core inflation because their prices are set in the commodity
 * markets this simulation clears globally, not by the region's own demand conditions.
 */
const FOOD_AND_ENERGY_SUBUNITS = new Set(['food_beverage', 'refined_products']);

export interface CpiBasket {
  /** Normalized share of household spending, by sub-unit. Fixed for the life of the basket. */
  weightBySubUnit: Record<string, number>;
  /** Each sub-unit's price when the basket was built. */
  basePriceBySubUnit: Record<string, number>;
  /** Index level the basket starts from, so a rebase does not create a step in the series. */
  baseIndexLevel: number;
  baseWeek: number;
}

/** How often the basket is rebased onto current spending patterns. */
export const CPI_BASKET_REBASE_WEEKS = 52;
/** The index level a brand-new simulation starts from. */
export const CPI_BASE_LEVEL = 100;

/**
 * Builds a basket from what households are spending right now: each sub-unit's real demand level
 * times the share of it that households (rather than firms or government) actually buy.
 */
export function buildCpiBasket(region: Region, week: number, baseIndexLevel: number): CpiBasket {
  const householdSpendBySubUnit: Record<string, number> = {};
  const basePriceBySubUnit: Record<string, number> = {};

  Object.values(INDUSTRY_SUBUNITS).forEach((subUnits) => {
    subUnits.forEach((su) => {
      if (su.buyerMix.HOUSEHOLD <= 0) return;
      const demand = region.categoryDemand[su.unitId as keyof typeof region.categoryDemand];
      // A consumer price index prices what a CONSUMER pays, which is the shelf price —
      // the landed price plus what the channel charges to hold the stock it is sold out of. The
      // landed price is what a business pays for the same good, and reading it here left the
      // channel's cost out of the household's cost of living entirely.
      const price = shelfPriceFor(demand, su.unitId, region);
      if (!demand || !(price > 0)) return;
      const spendLocal = demand.demandLevelAnnualLocal * su.buyerMix.HOUSEHOLD;
      if (!(spendLocal > 0)) return;
      householdSpendBySubUnit[su.unitId] = spendLocal;
      basePriceBySubUnit[su.unitId] = price;
    });
  });

  const totalSpendLocal = Object.values(householdSpendBySubUnit).reduce((sum, v) => sum + v, 0);
  const weightBySubUnit: Record<string, number> = {};
  if (totalSpendLocal > 0) {
    Object.entries(householdSpendBySubUnit).forEach(([unitId, spendLocal]) => {
      weightBySubUnit[unitId] = spendLocal / totalSpendLocal;
    });
  }

  return { weightBySubUnit, basePriceBySubUnit, baseIndexLevel, baseWeek: week };
}

/**
 * The index level implied by this week's real cleared prices. `excludeFoodAndEnergy` produces the
 * core measure over the same basket, with the remaining weights renormalized so it stays a
 * properly weighted index rather than a partial sum.
 */
export function computeCpiLevel(region: Region, basket: CpiBasket, excludeFoodAndEnergy = false): number {
  let weightedRatioSum = 0;
  let includedWeight = 0;

  Object.entries(basket.weightBySubUnit).forEach(([unitId, weight]) => {
    if (excludeFoodAndEnergy && FOOD_AND_ENERGY_SUBUNITS.has(unitId)) return;
    const basePrice = basket.basePriceBySubUnit[unitId];
    const cd = region.categoryDemand[unitId as keyof typeof region.categoryDemand];
    const currentPrice = shelfPriceFor(cd, unitId, region);
    if (!basePrice || !(basePrice > 0) || !(currentPrice > 0)) return;
    weightedRatioSum += weight * (currentPrice / basePrice);
    includedWeight += weight;
  });

  if (includedWeight <= 0) return basket.baseIndexLevel;
  return basket.baseIndexLevel * (weightedRatioSum / includedWeight);
}

/**
 * A YEAR-OVER-YEAR CHANGE NEEDS A YEAR OF WEEKS THAT HAPPENED.
 *
 * A trailing year of index levels used to be fabricated here, compounding at the inflation
 * TARGET — what a central bank that had been hitting its target would have produced — so the
 * year-over-year read had something to divide by from week 1. What it produced was a manufactured
 * inflation series for the whole first year, and it did not sit quietly in a display: it fed the
 * Taylor rule, the labour deflator's cost-of-living pass-through and the news, all of which
 * treated it as a measurement of this economy. A central bank that has hit its target is also
 * precisely the real-world outcome rule 2 forbids importing.
 *
 * The history now begins where the world does, with the opening level and nothing before it. The
 * year-over-year figure is absent until fifty-three real weeks exist (`11-fiscal`'s guard already
 * required that; it simply always found the fabricated year there), and what is reported until
 * then is THE LEVEL, which is a fact.
 */
export function openingCpiHistory(currentLevel: number): number[] {
  return [Number(currentLevel.toFixed(6))];
}
