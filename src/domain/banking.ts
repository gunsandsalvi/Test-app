/**
 * Commercial & Central Banking Domain Model
 *
 * Models banking sector balance sheets, deposit bases, loan books, capital ratios,
 * itemized instrument holdings, and sector ownership shares.
 * Written and updated by banking sector evolution and credit conditions simulation stages.
 */

import { RegionId } from './geography';
import { FxDealerBook } from './dealer-derivatives';

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
/**
 * OWN1 — a REPORTED STATISTIC, measured off the real books each week by
 * `holdings-view.ts:measuredOwnershipAllRegions` and written in stage 11. Nothing in the engine
 * reads it to decide anything, and nothing may start: it was an input once, and the three books'
 * tradable float, every bank's sovereign target and household direct equity were all decided by
 * a number that owned nothing. The household share is the residual: 1 - these three.
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
  /** XB2b: the FX forward desk's live book — inventory, margin held, and notional written. */
  fxDealerBook?: FxDealerBook;
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
  /** SETL5 — institutional balances held here (funds, insurers, pensions, dealers' clients).
   * A real liability with reserves behind it, maintained by settlement and reconciled weekly. */
  institutionalDepositsUSD?: number;
  /** SETL2 — the named boundary's balance here: money owed to counterparties the model has not
   * built yet (see settlement.ts's UNMODELED). A real liability with real reserves behind it, so
   * the identity closes; its SIZE is the measure of how much of the payment graph is still
   * unnamed, and it is watched down as each flow gets a real counterparty (§6). */
  unmodeledDepositsUSD?: number;
  /** SEG1 — the private-sector segment pools' balances here (this bank's market-share slice of
   * each pool's `cashUSD`). A real liability with reserves behind it, maintained by settlement
   * and reconciled weekly like the corporate and institutional lines. Mostly transaction
   * balances of small firms, so it pays nothing — which is what small-business checking pays. */
  smeDepositsUSD?: number;
  /** HH — a reported weekly FLOW (not a stock): interest this bank paid its household
   *  depositors, at its own deposit rate. Part of measured household income. */
  householdDepositInterestWeeklyUSD?: number;
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

/**
 * DIST/HSG — ONE MORTGAGE VINTAGE: a year's worth of lending that shares an origination.
 *
 * The book used to be one principal at one blended LTV, and `bank-lending.ts` priced its loss
 * severity off that single average — a curve that is FLAT at its floor below LTV 0.75 and only
 * bites above it. Measured average LTV was 0.340, so severity sat on the floor constant in every
 * region in every week and house prices had to fall 55% before the mechanism did anything
 * (§6.1). That is `f(E[LTV])` where the honest question is `E[f(LTV)]`, and the two diverge
 * hardest exactly at the kink that matters.
 *
 * A vintage carries the collateral it was written against, so it can be MARKED: a price fall
 * moves every vintage's LTV at once and pushes a real mass of the book across the kink, which is
 * the mechanism of every mortgage crisis and the one the average could not express.
 */
export interface MortgageVintage {
  principalUSD: number;
  /** The home value this vintage was written against, in the week it was written. */
  originationCollateralUSD: number;
  /** The region's median home price when it was written — the base its mark is measured from. */
  originationHomePriceUSD: number;
  /** Fixed at origination: what this borrower actually pays, not what the book averages to. */
  rateAnnual: number;
  /** Weeks left on this vintage's own annuity clock. */
  wamWeeks: number;
  /**
   * HSG — weeks until this vintage's RATE RESETS to whatever the market is then. A 30-year loan
   * on a 5-year fix, which is what makes a rate rise reach existing borrowers instead of only
   * new ones.
   */
  fixedForWeeks: number;
  originatedWeek: number;
}

export interface HouseholdLoanPool {
  kind: HouseholdLoanKind;
  /**
   * MORTGAGE: the SUM of `vintages` — a measurement of them, not a second stock (rule 3).
   * Every other kind: the pool's own principal.
   */
  principalUSD: number;
  /**
   * MORTGAGE only — the book, loan cohort by loan cohort. This is the truth; `principalUSD`,
   * `wacAnnual` and `wamWeeks` are derived from it and kept so the rest of the model reads one
   * number where it used to.
   */
  vintages?: MortgageVintage[];
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

/**
 * What wholesale money costs over policy.
 *
 * RULE 1, OPEN: this is the PRICE of a bank's own funding, and it is the same 40bps for a
 * well-capitalised bank and one whose capital ratio has left its band. A bank's funding spread is
 * exactly where the market's view of it shows up — and §6.1's USA cohort story is about banks
 * funding ~48% wholesale, so this number is load-bearing there. Owner: G3.
 */
export const WHOLESALE_FUNDING_SPREAD_BPS = 40;

/** Basel-style risk weights: a secured mortgage consumes less capital than unsecured credit. */
export const MORTGAGE_RISK_WEIGHT = 0.5;
export const CONSUMER_CREDIT_RISK_WEIGHT = 0.75;
/** A new mortgage is a 30-year annuity; a steady-state book of them averages ~21y remaining. */
export const MORTGAGE_TERM_WEEKS = 30 * 52;
export const MORTGAGE_SEED_WAM_WEEKS = 21 * 52;

/**
 * DIST/HSG — how many cohorts the seed book is cut into.
 *
 * A RESOLUTION parameter, not a shape one (§5-DIST-P): it says how finely the vintage
 * cross-section is discretised, and the answer must not depend on it. Thirty is one per year of
 * a thirty-year term, which is the natural grid for a book whose loans are annual cohorts.
 */
export const MORTGAGE_SEED_VINTAGE_COHORTS = 30;

/**
 * HSG — how long a mortgage's rate is FIXED FOR, which is not how long the loan runs.
 *
 * A PRODUCT primitive (§5-DIST-P's third category — an institution's terms, chosen, not derived).
 * It is the single most important thing about a mortgage book that this model did not have: a
 * 30-year loan on a 5-year fix RESETS, and a household that borrowed at 3% discovers it owes
 * payments at 7%. Without it no borrower ever faced a rate they did not agree to, and "difficulty
 * refinancing when rates are high" could not happen to anybody (§6.1).
 */
export const MORTGAGE_FIXED_PERIOD_WEEKS = 5 * 52;

/**
 * HSG — the share of income a lender will let a borrower commit to mortgage payments.
 *
 * A LENDING STANDARD: an institutional rule a regulator and a credit committee choose, not a
 * fact to be derived (§5-DIST-P). It is what makes borrowing capacity depend on the RATE — the
 * same house at 7% needs a smaller loan than at 3%, because the payment is what is constrained —
 * and it is the channel by which monetary policy actually reaches a housing market. Origination
 * volume used to be `turnover x LTV x bank appetite`, with the rate nowhere in it.
 */
export const MORTGAGE_DSTI_LIMIT = 0.35;
/** Auto/personal term credit: 5-year annuities, seeded mid-life. */
export const CONSUMER_TERM_WEEKS = 5 * 52;
export const CONSUMER_TERM_SEED_WAM_WEEKS = Math.round(2.5 * 52);
/**
 * Primary mortgage spread over the cleared 10Y.
 *
 * RULE 1, OPEN: a mortgage rate is a PRICE, and this states it. `BankLoan.marginBps` right below
 * documents the correct treatment for business loans — "quoted by the bank's own credit
 * arithmetic at origination, the same expected-loss + capital-cost pricing the bond market uses"
 * — and the household book simply does not do it. Every bank charges every borrower the same
 * 170bps whatever its funding costs or its losses run. Owner: HSG.
 */
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
/**
 * Card issuance runs real operating cost (servicing, fraud, rewards) that term credit doesn't.
 *
 * RULE 13, OPEN: one number per product for every bank, so no bank can run its card book more
 * cheaply than another — the same shape as the insurer expense ratio IND-R4 deleted. Owner: IND.
 */
export const CARD_OPERATING_COST_BPS = 500;
export const CONSUMER_TERM_OPERATING_COST_BPS = 150;
/**
 * Share of the owner-occupied housing stock that trades per year — the driver of mortgage
 * origination demand.
 *
 * RULE 4/13, OPEN: an observed real-world turnover rate. How many houses change hands is an
 * OUTCOME of households deciding to move against a price, which is precisely what HSG builds; a
 * constant here means origination volume cannot respond to the housing market at all.
 * Owner: HSG.
 */
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
/**
 * DIST/HSG — a vintage's CURRENT loan-to-value, marked to today's home prices.
 *
 * The collateral is worth what the housing market says it is worth now, so the mark is the
 * region's median price against the price this vintage was written at. A loan from twenty years
 * ago at 80% is a loan at 20% today; one written last year at a peak is underwater after a 15%
 * fall. That spread across vintages IS the distribution the average was hiding.
 */
export function vintageCurrentLtv(v: MortgageVintage, medianHomePriceNowUSD: number): number {
  const base = Math.max(1, v.originationHomePriceUSD);
  const markedCollateralUSD = Math.max(1, v.originationCollateralUSD) * (Math.max(0, medianHomePriceNowUSD) / base);
  return markedCollateralUSD > 0 ? v.principalUSD / markedCollateralUSD : 2;
}

/**
 * DIST/HSG — loss severity for ONE loan at ONE loan-to-value: foreclosure recovers the house
 * less the cost of selling it, against the loan. Unchanged arithmetic; what changed is that it
 * is now asked per vintage and averaged, rather than asked once of an average.
 */
export function mortgageSeverityAtLtv(ltv: number): number {
  const recovery = Math.min(1, (1 - FORECLOSURE_COST_SHARE) / Math.max(0.05, ltv));
  return Math.max(MORTGAGE_MIN_LOSS_SEVERITY, 1 - recovery);
}

/**
 * DIST/HSG — the book's expected severity: `E[f(LTV)]`, principal-weighted over the vintages.
 *
 * This is the whole point of carrying them. With one average LTV the answer was `f(E[LTV])`,
 * which sat on the floor constant and could not move; here the tail of the distribution that is
 * actually above the kink contributes the losses, which is where every dollar of mortgage loss
 * comes from in reality.
 */
export function bookMortgageSeverity(vintages: MortgageVintage[] | undefined, medianHomePriceNowUSD: number): number {
  if (!vintages || vintages.length === 0) return MORTGAGE_MIN_LOSS_SEVERITY;
  let weighted = 0;
  let total = 0;
  vintages.forEach((v) => {
    const w = Math.max(0, v.principalUSD);
    if (w <= 0) return;
    total += w;
    weighted += w * mortgageSeverityAtLtv(vintageCurrentLtv(v, medianHomePriceNowUSD));
  });
  return total > 0 ? weighted / total : MORTGAGE_MIN_LOSS_SEVERITY;
}

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
  /** A company.id, or an SME pool id "<region>_SEG_<industry>". */
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
