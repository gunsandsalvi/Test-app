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
  /**
   * EQUITY only (WS4): the real SHARE COUNT held. Shares are the thing owned; the USD figure
   * above is shares x the cleared price and is therefore a derived view of this. Storing only
   * dollars would make the size of the book depend on the price the book itself is supposed to
   * set — the circularity that broke ownership convergence once already (task #28).
   */
  quantityShares?: number;
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
  /**
   * WS6 — this bank's overnight general-collateral repo book, struck fresh each week by
   * stages/repo-clearing.ts and matured (principal AND interest, as explicit flows) at the
   * start of the next week inside evolveBankingSector. Always a one-week-old overnight
   * position, never a term liability.
   */
  repoLentUSD: number;
  repoBorrowedUSD: number;
  /**
   * Government-bond collateral pledged against `repoBorrowedUSD` + `srfBorrowingUSD`, at the
   * derived per-bucket haircuts (see computeSovereignRepoHaircuts). Pledged paper cannot
   * simultaneously be sold — 07c/07f read this as a floor on the pledging bank's holdings and
   * exclude it from further borrowing capacity.
   */
  repoEncumberedCollateralUSD: number;
  /**
   * G2 slice 1 — the ITEMIZED business loan book: every dollar of `businessLoanBookUSD` is one
   * of these, with a named borrower. Two real borrower classes today: the SME segment pools
   * (borrowerId = "<region>_SEG_<type>" — the ~15x-levered seed scalar recalibrated down to
   * what segment EBITDA can service and bank capital can carry), and corporate bank facilities
   * (borrowerId = company.id, mirroring tranches flagged isBankFacility). Households arrive
   * with MS. `businessLoanBookUSD` is the derived sum.
   */
  businessLoans: BankLoan[];
  /**
   * G2 slice 4 — corporate deposits: the sum of home-companies' S5 cash, derived weekly (a
   * VIEW of the one cash ledger, never a second store). Kept beside the household deposit
   * stock that `depositsUSD` carries; total funding = depositsUSD + corporateDepositsUSD.
   */
  corporateDepositsUSD: number;
}

/** G2: one real loan to one named borrower on one named bank's book. */
export interface BankLoan {
  id: string;
  /** A company.id, or an SME pool id "<region>_SEG_<segmentType>". */
  borrowerId: string;
  borrowerKind: 'COMPANY_FACILITY' | 'SME_POOL';
  principalUSD: number;
  /** Spread over policyRate, annual bps — quoted by the bank's own credit arithmetic at
   * origination (slice 3), the same expected-loss + capital-cost pricing the bond market uses. */
  marginBps: number;
  originationWeek: number;
  termWeeks: number;
  status: 'PERFORMING' | 'DEFAULTED';
}
