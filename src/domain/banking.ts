/**
 * Commercial & Central Banking Domain Model
 *
 * Models banking sector balance sheets, deposit bases, loan books, capital ratios,
 * itemized instrument holdings, and sector ownership shares.
 * Written and updated by banking sector evolution and credit conditions simulation stages.
 */

import { RegionId } from './geography';

export interface ItemizedHolding {
  instrumentId: string; // for equity: company.id; for CORP_BOND/LEVERAGED_LOAN: the DebtTranche.id; for GOV_BOND: the GovDebtTranche.id; for ETF_SHARE: the fund entity's id
  instrumentType: 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND' | 'PE_FUND_INTEREST' | 'ETF_SHARE';
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

/**
 * XB1: `foreignShare` was removed. It assigned each region a share of every other region's
 * markets, re-imposed weekly, owned by nobody — 442B of claims with no holder. Foreign ownership
 * is now the residual of what foreign institutions actually bought in the clearing books, which
 * is what ownership is.
 */
export interface AssetOwnershipShares {
  bankShare: number;
  institutionalShare: number; // insurers + asset managers
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
   * HH3 — the itemized household books (mortgage / card / consumer term pools). Owned by the
   * household-lending pass in bank-lending.ts; `consumerLoanBookUSD` is their derived sum.
   */
  householdLoans: HouseholdLoanPool[];
  /**
   * G2 slice 4 — corporate deposits: the sum of home-companies' S5 cash, derived weekly (a
   * VIEW of the one cash ledger, never a second store). Kept beside the household deposit
   * stock that `depositsUSD` carries; total funding = depositsUSD + corporateDepositsUSD.
   */
  corporateDepositsUSD: number;
  /**
   * HH4d — the funding that is NOT household deposits: bonds, interbank and other wholesale
   * money, split out at seed so `depositsUSD` can be the real household stock (it used to be
   * the balancing item of the whole asset side, 790B against households' actual 372B — the §6
   * two-representations row). A stock that pays a spread over policy and stays at its seed
   * level until a bank-liability project makes issuance real.
   */
  wholesaleFundingUSD: number;
}

/**
 * HH3 — the itemized HOUSEHOLD loan books: mortgages, credit cards and consumer term loans as
 * real pools on named banks' books, the way `businessLoans` already itemizes the corporate side.
 * The region's household debt lines are the DERIVED SUM of these pools across its banks, and
 * `consumerLoanBookUSD` the derived sum per bank — one representation of household borrowing
 * where there used to be two: a household aggregate evolved by paydown constants beside a bank
 * scalar chasing an 11.67%-of-it target, with the other 88% of the debt owed to nobody at all.
 */
export type HouseholdLoanKind = 'MORTGAGE' | 'CREDIT_CARD' | 'CONSUMER_TERM';

export interface HouseholdLoanPool {
  kind: HouseholdLoanKind;
  principalUSD: number;
  /**
   * MORTGAGE: the pool's weighted-average coupon, FIXED at each vintage's origination (new
   * money joins at the current 10Y + spread and blends in) — which is what makes a mortgage
   * book slow to reprice and the household sector rate-sensitive at the margin, not the stock.
   */
  wacAnnual?: number;
  /** CREDIT_CARD / CONSUMER_TERM: floating margin over policy, annual bps. */
  marginBps?: number;
  /**
   * MORTGAGE / CONSUMER_TERM: weighted-average remaining term, in weeks — the annuity clock.
   * The scheduled principal each week is DERIVED from (principal, rate, this): payment minus
   * interest. This is what retires the 0.0004/wk "≈2%/yr" mortgage paydown constant: the rate
   * a book amortizes at is arithmetic on its own terms, not a number chosen to look like one.
   */
  wamWeeks?: number;
}

/** What wholesale money costs over policy — senior bank funding trades tight. */
export const WHOLESALE_FUNDING_SPREAD_BPS = 40;

/** Basel-style risk weights: a secured mortgage consumes less capital than unsecured credit. */
export const MORTGAGE_RISK_WEIGHT = 0.5;
export const CONSUMER_CREDIT_RISK_WEIGHT = 0.75;
/** A new mortgage is a 30-year annuity; a steady-state book of them averages ~21y remaining. */
export const MORTGAGE_TERM_WEEKS = 30 * 52;
export const MORTGAGE_SEED_WAM_WEEKS = 21 * 52;
/** Auto/personal term credit: 5-year annuities, seeded mid-life. */
export const CONSUMER_TERM_WEEKS = 5 * 52;
export const CONSUMER_TERM_SEED_WAM_WEEKS = Math.round(2.5 * 52);
/** Primary mortgage spread over the cleared 10Y: origination + servicing + credit, ~170bps. */
export const MORTGAGE_SPREAD_OVER_10Y_BPS = 170;
/**
 * The revolving pool's weekly payment rate. A NAMED behavioural primitive, not a derivation:
 * a card pool mixes transactors (paid in full monthly) with revolvers (minimum payments), and
 * until HH4's cohorts split them the pool's blended turnover is one number. ~4%/wk is the
 * mixed pool's real turnover; the annuity arithmetic that retired the mortgage constant has
 * no equivalent for a balance with no schedule.
 */
export const CARD_POOL_PAYMENT_RATE_WEEKLY = 0.04;
/**
 * The slice of the revolving pool's payment rate that is a REQUIRED minimum — the part that is
 * genuinely debt-service burden. The rest of the 4%/wk turnover is transactor flow: spending
 * already counted in consumption, cycled through the card. ~2.5%/month minimum ≈ 0.5%/wk.
 */
export const CARD_MIN_PRINCIPAL_RATE_WEEKLY = 0.005;
/** Card issuance runs real operating cost (servicing, fraud, rewards) that term credit doesn't. */
export const CARD_OPERATING_COST_BPS = 500;
export const CONSUMER_TERM_OPERATING_COST_BPS = 150;
/** Share of the owner-occupied housing stock that trades per year — the real driver of
 * mortgage origination demand, now computable because HH2 made the stock physical. */
export const HOUSING_TURNOVER_RATE_ANNUAL = 0.04;
export const MORTGAGE_LTV_AT_ORIGINATION = 0.80;
/** Foreclosure recovers the house less the real cost of taking and selling it. */
export const FORECLOSURE_COST_SHARE = 0.25;
/** Mortgage default frequency relative to unsecured credit at the same unemployment print —
 * owners with equity sell rather than default, which is also why severity reads home equity. */
export const MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER = 0.25;
/** Floor on mortgage loss severity even with deep equity: foreclosure is never free. */
export const MORTGAGE_MIN_LOSS_SEVERITY = 0.05;

/** The household book's risk-weighted footprint, per-kind. */
export function householdBookRwaUSD(pools: HouseholdLoanPool[] | undefined): number {
  return (pools ?? []).reduce(
    (a, p) => a + p.principalUSD * (p.kind === 'MORTGAGE' ? MORTGAGE_RISK_WEIGHT : CONSUMER_CREDIT_RISK_WEIGHT),
    0
  );
}

/**
 * The scheduled principal a level-payment annuity retires this week: payment minus interest,
 * from the pool's own principal, rate and remaining term. Replaces the paydown constants.
 */
export function annuityWeeklyPrincipalUSD(principalUSD: number, rateAnnual: number, wamWeeks: number): number {
  if (!(principalUSD > 0)) return 0;
  const weeks = Math.max(1, wamWeeks);
  const r = Math.max(0, rateAnnual) / 52;
  if (r <= 1e-9) return principalUSD / weeks;
  const paymentUSD = (principalUSD * r) / (1 - Math.pow(1 + r, -weeks));
  return Math.max(0, Math.min(principalUSD, paymentUSD - principalUSD * r));
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
