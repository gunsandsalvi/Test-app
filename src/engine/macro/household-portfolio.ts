/**
 * What households actually own.
 *
 * The household sector held its equity as a single number that appreciated by a formula return:
 * 2,224B against a total real market capitalisation of 1,052B, in no share register and clearing
 * in no book, while driving net worth, the wealth effect and consumption. This module replaces it
 * with the real claims the model contains, and names the part it does not.
 *
 * Four components, in descending order of how real they are:
 *   **ETF shares.** Created through the authorised-participant mechanism like any other holder's,
 *     marked at the fund's own NAV. A household has no research capacity, so the ETF project's
 *     coverage rule already makes it a 100% indexer — households are the buyer the broad-market
 *     funds were missing, which is what made this gap visible in the first place.
 *   **Direct listed equity.** The float institutions do not hold. 07e already treats the
 *     non-institutional share as passive holders who do not bid; this says who they are.
 *   **Private business equity.** Households own the unlisted economy. HC gave every private firm
 *     an `ownership.founderPct`; valued at the same cleared multiple the sponsors mark at, this is
 *     the largest real component and it was entirely invisible before.
 *   C5: there is no "unmodeled remainder" — household wealth is the claims that exist.
 */

import { bookHeadOf } from '../../engine2/holdings';
import { internString } from '../../engine2/world';
import { Company, RegionId } from '../../types';
import { InstitutionalEntity } from '../../domain/institutions';
import { HouseholdState } from '../../domain/region-macro';
import { isActiveCompany, isPubliclyListed } from '../../domain/company';
import { marketCapOf, totalDebtOf } from '../../domain/company';
import { entityCashOf } from '../ledger/accounts';

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
    const equityUSD = Math.max(0, evMultiple * c.ebitda - totalDebtOf(c));
    return sum + equityUSD * founderPct;
  }, 0);
}

/**
 * The listed shares households hold directly: the residual of a REAL register, name by
 * name. Every share of a listed company is either on some institution's book (funds, insurers,
 * pensions and the index funds, all of which bid in 07e and settle their cash there) or it is
 * held directly, and this counts the second kind by subtracting the first from the register.
 *
 * What it replaces: `marketCap x (1 - equityOwnership.institutionalShare)`, a flat regional
 * fraction of every company alike, taken from a share that was assigned at seed and drifted
 * inside a band. A name institutions have crowded into and a name they have never bought were
 * reported as equally household-owned.
 *
 * Nothing circular: 07e clears the whole register (OWN2), so this is a measurement of who ended
 * up holding it, never an input to what the book may trade.
 */
// Reads the persistent rows — mid-week the object books are a stale view.
export function householdDirectEquityUSD(
  v2: import('../../engine2/world').V2World,
  regionId: RegionId,
  companies: Company[],
  entities: InstitutionalEntity[],
  /** The banks' equity desks, by company — 07e creates their inventory as real bank-owned
   *  shares, so what a desk holds is not part of the float. */
  deskHeldUSD?: Map<string, number>
): number {
  const H = v2.holdings;
  const equityRef = internString(v2, 'EQUITY');
  const regionRef = internString(v2, regionId);
  const institutionallyHeldUSD = new Map<string, number>();
  entities.forEach((e) => {
    if (e.isDefaulted) return;
    for (let r = bookHeadOf(v2, e.id); r >= 0; r = H.next[r]) {
      if (H.typeRef[r] !== equityRef || H.regionRef[r] !== regionRef) continue;
      const instrumentId = v2.internedStrings[H.instrRef[r]];
      institutionallyHeldUSD.set(
        instrumentId,
        (institutionallyHeldUSD.get(instrumentId) ?? 0) + H.qtyLocal[r]
      );
    }
  });
  return companies.reduce((sum, c) => {
    if (c.region !== regionId || !isActiveCompany(c) || !isPubliclyListed(c)) return sum;
    // The float is what NO named book holds: the register's institutions and the banks' desks
    // both come out. Subtracting only the register counted the desks' whole equity book as
    // household net worth — and 07e computes the same residual the other way, with the desks
    // out, so the two disagreed by exactly that.
    const namedUSD = (institutionallyHeldUSD.get(c.id) ?? 0) + (deskHeldUSD?.get(c.id) ?? 0);
    return sum + Math.max(0, Math.max(0, marketCapOf(c)) - namedUSD);
  }, 0);
}

/** Marked value of the household's index-fund shares, at each fund's current net asset value. */
// The fund's basket is read off the rows.
export function householdEtfHoldingsUSD(
  v2: import('../../engine2/world').V2World,
  hs: Pick<HouseholdState, 'etfShares'>,
  entities: InstitutionalEntity[]
): number {
  if (!hs.etfShares?.length) return 0;
  const H = v2.holdings;
  const fundById = new Map(entities.filter((e) => e.entityType === 'ETF' && e.etf).map((e) => [e.id, e]));
  return hs.etfShares.reduce((sum, holding) => {
    const fund = fundById.get(holding.fundId);
    if (!fund?.etf || !(fund.etf.sharesOutstanding > 0)) return sum;
    let heldLocal = 0;
    for (let r = bookHeadOf(v2, fund.id); r >= 0; r = H.next[r]) heldLocal += H.qtyLocal[r];
    const navUSD = heldLocal + Math.max(0, entityCashOf(v2, fund));
    return sum + holding.shares * (navUSD / fund.etf.sharesOutstanding);
  }, 0);
}
