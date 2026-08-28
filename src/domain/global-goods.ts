/**
 * The world market for a sub-unit's output (XB3a).
 *
 * Every sub-unit clears in TWO places: one global book that all four regions bid and offer into,
 * and one local book per region. What splits them is `CATEGORY_TRADABILITY`, the continuous
 * parameter the model already carries — a region puts that share of its supply and of its demand
 * into the world book and keeps the rest at home. Software (0.85) is therefore nearly one world
 * price; construction (0.02) is four local ones. No threshold constant decides which categories
 * are "tradable", because tradability is not a yes/no property.
 *
 * Trade is then ACCOUNTING rather than a mechanism: an export is a fill in the global book whose
 * buyer sits in a different region from its seller. What it replaced was `exportShareCapture`, a
 * formula that credited a region a share of another region's demand and handed the resulting
 * revenue to firms in stage 08 — a second, independent way for a company to make a sale, beside
 * the auction that was already selling its output (rule 3).
 */

import { Industry, INDUSTRY_SUBUNITS } from './industry';
import { CATEGORY_TRADABILITY } from './region-macro';

/** subUnitId -> the industry category it belongs to. A view over INDUSTRY_SUBUNITS, built once. */
export const SUBUNIT_INDUSTRY: Record<string, Industry> = (() => {
  const map: Record<string, Industry> = {};
  (Object.keys(INDUSTRY_SUBUNITS) as Industry[]).forEach((industry) => {
    INDUSTRY_SUBUNITS[industry].forEach((su) => { map[su.unitId] = industry; });
  });
  return map;
})();

/**
 * The share of this sub-unit's supply and demand that meets the rest of the world.
 *
 * Tradability is a property of the CATEGORY, so every sub-unit under it inherits the same figure;
 * making it a per-sub-unit property is BP1's registry, not this slice's to invent.
 */
export function subUnitTradability(subUnitId: string): number {
  const industry = SUBUNIT_INDUSTRY[subUnitId];
  const tradability = industry !== undefined ? CATEGORY_TRADABILITY[industry] : undefined;
  return typeof tradability === 'number' && Number.isFinite(tradability)
    ? Math.max(0, Math.min(1, tradability))
    : 0;
}

/**
 * One sub-unit's world book. The regional `CategoryDemandState` carries the same three price
 * fields for the local book; these are the global book's own, so neither is a second
 * representation of the other — they are two markets with two prices.
 */
export interface GlobalGoodsMarketState {
  subUnitId: string;
  /** Last cleared world price. The book's own anchor next week. */
  unitPriceUSD: number;
  /** Slow-moving average suppliers set production against — same cobweb damping as the local book. */
  smoothedUnitPriceUSD: number;
  /** Fixed baseline for the world price index, captured the first time the book clears (S8). */
  baseUnitPriceUSD: number;
  /** Units that changed hands in the world book this week. */
  clearedUnitsThisWeek: number;
  /** Value of this week's fills whose buyer and seller sat in different regions — the trade. */
  crossBorderValueUSD: number;
  /** XB3a — whose currency this market invoices in, contested weekly by three real forces and
   *  never assigned. Undefined until the book first clears something across a border. */
  invoiceRegion?: import('./geography').RegionId;
}

export function createSeedGlobalGoodsMarket(subUnitId: string, unitPriceUSD: number): GlobalGoodsMarketState {
  return {
    subUnitId,
    unitPriceUSD,
    smoothedUnitPriceUSD: unitPriceUSD,
    baseUnitPriceUSD: unitPriceUSD,
    clearedUnitsThisWeek: 0,
    crossBorderValueUSD: 0,
  };
}
