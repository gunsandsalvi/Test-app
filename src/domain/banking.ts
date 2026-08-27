/**
 * Commercial & Central Banking Domain Model
 *
 * Models banking sector balance sheets, deposit bases, loan books, capital ratios,
 * itemized instrument holdings, and sector ownership shares.
 * Written and updated by banking sector evolution and credit conditions simulation stages.
 */

import { RegionId } from './geography';

export interface ItemizedHolding {
  instrumentId: string; // for equity: company.id; for CORP_BOND/LEVERAGED_LOAN: the DebtTranche.id; for GOV_BOND: the GovDebtTranche.id
  instrumentType: 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'PE_FUND_INTEREST';
  issuerRegion: RegionId;
  quantityOrNotionalUSD: number; // dollar-denominated market value at cost
}

export interface AssetOwnershipShares {
  bankShare: number;
  institutionalShare: number; // insurers + asset managers
  foreignShare: Record<RegionId, number>; // this region's assets held by each of the other three
  centralBankShare: number; // meaningful only for sovereign bonds — 0 elsewhere
}

export interface BankingSector {
  businessLoanBookUSD: number;
  consumerLoanBookUSD: number;
  depositsUSD: number;
  sovereignBondHoldingsUSD: number;
  cashReservesUSD: number;
  bankEquityUSD: number;
  bankCapitalRatio: number;
  netInterestMarginPct: number;
  loanLossProvisionRateAnnualPct: number;
  creditConditionsIndex: number; // -1 (very loose) to +1 (very tight)
  centralBankReservesUSD: number;
  moneySupplyM2USD: number;
  itemizedHoldings: ItemizedHolding[];
  // Wall Street Phase 2: real central bank facility usage — a genuine, named operation each
  // week, not policyRate read as an ambient parameter. A bank short of its own target cash
  // buffer borrows from the Standing Repo Facility (against government-bond collateral, at
  // policyRate + a spread); a bank with cash above its target buffer places the excess at the
  // reverse repo facility (earning policyRate - a spread) rather than letting idle cash sit
  // unremunerated or invisibly disappear into the aggregate. See
  // 02b-bank-diversification.ts's applyCentralBankFacilities.
  srfBorrowingUSD: number;
  onRrpLendingUSD: number;
  // Wall Street: real corporate-bond dealer inventory — the banking sector's shared secondary-
  // market trading book (banks sit in the middle of the real institutional-entity clearing
  // auction, absorbing client order imbalance onto their own book rather than the market simply
  // failing to clear). One position per issuer this region's banks are currently long/short
  // against a flat book; a genuine balance-sheet line updated only by real trade fills, not a
  // formula. See stages/07b-corporate-bond-clearing.ts.
  corpBondDealerInventory: { companyId: string; inventoryUSD: number }[];
  // Wall Street: the banking sector's real sovereign-bond holdings, broken out by tenor bucket
  // (t2/t5/t10/t30) — banks hold government bonds substantially for real regulatory-liquidity
  // (HQLA) purposes; this per-bucket breakdown is what lets the real sovereign-bond clearing
  // engine (07c-sovereign-bond-clearing.ts) treat "the banking sector" as a real participant in
  // the tenor-point auction rather than one scalar total with no maturity composition.
  // sovereignBondHoldingsUSD stays the derived sum of these buckets.
  sovereignBondHoldingsByTenor: Record<string, number>;
  // Real dealer inventory for the sovereign-bond clearing auction, by tenor bucket — the same
  // shared-regional-dealer-desk role banks play for corporate bonds (corpBondDealerInventory),
  // distinct from banks' own real investment-portfolio holdings above (sovereignBondHoldingsByTenor).
  sovBondDealerInventory: { tenorKey: string; inventoryUSD: number }[];
  // Same shared-regional-dealer-desk role for leveraged loans. See 07d-leveraged-loan-clearing.ts.
  loanDealerInventory: { companyId: string; inventoryUSD: number }[];
}
