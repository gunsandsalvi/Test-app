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

import { GameState, Company } from '../../../types';
import { ensureV2, V2World } from '../../../engine2/world';
import { ladderRowsOf, TR_FLOATING, TR_CP, TR_FACILITY } from '../../../engine2/tranches';
import { clearedPriceOf } from '../../../engine2/prices';
import { WeeklyStepContext } from './context';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { isInvestmentGrade } from './asset-allocation';
import { marketCapOf } from '../../../domain/company';
import {
  INDEX_DEFINITIONS, IndexDefinition, IndexConstituent, MarketIndex,
  LARGE_CAP_CUMULATIVE_SHARE, INDEX_REBALANCE_WEEKS, INDEX_BASE_LEVEL,
} from '../../../domain/indexes';

// §7.311 — ladder reads on rows; "indexable" = capital-markets paper (no bank debt, no CP).
const INDEXABLE_EXCLUDED = TR_FACILITY | TR_CP;

/**
 * A credit index is MARKET-VALUE weighted, so a bond's contribution is its principal at its
 * PRICE, not its face. Valuing the book at par made the level track amount outstanding instead of
 * return: measured, the loan index sat at 99.5 after forty weeks of real spread movement, because
 * nothing but principal could ever move it.
 *
 * §3.13 — AND THE PRICE IS READ, NOT RE-DERIVED. This used to discount each tranche's cash flows
 * at the Nelson-Siegel fit plus the issuer's one spread: a third opinion about a price the auction
 * had already struck, on a curve that is not the one the auction struck it against (§3.25's two
 * conventions, and `P6`'s whole point). 07b prints a price per piece of paper and this reads it.
 * A tranche no session has printed contributes nothing rather than a guess — an index of what
 * traded is what an index is.
 */
function fixedMarketValueLocal(v2: V2World, comp: Company, week: number): number {
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if (S.flags[r] & (INDEXABLE_EXCLUDED | TR_FLOATING)) continue;
    const price = clearedPriceOf(v2, v2.internedStrings[S.idRef[r]]);
    if (price === undefined || !(price > 0)) continue;
    sum += S.principalLocal[r] * price;
  }
  return sum;
}

function floatingMarketValueLocal(v2: V2World, comp: Company): number {
  // 07d clears a price to par for every loan it quotes; par is the honest fallback for a tranche
  // whose issuer has no quote yet (a debut in its first week).
  const pricePerDollar = (comp.leveragedLoan?.pricePar ?? 100) / 100;
  const S = v2.tranches;
  let sum = 0;
  for (const r of ladderRowsOf(v2, comp.id)) {
    if ((S.flags[r] & INDEXABLE_EXCLUDED) || !(S.flags[r] & TR_FLOATING)) continue;
    sum += S.principalLocal[r] * Math.max(0, pricePerDollar);
  }
  return sum;
}

/**
 * What each eligible name contributes to this index, at this week's cleared prices — market cap
 * for equity, outstanding principal for credit. Zero means not eligible.
 */
function indexValueLocal(v2: V2World, def: IndexDefinition, comp: Company, week: number): number {
  if (!isActiveCompany(comp)) return 0;
  if (def.region && comp.region !== def.region) return 0;

  if (def.assetClass === 'EQUITY') {
    if (!isPubliclyListed(comp) || !(comp.sharesOutstanding > 0) || !(comp.stockPrice > 0)) return 0;
    return marketCapOf(comp);
  }

  if (def.assetClass === 'LEVERAGED_LOAN') return floatingMarketValueLocal(v2, comp);

  // Corporate bonds, split by the issuer's own cleared rating.
  const ig = isInvestmentGrade(comp.creditRating);
  if (def.tier === 'IG' && !ig) return 0;
  if (def.tier === 'HY' && ig) return 0;
  return fixedMarketValueLocal(v2, comp, week);
}

/**
 * Re-strike one index's membership and weights. LARGE_CAP takes names in descending value until
 * the cumulative share crosses the threshold; SMALL_CAP takes exactly what LARGE_CAP left, so the
 * two partition ALL_CAP with no name in both and none in neither.
 */
function rebalance(v2: V2World, def: IndexDefinition, companies: Company[], week: number): IndexConstituent[] {
  const eligible = companies
    .map((c) => ({ instrumentId: c.id, valueLocal: indexValueLocal(v2, def, c, week) }))
    .filter((x) => x.valueLocal > 0)
    .sort((a, b) => b.valueLocal - a.valueLocal);
  if (eligible.length === 0) return [];

  const totalLocal = eligible.reduce((s, x) => s + x.valueLocal, 0);
  let members = eligible;
  if (def.tier === 'LARGE_CAP' || def.tier === 'SMALL_CAP') {
    let cumulative = 0;
    let cut = 0;
    for (; cut < eligible.length; cut++) {
      cumulative += eligible[cut].valueLocal;
      if (cumulative / totalLocal >= LARGE_CAP_CUMULATIVE_SHARE) { cut++; break; }
    }
    members = def.tier === 'LARGE_CAP' ? eligible.slice(0, cut) : eligible.slice(cut);
  }
  const memberTotalLocal = members.reduce((s, x) => s + x.valueLocal, 0);
  if (!(memberTotalLocal > 0)) return [];
  return members.map((x) => ({ instrumentId: x.instrumentId, weight: x.valueLocal / memberTotalLocal }));
}

/** This week's aggregate value of a fixed membership, at cleared prices. */
function basketValueLocal(v2: V2World, def: IndexDefinition, constituents: IndexConstituent[], byId: Map<string, Company>, week: number): number {
  return constituents.reduce((sum, c) => {
    const comp = byId.get(c.instrumentId);
    return comp ? sum + indexValueLocal(v2, def, comp, week) : sum;
  }, 0);
}

export function runIndexCalculationStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const byId = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  const previous = new Map((state.marketIndexes ?? []).map((i) => [i.id, i]));
  const week = ctx.nextWeek;

  ctx.updatedMarketIndexes = INDEX_DEFINITIONS.map((def): MarketIndex => {
    const prior = previous.get(def.id);

    // Inception: strike the membership and start at base.
    if (!prior || prior.constituents.length === 0) {
      const constituents = rebalance(v2, def, ctx.updatedCompanies, week);
      return {
        id: def.id,
        constituents,
        lastRebalanceWeek: week,
        level: prior?.level ?? INDEX_BASE_LEVEL,
        totalValueLocal: basketValueLocal(v2, def, constituents, byId, week),
      };
    }

    // Level FIRST, on the membership that was in force all week — the return the basket actually
    // delivered. Doing this after a rebalance would credit the index with the difference between
    // two different baskets, which is a return no holder could have earned.
    const heldValueLocal = basketValueLocal(v2, def, prior.constituents, byId, week);
    const level = prior.totalValueLocal > 0
      ? prior.level * (heldValueLocal / prior.totalValueLocal)
      : prior.level;

    const due = week - prior.lastRebalanceWeek >= INDEX_REBALANCE_WEEKS;
    if (!due) {
      return { ...prior, level, totalValueLocal: heldValueLocal };
    }
    // Rebalance: new membership, and the value line re-based onto it so next week's level change
    // is measured against what the index now holds.
    const constituents = rebalance(v2, def, ctx.updatedCompanies, week);
    return {
      id: def.id,
      constituents,
      lastRebalanceWeek: week,
      level,
      totalValueLocal: basketValueLocal(v2, def, constituents, byId, week),
    };
  });
}
