import { V2World } from '../../../engine2/world';
/**
 * The demand schedule an INDEX FUND posts into a clearing book.
 *
 * An index fund is the one participant in this engine that does not decide what a security is
 * worth. It holds its benchmark weight at whatever the market is asking, and stops when the money
 * runs out. That price-insensitivity is not a simplification — it is the defining property of the
 * product and a large, real force in the markets it buys into, and no existing participant could
 * express it: every other schedule in this engine is anchored on a reservation level.
 *
 * So the fund's schedule is a SIZE with no reservation: a target holding equal to its index weight
 * times what it has to invest, and a cash constraint. Shared by 07b, 07d and 07e so the three
 * books cannot drift into three different ideas of what an index fund does.
 */

import { InstitutionalEntity } from '../../../types';
import { ParticipantDemand } from './financial-clearing-engine';
import { MarketIndex } from '../../../domain/indexes';
import { entityCashOf } from '../../ledger/accounts';
import type { RegionId } from '../../../domain/geography';
import { INDEX_DEFINITIONS } from '../../../domain/indexes';
import type { IndexDefinition } from '../../../domain/indexes';

/**
 * A reservation level so far beyond any real schedule that the fund is always a full-size bidder.
 * It is a NUMERICAL device for "no reservation", never economics — the fund's restraint is its
 * size and its cash, both of which are real.
 */
const NO_RESERVATION_YIELD_BPS = 1e9;
// A PRICE_LIKE reservation is a MAXIMUM price — the holder wants nothing above it and full size
// below. "No reservation" is therefore an unreachably HIGH price, not zero: set to zero the fund
// bought nothing at any positive price, which is the opposite of what an index fund does
// (measured: equity funds held two positions against a 157-name benchmark).
const NO_RESERVATION_PRICE = 1e9;

/**
 * The fund's terms for one instrument. `statKind` orients the no-reservation level; `targetLocal`
 * is index weight x investable assets, and `availableCashLocal` is what it can actually add.
 */
export function indexFundDemand(
  targetLocal: number,
  availableCashLocal: number,
  statKind: 'YIELD_LIKE' | 'PRICE_LIKE'
): ParticipantDemand {
  return {
    reservationStat: statKind === 'YIELD_LIKE' ? -NO_RESERVATION_YIELD_BPS : NO_RESERVATION_PRICE,
    maxHoldingLocal: Math.max(0, targetLocal),
    // Full size immediately: there is no level at which the fund scales in, because it is not
    // pricing. Any positive range would make it price-sensitive, which is the opposite of what
    // it is.
    fullSizeStatRange: 1e-6,
    maxNetPurchaseLocal: Math.max(0, availableCashLocal),
  };
}

/**
 * Every fund tracking an index that this book prices, with the target each one wants in a given
 * instrument. Returns an empty list when there are no funds, so an adapter pays nothing for the
 * feature before any shares exist.
 */
/**
 * §3.13-READ D6 — THE INDEXES THIS BOOK PRICES, and the one predicate that says so.
 *
 * It was written twice per book, a hundred lines apart, and 07b's and 07d's two copies DISAGREED.
 * The selection filter that decides which ETFs get a SEAT matched on asset class alone; the
 * `bookIndexIds` list that decides which ETFs get DEMAND also required the index's region. So a
 * fund tracking a foreign credit index was admitted to the auction as a participant and then
 * handed no demand at all — seated, counted, and mute. 07e had the region clause in both places
 * and was right.
 *
 * A region-less definition is a GLOBAL index and belongs in every region's book, which is what
 * 07e's `|| !d.region` says; the credit books never wrote that clause because no credit index is
 * region-less today, and it is inert there rather than a change.
 */
export function bookIndexIdsOf(
  assetClass: IndexDefinition['assetClass'],
  regionId: RegionId
): string[] {
  return INDEX_DEFINITIONS
    .filter((d) => d.assetClass === assetClass && (d.region === regionId || !d.region))
    .map((d) => d.id);
}

/**
 * The funds that get a SEAT in this book: those tracking one of its indexes. `sameRegionOnly`
 * is the one thing the three books still differ on and it is a real question rather than a drift
 * — whether a fund domiciled elsewhere may bid in this region's book — so each names its own
 * answer instead of one being silently imposed on the others.
 */
export function indexFundsSeatedIn(
  entities: InstitutionalEntity[],
  assetClass: IndexDefinition['assetClass'],
  regionId: RegionId,
  sameRegionOnly: boolean
): InstitutionalEntity[] {
  const ids = new Set(bookIndexIdsOf(assetClass, regionId));
  return entities.filter((e) =>
    e.entityType === 'ETF' && !!e.etf && ids.has(e.etf.indexId)
    && (!sameRegionOnly || e.region === regionId));
}

export function indexFundsForBook(
  v2: V2World,
  entities: InstitutionalEntity[],
  indexes: MarketIndex[],
  indexIds: string[],
  /**
   * SCALE C1 / §3.13-READ B3 — A FUND'S BOOK VALUE, READ THROUGH THE STORE. Required, not
   * optional: the entity's own `itemizedHoldings` array is a STALE week-start snapshot between
   * the store's build and its write-back, and all three callers (07b, 07d, 07e) run inside that
   * window and all three already pass `holdingsUsdOf`. The fallback that read the array directly
   * was reachable only from a caller that does not exist, and rule 19 says a stale mirror with no
   * reader is a defect waiting for one.
   */
  holdingsUsdOf: (e: InstitutionalEntity) => number
): { fund: InstitutionalEntity; index: MarketIndex; investableLocal: number }[] {
  const wanted = new Set(indexIds);
  const indexById = new Map(indexes.map((i) => [i.id, i]));
  const out: { fund: InstitutionalEntity; index: MarketIndex; investableLocal: number }[] = [];
  entities.forEach((e) => {
    if (e.entityType !== 'ETF' || !e.etf || !wanted.has(e.etf.indexId)) return;
    const index = indexById.get(e.etf.indexId);
    if (!index || index.constituents.length === 0) return;
    // A fund invests everything it has: its basket plus the cash creations just handed it.
    // §7.266: SIGNED — a fund whose cash stands negative has less to invest than it holds, so
    // its targets drop by the shortfall and the next clearing SELLS it back to solvency. The
    // old `max(0, cash)` left an overdrawn fund targeting its full basket forever: nothing
    // ever sold, nothing ever refilled, and one small dip printed as a violation every week
    // (the sticky overdraft singles of §7.262/§7.265). A fund short of money liquidates —
    // that is the refill path a real fund has, and the one this one was missing.
    const holdingsLocal = holdingsUsdOf(e);
    // §7.273 — THE FUND KEEPS ITS OWN FEE AS A CASH SLEEVE. Fully invested, a fund that pays
    // its sponsor and its trading spreads out of a zero cash line orbits at dust-negative
    // forever: each refill sale nets proceeds-minus-fee and lands just below zero again
    // (measured: USAEQX overdrawn by <5M for 21 straight weeks at the §7.271 reference). The
    // sleeve is a year of its OWN expense ratio — the fund's own measured obligation, no new
    // constant — which is also what real index funds hold cash for.
    const investableLocal = (holdingsLocal + entityCashOf(v2, e)) * (1 - (e.etf.expenseRatioAnnual));
    if (investableLocal > 0) out.push({ fund: e, index, investableLocal });
  });
  return out;
}
