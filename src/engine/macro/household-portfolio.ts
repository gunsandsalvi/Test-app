/**
 * MS1 — what households actually own.
 *
 * The household sector held its equity as a single number that appreciated by a formula return:
 * 2,224B against a total real market capitalisation of 1,052B, in no share register and clearing
 * in no book, while driving net worth, the wealth effect and consumption. This module replaces it
 * with the real claims the model contains, and names the part it does not.
 *
 * Four components, in descending order of how real they are:
 *   - **ETF shares.** Created through the authorised-participant mechanism like any other holder's,
 *     marked at the fund's own NAV. A household has no research capacity, so the ETF project's
 *     coverage rule already makes it a 100% indexer — households are the buyer the broad-market
 *     funds were missing, which is what made this gap visible in the first place.
 *   - **Direct listed equity.** The float institutions do not hold. 07e already treats the
 *     non-institutional share as passive holders who do not bid; this says who they are.
 *   - **Private business equity.** Households own the unlisted economy. HC gave every private firm
 *     an `ownership.founderPct`; valued at the same cleared multiple the sponsors mark at, this is
 *     the largest real component and it was entirely invisible before.
 *   - **The unmodeled remainder**, which is not a claim at all but an honest label for the assets
 *     the universe does not yet contain. See `unmodeledFinancialAssetsUSD`.
 */

import { Company, RegionId } from '../../types';
import { InstitutionalEntity } from '../../domain/institutions';
import { HouseholdState } from '../../domain/region-macro';
import { isActiveCompany, isPubliclyListed } from '../../domain/company';

/**
 * Founder stakes in this region's private tier, at the multiple the public market clears for
 * comparable listed earnings — the same number HC4's NAV mark and HC6's deal arithmetic read, so
 * a private company is worth one thing no matter who is holding it.
 */
export function householdPrivateBusinessEquityUSD(
  regionId: RegionId,
  companies: Company[],
  evMultiple: number
): number {
  if (!(evMultiple > 0)) return 0;
  return companies.reduce((sum, c) => {
    if (c.region !== regionId || !isActiveCompany(c) || isPubliclyListed(c)) return sum;
    const founderPct = c.ownership?.founderPct ?? 1;
    if (!(founderPct > 0)) return sum;
    const equityUSD = Math.max(0, evMultiple * c.ebitda - c.totalDebt);
    return sum + equityUSD * founderPct;
  }, 0);
}

/**
 * The listed float households hold: what institutions do not. `equityOwnership.institutionalShare`
 * is the same number 07e uses to decide how much of each name is genuinely in play, so the two
 * sides of the register agree by construction rather than by coincidence.
 */
export function householdDirectEquityUSD(
  regionId: RegionId,
  companies: Company[],
  institutionalShare: number
): number {
  const householdShare = Math.max(0, 1 - institutionalShare);
  return companies.reduce((sum, c) => {
    if (c.region !== regionId || !isActiveCompany(c) || !isPubliclyListed(c)) return sum;
    return sum + Math.max(0, c.marketCap) * householdShare;
  }, 0);
}

/** Marked value of the household's index-fund shares, at each fund's current net asset value. */
export function householdEtfHoldingsUSD(
  hs: Pick<HouseholdState, 'etfShares'>,
  entities: InstitutionalEntity[]
): number {
  if (!hs.etfShares?.length) return 0;
  const fundById = new Map(entities.filter((e) => e.entityType === 'ETF' && e.etf).map((e) => [e.id, e]));
  return hs.etfShares.reduce((sum, holding) => {
    const fund = fundById.get(holding.fundId);
    if (!fund?.etf || !(fund.etf.sharesOutstanding > 0)) return sum;
    const navUSD = fund.itemizedHoldings.reduce((a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0)
      + Math.max(0, fund.cashUSD ?? 0);
    return sum + holding.shares * (navUSD / fund.etf.sharesOutstanding);
  }, 0);
}
