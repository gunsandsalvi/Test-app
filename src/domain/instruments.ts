/** Tradeable asset types, the player's positions, the player-facing dealers, and commodities.
 *
 *  RULE 3, OPEN: `Dealer` below is a SECOND dealer system. It quotes the player by formula
 *  (`baseSpreadBps × spreadMultiplier`, an `axeDiscountPct`, a `creditLimitUSD`) while the banks
 *  run real dealer inventories in the clearing books off their own balance sheets. Two
 *  representations of one real thing, and only one of them has a balance sheet. It also carries
 *  presentation fields (`tagline`, `axeBadge`, `color`) on a domain trading entity.
 *  Owner: G3 (8) — "one dealer system" is its name. */

import { RegionId } from './geography';
import { VIEW_BASE_COMMODITY_CATEGORY_LINKAGE } from './industry-registry';
import { Sector, CreditRating } from './company';

export type AssetType = 
  | 'EQUITY' 
  | 'CORP_BOND' 
  | 'LEVERAGED_LOAN'
  | 'SOV_BOND' 
  | 'CDS' 
  | 'IRS' 
  | 'TRS' 
  | 'XCS' 
  | 'COMMODITY' 
  | 'OPTION'
  | 'FX_SPOT';

export interface Position {
  id: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  region: RegionId;
  dealerId: string;
  
  direction: 'LONG' | 'SHORT' | 'PAY_FIXED' | 'RECEIVE_FIXED' | 'BUY_PROTECTION' | 'SELL_PROTECTION';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  notional: number;
  
  trancheId?: string;
  rateType?: 'FIXED' | 'FLOATING';
  entryOasSpreadBps?: number;
  entryPolicyRate?: number;
  entryBenchmarkYield?: number;
  isClosed?: boolean;

  // Derivative specifics
  tenorYears?: number;
  maturityWeek?: number;
  fixedRate?: number;
  strike?: number;
  optionType?: 'CALL' | 'PUT';
  expiryWeek?: number;
  underlyingPrice?: number;
  impliedVol?: number;
  
  // Margining & MTM
  marginRequirement: number;
  maintenanceMargin: number;
  unrealizedPnL: number;
  realizedPnL: number;
  weeklyFinancingCost: number;
  expectedWeeklyCarryUSD?: number;
  
  // Greeks / DV01
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  dv01?: number;
  
  openedWeek: number;
}

export interface Dealer {
  id: string;
  name: string;
  tagline: string;
  inventoryAxe: string;
  axeBadge: string;
  axeDescription: string;
  axeAssetClasses: AssetType[];
  axeDiscountPct: number;
  spreadMultiplier: number;
  baseSpreadBps: number;
  creditLimitUSD: number;
  currentExposureUSD: number;
  acceptedAssetClasses: AssetType[];
  color: string;
}

export type CommodityQuantityUnit = 'BARREL' | 'MMBTU' | 'TROY_OZ' | 'TONNE';

export const COMMODITY_QUANTITY_UNIT: Record<string, CommodityQuantityUnit> = {
  CRUDE_OIL: 'BARREL', HEAVY_CRUDE_OIL: 'BARREL', NATURAL_GAS: 'MMBTU',
  GOLD: 'TROY_OZ', SILVER: 'TROY_OZ',
  COPPER: 'TONNE', WHEAT: 'TONNE', CORN: 'TONNE', SOYBEANS: 'TONNE',
};

// 1$ is 1$: subUnitId here is the REAL industry input category a company's own productLines/
// CATEGORY_INPUT_REQUIREMENTS recipe draws down (see 04-input-output.ts) — not just a demand-
// side price-discovery proxy. Every producedCommodityId-tagged company (see companyGenerator.ts)
// carries a matching productLines entry for its commodity's linked subUnitId, so "the company you
// can trade" and "the company that really supplies this industrial input" are the same named
// actor, and stage04 sources its real weekly supply directly from these commodities' own
// weeklySupplyUnits/spotPrice instead of an independently invented figure.
// §6: `industrial_automation` is no longer in this table — it is a plain sub-unit category
// whose supply and demand clear in stages 04/05 like any other; the pseudo-commodity entry and
// its bespoke branches in evolution.ts pretended it was a tradable spot commodity, which it
// never was.
// BP1a: the WORKING copy, initialized from the registry-derived base below; init calibrates it.
export const COMMODITY_CATEGORY_LINKAGE: Record<string, { subUnitId: string; intensityShare: number }> =
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
    impliedVol?: number;
    /** OPTION only: the contract's own expiry week; absent = the dealer's standard listed tenor. */
    expiryWeek?: number;
    delta?: number;
    gamma?: number;
    vega?: number;
    strike?: number;
    optionType?: 'CALL' | 'PUT';
    baseCurrency?: string;
    quoteCurrency?: string;
    convenienceYield?: number;
    dividendYield?: number;
  };
}
