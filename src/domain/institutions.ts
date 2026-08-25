/**
 * Non-Bank Financial Institutions Domain Model
 *
 * Models non-bank institutional entities (insurers, asset managers, pension funds),
 * target asset allocation matrices, balance sheets, and capital bases.
 * Written and updated by institutional allocation and market evolution simulation stages.
 */

import { RegionId } from './geography';
import { ItemizedHolding } from './banking';
import { FinancialStatementProfile } from './company';

export interface InstitutionalSector {
  corpBondHoldingsUSD: number;
  sovBondHoldingsUSD: number;
  equityHoldingsUSD: number;
  cashUSD: number;
  sectorEquityUSD: number;
  investmentIncomeMarginPct: number;
  itemizedHoldings: ItemizedHolding[];
}

export type InstitutionalEntityType = 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND';

export interface AssetAllocationTarget {
  equityPct: number;
  corpBondPct: number;
  govBondPct: number;
  cashPct: number;
}

export interface InstitutionalEntity {
  financialStatementProfile?: FinancialStatementProfile;
  id: string;
  name: string;
  ticker: string;
  region: RegionId;
  entityType: InstitutionalEntityType;
  totalAssetsUSD: number;
  equityCapitalUSD: number;
  sharesOutstanding: number;
  stockPrice: number;
  itemizedHoldings: ItemizedHolding[];
  assetAllocationTarget: AssetAllocationTarget;
  isDefaulted: boolean;
  historicalPrices: number[];
  revenueHistory?: number[];
}
