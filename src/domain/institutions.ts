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

export type InstitutionalEntityType = 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | 'HEDGE_FUND' | 'PRIVATE_EQUITY';

export interface AssetAllocationTarget {
  equityPct: number;
  corpBondPct: number;
  govBondPct: number;
  cashPct: number;
  // Real leveraged-loan allocation, carved out of the entity's total corporate-credit appetite
  // (corpBondPct + loanPct together represent that total) — loans and bonds of the same issuer
  // trade in genuinely different real markets with different investor bases (CLOs/loan funds vs
  // bond funds), so they get their own real clearing engine
  // (07d-leveraged-loan-clearing.ts) rather than being a byproduct of the bond one.
  loanPct: number;
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
  /**
   * Real, per-entity cash. Every fill this entity takes in a clearing stage settles against it,
   * so its securities and its money move together. Before this existed the entity's holdings
   * changed each week with nothing on the other side of the trade — a market on one side of the
   * ledger only.
   */
  cashUSD: number;
  /**
   * WS6 — cash this entity lent overnight in the general-collateral repo market this week
   * (stages/repo-clearing.ts). It matures back into cashUSD with interest at the start of the
   * next week's money-market session. Part of the entity's book (markInstitutionalBooks and
   * the S4 conservation check count it), NOT part of its weekly purchase capacity — the cash
   * is genuinely out the door for the week, and counting it twice would let the entity buy
   * securities with money it had already lent.
   */
  repoLentUSD?: number;
  assetAllocationTarget: AssetAllocationTarget;
  /**
   * PRIVATE_EQUITY only (HC4): the fund's real portfolio and the real LPs behind it. Portfolio
   * companies are private firms whose ownership block names this fund as sponsor; the stakes'
   * value is marked from those firms' real EBITDA and debt. Committed-but-undrawn capital is a
   * real claim on the named LPs — HC6's deal flow draws it, debiting LP cash through the same
   * budget machinery as any other real payment.
   */
  peFund?: {
    portfolioCompanyIds: string[];
    lpCommitments: { lpEntityId: string; committedUSD: number; drawnUSD: number }[];
  };
  isDefaulted: boolean;
  historicalPrices: number[];
  revenueHistory?: number[];
}
