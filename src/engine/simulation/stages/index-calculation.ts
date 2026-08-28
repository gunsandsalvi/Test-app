/**
 * INDEX CALCULATION — run the membership and weighting rules over the market that exists this
 * week, and publish the level.
 *
 * Runs after the clearing stages and after stage 08, so every price it reads is one the market
 * actually cleared and every fundamental is this week's. Two separate jobs, deliberately on
 * different calendars:
 *
 *   - **Rebalance (quarterly).** Re-run the membership rule and re-strike the weights. This is
 *     the only moment constituents change, which is what makes index inclusion an event with a
 *     flow behind it rather than a continuous drift nobody has to trade.
 *   - **Level (weekly).** Move the published level by what the CURRENT members did, measured
 *     against the same basket a week earlier. Never by the basket changing underneath it: a
 *     rebalance must not move the level, or the index would print a return nobody could have
 *     earned. That is why the aggregate value is carried and the level is chained off it.
 */

import { GameState, RegionId, Company } from '../../../types';
import { WeeklyStepContext } from './context';
import { isActiveCompany, isPubliclyListed, DebtTranche } from '../../../domain/company';
import { isInvestmentGrade } from './asset-allocation';
import { calculateNelsonSiegelZeroRate, NelsonSiegelParams } from '../../nelsonSiegel';
import {
  INDEX_DEFINITIONS, IndexDefinition, IndexConstituent, MarketIndex,
  LARGE_CAP_CUMULATIVE_SHARE, INDEX_REBALANCE_WEEKS, INDEX_BASE_LEVEL,
} from '../../../domain/indexes';

/** Paper the credit indexes can hold: capital-markets instruments, not bank debt or CP. */
function indexableTranches(comp: Company): DebtTranche[] {
  return (comp.debtTranches || []).filter((t) => !t.isBankFacility && !t.isCommercialPaper);
}

/**
 * A credit index is MARKET-VALUE weighted, so a bond's contribution is its principal at its
 * PRICE, not its face. Valuing the book at par made the level track amount outstanding instead of
 * return: measured, the loan index sat at 99.5 after forty weeks of real spread movement, because
 * nothing but principal could ever move it.
 *
 * The price is not a new formula — it is the present value of the tranche's own cash flows at the
 * cleared curve plus this issuer's cleared spread, which is the same arithmetic the make-whole
 * uses. Floating paper reads the price 07d already clears for it.
 */
function fixedMarketValueUSD(comp: Company, curve: NelsonSiegelParams, week: number): number {
  return indexableTranches(comp)
    .filter((t) => t.rateType === 'FIXED')
    .reduce((sum, t) => {
      const years = Math.max(0.25, (t.maturityWeek - week) / 52);
      const discount = calculateNelsonSiegelZeroRate(years, curve) + comp.oasSpreadBps / 10000;
      const d = Math.max(1e-6, discount);
      const df = Math.pow(1 + d, -years);
      const pricePerDollar = (t.couponRate ?? 0) * ((1 - df) / d) + df;
      return sum + t.principalUSD * Math.max(0, pricePerDollar);
    }, 0);
}

function floatingMarketValueUSD(comp: Company): number {
  // 07d clears a price to par for every loan it quotes; par is the honest fallback for a tranche
  // whose issuer has no quote yet (a debut in its first week).
  const pricePerDollar = (comp.leveragedLoan?.pricePar ?? 100) / 100;
  return indexableTranches(comp)
    .filter((t) => t.rateType === 'FLOATING')
    .reduce((sum, t) => sum + t.principalUSD * Math.max(0, pricePerDollar), 0);
}

/**
 * What each eligible name contributes to this index, at this week's cleared prices — market cap
 * for equity, outstanding principal for credit. Zero means not eligible.
 */
function indexValueUSD(def: IndexDefinition, comp: Company, curveOf: (r: RegionId) => NelsonSiegelParams, week: number): number {
  if (!isActiveCompany(comp)) return 0;
  if (def.region && comp.region !== def.region) return 0;

  if (def.assetClass === 'EQUITY') {
    // Banks and institutions price off book value rather than in 07e's cleared book (§6), so an
    // index of cleared equity prices cannot include them without publishing a level partly made
    // of formula prices.
    if (comp.isBankEntity || comp.isInstitutionalEntity) return 0;
    if (!isPubliclyListed(comp) || !(comp.sharesOutstanding > 0) || !(comp.stockPrice > 0)) return 0;
    return comp.marketCap;
  }

  if (def.assetClass === 'LEVERAGED_LOAN') return floatingMarketValueUSD(comp);

  // Corporate bonds, split by the issuer's own cleared rating.
  const ig = isInvestmentGrade(comp.creditRating);
  if (def.tier === 'IG' && !ig) return 0;
  if (def.tier === 'HY' && ig) return 0;
  return fixedMarketValueUSD(comp, curveOf(comp.region), week);
}

/**
 * Re-strike one index's membership and weights. LARGE_CAP takes names in descending value until
 * the cumulative share crosses the threshold; SMALL_CAP takes exactly what LARGE_CAP left, so the
 * two partition ALL_CAP with no name in both and none in neither.
 */
function rebalance(def: IndexDefinition, companies: Company[], curveOf: (r: RegionId) => NelsonSiegelParams, week: number): IndexConstituent[] {
  const eligible = companies
    .map((c) => ({ instrumentId: c.id, valueUSD: indexValueUSD(def, c, curveOf, week) }))
    .filter((x) => x.valueUSD > 0)
    .sort((a, b) => b.valueUSD - a.valueUSD);
  if (eligible.length === 0) return [];

  const totalUSD = eligible.reduce((s, x) => s + x.valueUSD, 0);
  let members = eligible;
  if (def.tier === 'LARGE_CAP' || def.tier === 'SMALL_CAP') {
    let cumulative = 0;
    let cut = 0;
    for (; cut < eligible.length; cut++) {
      cumulative += eligible[cut].valueUSD;
      if (cumulative / totalUSD >= LARGE_CAP_CUMULATIVE_SHARE) { cut++; break; }
    }
    members = def.tier === 'LARGE_CAP' ? eligible.slice(0, cut) : eligible.slice(cut);
  }
  const memberTotalUSD = members.reduce((s, x) => s + x.valueUSD, 0);
  if (!(memberTotalUSD > 0)) return [];
  return members.map((x) => ({ instrumentId: x.instrumentId, weight: x.valueUSD / memberTotalUSD }));
}

/** This week's aggregate value of a fixed membership, at cleared prices. */
function basketValueUSD(def: IndexDefinition, constituents: IndexConstituent[], byId: Map<string, Company>, curveOf: (r: RegionId) => NelsonSiegelParams, week: number): number {
  return constituents.reduce((sum, c) => {
    const comp = byId.get(c.instrumentId);
    return comp ? sum + indexValueUSD(def, comp, curveOf, week) : sum;
  }, 0);
}

export function runIndexCalculationStage(state: GameState, ctx: WeeklyStepContext): void {
  const byId = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  const curveOf = (r: RegionId) => ctx.updatedRegions[r].yieldCurveParams;
  const previous = new Map((state.marketIndexes ?? []).map((i) => [i.id, i]));
  const week = ctx.nextWeek;

  ctx.updatedMarketIndexes = INDEX_DEFINITIONS.map((def): MarketIndex => {
    const prior = previous.get(def.id);

    // Inception: strike the membership and start at base.
    if (!prior || prior.constituents.length === 0) {
      const constituents = rebalance(def, ctx.updatedCompanies, curveOf, week);
      return {
        id: def.id,
        constituents,
        lastRebalanceWeek: week,
        level: prior?.level ?? INDEX_BASE_LEVEL,
        totalValueUSD: basketValueUSD(def, constituents, byId, curveOf, week),
      };
    }

    // Level FIRST, on the membership that was in force all week — the return the basket actually
    // delivered. Doing this after a rebalance would credit the index with the difference between
    // two different baskets, which is a return no holder could have earned.
    const heldValueUSD = basketValueUSD(def, prior.constituents, byId, curveOf, week);
    const level = prior.totalValueUSD > 0
      ? prior.level * (heldValueUSD / prior.totalValueUSD)
      : prior.level;

    const due = week - prior.lastRebalanceWeek >= INDEX_REBALANCE_WEEKS;
    if (!due) {
      return { ...prior, level, totalValueUSD: heldValueUSD };
    }
    // Rebalance: new membership, and the value line re-based onto it so next week's level change
    // is measured against what the index now holds.
    const constituents = rebalance(def, ctx.updatedCompanies, curveOf, week);
    return {
      id: def.id,
      constituents,
      lastRebalanceWeek: week,
      level,
      totalValueUSD: basketValueUSD(def, constituents, byId, curveOf, week),
    };
  });
}
