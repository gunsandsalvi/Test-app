/**
 * XB — who may hold whose paper, and how much.
 *
 * The defect this replaces: `AssetOwnershipShares.foreignShare` was an ownership share IMPOSED on
 * every market (8% of each sovereign stock per foreign region, 5% of equity, 4% of corporate),
 * re-imposed every week by 02-region-macro and subtracted from the tradable float in all five
 * clearing books. It owned nothing — no entity held it, no coupon reached it — and it was an
 * INPUT where ownership should be an OUTPUT. Measured: 442B of claims with no holder, against
 * 883B of total institutional assets across all four regions.
 *
 * Ownership is not a share you assign. It is whatever the auction leaves each holder holding once
 * every holder has bid what its own mandate and money allow. What is imposed here is only the
 * MANDATE — the rules a real institution genuinely operates under — and the holdings that follow
 * are measured, not set.
 */

import { RegionId } from './geography';
import { InstitutionalEntityType } from './institutions';

/**
 * Share of a book its mandate keeps at home. Real and large: a pension fund's liabilities are in
 * its members' currency and its regulator cares, so it runs 60–80% domestic; an insurer more so,
 * because solvency rules charge currency mismatch; an asset manager tracks a benchmark that is
 * itself mostly domestic; a hedge fund has no such constraint and goes where the trade is.
 *
 * This is a MANDATE, not an ownership share: it bounds what an entity may buy abroad, and the
 * auction decides what it ends up owning.
 *
 * RULE 5, OPEN: a real home-bias mandate is a LIMIT ("no more than X% foreign"), but
 * `mandateWeightForIssuer` below returns it as a WEIGHT that scales demand directly — so the
 * constraint is acting as a preference, and an entity always wants exactly 75% domestic rather
 * than being merely allowed up to 25% abroad. Rule 5: the target is the guide, the actual
 * purchase is tactical. Owner: HF, which gives entities real strategies to be tactical with.
 */
export const HOME_BIAS_BY_ENTITY_TYPE: Record<InstitutionalEntityType, number> = {
  PENSION_FUND: 0.75,
  INSURER: 0.85,
  ASSET_MANAGER: 0.65,
  HEDGE_FUND: 0.20,
  PRIVATE_EQUITY: 0.90,
  MONEY_MARKET_FUND: 1.0,
  ETF: 1.0,
};

/**
 * The weight this entity's mandate puts on one issuer region's market.
 *
 * Domestic gets the home-bias share. The remainder spreads across foreign markets IN PROPORTION
 * TO THEIR SIZE — a bigger market absorbs more of a foreign mandate for the same reason an index
 * weights it more, and it means no per-pair constant has to be invented. Returns 0 when the
 * entity has no foreign opportunity set at all.
 *
 * Index funds and money funds return 1 at home and 0 abroad: a money fund's mandate is its own
 * currency, and an index fund holds its benchmark, which XB's global indexes will widen for it
 * rather than a mandate override doing so here.
 */
export function mandateWeightForIssuer(
  entityType: InstitutionalEntityType,
  holderRegion: RegionId,
  issuerRegion: RegionId,
  marketSizeByRegionUSD: Record<string, number>
): number {
  const homeBias = HOME_BIAS_BY_ENTITY_TYPE[entityType] ?? 1;
  if (issuerRegion === holderRegion) return homeBias;
  if (homeBias >= 1) return 0;
  const foreignTotal = Object.entries(marketSizeByRegionUSD)
    .filter(([r]) => r !== holderRegion)
    .reduce((a, [, v]) => a + (Number(v) || 0), 0);
  if (foreignTotal <= 0) return 0;
  return (1 - homeBias) * ((Number(marketSizeByRegionUSD[issuerRegion]) || 0) / foreignTotal);
}

/**
 * Whether an entity type's mandate lets it hold DURATION at all.
 *
 * A money market fund may not: its shares are redeemable at a fixed $1, so it holds only paper
 * short enough that price risk cannot break that promise. An ETF holds its benchmark and reaches
 * the market through the index-fund path rather than as a discretionary buyer.
 *
 * This existed implicitly before XB1 and nothing enforced it: the old imposed-share machinery
 * renormalized every holder's target down to a fixed aggregate, which happened to keep a money
 * fund's long-bond position small enough not to matter. With targets bottom-up from each
 * entity's own book, the same fund bid its full government allocation into the BOND auction and
 * broke its $1 NAV in four regions. **A constraint that only held because something else was
 * binding is not a constraint.**
 */
export function mandateAllowsDuration(entityType: InstitutionalEntityType): boolean {
  return entityType !== 'MONEY_MARKET_FUND' && entityType !== 'ETF';
}
