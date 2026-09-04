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
import { totalDebtOf } from '../../domain/company';
import { entityCashOf } from '../ledger/accounts';
import { householdBookId } from '../ledger/holdings-ledger';

/**
 * Founder stakes in this region's private tier, at the multiple the public market clears for
 * comparable listed earnings — the same number HC4's NAV mark and HC6's deal arithmetic read, so
 * a private company is worth one thing no matter who is holding it.
 */
export function householdPrivateBusinessEquityLocal(
  regionId: RegionId,
  companies: Company[],
  evMultiple: number
): number {
  if (!(evMultiple > 0)) return 0;
  return companies.reduce((sum, c) => {
    if (c.region !== regionId || !isActiveCompany(c) || isPubliclyListed(c)) return sum;
    const founderPct = c.ownership?.founderPct ?? 1;
    if (!(founderPct > 0)) return sum;
    const equityLocal = Math.max(0, evMultiple * c.ebitda - totalDebtOf(c));
    return sum + equityLocal * founderPct;
  }, 0);
}

/**
 * The listed shares households hold directly — READ OFF THEIR OWN REGISTER BOOK.
 *
 * §9.13-EQUITY: this was a SUBTRACTION. Every share of a listed company was either on some
 * institution's book or on a bank's desk, and this counted the rest by taking those two away from
 * market cap, name by name, every time anybody asked. That made the largest holder class in the
 * model a quantity nobody could point at: it had no rows, so it could not be a counterparty, could
 * not be scaled by a corporate action, and was paid its dividends under a second name ("the public
 * float") because there was no holder of record to pay. Rule 2 — a residual with no holder is a
 * defect, not a boundary.
 *
 * The household sector now has a register book like anyone else's (`holdings-ledger.ts`), opened
 * by wire at the seed with exactly the shares no named book held, and moved only by trade since.
 * This is a read of it, marked at the close by `register-marking` like every other row.
 *
 * What the subtraction replaced before that, and why it was still an improvement:
 * `marketCap × (1 - equityOwnership.institutionalShare)`, a flat regional fraction of every
 * company alike, from a share assigned at seed and drifting inside a band.
 */
// Reads the persistent rows — mid-week the object books are a stale view.
export function householdDirectEquityLocal(
  v2: import('../../engine2/world').V2World,
  regionId: RegionId
): number {
  const H = v2.holdings;
  const equityRef = internString(v2, 'EQUITY');
  const regionRef = internString(v2, regionId);
  let sum = 0;
  for (let r = bookHeadOf(v2, householdBookId(regionId)); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== equityRef || H.regionRef[r] !== regionRef) continue;
    sum += H.qtyLocal[r];
  }
  return sum;
}

/** Marked value of the household's index-fund shares, at each fund's current net asset value. */
// The fund's basket is read off the rows.
export function householdEtfHoldingsLocal(
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
    const navLocal = heldLocal + Math.max(0, entityCashOf(v2, fund));
    return sum + holding.shares * (navLocal / fund.etf.sharesOutstanding);
  }, 0);
}
