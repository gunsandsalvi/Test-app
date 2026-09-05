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
import { marketCapAt, issuedSharesOf } from '../../../engine2/instruments';
import { buildEntityIndex } from '../../ledger/entity-index';
import type { EntityId, InstrumentId } from '../../../domain/ids';
import { ensureV2, V2World } from '../../../engine2/world';
import { trancheIdOf, ladderRowsOf, trancheRowOf, issuerIdOf, TR_FLOATING, TR_CP, TR_FACILITY } from '../../../engine2/tranches';
import { clearedPriceOf } from '../../../engine2/prices';
import { WeeklyStepContext } from './context';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { isInvestmentGrade } from './asset-allocation';
import {
  INDEX_DEFINITIONS, IndexDefinition, IndexConstituent, MarketIndex,
  LARGE_CAP_CUMULATIVE_SHARE, INDEX_REBALANCE_WEEKS, INDEX_BASE_LEVEL,
} from '../../../domain/indexes';
import { equityInstrumentId } from '../../../domain/instrument-keys';

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
function creditRowValueLocal(v2: V2World, r: number, floating: boolean): number {
  const S = v2.tranches;
  if (S.flags[r] & INDEXABLE_EXCLUDED) return 0;
  if (((S.flags[r] & TR_FLOATING) !== 0) !== floating) return 0;
  const price = clearedPriceOf(v2, trancheIdOf(v2, r));
  if (price === undefined || !(price > 0)) return 0;
  return S.principalLocal[r] * price;
}

/** Whether an issuer's paper is in this credit index's scope — the tier is the issuer's rating. */
function creditIssuerEligible(def: IndexDefinition, comp: Company): boolean {
  if (!isActiveCompany(comp)) return false;
  if (def.region && comp.region !== def.region) return false;
  if (def.assetClass === 'LEVERAGED_LOAN') return true;
  const ig = isInvestmentGrade(comp.creditRating);
  return def.tier === 'IG' ? ig : def.tier === 'HY' ? !ig : true;
}

/**
 * §3.13-BOOK dV — A CREDIT INDEX'S CONSTITUENTS ARE TRANCHES. The index held ISSUERS, each weighted
 * by the market value of everything it owed, and the trackers spread that weight across the
 * issuer's paper afterwards by this week's values; a field called `instrumentId` held a borrower.
 * Each piece of indexable paper is its own constituent now, weighted by its own principal at its
 * own cleared price — the index owns the paper, not the borrower, and its weights are the
 * statement A1 asks for.
 */
function creditConstituents(v2: V2World, def: IndexDefinition, companies: Company[]): { instrumentId: InstrumentId; valueLocal: number }[] {
  const floating = def.assetClass === 'LEVERAGED_LOAN';
  const out: { instrumentId: InstrumentId; valueLocal: number }[] = [];
  companies.forEach((comp) => {
    if (!creditIssuerEligible(def, comp)) return;
    for (const r of ladderRowsOf(v2, comp.id)) {
      const valueLocal = creditRowValueLocal(v2, r, floating);
      if (valueLocal > 0) out.push({ instrumentId: trancheIdOf(v2, r), valueLocal });
    }
  });
  return out;
}

/** What an eligible name's EQUITY contributes to an equity index — its market cap; zero = not eligible. */
function equityValueLocal(v2: V2World, def: IndexDefinition, comp: Company): number {
  if (!isActiveCompany(comp)) return 0;
  if (def.region && comp.region !== def.region) return 0;
  if (!isPubliclyListed(comp) || !(issuedSharesOf(v2, comp.id) > 0) || !(comp.stockPrice > 0)) return 0;
  return marketCapAt(v2, comp);
}

/** One constituent's value this week, at cleared prices — the index's own instrument, whatever
 *  its class: a company's equity at market cap, a tranche at its principal times its price. */
function constituentValueLocal(v2: V2World, def: IndexDefinition, c: IndexConstituent, byId: ReadonlyMap<EntityId, Company>): number {
  if (def.assetClass === 'EQUITY') {
    const comp = byId.get(issuerIdOf(v2, c.instrumentId));
    return comp ? equityValueLocal(v2, def, comp) : 0;
  }
  // A constituent that matured or was retired since the rebalance contributes nothing until the
  // next one, exactly as a delisted name does on the equity side.
  const r = trancheRowOf(v2, c.instrumentId);
  return r === undefined ? 0 : creditRowValueLocal(v2, r, def.assetClass === 'LEVERAGED_LOAN');
}

/**
 * Re-strike one index's membership and weights. LARGE_CAP takes names in descending value until
 * the cumulative share crosses the threshold; SMALL_CAP takes exactly what LARGE_CAP left, so the
 * two partition ALL_CAP with no name in both and none in neither.
 */
function rebalance(v2: V2World, def: IndexDefinition, companies: Company[]): IndexConstituent[] {
  // §3.13-BOOK dV: every constituent is an INSTRUMENT the index holds — a company's equity, or
  // one piece of its indexable paper — never the issuer.
  const eligible = (def.assetClass === 'EQUITY'
    ? companies.map((c) => ({ instrumentId: equityInstrumentId(c.id), valueLocal: equityValueLocal(v2, def, c) }))
    : creditConstituents(v2, def, companies))
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
function basketValueLocal(v2: V2World, def: IndexDefinition, constituents: IndexConstituent[], byId: ReadonlyMap<EntityId, Company>): number {
  return constituents.reduce((sum, c) => sum + constituentValueLocal(v2, def, c, byId), 0);
}

export function runIndexCalculationStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2 = ensureV2(state);
  const { companyById: byId } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const previous = new Map((state.marketIndexes).map((i) => [i.id, i]));
  const week = ctx.nextWeek;

  ctx.updatedMarketIndexes = INDEX_DEFINITIONS.map((def): MarketIndex => {
    const prior = previous.get(def.id);

    // Inception: strike the membership and start at base.
    if (!prior || prior.constituents.length === 0) {
      const constituents = rebalance(v2, def, ctx.updatedCompanies);
      return {
        id: def.id,
        constituents,
        lastRebalanceWeek: week,
        level: prior?.level ?? INDEX_BASE_LEVEL,
        totalValueLocal: basketValueLocal(v2, def, constituents, byId),
      };
    }

    // Level FIRST, on the membership that was in force all week — the return the basket actually
    // delivered. Doing this after a rebalance would credit the index with the difference between
    // two different baskets, which is a return no holder could have earned.
    const heldValueLocal = basketValueLocal(v2, def, prior.constituents, byId);
    const level = prior.totalValueLocal > 0
      ? prior.level * (heldValueLocal / prior.totalValueLocal)
      : prior.level;

    const due = week - prior.lastRebalanceWeek >= INDEX_REBALANCE_WEEKS;
    if (!due) {
      return { ...prior, level, totalValueLocal: heldValueLocal };
    }
    // Rebalance: new membership, and the value line re-based onto it so next week's level change
    // is measured against what the index now holds.
    const constituents = rebalance(v2, def, ctx.updatedCompanies);
    return {
      id: def.id,
      constituents,
      lastRebalanceWeek: week,
      level,
      totalValueLocal: basketValueLocal(v2, def, constituents, byId),
    };
  });
}
