/**
 * Financial Instruments & Trading Assets Domain Model
 *
 * Models tradeable asset classes (equities, corporate bonds, sovereign bonds, CDS, IRS, TRS, XCS, commodities, options, FX spot),
 * portfolio positions, dealer market makers, tradeable instrument definitions, and physical commodities.
 * Read and updated by market pricing, trade execution, portfolio valuation, and risk/margin engines.
 */

import { RegionId } from './geography';
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
  WTI: 'BARREL', BRENT: 'BARREL', NATGAS: 'MMBTU',
  GOLD: 'TROY_OZ', SILVER: 'TROY_OZ',
  COPPER: 'TONNE', WHEAT: 'TONNE', CORN: 'TONNE', SOYBEANS: 'TONNE',
};

export const COMMODITY_CATEGORY_LINKAGE: Record<string, { subUnitId: string; intensityShare: number }> = {
  WTI: { subUnitId: 'upstream_extraction', intensityShare: 0.35 },
  BRENT: { subUnitId: 'upstream_extraction', intensityShare: 0.30 },
  NATGAS: { subUnitId: 'upstream_extraction', intensityShare: 0.20 },
  GOLD: { subUnitId: 'specialty_metals', intensityShare: 0.05 },
  SILVER: { subUnitId: 'specialty_metals', intensityShare: 0.08 },
  COPPER: { subUnitId: 'specialty_metals', intensityShare: 0.15 },
  WHEAT: { subUnitId: 'food_beverage', intensityShare: 0.04 },
  CORN: { subUnitId: 'food_beverage', intensityShare: 0.04 },
  SOYBEANS: { subUnitId: 'food_beverage', intensityShare: 0.03 },
  industrial_automation: { subUnitId: 'industrial_automation', intensityShare: 0.15 },
};

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
