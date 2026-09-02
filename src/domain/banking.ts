/**
 * Commercial & Central Banking Domain Model
 *
 * Models banking sector balance sheets, deposit bases, loan books, capital ratios,
 * itemized instrument holdings, and sector ownership shares.
 * Written and updated by banking sector evolution and credit conditions simulation stages.
 */

import { RegionId } from './geography';
import { ItemizedHoldingType } from './assets';
import { FxDealerBook } from './dealer-derivatives';
import { DealerDeskInventory } from './dealer-desk';

export interface ItemizedHolding {
  instrumentId: string; // for equity: company.id; for CORP_BOND/LEVERAGED_LOAN/COMMERCIAL_PAPER: the issuer's company.id; for GOV_BOND: the tenor-bucket id; for ETF_SHARE: the fund entity's id
  /** Named and derived from the one superset (domain/assets — step 4); members unchanged. */
  instrumentType: ItemizedHoldingType;
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

/**
 * §7.279 — THE VIEW HALF OF THE BankBook/View SPLIT (§5-STRUCT Tier 4, first slice).
 *
 * `BankingSector` serves two masters: the PER-BANK sheet (`company.bankBalanceSheet`, writable —
 * the BankBook role) and the REGION AGGREGATE (`region.bankingSector`, rebuilt from the per-bank
 * sheets by 02b's exhaustive sum). Writing a field INTO the aggregate is the 40/60-force-place
 * class: the money appears in the regional view and on no bank's book, and the next rebuild
 * silently erases it. This alias types the aggregate as read-only, so an in-place field write
 * fails to COMPILE; replacing the whole object (the rebuild, the dealer-inventory refresh) stays
 * legal, because a wholesale replacement is visible at review in a way a field poke is not.
 * The full split — its own nominal type, dealer inventories moved onto per-bank books, the
 * aggregate fully derived — is the standing Tier-4 slice this prepares.
 */
export type BankingSectorView = Readonly<BankingSector>;

export interface BankingSector {
  // §5-WIRES D: the two loan books are READS of the rows — `businessLoanBookOf` (Σ businessLoans)
  // and `consumerLoanBookOf` (Σ householdLoans). The regional aggregate carries no rows and so
  // no loan book of its own: a region's book is `regionLoanBooksUSD` over its named banks.
  depositsUSD: number;
  sovereignBondHoldingsUSD: number;
  // §5-WIRES A3.6c: a bank's reserves are its account (`bankReservesOf`) — no field carries them.
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
   * CAL — sovereign interest this bank has EARNED but not yet been PAID. A coupon accrues every
   * week and settles on the bucket's date, so in between it is a receivable, and a real one: the
   * bank's own asset against the treasury. `sovereign-calendar.ts` is its only writer, posting it
   * against equity off the same ledger the treasury pays from, so the holder's claim and the
   * issuer's payable are one number seen from two books and cannot drift by the lumpiness.
   */
  sovereignAccruedCouponUSD?: number;
  /**
   * Government-bond collateral pledged against `repoBorrowedUSD` + `srfBorrowingUSD`, at the
   * derived per-bucket haircuts (see computeSovereignRepoHaircuts). Pledged paper cannot
   * simultaneously be sold — 07c/07f read this as a floor on the pledging bank's holdings and
   * exclude it from further borrowing capacity.
   */
  repoEncumberedCollateralUSD: number;
  /** HF1 — margin loans this bank has out to hedge funds, derived from the region's
   *  prime-brokerage book. A real asset, consuming the leverage ratio like any other loan. */
  primeBrokerageLoansUSD?: number;
  /** G3c: the deposit rate this bank decided to pay (annualised decimal), out of its own
   *  alternative funding cost and the share of its base actually in play. One writer
   *  (evolveBankingSector); anyone who needs the rate reads it here rather than restating it. */
  depositRateAnnual?: number;
  /** XB2b: the FX forward desk's live book — inventory, margin held, and notional written. */
  fxDealerBook?: FxDealerBook;
  /**
   * G3a — THIS bank's own market-making inventory, by book. The three arrays above
   * (`corpBondDealerInventory`, `sovBondDealerInventory`, `loanDealerInventory`) are now the
   * derived regional SUM of these, kept for the readers that want one aggregate; this is the
   * owned position, sized by the bank's own leverage headroom, funded out of its own reserves,
   * and decided by a schedule it posts in the auction. See domain/dealer-desk.ts.
   */
  dealerDeskInventory?: DealerDeskInventory;
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
  /** §5-CLOSE — the central bank's UNSECURED loan to this bank: the lender of last resort at the
   *  funding close, drawn when the week ends short of the buffer and repaid from excess cash. A
   *  named liability with a named creditor; wholesale money "from nobody" is gone. */
  centralBankLoanUSD?: number;
  /** §5-CLOSE — FX clients' margin held by this bank's desk: their money, a liability. */
  clientMarginUSD?: number;
  /** SEG1 — the private-sector segment pools' balances here (this bank's market-share slice of
   * each pool's `cashUSD`). A real liability with reserves behind it, maintained by settlement
   * and reconciled weekly like the corporate and institutional lines. Mostly transaction
   * balances of small firms, so it pays nothing — which is what small-business checking pays. */
  smeDepositsUSD?: number;
  /** HH — a reported weekly FLOW (not a stock): interest this bank paid its household
   *  depositors, at its own deposit rate. Part of measured household income. */
  householdDepositInterestWeeklyUSD?: number;
  /** PUB3d/§7.254 — last week's bill accretion on this bank's sovereign book, recorded by the
   *  accretion stage so the NIM income measure can count the return the book actually earned
   *  (non-cash: it is already in equity; never credit cash from it). */
  lastBillAccretionWeeklyUSD?: number;
  /** §5-CLOSE C4 — reported FLOWS the weekly evolution decides and 02b pays as settlement
   *  payments: interest on reserves (CENTRAL_BANK → this bank), interest on corporate balances
   *  (this bank → each depositor pro rata) and the dividend (this bank → the register's holders).
   *  None of them is written to cash by the evolution itself. */
  reservesInterestWeeklyUSD?: number;
  corporateDepositInterestWeeklyUSD?: number;
  dividendWeeklyUSD?: number;
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
 * What wholesale money costs over policy, for a bank whose credit the market has not priced yet.
 *
 * G3c closed the rule-1 defect this used to carry: a bank's funding spread is now its OWN cleared
 * corporate-bond spread, printed by the same auction that prices every other issuer, so a bank
 * whose capital ratio has left its band pays for it. This survives as the week-1 fallback, before
 * the first auction has run.
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

/**
 * CRD — the weekly rate at which a clean credit file climbs back a tier.
 *
 * An INSTITUTIONAL primitive (§5-DIST-P): how long a blemish stays on a file is set by credit-
 * reporting rules, not by anything a household or a lender decides. Seven years is the usual
 * statutory period, so a clean file recovers a rung on that order.
 *
 * It exists because migration used to be one-way — households moved DOWN whenever unemployment
 * was above NAIRU and never came back, so any long run ends with the whole population subprime.
 * A distribution that can only move in one direction is an absorbing state, not a distribution.
 */
export const CREDIT_FILE_CURE_WEEKLY = 1 / (7 * 52);
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
/**
 * HSG — `MORTGAGE_SPREAD_OVER_10Y_BPS = 170` is GONE from origination. Every bank charged every
 * borrower the same spread over the 10Y, in a file whose own `BankLoan.marginBps` doc says a
 * margin is "quoted by the bank's own credit arithmetic at origination, the same expected-loss +
 * capital-cost pricing the bond market uses". `bank-lending.ts` quotes it that way now: the loss
 * rate this bank's OWN mortgage vintages are running, the mortgage risk weight, its own cost of
 * equity and `MORTGAGE_OPERATING_COST_BPS`.
 *
 * What survives is the SEED's opening quote and nothing else: at week 0 no bank has a loss
 * experience to price off, so the region opens on this and the banks own it from week 1 (§7.4).
 */
export const MORTGAGE_SEED_SPREAD_OVER_10Y_BPS = 170;
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
 * HSG — what it costs a bank to originate and service a mortgage, in basis points of balance.
 * The cheapest household loan there is to run: one collateral valuation, one registration, and a
 * payment a month against a card book's constant authorisation traffic (`CARD_OPERATING_COST_BPS`
 * is 500 for exactly that reason). A cost primitive with one owner, in the same family as the two
 * above it, and it is what replaces the SPREAD it used to be buried inside.
 */
export const MORTGAGE_OPERATING_COST_BPS = 40;
/**
 * HSG — HOW MANY HOUSES CHANGE HANDS IS AN OUTCOME NOW, and this is the seed's opening value.
 *
 * `HOUSING_TURNOVER_RATE_ANNUAL = 0.04` was an observed real-world rate fixing origination volume,
 * with its own rule-4/13 objection written above it: how many houses trade is what households
 * decide against a price and a rate, so a constant meant origination could not respond to the
 * housing market at all. `housingTurnoverAnnual` below derives it. This survives as the rate the
 * region opens on, before any mortgage book has a cross-section to read (§7.4).
 */
export const HOUSING_TURNOVER_SEED_RATE_ANNUAL = 0.04;

/**
 * HSG — THE TURNOVER RATE, from the two things that actually move a household.
 *
 * **A tenure ends.** Every owner sells once: the estate does it if the owner does not. So the
 * floor is one move per tenure, and a tenure is the years an owner has left — the same Gompertz
 * hazard the pension drawdown reads (§7.181), at the median age of the adult population. Nothing
 * about that is stated; it is the demography the model already carries.
 *
 * **Or moving up becomes affordable.** An owner trades up when today's income at today's quoted
 * rate supports a bigger loan than the one it took — which is a MEASURABLE share of the vintage
 * cross-section, since every vintage remembers the house it was written against. Those owners
 * make that move once over the same tenure, so the rate is `(1 + tradeUpShare) / tenure`.
 *
 * The result is what the row asked for: rates fall and turnover rises because more of the book
 * clears the test; rates rise and it falls back toward the forced-move floor. No coefficient
 * decides the sensitivity — the vintage cross-section does.
 */
export function housingTurnoverAnnual(args: {
  /** Years an owner is expected to hold — `remainingLifeExpectancyYears(median adult age)`. */
  tenureYears: number;
  /** Share of the mortgage book, by principal, that can now afford more than it borrowed. */
  tradeUpShare: number;
}): number {
  const tenure = Math.max(1, args.tenureYears);
  const share = Math.max(0, Math.min(1, args.tradeUpShare));
  return (1 + share) / tenure;
}
export const MORTGAGE_LTV_AT_ORIGINATION = 0.80;
/** Foreclosure recovers the house less the real cost of taking and selling it. */
export const FORECLOSURE_COST_SHARE = 0.25;
/** Mortgage default frequency relative to unsecured credit at the same unemployment print —
 * owners with equity sell rather than default, which is also why severity reads home equity. */
export const MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER = 0.25;
/** Floor on mortgage loss severity even with deep equity: foreclosure is never free. */
export const MORTGAGE_MIN_LOSS_SEVERITY = 0.05;

/** The household book's risk-weighted footprint, per-kind. */
/** Every deposit-class liability on a sheet — the household, corporate, institutional and SME
 *  lines and the clients' margin held. ONE definition (§7.373): the money audit's snapshot
 *  omitted the margin line while its week-end read included it, and the whole margin STOCK
 *  printed as "unexplained" money every week the desks held any. */
export const depositsOf = (s: BankingSector): number =>
  s.depositsUSD + (s.corporateDepositsUSD ?? 0) + (s.institutionalDepositsUSD ?? 0) + (s.smeDepositsUSD ?? 0) + (s.clientMarginUSD ?? 0);

/** §5-WIRES D — THE LOAN BOOKS ARE READS. A stored sum of stored rows can disagree with its rows
 *  (O4's "facilities on ladders = loans on banks" lived on exactly that); the read cannot. */
export const businessLoanBookOf = (s: { businessLoans?: BankLoan[] }): number =>
  (s.businessLoans ?? []).reduce((a, l) => a + l.principalUSD, 0);
export const consumerLoanBookOf = (s: { householdLoans?: HouseholdLoanPool[] }): number =>
  (s.householdLoans ?? []).reduce((a, p) => a + p.principalUSD, 0);
/** Both credit books together — the RWA's and the leverage ratio's credit term. */
export const loanBooksOf = (s: { businessLoans?: BankLoan[]; householdLoans?: HouseholdLoanPool[] }): number =>
  businessLoanBookOf(s) + consumerLoanBookOf(s);
/** A region's loan books: the sum over its named banks' rows (the aggregate holds no rows). */
export function regionLoanBooksUSD(banks: { bankBalanceSheet?: BankingSector }[]): { businessLoanUSD: number; consumerLoanUSD: number } {
  let businessLoanUSD = 0, consumerLoanUSD = 0;
  banks.forEach((b) => { if (b.bankBalanceSheet) { businessLoanUSD += businessLoanBookOf(b.bankBalanceSheet); consumerLoanUSD += consumerLoanBookOf(b.bankBalanceSheet); } });
  return { businessLoanUSD, consumerLoanUSD };
}

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
