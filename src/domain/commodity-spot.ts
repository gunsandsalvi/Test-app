/**
 * §3.22 — A COMMODITY'S SPOT IS A READ OF THE GOODS AUCTION.
 *
 * Every commodity in this world exists as a goods sub-unit that stage 05 clears in a per-region
 * double auction — produced by named firms with real capacity, held as stock in units, shipped by
 * named carriers, consumed by real recipes — and `COMMODITY_CATEGORY_LINKAGE` says which sub-unit
 * each commodity is a value share of. So a commodity's spot is not a second market and not a
 * walk: it is what that sub-unit cleared at this week, at the gate, in the numéraire, in the
 * commodity's own unit. One writer, and it is the auction (rules 3 and 4; rule 19: the store
 * holds the fact, this file reads it).
 *
 * What this replaced: `evolveCommodity` (macro/evolution.ts) multiplied last week's spot by
 * `exp(0.4 × (growth + noise) + 0.12 × (clearingRatio − 1))`, with the demand and supply
 * schedules written down as two elasticities on the ratio of spot to the seed's history. Nobody
 * bid, nobody offered, nothing was allocated — `commodities-spot.md` F3, D1, C4, B2.a, C2. The
 * sub-unit's cleared supply and demand were read only to build the ratio that moved the walk.
 */

import { REGION_IDS, RegionId } from './geography';
import { Region } from './region-macro';
import type { CategoryDemandState } from './market-microstructure';
import { Commodity, COMMODITY_CATEGORY_LINKAGE } from './instruments';
import { localToUsd, FxToUsd } from './currency';
import { defect } from './defect';

export interface CommodityLinkage {
  subUnitId: string;
  /** The share of the sub-unit's VALUE this commodity is (calibrated at the seed). */
  intensityShare: number;
}

/** Which sub-unit a commodity is a value share of. A commodity nothing in this world produces
 *  has no linkage — and no price. */
export function commodityLinkageOf(commodityId: string, symbol?: string): CommodityLinkage {
  const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId] ?? (symbol ? COMMODITY_CATEGORY_LINKAGE[symbol] : undefined);
  return linkage ?? defect(`commodity ${commodityId} is linked to no goods sub-unit`);
}

export interface WorldPrint {
  /** The ex-works price of one sub-unit unit, USD, weighted by the units each origin supplied.
   *  `undefined` when no origin supplied a unit this week: no trade, no print (§3.21). */
  priceUsdPerUnit: number | undefined;
  /** Σ over origins of what the auction and the contracts delivered this week, sub-unit units. */
  suppliedUnits: number;
  /** Σ over regions of what was bid for this week, sub-unit units. */
  demandedUnits: number;
}

/**
 * The sub-unit's world print this week. A commodity trades in one world market (A1.a — location
 * is not yet part of its identity), so the price is every origin's gate price in the numéraire,
 * weighted by the units that origin supplied; the quantities are the auction's own.
 */
export function worldPrintOf(subUnitId: string, regions: Record<RegionId, Region>, fxToUsd: FxToUsd): WorldPrint {
  let valueUsd = 0;
  let suppliedUnits = 0;
  let demandedUnits = 0;
  REGION_IDS.forEach((r) => {
    // A category this region does not carry has no entry. `Region.categoryDemand` is declared
    // total and is sparse (§3.29-iv owns the type); the read says the truth here.
    const cd = regions[r].categoryDemand[subUnitId] as CategoryDemandState | undefined;
    if (!cd) return;
    demandedUnits += cd.totalUnitsDemandedThisWeek ?? 0;
    const units = cd.totalUnitsSuppliedThisWeek ?? 0;
    if (!(units > 0)) return;
    const priceLocal = cd.exWorksUnitPriceLocal;
    if (!(priceLocal !== undefined && priceLocal > 0)) {
      return defect(`${r} ${subUnitId} supplied ${units.toFixed(1)} units with no ex-works price`);
    }
    suppliedUnits += units;
    valueUsd += localToUsd(units * priceLocal, r, fxToUsd);
  });
  return { priceUsdPerUnit: suppliedUnits > 0 ? valueUsd / suppliedUnits : undefined, suppliedUnits, demandedUnits };
}

/**
 * RULE 8 — the commodity's own unit against the sub-unit's. A barrel, a bushel, an ounce is some
 * number of the linked sub-unit's units, and that number is fixed where the two are first stated
 * together: the marginal producer's cost per unit (`getCommodityBaseSpotPrice`, the seed level,
 * NAT1) against the sub-unit's seed print. Bushels per tonne, stated once and never rewritten.
 */
export function goodsUnitsPerCommodityUnitOf(seedSpotUsd: number, subUnitId: string, regions: Record<RegionId, Region>, fxToUsd: FxToUsd): number {
  const print = worldPrintOf(subUnitId, regions, fxToUsd);
  if (print.priceUsdPerUnit === undefined || !(seedSpotUsd > 0)) {
    return defect(`${subUnitId} has no seed print to state a commodity unit against`);
  }
  return seedSpotUsd / print.priceUsdPerUnit;
}

/**
 * The commodity's print this week: the linked sub-unit's world print, in the commodity's own
 * unit, and the auction's own quantities in the commodity's share. Everything the object says
 * about this week is a read; nothing here moves a price. When no origin supplied a unit the
 * last print carries, unchanged (§3.21: a bracket — or a blank — is never a print).
 */
export function markCommodityToAuction(comm: Commodity, regions: Record<RegionId, Region>, fxToUsd: FxToUsd): Commodity {
  const linkage = commodityLinkageOf(comm.id, comm.symbol);
  const g = comm.goodsUnitsPerUnit;
  if (!(g > 0)) return defect(`commodity ${comm.id} states no unit against ${linkage.subUnitId}`);
  const print = worldPrintOf(linkage.subUnitId, regions, fxToUsd);
  const spotPrice = print.priceUsdPerUnit === undefined ? comm.spotPrice : Number((print.priceUsdPerUnit * g).toFixed(2));
  const weeklySupplyUnits = (print.suppliedUnits * linkage.intensityShare) / g;
  const weeklyDemandUnits = (print.demandedUnits * linkage.intensityShare) / g;
  const ratio = weeklySupplyUnits > 0 ? weeklyDemandUnits / weeklySupplyUnits : weeklyDemandUnits > 0 ? Infinity : 1;
  const supplyDemandBalance: Commodity['supplyDemandBalance'] =
    ratio > 1.15 ? 'Deficit (Tight Supply)' : ratio < 0.85 ? 'Surplus (Oversupplied)' : 'Balanced';
  return {
    ...comm,
    spotPrice,
    change1W: Number((spotPrice - comm.spotPrice).toFixed(2)),
    historicalPrices: [...comm.historicalPrices.slice(-51), spotPrice],
    weeklySupplyUnits,
    weeklyDemandUnits,
    supplyDemandBalance,
    // DER4: the curve is cleared by the futures book (`derivative-markets/commodity-future.ts`)
    // against real producer and consumer hedging demand; a tenor that has never printed opens
    // on spot.
    futures1M: comm.futures1M > 0 ? comm.futures1M : spotPrice,
    futures3M: comm.futures3M > 0 ? comm.futures3M : spotPrice,
    futures6M: comm.futures6M > 0 ? comm.futures6M : spotPrice,
  };
}
