
/** The firm: one model for every company in the world — listed or private, operating or
 *  financial. Product lines, debt tranches, the three statements, credit, and the real input and
 *  output inventories it holds. No parallel firm type anywhere (§7.33). */

import { RegionId } from './geography';
import { defect } from './defect';
import { Industry } from './industry';
import { ItemizedHolding, BankingSector } from './banking';
import { HedgeFundStrategy } from './institutions';

export type FinancialStatementProfile = 'STANDARD_OPERATING' | 'INSURER' | 'ASSET_MANAGER' | 'BANK' | 'REIT' | 'CARRIER';

export type Sector = 'Tech' | 'Energy' | 'Financials' | 'Industrials' | 'Consumer' | 'Banks';

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

export interface ProductLine {
  industry: Industry;
  subUnitId: string;
  category?: string;
  revenueShare: number;
  categoryMarketShare: number;
  previousCategoryMarketShare?: number;
  categoryMarketShare13WeeksAgo?: number;
  competitiveness: number;
  marginByUnit?: Record<string, number>;
  /**
   * Real productive capacity for this line, in UNITS per week — a physical stock, not a dollar
   * budget. A plant that makes 100 units a week makes 100 when the price doubles; what price
   * changes is how much of that capacity is worth running, never the capacity itself.
   *
   * This exists because production used to be sized in dollars and converted to units at the
   * CURRENT price (`annualRevenue/52 / currentUnitPrice`), which made supply fall as price rose
   * — a positive feedback loop and the mechanism behind the inflation runaway recorded in the
   * plan (§7.28): a handful of categories spiralled to 9x while the median category never moved,
   * and in every spiralling one supply was collapsing as price climbed.
   *
   * Seeded on first use from the line's real baseline output, then evolved by real net
   * investment (growth capex less depreciation, as a ratio of the capital stock, so the number
   * is real and inflation cancels).
   */
  weeklyCapacityUnits?: number;
  /**
   * CAP — this line's CAPITAL PRODUCTIVITY: units a week per dollar of the firm's net PP&E, fixed
   * the first time the line trades from the capacity and the capital it opened with.
   *
   * Capacity used to be a RATE walked against its own prior value, which accumulates every error
   * it is ever given and drifts from the capital it claims to describe. A plant is not a rate; it
   * is what the capital can make (§7.177, §5-CAP).
   */
  unitsPerNetPpeDollar?: number;
}

// 1$ is 1$ Phase 6: one real purchase lot — a specific quantity bought from a specific named
// counterparty at a specific real price, in a specific week. See Company.inputInventoryBySubUnit.
export interface InputLot {
  sellerId: string;
  unitsHeld: number;
  unitPriceUSD: number;
  acquiredWeek: number;
}

export interface SegmentFinancial {
  subUnitId: string;
  revenueUSD: number;
  ebitdaUSD: number;
  capexUSD: number;
}

export interface DebtTranche {
  id: string; // format: "{ticker}-T{n}"
  principalUSD: number;
  rateType: 'FIXED' | 'FLOATING';
  couponRate?: number; // FIXED only — locked annual rate, paid on principalUSD, never changes until maturity
  floatingMarginBps?: number; // FLOATING only — locked spread over policyRate, never changes until maturity
  originationWeek: number;
  maturityWeek: number;
  seniority: 'SENIOR' | 'SUBORDINATED';
  /**
   * WS5: commercial paper — a genuinely different market from the bond it superficially
   * resembles. A 13-week unsecured note issued against a projected working-capital gap, priced
   * off the cleared bill curve plus the issuer's short-horizon expected loss, and ROLLED (or
   * failed) weekly by 07f-short-debt-clearing.ts, which owns its whole lifecycle. Every other
   * consumer of the ladder (07b's bond float, stage 08's maturity refinancing and surplus-cash
   * prepayment) must skip tranches carrying this flag — to them CP is someone else's market.
   * It still counts in totalDebt and still pays real interest through the ledger, because it is
   * real debt.
   */
  isCommercialPaper?: boolean;
  /**
   * G2: a BANK FACILITY — a revolver draw or a maintenance bridge. This is bank debt, not a
   * capital-markets instrument: it lives as a real loan on a named bank's book
   * (bankBalanceSheet.businessLoans), its interest is paid TO that bank through the S5 ledger,
   * and the securities markets must skip it — 07d's loan float, S11's holder income and 07b's
   * bond machinery all treat it the way they treat CP: someone else's market. Before this flag
   * the same floating principal sat on the banks' aggregate book AND in the institutions' 07d
   * holdings, expensed once and received twice (§6's double-count row).
   */
  isBankFacility?: boolean;
  /** G2: the named bank holding this facility (the issuer's house bank at origination). */
  facilityBankTicker?: string;
  /**
   * What it costs to retire this tranche early — see `domain/call-protection.ts`. Stamped at
   * issuance from what the issue IS (floating paper gets a soft call, high yield a non-call
   * period, investment grade a make-whole), because the regime is a property of the instrument
   * and not of the week it happens to be called in. Absent on bank facilities and CP, which are
   * repayable at par by construction.
   */
  callProtection?: import('./call-protection').CallProtectionKind;
  /**
   * CAL — how many times a year this instrument PAYS, and the week its cycle is anchored to.
   *
   * Interest ACCRUES every week — that is what an income statement says — but cash moves on the
   * instrument's own dates: a bond semi-annually, a floating loan or facility quarterly off its
   * reset, commercial paper at maturity and not before. The smooth 1/52 cash flow this replaces
   * conserved dollars and erased the lumpiness that is the whole reason money markets breathe on
   * a calendar: quarter-end liquidity, coupon-date reinvestment, the week a treasurer has to find
   * real money. Absent means the instrument's default frequency for its kind.
   */
  paymentsPerYear?: number;
  /** The week the payment cycle is anchored to — its issuance week. */
  paymentAnchorWeek?: number;
  _refinanceInitiated?: boolean;
}

export interface CogsBreakdown {
  baseCostUSD: number;
  wagePressureUSD: number;
  inputPriceCostUSD: number;
  capacityDecayCostUSD: number;
  crowdingCostUSD: number;
}

export interface QuarterlyIncomeStatement {
  revenue: number;
  cogs: number;
  cogsBreakdown: CogsBreakdown;
  grossProfit: number;
  sgaExpense: number;
  ebitda: number;
  depreciationAmortization: number;
  ebit: number;
  interestExpense: number;
  pretaxIncome: number;
  taxExpense: number;
  netIncome: number;
  eps: number;
}

export interface QuarterlyBalanceSheet {
  cash: number;
  treasuryHoldingsUSD: number;
  accountsReceivable: number;
  finishedGoodsInventoryUSD: number;
  // 1$ is 1$ Phase 6: real held raw-material/input inventory value (sum of InputLot.unitsHeld *
  // unitPriceUSD across every category, as of this filing date) — genuinely distinct from
  // finished goods, and previously missing from the balance sheet entirely (real input stock
  // existed on the company but nothing on the statements reflected its value as an asset).
  rawMaterialsInventoryUSD: number;
  grossPPE: number;
  accumulatedDepreciation: number;
  netPPE: number;
  totalAssets: number;
  accountsPayable: number;
  shortTermDebt: number;
  longTermDebt: number;
  totalLiabilities: number;
  shareholdersEquity: number;
}

export interface QuarterlyCashFlowStatement {
  netIncome: number;
  daAddback: number;
  changeInWorkingCapital: number;
  cashFromOperations: number;
  maintenanceCapex: number;
  growthCapex: number;
  rndExpense?: number;
  treasuryPurchases: number;
  cashFromInvesting: number;
  debtIssuance: number;
  debtRepayment: number;
  dividendsPaid: number;
  buybacks: number;
  cashFromFinancing: number;
  netChangeInCash: number;
}

export interface FundamentalSnapshot {
  week: number;
  filingPeriod: string;
  filingDate: string;
  incomeStatement: QuarterlyIncomeStatement;
  balanceSheet: QuarterlyBalanceSheet;
  cashFlowStatement: QuarterlyCashFlowStatement;
  leverage: number;
  interestCoverage: number;
  annualRevenue?: number;
  ebitda?: number;
  ebit?: number;
  netIncome?: number;
  cash?: number;
  totalDebt?: number;
  eps?: number;
  creditRating?: CreditRating;
}

export interface DealerEstimate {
  eps: number;
  revenue: number;
}

export interface ConsensusForecast {
  alpha: DealerEstimate;
  beta: DealerEstimate;
  gamma: DealerEstimate;
  consensusEps: number;
  consensusRevenue: number;
}

export interface LeveragedLoanInfo {
  quotedMarginBps: number;
  referenceBenchmark: 'SOFR' | 'EURIBOR' | 'SONIA' | 'TONA';
  pricePar: number;
  discountMarginBps: number;
  tenorYears: number;
  seniority: 'Senior Secured First Lien';
  recoveryRate: number;
  // Rolling weekly history of real cleared discountMarginBps — same real momentum signal as
  // Company.oasSpreadBpsHistory. See 07d-leveraged-loan-clearing.ts.
  discountMarginBpsHistory?: number[];
}

export interface Company {
  concentrationRiskFlags?: string[];
  /**
   * CRD-R1 — the largest single counterparty's share of this firm's contract revenue and of its
   * input supply, measured weekly by `09-concentration-risk.ts`. The flags beside them are
   * sentences for the UI; these are what a rating can be notched off.
   */
  customerConcentration?: number;
  supplierConcentration?: number;
  financialStatementProfile?: FinancialStatementProfile;
  /** XB3a-2 — CARRIER only: the ships and trucks this firm owns, the lanes they are committed to,
   *  and what they carried last week. Its revenue is freight earned in the per-lane market, not
   *  units sold in the goods auction. See domain/carrier.ts. */
  carrierFleet?: import('./carrier').CarrierFleet;
  segmentFinancials?: SegmentFinancial[];
  revenueVolatility?: number;
  technicalReservesUSD?: number;
  aumUSD?: number;
  managementFeeRate?: number;
  insurancePremiumsWrittenUSD?: number;
  insuranceClaimsPaidUSD?: number;
  id: string;
  ticker: string;
  name: string;
  region: RegionId;
  sector: Sector;

  // 3-Statement Fundamentals
  isBankEntity?: boolean;
  isInstitutionalEntity?: boolean;
  institutionalEntityType?: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND';
  baselineAnnualRevenue: number;
  annualRevenue: number;
  productLines?: ProductLine[];
  primarySubUnitId?: string;
  /** IND7 — consecutive weeks this firm has held a dominant share in some category it sells
   *  into. A competition authority acts on a sustained position, not a snapshot. */
  antitrustWeeksAboveThreshold?: number;
  employeeCount: number;
  previousEmployeeCount: number;
  baselineEmployeeCount: number;
  ebitda: number;
  baselineEbitdaMargin?: number;
  ebit: number;
  netIncome: number;
  eps: number;
  sharesOutstanding: number;
  cash: number;
  totalDebt: number;
  currentLiabilities: number;
  debtTranches: DebtTranche[];
  capex: number;
  previousCapex?: number;
  maintenanceCapex: number;
  growthCapex: number;
  grossPPEUSD: number;
  accumulatedDepreciationUSD: number;
  /** IND1: capital goods that actually ARRIVED last week, at landed cost. Real net investment. */
  /**
   * IND13 — ASSETS UNDER CONSTRUCTION: capital that has arrived and is not yet plant.
   *
   * A machine on the loading dock produces nothing; it is installed and commissioned first, and
   * only then does gross PP&E — and the capacity that grows off it — move. Each lot carries the
   * week it enters service, from the good's own commissioning lead. IND1 separated ordering from
   * delivery and this is the second half: investment shows up AFTER the demand that justified
   * it, which is what makes a capacity cycle a cycle.
   */
  assetsUnderConstruction?: { valueUSD: number; entersServiceWeek: number }[];
  /** IND13 — what actually entered service last week: what the plant really grew by. */
  capexCommissionedLastWeekUSD?: number;
  rndExpense?: number;
  baselineGrowthCapexToRevenueRatio: number;
  maintenanceShortfallStreak: number;
  executionQuality: number;
  occupationMixDrift: Partial<Record<string, number>>;

  // Quarterly Earnings
  /**
   * The quarterly reporting apparatus — OPTIONAL, because it belongs to a listed company and a
   * private one has none of it. Private firms do not report quarterly, are not covered by dealers
   * and issue no guidance; §5-HC said so in the architecture and the generator handed them the
   * whole set anyway, which is §7.17's failure mode exactly: a field attached to everything that
   * applies to a subset, frozen at its seed and reading as live downstream. `earningsWeekModulo`
   * being absent is also what switches the reporting path off, so the gate is the data.
   */
  earningsWeekModulo?: number;
  lastEarningsReportWeek?: number;
  reportedThisWeek?: boolean;
  dealerConsensus?: ConsensusForecast;
  lastEarningsSurprisePct?: number;
  lastManagementCommentary?: string;

  /**
   * S5: last week's cash walk as an explicit ledger — every real dollar in or out of `cash`,
   * named. The invariant is structural: cash changes ONLY by the sum of these entries (one
   * posting helper in stage 08 is the single write path), so any unexplained cash move is a
   * missing entry, not a mystery.
   */
  lastCashLedger?: { label: string; amountUSD: number }[];
  /**
   * WS7: treasury cash swept into the region's money market fund at its $1 NAV — a corporate
   * near-cash asset, NOT cash (the S5 ledger moves real dollars out when shares are bought and
   * back in when they redeem). The treasurer sweeps what sits above the company's own
   * working-capital need and redeems the moment operations need it back.
   */
  mmfSharesUSD?: number;
  /** WS8: week of this issuer's last OPPORTUNISTIC primary announcement. A quarterly-sized deal
   * covers a quarter's deployment, so the CFO does not return to the market for one. */
  lastOpportunisticOfferingWeek?: number;
  /** G2: the bank where this company's operating cash IS a deposit — one representation: the
   * company's S5 cash and the bank's corporate-deposit line are two views of the same money. */
  homeBankTicker?: string;
  // ---- HC Wave 2 lifecycle state. Each `pending*` field marks a deal whose FINANCING is in
  // the WS8 queue this week; settlement (or withdrawal) clears it — a deal whose market says
  // no simply does not happen. ----
  pendingLboSponsorId?: string;
  pendingLboEquityUSD?: number;
  pendingRecapSponsorId?: string;
  pendingIpoSponsorId?: string;
  pendingIpoShares?: number;
  /** Week of the last dividend recap — sponsors do not re-lever a company every quarter. */
  lastRecapWeek?: number;
  /** HC1/HC8: the SME pool this private firm was carved from — conservation needs to know
   * which aggregate a firm came out of (and, at HC8, which one a birth reduces). */
  smePoolIndustry?: import('./industry').Industry;
  /** HC8: week this firm was born out of its pool (absent for the Wave 1 cohort). */
  bornWeek?: number;

  // Capital Structure
  /**
   * The company's syndicated term loan, present only while it actually has floating-rate debt
   * outstanding. Optional on purpose: this used to be attached to every company unconditionally,
   * so 167 of 200 firms carried a live-looking loan quote with no loan behind it. The loan
   * clearing stage correctly skips a company with no floating debt, which meant those quotes were
   * never updated and every published discount margin was a frozen generation-time number
   * unrelated to the issuer's current credit — CCC names quoting inside AAA ones. A company
   * without a loan has no loan quote. 07d-leveraged-loan-clearing.ts owns this field's lifecycle:
   * it opens a quote when floating debt appears and retires it when the debt is repaid.
   */
  leveragedLoan?: LeveragedLoanInfo;
  historicalFundamentals: FundamentalSnapshot[];

  // Credit & Status
  leverage: number;
  interestCoverage: number;
  creditRating: CreditRating;
  ratingHistory: CreditRating[];
  isDefaulted: boolean;
  mergerAcquired?: boolean; // Set true when company is acquired in M&A (disjoint from isDefaulted)
  acquiredByTicker?: string; // Ticker of acquiring company
  recoveryRate: number;
  baselineRecoveryRate: number;

  // Market & Pricing
  stockPrice: number;
  historicalPrices: number[];
  revenueHistory?: number[];
  forwardPE: number;
  marketCap: number;
  dividendYield: number;
  baselineDividendYield: number;
  bankMarketShare?: number;
  // Wall Street Phase 1: this bank's own real balance sheet — a genuine loan book, deposit
  // base, capital ratio, and central-bank reserve account distinct from every other named bank
  // in the region, not a proportional slice of one regional aggregate. See
  // 02b-bank-diversification.ts (where it's evolved) and domain/banking.ts's BankingSector.
  bankBalanceSheet?: BankingSector;
  // A persistent, per-bank idiosyncratic risk multiplier (seeded at generation, not re-rolled
  // weekly) — the real reason two banks facing the identical regional credit cycle diverge:
  // a higher-risk bank's own business-loan-loss experience scales up by this factor, so it can
  // genuinely underperform (or fail) while a conservative bank in the same region stays healthy.
  bankRiskFactor?: number;
  /**
   * Whether this company's equity trades on the public market — a STATE, not a type (plan §5-HC:
   * one firm model, one lifecycle). A PRIVATE company is every bit as real: it produces, employs,
   * borrows and defaults through the same stages, gated only where the behaviour is genuinely
   * public-only (equity pricing, consensus/earnings theater, index membership). Going public is a
   * transition of this flag through a real offering (HC7), not the creation of a new object.
   * Required at every creation site: `isPubliclyListed` throws on a missing one rather than
   * defaulting a firm onto the public market.
   */
  listingStatus?: 'PUBLIC' | 'PRIVATE';
  /**
   * Who owns a private company's equity. Founders/family by default; PE sponsor fields are
   * filled by HC4/HC6 when sponsors become real entities with real committed capital. On public
   * companies the real register is the share-ownership model (WS4) — this block is only
   * meaningful while listingStatus is PRIVATE.
   */
  ownership?: { founderPct: number; peSponsorId?: string; peSponsorPct?: number;
    /** HC6: week the sponsor acquired it — the hold period an exit decision reads. */
    acquiredWeek?: number;
    /** HC7: the EV/EBITDA the sponsor PAID — the basis an exit is measured against. */
    entryEvMultiple?: number };
  // RULE 3, OPEN: this was inlined to mirror `InstitutionalEntityType` (a type import would
  // close a module cycle) and the two have since DRIFTED — that union also carries
  // PRIVATE_EQUITY, MONEY_MARKET_FUND and ETF, which cannot be expressed here. So a PE fund or a
  // money fund's listed shell has `institutionalRole: null`. Exactly §7.5's duplicated-shape
  // defect: a value added to one copy and not the other. Break the cycle instead.
  /** Week this company first defaulted — lets credit contagion decay out of a rolling window
   *  instead of counting every default that ever happened (S8). */
  defaultedWeek?: number;
  institutionalRole: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | 'HEDGE_FUND' | null;
  institutionalMarketShare?: number;
  /** HF1 — which strategy this hedge fund runs; carried onto its InstitutionalEntity. */
  hedgeFundStrategy?: HedgeFundStrategy;
  beta: number;

  // Debt & CDS Pricing
  seniorBondYield: number;
  oasSpreadBps: number;
  /**
   * CRD/DER2 — the CLEARED single-name CDS spread, in bps. It was `oasSpreadBps + a random draw
   * in [-4, +4]` bounded to [10, 5000] — a decoration on another price with a clamp on each end —
   * and it is now what the protection book actually cleared at (07h).
   */
  cdsSpreadBps: number;
  /**
   * CRD/DER2 — the CDS BASIS: the cleared protection spread less this issuer's cleared cash OAS.
   * An OUTCOME, and the second cross-market agreement test this model can run after DER1's swap
   * spread. Persistently negative means the cash market is paying more for the same default risk
   * than the synthetic one.
   */
  cdsBasisBps?: number;
  // Rolling weekly history of real cleared oasSpreadBps (most recent last, capped length) — real
  // credit investors weigh recent spread momentum (a name that's been widening fast is a riskier
  // "catch the falling knife" buy even if it already looks cheap) alongside static fair value.
  // See 07b-corporate-bond-clearing.ts's attractiveness scoring.
  oasSpreadBpsHistory?: number[];

  // Production
  inputSupplyConstraintFactor: number;
  // Output (finished-goods) inventory, keyed by sub-unit — a company producing multiple
  // product lines (e.g. semiconductors + consumer_devices + enterprise_software at once) holds
  // a genuinely separate inventory for each; a single shared scalar here was silently
  // overwritten by whichever line's weekly bidding pass ran last. See getOutputInventoryUSD /
  // getOutputInventoryUnits below for the aggregate reads most call sites actually want.
  outputInventoryBySubUnit: Record<string, { unitsHeld: number; valueUSD: number }>;
  // 1$ is 1$ Phase 2/6: real input inventory, keyed by the input sub-unit category (e.g.
  // upstream_extraction, specialty_metals) a company has actually bought and holds. Each entry is
  // a LIST of real purchase lots — not one blended average — because "you get out N output that
  // sits in inventory until P buys it at L price" (the project's founding ask) means a company
  // holding units bought from three different real sellers at three different prices should be
  // able to say so, not report one indistinguishable average cost. Each lot remembers who it was
  // bought from (a real company ticker, or an SME pool id — see below)
  // and the real price paid — credited in 05-unit-bidding.ts when a purchase clears (both
  // contract-settlement and open-market, the latter via an explicit buyer/seller lot allocation,
  // not just an aggregate total), consumed oldest-lot-first in 08-company-fundamentals.ts.
  // A pool seller's id is "PRIVATE:<region>:<industry>" since SEG keyed the tier to the registry.
  inputInventoryBySubUnit?: Record<string, InputLot[]>;
  /**
   * IND10 — WORK IN PROGRESS: production started and not yet finished, by sub-unit.
   *
   * Index `i` is the lot that completes in `i` weeks, so index 0 completes this week and the
   * queue's length is the sub-unit's production lead. A good with a lead of zero never has one:
   * it is started and finished in the same pass, which is exactly what the model did for every
   * good before this stock existed.
   *
   * It is a real balance-sheet stock — for a shipyard or a construction firm it is most of the
   * asset side — and it is where a week's production cost sits between being spent and being
   * sellable.
   */
  wipBySubUnit?: Record<string, { units: number; valueUSD: number }[]>;
  recentFulfillmentEMA: number;
  /**
   * IND14 — THIS SUPPLIER'S DELIVERY RECORD: units delivered against units owed on its own
   * contracts, smoothed.
   *
   * A stockout does not lose a week's sale, it loses the relationship. Before IND11 there was
   * nothing to measure — an undelivered order evaporated and a chronic under-deliverer looked
   * identical to a punctual one the following Monday. Now the record exists, so it can be
   * PRICED: buyers weight who they contract with by it, beside landed cost.
   *
   * The EMA is deliberately slow (0.9). Reliability that could be repaired by one good week
   * would not be reliability, and the design's own test is that the graph does not rewire back
   * on one good week.
   */
  deliveryReliability?: number;
  /** IND2 — the annualised CONTRACTED revenue base a subscription seller carries. It survives a
   *  week with no sales and decays only by churn, which is what makes a software firm's revenue
   *  behave differently from a steel mill's. Absent on pure unit sellers. */
  recurringRevenueBaseUSD?: number;
  _targetProductionUSD?: number;
  // 1$ is 1$ Phase 6: this week's real settled sales/purchases (from 05-unit-bidding.ts's
  // actual bid/offer clearing — open-market plus active-contract volume) — persisted onto the
  // company so the UI can show real weekly production/purchasing activity, not just the target.
  /** PUB1b — tax accrued but not yet remitted. Real firms accrue weekly and pay quarterly, and
   * that lumpiness is most of what makes a treasury account swing. */
  accruedTaxLiabilityUSD?: number;
  lastWeekSalesUSD?: number;
  /**
   * HH6 — the wage this firm OFFERS, as a multiple of the going rate for its own occupation
   * mix. 1.0 is the market rate. Set weekly from its real vacancy-fill experience (cannot fill
   * → raise) and its margin headroom (losing money → cannot). The occupation wage indexes are
   * the employment-weighted average of these, so what households earn is what firms pay.
   */
  offeredWageIndex?: number;
  /** HH6 — the share of this firm's own postings that went unfilled last week: its measured
   * hiring difficulty, and the input to the wage push above. */
  unfilledVacancyShare?: number;
  lastWeekPurchasesUSD?: number;
  treasuryHoldings: ItemizedHolding[];
  producedCommodityId?: string;
  demandShockLagBuffer?: number[];
}
/**
 * Public-market membership test.
 *
 * GUARD: undefined used to read as PUBLIC, so a creation site that forgot the field silently
 * listed the firm on the public market — where it gets a share price, index membership and an
 * earnings call. It is a required state; a missing one fails here.
 */
export function isPubliclyListed(c: Pick<Company, 'listingStatus' | 'ticker'>): boolean {
  if (c.listingStatus === undefined) {
    return defect(`company ${c.ticker} has no listingStatus — set it where the company is created`);
  }
  return c.listingStatus !== 'PRIVATE';
}

export function isActiveCompany(c: Company): boolean { return !c.isDefaulted && !c.mergerAcquired; }

/**
 * CASH — the corporate treasury's own sleeve, and why it is a bid rather than a bookkeeping line.
 *
 * A treasurer holds an operating buffer against the week's payments and parks what is genuinely
 * surplus in short government paper. Both numbers are this firm's own: the buffer is a share of
 * its revenue, the sleeve a share of what is left. That much was always here — inside stage 08,
 * where the company MINTED the paper (`treasuryHoldings.push`) and paid an UNMODELED
 * counterparty for it, then burned it back the same way. Measured at the boundary: 6.1B gross
 * over ten weeks of sovereign paper appearing and disappearing with no seller and no buyer,
 * while 07f's own float rule carved these very holdings out on the grounds that "corporate
 * treasuries never bid".
 *
 * They bid now, in the bill auction, on this schedule. The arithmetic below is unchanged and has
 * one owner: 07f sizes the bid with it, and nothing mints paper any more.
 */
export const TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE = 0.05;
export const TREASURY_SLEEVE_SHARE_OF_SURPLUS_CASH = 0.6;

/** What this firm wants to be holding in short government paper, given the cash it has now. */
export function corporateTreasuryTargetUSD(cashUSD: number, annualRevenueUSD: number): number {
  const investableUSD = Math.max(0, cashUSD - annualRevenueUSD * TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE);
  return investableUSD * TREASURY_SLEEVE_SHARE_OF_SURPLUS_CASH;
}

export function getOutputInventoryUSD(comp: Company, subUnitId?: string): number {
  const inv = comp.outputInventoryBySubUnit;
  if (!inv) return 0;
  if (subUnitId) return inv[subUnitId]?.valueUSD ?? 0;
  return Object.values(inv).reduce((s, entry) => s + entry.valueUSD, 0);
}

export function getOutputInventoryUnits(comp: Company, subUnitId?: string): number {
  const inv = comp.outputInventoryBySubUnit;
  if (!inv) return 0;
  if (subUnitId) return inv[subUnitId]?.unitsHeld ?? 0;
  return Object.values(inv).reduce((s, entry) => s + entry.unitsHeld, 0);
}

/** IND10 — units of this company's output that are started but not yet finished. */
/** IND13 — capital delivered and not yet in service: the construction-in-progress asset. */
export function assetsUnderConstructionUSD(comp: Company): number {
  return (comp.assetsUnderConstruction ?? []).reduce((s, l) => s + l.valueUSD, 0);
}

export function getWipUnits(comp: Company, subUnitId?: string): number {
  const wip = comp.wipBySubUnit;
  if (!wip) return 0;
  const q = (lots: { units: number }[]) => lots.reduce((s, l) => s + l.units, 0);
  if (subUnitId) return q(wip[subUnitId] ?? []);
  return Object.values(wip).reduce((s, lots) => s + q(lots), 0);
}

/** IND10 — the cost sunk into that unfinished production: the WIP asset. */
export function getWipUSD(comp: Company, subUnitId?: string): number {
  const wip = comp.wipBySubUnit;
  if (!wip) return 0;
  const q = (lots: { valueUSD: number }[]) => lots.reduce((s, l) => s + l.valueUSD, 0);
  if (subUnitId) return q(wip[subUnitId] ?? []);
  return Object.values(wip).reduce((s, lots) => s + q(lots), 0);
}

export function getInputInventoryUSD(comp: Company, subUnitId?: string): number {
  const inv = comp.inputInventoryBySubUnit;
  if (!inv) return 0;
  const lotSum = (lots: InputLot[]) => lots.reduce((s, lot) => s + lot.unitsHeld * lot.unitPriceUSD, 0);
  if (subUnitId) return lotSum(inv[subUnitId] ?? []);
  return Object.values(inv).reduce((s, lots) => s + lotSum(lots), 0);
}

export function getInputInventoryUnits(comp: Company, subUnitId?: string): number {
  const inv = comp.inputInventoryBySubUnit;
  if (!inv) return 0;
  const unitSum = (lots: InputLot[]) => lots.reduce((s, lot) => s + lot.unitsHeld, 0);
  if (subUnitId) return unitSum(inv[subUnitId] ?? []);
  return Object.values(inv).reduce((s, lots) => s + unitSum(lots), 0);
}


/**
 * IND7 — ANTITRUST. A competition authority acts on a MEASURED share held for a sustained period,
 * not on a snapshot: one quarter at 40% is a good quarter, three years at 40% is a position.
 *
 * The threshold and the window are policy primitives — what a competition regime chooses to act
 * on — in the same sense as a tax rate or a capital ratio (rule 4 allows the primitive; it forbids
 * importing any real authority's actual case history).
 */
export const ANTITRUST_SHARE_THRESHOLD = 0.45;
export const ANTITRUST_SUSTAINED_WEEKS = 52;

/** The highest share this firm holds in any single category it sells into, measured. */
export function peakCategoryShare(comp: { productLines?: { categoryMarketShare?: number }[] }): number {
  return (comp.productLines || []).reduce((m, l) => Math.max(m, l.categoryMarketShare ?? 0), 0);
}

/**
 * Whether this firm is under an antitrust hold — dominant for long enough that a regime would
 * act. The immediate consequence is that it may not ACQUIRE (stage 10 respects it); the
 * divestiture that should follow is recorded as unbuilt in §7.138.
 */
export function isAntitrustBlocked(comp: { antitrustWeeksAboveThreshold?: number }): boolean {
  return (comp.antitrustWeeksAboveThreshold ?? 0) >= ANTITRUST_SUSTAINED_WEEKS;
}

/**
 * CAL — how often this instrument pays, if it did not say.
 *
 * Semi-annual for a fixed-rate bond, quarterly for floating paper (it pays on its own reset), and
 * once at maturity for commercial paper, which is a discount instrument and has no coupon.
 */
export function trancheePaymentsPerYear(t: DebtTranche): number {
  if (t.paymentsPerYear !== undefined) return Math.max(1, t.paymentsPerYear);
  if (t.isCommercialPaper) return 1;
  return t.rateType === 'FIXED' ? 2 : 4;
}

/** Whether this tranche's cash payment falls in this week, and how many weeks it covers. */
export function tranchePaymentDue(t: DebtTranche, week: number): { due: boolean; weeksCovered: number } {
  const perYear = trancheePaymentsPerYear(t);
  const periodWeeks = Math.max(1, Math.round(52 / perYear));
  if (t.isCommercialPaper) {
    return { due: t.maturityWeek === week, weeksCovered: periodWeeks };
  }
  const anchor = t.paymentAnchorWeek ?? 0;
  const since = week - anchor;
  return { due: since > 0 && since % periodWeeks === 0, weeksCovered: periodWeeks };
}
