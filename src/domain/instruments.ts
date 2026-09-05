/** Tradeable asset types, the player's positions, the player-facing dealers, and commodities.
 *
 *  G3b closed the rule-3 defect this file used to carry: `Dealer` was a SECOND dealer system,
 *  quoting the player by formula while the banks ran real inventories off their own balance
 *  sheets. It is now a VIEW of the named banks' desks — one entry per bank, its axe read off
 *  the books it actually holds paper in, its limit its real dealer capacity — built by
 *  `dealersFromBanks` and refreshed every week. Nothing decides off it; the quote and the fill
 *  both come from the desk. */

import { RegionId } from './geography';
import { VIEW_BASE_COMMODITY_CATEGORY_LINKAGE } from './industry-registry';
import { Sector, CreditRating } from './company';
import type { InstrumentKind } from './assets';

/** §3.13-BOOK (e): the classes the player can trade — a view of the one kind list. A government
 *  bond is `GOV_BOND` here as it is on the register, and a commodity position is the future the
 *  engine clears (`COMMODITY_FUTURE`); `OPTION` and `TRS` have no engine market yet. */
/** §3.17b-ii — the CASH kinds a position can be. The six derivative kinds the player's legacy layer
 *  carried (IRS, CDS, TRS, XCS, COMMODITY_FUTURE, OPTION) are gone: a derivative is a contract on
 *  the one book with a counterparty, never a position marked by formula against nobody. */
export type AssetType = Extract<InstrumentKind, 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'FX_SPOT'>;

export interface Position {
  id: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  region: RegionId;
  dealerId: string;
  
  direction: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  notional: number;
  
  trancheId?: string;
  rateType?: 'FIXED' | 'FLOATING';
  entryOasSpreadBps?: number;
  /** §3.26-a — the spread the last mark implied over the curve of its week, so this week's move
   *  can be split by measurement into what the spread did and what the curve did. */
  markedSpreadBps?: number;
  entryPolicyRate?: number;
  entryBenchmarkYield?: number;
  isClosed?: boolean;

  // A bond position's own terms (the sovereign case reads them to reprice the tranche).
  tenorYears?: number;
  maturityWeek?: number;
  fixedRate?: number;

  // Margining & MTM
  marginRequirement: number;
  maintenanceMargin: number;
  unrealizedPnL: number;
  realizedPnL: number;
  weeklyFinancingCost: number;
  
  // Delta / DV01
  delta?: number;
  dv01?: number;
  
  openedWeek: number;
}

export interface Dealer {
  /** The bank's ticker. A player order is an order to THAT bank's desk. */
  id: string;
  name: string;
  tagline: string;
  inventoryAxe: string;
  axeBadge: string;
  axeDescription: string;
  /** Where this desk is actually long paper right now — a real axe, measured, not declared. */
  axeAssetClasses: AssetType[];
  /** What the desk could still take on: its own dealer capacity. */
  creditLimitLocal: number;
  /** What it already carries, gross, across every book. */
  currentExposureLocal: number;
  acceptedAssetClasses: AssetType[];
  color: string;
}

// 1$ is 1$: subUnitId here is the REAL industry input category a company's own productLines/
// CATEGORY_INPUT_REQUIREMENTS recipe draws down (stage 05's recipe buyers) — not just a demand-
// side price-discovery proxy. Every producedCommodityId-tagged company (see companyGenerator.ts)
// carries a matching productLines entry for its commodity's linked subUnitId, so "the company you
// can trade" and "the company that really supplies this industrial input" are the same named
// actor. §3.22/23: the commodity's spot and weekly units are a READ of that sub-unit's auction
// (`domain/commodity-spot.ts`); nothing sources a sub-unit's supply from the commodity — its
// producers make it, and stage 04's second supply into a segment pool is deleted.
// §6: `industrial_automation` is no longer in this table — it is a plain sub-unit category
// whose supply and demand clear in stage 05 like any other; the pseudo-commodity entry and
// its bespoke branches in evolution.ts pretended it was a tradable spot commodity, which it
// never was.
// BP1a: the WORKING copy, initialized from the registry-derived base below; init calibrates it.
/** Keyed by commodity id (and symbol) and SPARSE — a commodity with no link has no entry (§3.29-iii: the type says so). */
export const COMMODITY_CATEGORY_LINKAGE: Partial<Record<string, { subUnitId: string; intensityShare: number }>> =
  JSON.parse(JSON.stringify(VIEW_BASE_COMMODITY_CATEGORY_LINKAGE));

/**
 * §6 "copy, don't mutate": the pristine generation-time shares, frozen. Init calibrates the
 * WORKING table above from THESE, so a second world built in the same process calibrates from
 * the base rather than compounding on an already-calibrated value.
 */
export const BASE_COMMODITY_CATEGORY_LINKAGE: Readonly<Record<string, { subUnitId: string; intensityShare: number }>> =
  Object.freeze(JSON.parse(JSON.stringify(VIEW_BASE_COMMODITY_CATEGORY_LINKAGE)));

export interface Commodity {
  id: string;
  name: string;
  symbol: string;
  category: 'Energy' | 'Metals' | 'Agriculture';
  unit: string;
  /**
   * §3.22 / rule 8 — how many of the linked sub-unit's units one unit of THIS commodity is: a
   * barrel, a bushel, an ounce against a unit of `upstream_extraction`, `agricultural_commodities`,
   * `specialty_metals`. Fixed at the seed, where the marginal producer's cost per unit meets the
   * sub-unit's seed print; every later spot is the sub-unit's cleared gate price times this.
   */
  goodsUnitsPerUnit: number;
  /** §3.22: a READ of the linked sub-unit's world print, USD per `unit` (`domain/commodity-spot.ts`). */
  spotPrice: number;
  historicalPrices: number[];
  revenueHistory?: number[];
  convenienceYield: number;
  futures1M: number;
  futures3M: number;
  futures6M: number;
  change1W: number;
  volatility: number;
  allTimeBaselinePrice?: number;
  supplyDemandBalance: 'Deficit (Tight Supply)' | 'Balanced' | 'Surplus (Oversupplied)';
  inventoryLevelPct: number;
  weeklySupplyUnits?: number;
  weeklyDemandUnits?: number;
}

export interface TradeableInstrument {
  assetType: AssetType;
  id: string;
  symbol: string;
  name: string;
  region: RegionId;
  price: number;
  quoteUnit: string;
  details: {
    sector?: Sector;
    rating?: CreditRating;
    leverage?: number;
    tenorYears?: number;
    couponRate?: number;
    trancheId?: string;
    rateType?: "FIXED" | "FLOATING";
    fixedRate?: number;
    floatingMarginBps?: number;
    oasSpreadBps?: number;
    cdsSpreadBps?: number;
    quotedMarginBps?: number;
    discountMarginBps?: number;
    referenceBenchmark?: string;
    baseCurrency?: string;
    quoteCurrency?: string;
    convenienceYield?: number;
    dividendYield?: number;
  };
}

/**
 * §3.14 — THE NAME A MARKET WOULD USE (`bond.md` N14). An internal id (`KRLN-T3`, `USA-GOV-10Y-41`)
 * is an id, never the name. The name is the issuer and what the paper pays and when: a bond is
 * `KRLN 4.75% 2031`, a loan (or a bank facility, which is a loan) `KRLN L+350 2029`, a bill
 * `USA 3M bill`, commercial paper `KRLN 3M CP`, and a sovereign bond `USA 4.75% 2031`. ONE
 * function, so the tranche view, the ladder, every holders list, the desk traces and the news
 * cannot each spell it. `yearOfWeek` is the caller's read of the one calendar (`calendar.ts`):
 * the UI passes it on the DISPLAY week (the burn-in shifted off), a trace on the raw week.
 */
interface NamedPaper {
  rateType: 'FIXED' | 'FLOATING';
  couponRate?: number;
  floatingMarginBps?: number;
  originationWeek: number;
  maturityWeek: number;
  isCommercialPaper?: boolean;
  /** A sovereign discount bill (`government.ts:isDiscountBill`), which the caller knows and the
   *  tranche does not carry. */
  isBill?: boolean;
}

/** "3M", "13M", "5Y", "1.5Y" — a tenor in the unit a market quotes it in. */
export function tenorLabel(weeks: number): string {
  const months = Math.round((weeks / 52) * 12);
  if (months < 12) return `${Math.max(1, months)}M`;
  const years = weeks / 52;
  return Number.isInteger(Math.round(years * 10) / 10) ? `${Math.round(years)}Y` : `${(Math.round(years * 10) / 10).toFixed(1)}Y`;
}

/** "4.75%", "4.5%", "5%" — a coupon as a market prints it. */
export function couponLabel(rate: number): string {
  return `${(Math.round(rate * 10000) / 100).toString()}%`;
}

export function instrumentDisplayName(issuer: string, t: NamedPaper, yearOfWeek: (week: number) => number): string {
  const tenorWeeks = t.maturityWeek - t.originationWeek;
  if (t.isBill) return `${issuer} ${tenorLabel(tenorWeeks)} bill`;
  if (t.isCommercialPaper) return `${issuer} ${tenorLabel(tenorWeeks)} CP`;
  const year = yearOfWeek(t.maturityWeek);
  if (t.rateType === 'FLOATING') return `${issuer} L+${Math.round(t.floatingMarginBps ?? 0)} ${year}`;
  return `${issuer} ${couponLabel(t.couponRate ?? 0)} ${year}`;
}
