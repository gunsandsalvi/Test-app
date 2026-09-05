
/** The firm: one model for every company in the world — listed or private, operating or
 *  financial. Product lines, debt tranches, the three statements, credit, and the real input and
 *  output inventories it holds. No parallel firm type anywhere (§7.33). */

import { plantNetLocal, type PlantVintage } from './plant';
import { InstrumentId, type EntityId, type Ticker } from './ids';
import { RegionId } from './geography';
import type { CdsTenorKey } from './derivatives/classes/cds';
import { defect } from './defect';
import { Industry } from './industry';
import { BankingSector } from './banking';
import { HedgeFundStrategy } from './institutions';

export type FinancialStatementProfile = 'STANDARD_OPERATING' | 'INSURER' | 'ASSET_MANAGER' | 'BANK' | 'REIT' | 'CARRIER';

export type Sector = 'Tech' | 'Energy' | 'Financials' | 'Industrials' | 'Consumer' | 'Banks';

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
/** Investment grade is BBB and above — the line the credit-derivative add-on and call protection draw. */
export const isInvestmentGradeRating = (r: CreditRating | undefined): boolean =>
  r === 'AAA' || r === 'AA' || r === 'A' || r === 'BBB';

export interface ProductLine {
  industry: Industry;
  subUnitId: string;
  category?: string;
  revenueShare: number;
  /** §3.20d-ii — consecutive weeks this line neither made nor sold a unit; the exit clock. */
  idleStreakWeeks?: number;
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
  unitPriceLocal: number;
  acquiredWeek: number;
}

export interface SegmentFinancial {
  subUnitId: string;
  revenueLocal: number;
  ebitdaLocal: number;
  capexLocal: number;
}

export interface DebtTranche {
  /** §3.13-BOOK slice (a): the paper's own id, in the INSTRUMENT space — format `{ticker}-T{n}`,
   *  which is a ticker with a suffix and exactly why the compiler has to be told they differ. */
  id: InstrumentId;
  principalLocal: number;
  rateType: 'FIXED' | 'FLOATING';
  couponRate?: number; // FIXED only — locked annual rate, paid on principalLocal, never changes until maturity
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
  facilityBankId?: EntityId;
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

interface CogsBreakdown {
  baseCostLocal: number;
  wagePressureLocal: number;
  inputPriceCostLocal: number;
  capacityDecayCostLocal: number;
  crowdingCostLocal: number;
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
  treasuryHoldingsLocal: number;
  accountsReceivable: number;
  finishedGoodsInventoryLocal: number;
  // 1$ is 1$ Phase 6: real held raw-material/input inventory value (sum of InputLot.unitsHeld *
  // unitPriceLocal across every category, as of this filing date) — genuinely distinct from
  // finished goods, and previously missing from the balance sheet entirely (real input stock
  // existed on the company but nothing on the statements reflected its value as an asset).
  rawMaterialsInventoryLocal: number;
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

interface QuarterlyCashFlowStatement {
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

interface DealerEstimate {
  eps: number;
  revenue: number;
}

interface ConsensusForecast {
  alpha: DealerEstimate;
  beta: DealerEstimate;
  gamma: DealerEstimate;
  consensusEps: number;
  consensusRevenue: number;
}

/**
 * §3.13 row 3 — `LeveragedLoanInfo` IS DELETED, for the reason `oasSpreadBps` was.
 *
 * Everything it carried was one of three things and none of them was a fact about the borrower:
 * a PRICE or a SPREAD (`pricePar`, `discountMarginBps` and its history), which belong to the piece
 * of paper and are read off what its own book cleared; a DUPLICATE of what the ladder already
 * states (`quotedMarginBps` is the row's `floatingMarginBps`, `tenorYears` its dates); or a
 * CONSTANT (`seniority`, `referenceBenchmark`, and `recoveryRate`, which the loan book derives from
 * the region's realised experience every week anyway).
 *
 * What replaced it: `engine/credit-price.ts:issuerSpreadAtOnCurve` with `IS_LOAN_ROW`, which is the
 * borrower's own LOAN CURVE — a term structure read off its own loans' cleared prices, kept apart
 * from its bond curve because a first lien and an unsecured claim are two risks on one name.
 */

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
  technicalReservesLocal?: number;
  aumLocal?: number;
  managementFeeRate?: number;
  insurancePremiumsWrittenLocal?: number;
  insuranceClaimsPaidLocal?: number;
  /**
   * §3.13-BOOK slice (c2a) — THE FIRM'S IDENTITY, IN THE ENTITY ID SPACE. Branded so the compiler
   * refuses a ticker, a participant id or a region where a firm's id belongs. Every writer of it
   * goes through a named constructor in `domain/entity-keys.ts` (§3.13-READ D11 put them there),
   * so the brand is applied where the id is MINTED rather than cast at a read.
   */
  id: EntityId;
  /**
   * §3.13-BOOK slice (c2c) — THE FIRM'S OTHER IDENTITY, branded. `PartyRef` keys COMPANY and the
   * three BANK arms by this and INSTITUTION by `id`, which is the inconsistency `c-then` ends —
   * and it could not be ended safely while both were `string`, because nothing could tell the
   * compiler which of the two a given site meant. This is the third confusable space (the others
   * being the entity id and the clearing participant id) and by far the largest.
   */
  ticker: Ticker;
  name: string;
  region: RegionId;
  sector: Sector;

  // 3-Statement Fundamentals
  isBankEntity?: boolean;
  isInstitutionalEntity?: boolean;
  institutionalEntityType?: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND';
  /**
   * §5-MNC — the OWNERSHIP link: this company is a subsidiary and its equity belongs to the
   * named parent (founderPct 0 keeps it out of the household private-business residual, OWN4).
   * Consolidation is a VIEW over this link, never a second set of books.
   */
  parentId?: EntityId;
  /** §5-PROD — Wright's-law learning state: cumulative output, the unit-labour multiplier
   *  (heads needed = baseline heads ÷ multiplier), and this week's own annualized learning
   *  rate — the number the firm's labour demand nets out in place of the deleted uniform
   *  drift. See domain/company-week/learning.ts. */
  cumulativeOutputUnits?: number;
  learningMultiplier?: number;
  lastLearningGrowthAnnual?: number;
  /** §5-DYN — the STOCK response the §7.139 produce/idle rule implied: share of the plant
   *  offline (no upkeep, no staffed capacity, restartable), its idle streak, and how long it
   *  has been offline (a §7.138 year mothballed is scrapped for good). */
  mothballedPpeShare?: number;
  idleStreakWeeks?: number;
  mothballedStreakWeeks?: number;
  /** §5-MNC — consecutive weeks each foreign market's own producers have beaten this firm's
   *  landed exports in the sourcing merit order (reset on any week it wins again); a year of
   *  losing is the structural signal the FDI decision fires on. */
  fdiDisadvantageWeeksByRegion?: Partial<Record<RegionId, number>>;
  /**
   * §7.284 step 2 — THE MANAGER→VEHICLE LINK, replacing the id-equality convention. A listed
   * manager (this Company shell: staff, fee revenue, its own equity) MANAGES vehicles (the
   * InstitutionalEntity pools: assets, cash, unit-holder liabilities). Today every institutional
   * shell manages exactly the one entity sharing its id — `managedEntityIdsOf` states that
   * default in ONE place — and this field is what lets a manager run several vehicles (the ETF
   * sponsor template) once the split's later steps land. Never read it raw; ask the helper.
   */
  managesEntityIds?: EntityId[];
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
  /** §7.269 — the net PP&E the baseline headcount was struck against, fixed the first time the
   *  staffing ceiling is read (the `unitsPerNetPpeDollar` pattern). The full-staffing ceiling is
   *  `baselineEmployeeCount × netPPE/baselineNetPPE`: a firm that BUILDS plant can hire past its
   *  seed headcount, and one that lets it depreciate cannot staff a plant it no longer has. */
  baselineNetPpeLocal?: number;
  /** §7.246 — the two measured cost lines of the most recent completed company week, persisted so
   *  stage 05's offer floor can decompose `(annualRevenue − ebitda)` into wages + real inputs +
   *  residual instead of dividing a TRAILING total by CURRENT staffed output. Both weekly (rule 8). */
  payrollWeeklyLocal?: number;
  realInputConsumptionCostWeeklyLocal?: number;
  ebitda: number;
  baselineEbitdaMargin?: number;
  ebit: number;
  netIncome: number;
  eps: number;
  // §3.13-BOOK dIV: shares in issue are a READ of the instrument index (`issuedSharesOf`), not a field.
  // §5-WIRES A3.1: cash is a READ of the persistent account (`cashOf`, engine/ledger/accounts.ts).
  // §5-WIRES D: total debt is a READ of the ladder (`totalDebtOf`, `ladderTotalLocal`), not a field.
  currentLiabilities: number;
  debtTranches: DebtTranche[];
  capex: number;
  previousCapex?: number;
  maintenanceCapex: number;
  growthCapex: number;
  /**
   * §3.26-f-ii — THE PLANT, as dated vintages (`domain/plant.ts`): what each commissioning cost,
   * the week it entered service, its own life. Gross, net, accumulated depreciation and the
   * week's charge are READS of it at the week asked (`plantGrossLocal`, `plantNetLocal`,
   * `plantAccumulatedDepreciationLocal`, `plantDepreciationAnnualLocal`); the two scalars they
   * replace were kept in step by hand by six writers and could not be told apart when they drifted.
   * Oldest first; every writer returns a new array.
   */
  plant: import('./plant').PlantVintage[];
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
  assetsUnderConstruction?: import('./plant').ConstructionLot[];
  /** IND13 — what actually entered service last week: what the plant really grew by. */
  capexCommissionedLastWeekLocal?: number;
  rndExpense?: number;
  baselineGrowthCapexToRevenueRatio: number;
  maintenanceShortfallStreak: number;
  executionQuality: number;
  /** §5-BRAINS — this firm's management: the two preference primitives (domain/preferences.ts),
   *  drawn once from the firm's own stream and replaced only by measured failure (§5-MGMT). */
  management?: import('./preferences').Preferences;
  /** §5-BRAINS — the earnings this management EXPECTS: an adaptive expectation at its own
   *  horizon. One owner, the labour stage (the first decision that reads it). */
  expectedEbitdaLocal?: number;
  /** §5-MGMT — consecutive quarterly reviews this management has failed. */
  managementFailedQuarters?: number;
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
  /** §3.20d-iii — the EBITDA margin management guided at its last report: its own expectation then. */
  guidedEbitdaMargin?: number;

  /**
   * S5: last week's cash walk as an explicit ledger — every real dollar in or out of `cash`,
   * named. The invariant is structural: cash changes ONLY by the sum of these entries (one
   * posting helper in stage 08 is the single write path), so any unexplained cash move is a
   * missing entry, not a mystery.
   */
  lastCashLedger?: { label: string; amountLocal: number }[];
  /**
   * WS7: treasury cash swept into the region's money market fund at its $1 NAV — a corporate
   * near-cash asset, NOT cash (the S5 ledger moves real dollars out when shares are bought and
   * back in when they redeem). The treasurer sweeps what sits above the company's own
   * working-capital need and redeems the moment operations need it back.
   */
  mmfSharesLocal?: number;
  /** WS8: week of this issuer's last OPPORTUNISTIC primary announcement. A quarterly-sized deal
   * covers a quarter's deployment, so the CFO does not return to the market for one. */
  lastOpportunisticOfferingWeek?: number;
  /** G2: the bank where this company's operating cash IS a deposit — one representation: the
   * company's S5 cash and the bank's corporate-deposit line are two views of the same money. */
  homeBankId?: EntityId;
  // ---- HC Wave 2 lifecycle state. Each `pending*` field marks a deal whose FINANCING is in
  // the WS8 queue this week; settlement (or withdrawal) clears it — a deal whose market says
  // no simply does not happen. ----
  pendingLboSponsorId?: string;
  pendingLboEquityLocal?: number;
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
  historicalFundamentals: FundamentalSnapshot[];

  // Credit & Status
  leverage: number;
  interestCoverage: number;
  creditRating: CreditRating;
  // §4.C II.5 — ratingHistory lives on v2.ratingRing (codes; world.ts).
  isDefaulted: boolean;
  mergerAcquired?: boolean; // Set true when company is acquired in M&A (disjoint from isDefaulted)
  acquiredById?: EntityId; // Ticker of acquiring company
  recoveryRate: number;
  baselineRecoveryRate: number;

  // Market & Pricing
  stockPrice: number;
  // §4.C II.5 — historicalPrices lives on v2.priceRing (world.ts).
  // §4.C II.5 — revenueHistory lives on v2.revRing (world.ts); the object field is gone.
  forwardPE: number;
  // §5-WIRES D: market cap is a READ, price × shares (`marketCapOf`), not a field.
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
  ownership?: { founderPct: number; peSponsorId?: EntityId; peSponsorPct?: number;
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
  /**
   * §3.13: what this borrower's five-year money cost at its LAST FILING — a statement of what the
   * market charged it on the date it reported, read off its own bonds, not a live field anything
   * prices from. There is no live issuer spread: `oasSpreadBps` is gone, and a caller that wants
   * this borrower's cost of money at a maturity reads its own credit curve
   * (`engine/credit-price.ts:issuerSpreadAt`), which is a term structure and not a number.
   */
  seniorBondYield: number;
  /**
   * CRD/DER2 — the CLEARED single-name CDS spread, in bps. It was the issuer's OAS plus a random
   * draw in [-4, +4] bounded to [10, 5000] — a decoration on another price with a clamp on each
   * end — and it is now what the protection book actually cleared at (07h). It is the ONE spread
   * a borrower legitimately carries, because a CDS is one contract on one name at one tenor.
   */
  /** §3.26-c — the benchmark tenor's last print of this name's protection book
   *  (`derivative-markets/cds.ts`), and NOTHING else: undefined (NaN on the lane) until the book
   *  has printed. It was the bond's OAS when no protection cleared, which made the basis zero by
   *  construction, and `oas ± random` at the seed. Never derived from the cash spread. */
  cdsSpreadBps?: number;
  /** §5-CLOSE P2 / §3.27-iv — the week each tenor's protection book last STRUCK a print
   *  (`derivative-markets/cds.ts`; absent: never). A tenor with no book this week carries its
   *  last print, which is a quote, not a price, and the basis test reads only prices. */
  cdsClearedWeekByTenor?: Partial<Record<CdsTenorKey, number>>;
  /**
   * CRD/DER2 — the CDS BASIS: the cleared protection spread less this issuer's cleared cash OAS.
   * An OUTCOME, and the second cross-market agreement test this model can run after DER1's swap
   * spread. Persistently negative means the cash market is paying more for the same default risk
   * than the synthetic one.
   */
  cdsBasisBps?: number;
  /** HF — shares of this name out on loan, i.e. sold short. A measurement of the region's stock
   * loan book (domain/securities-lending.ts), never a stated number. */
  shortInterestShares?: number;

  // Production
  inputSupplyConstraintFactor: number;
  // Output (finished-goods) inventory, keyed by sub-unit — a company producing multiple
  // product lines (e.g. semiconductors + consumer_devices + enterprise_software at once) holds
  // a genuinely separate inventory for each; a single shared scalar here was silently
  // overwritten by whichever line's weekly bidding pass ran last. See getOutputInventoryLocal /
  // getOutputInventoryUnits below for the aggregate reads most call sites actually want.
  /** §7.345 — units sold last week by line (stage 08 carries it from the week's update) and the
   *  sales this management EXPECTS by line (owner: stage 05, where production is decided). */
  lastWeekSalesUnitsBySubUnit?: Record<string, number>;
  expectedSalesUnitsBySubUnit?: Record<string, number>;
  /** Per sub-unit the firm has ever produced — SPARSE (§3.29-iii: the type says so). */
  outputInventoryBySubUnit: Partial<Record<string, { unitsHeld: number; valueLocal: number }>>;
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
  wipBySubUnit?: Record<string, { units: number; valueLocal: number }[]>;
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
  recurringRevenueBaseLocal?: number;
  _targetProductionLocal?: number;
  // 1$ is 1$ Phase 6: this week's real settled sales/purchases (from 05-unit-bidding.ts's
  // actual bid/offer clearing — open-market plus active-contract volume) — persisted onto the
  // company so the UI can show real weekly production/purchasing activity, not just the target.
  /** PUB1b — tax accrued but not yet remitted. Real firms accrue weekly and pay quarterly, and
   * that lumpiness is most of what makes a treasury account swing. */
  // §5-WIRES N: the accrued, unpaid tax is the firm's undue dated rows to the treasury (`undueOwedByPayerLocal`), not a field.
  /** §7.302 — the week this bank was RESOLVED (equity ≤ 0 → purchase-and-assumption by the
   *  region's largest survivor; wholesale haircut by the hole; the shell defaults into the
   *  estate for its register claims). Set once; a resolved bank never trades again. */
  bankResolvedWeek?: number;
  /** §5-TAXR — accumulated losses not yet used against taxable profit. A recovering firm draws
   *  this down and pays nothing until it is gone; receipts fall faster than profits in a
   *  downturn. Seeded absent: a firm opens with no loss history (§7.4). */
  taxLossCarryforwardLocal?: number;
  /** §5-TAXR — the plant's TAX basis, run down double-declining while the book runs straight-
   *  line. Seeded at book net PP&E on first touch — no opening deferral (§7.4). */
  taxBasisPpeLocal?: number;
  /** §5-TAXR — (book net PP&E − tax basis) × rate: what acceleration has deferred. A VIEW. */
  deferredTaxLiabilityLocal?: number;
  lastWeekSalesLocal?: number;
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
  lastWeekPurchasesLocal?: number;
  // §3.13-BOOK d3c: `treasuryHoldings` is deleted — a firm's own book (bills, since it bids in
  // 07f) is its register rows under the `COMPANY` party (`sovereign-register.ts:sovereignRowsOf`).
  producedCommodityId?: string;
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
 * §3.13-READ D8 — THIS REGION'S LIVE BANKS WITH A SHEET, and the only spelling of it.
 *
 * Fourteen sites asked this question in four different ways, and the differences were accidents
 * rather than decisions: some read `ctx.prevActiveFirms` (week-start, public-only), some
 * `ctx.updatedCompanies` (live), some `state.companies`; some spelled liveness `isActiveCompany`,
 * some `!isDefaulted`, and four asked for no liveness at all. The clearing stages all run before
 * `bank-resolution`, so most of those differences were latent — but ONE was not: `overdraft-sweep`
 * runs at stage 406 and spelled liveness `!isDefaulted`, while `10-mergers` sets `mergerAcquired`
 * at stage 380. An acquired bank was still being handed a share of every SME facility draw,
 * weighted by a `bankMarketShare` its acquirer had already taken over.
 *
 * A bank with no `bankBalanceSheet` is not a counterparty to anything — every one of the four
 * sites that omitted the check reached for the sheet on the next line with `?.` and scored the
 * bank at zero. Requiring it here says that once, instead of fourteen times by accident.
 */
export function banksOf(companies: readonly Company[], region?: RegionId): Company[] {
  return companies.filter((c) =>
    c.isBankEntity && !!c.bankBalanceSheet && isActiveCompany(c)
    && (region === undefined || c.region === region));
}

/**
 * §7.269 — THE FULL-STAFFING CEILING SCALES WITH THE PLANT, and this is its ONE derivation
 * (rule 4: stage 05's `staffedShare` denominator and the labour market's hiring cap are the
 * same physical statement — what headcount runs this plant at full).
 *
 * It was `baselineEmployeeCount`, FROZEN AT THE SEED, in both places: a firm that built plant
 * could never hire past its seed headcount, so §7.110's hiring symmetry was structurally
 * impossible — every profitable firm sat AT its cap while the below-the-line firms shed, the
 * released workers had nowhere to go, and unemployment ratcheted ~0.5pp/week in every region
 * for the model's whole life (u 9% → 27–30% by w60 at every reference; the USA band-cap
 * grazes were the ceiling of this). The ratio is the plant the baseline headcount was struck
 * against — recorded at first read, the `unitsPerNetPpeDollar` pattern — so IND1's delivered
 * capex raises the ceiling and depreciation lowers it, symmetrically.
 */
export function fullStaffingCapHeads(c: Company, plant: readonly PlantVintage[], week: number): number {
  const baselineHeads = c.baselineEmployeeCount;
  if (!(baselineHeads > 0)) return Math.max(1, c.employeeCount);
  const netPpeLocal = plantNetLocal(plant, week); // §3.13-BOOK g-ii-c: the register's rows, handed in
  // §5-PROD: a firm that has LEARNED runs the same plant with fewer people — the ceiling is
  // heads-per-plant at the firm's own current unit-labour productivity, not its baseline's.
  const learning = Math.max(1e-6, c.learningMultiplier ?? 1);
  // §5-DYN — MOTHBALLED PLANT IS NOT STAFFABLE. "No maintenance draw, no staffed capacity" is
  // the mechanism's own definition, and until this factor the second half was unimplemented:
  // the ceiling ignored the mothballed share, so a firm kept full staff on a shaved plant, the
  // full payroll divided by the online plant's output re-failed the §7.139 unit-cost test, and
  // the mothball RATCHETED — measured in the first 80-week reference as the u-band regression
  // (§7.301). The labour demand this ceiling caps now falls with the plant that is actually
  // there to staff, which is what lets a mothballed firm shed cost and the test recover.
  const online = 1 - Math.max(0, Math.min(1, c.mothballedPpeShare ?? 0));
  if (!(netPpeLocal > 0)) return Math.max(1, (baselineHeads * online) / learning);
  if (!(c.baselineNetPpeLocal !== undefined && c.baselineNetPpeLocal > 0)) c.baselineNetPpeLocal = netPpeLocal;
  return Math.max(1, (baselineHeads * (netPpeLocal / c.baselineNetPpeLocal) * online) / learning);
}

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
const TREASURY_SLEEVE_SHARE_OF_SURPLUS_CASH = 0.6;

/** What this firm wants to be holding in short government paper, given the cash it has now. */
export function corporateTreasuryTargetLocal(cashLocal: number, annualRevenueLocal: number, riskAversion = 1): number {
  const investableLocal = Math.max(0, cashLocal - annualRevenueLocal * TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE * riskAversion);
  return investableLocal * TREASURY_SLEEVE_SHARE_OF_SURPLUS_CASH;
}

export function getOutputInventoryLocal(comp: Company, subUnitId?: string): number {
  const inv = comp.outputInventoryBySubUnit;
  if (subUnitId) return inv[subUnitId]?.valueLocal ?? 0;
  return Object.values(inv).reduce((s, entry) => s + (entry?.valueLocal ?? 0), 0);
}

export function getOutputInventoryUnits(comp: Company, subUnitId?: string): number {
  const inv = comp.outputInventoryBySubUnit;
  if (subUnitId) return inv[subUnitId]?.unitsHeld ?? 0;
  return Object.values(inv).reduce((s, entry) => s + (entry?.unitsHeld ?? 0), 0);
}

/** IND10 — units of this company's output that are started but not yet finished. */
// ENGINE V2 (§7.304) — input lots live on the persistent columnar table (engine2/lots.ts);
// the balance-sheet reads are totalInputValueLocal / inputUnitsHeld / materializeInputInventory.


/**
 * IND7 — ANTITRUST. A competition authority acts on a MEASURED share held for a sustained period,
 * not on a snapshot: one quarter at 40% is a good quarter, three years at 40% is a position.
 *
 * The threshold and the window are policy primitives — what a competition regime chooses to act
 * on — in the same sense as a tax rate or a capital ratio (rule 2 allows the primitive; it forbids
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

/**
 * CAL / §3.37-SEED — A TRANCHE'S COUPON DATES ARE COUNTED FROM ITS OWN ISSUE.
 *
 * `paymentAnchorWeek` is optional and NOTHING has ever set it — not the seed, not any of the six
 * runtime issuance sites — so every reader fell back to `?? 0` and **every bond in the model paid
 * on the same global cycle anchored at week zero**. A bond issued forty weeks before the world
 * opened and one issued three weeks before it paid in the same weeks, and neither paid on a date
 * that had anything to do with its own life. It is also what made the opening accrual wrong: with
 * the anchor at zero a mid-life rung's first coupon covered only the weeks since the world opened,
 * not the weeks since its last real payment date (atlas the-seed D2).
 *
 * The default is the ORIGINATION WEEK, which is the date a real bond's schedule is struck from.
 * The field stays for paper that genuinely re-anchors (a re-opening taps an existing line's
 * dates); it is no longer the only thing standing between a tranche and a schedule.
 */
/**
 * CAL / `bond.md` N9.b — WHAT HAS ACCRUED ON ONE UNIT OF FACE, as a fraction of face.
 *
 * `annual rate × weeks since this tranche's own last coupon date / 52`. One owner, because three
 * things need the same number and must not disagree: the seed's opening ledger, the weekly accrual,
 * and the ACCRUED A BUYER PAYS A SELLER when the paper moves (N9.b, §3.13b) — the leg that makes a
 * quoted price a CLEAN price. A tranche in its first week has accrued nothing.
 */
export function accruedPerFace(
  t: TrancheSchedule,
  annualRate: number,
  week: number,
): number {
  return (annualRate * weeksAccrued(t, week)) / 52;
}

/** What `accruedPerFace` needs of a tranche to place it in its own coupon period. */
type TrancheSchedule = {
  originationWeek: number; paymentAnchorWeek?: number; paymentsPerYear?: number;
  isCommercialPaper?: boolean; rateType?: string;
};

/**
 * HOW MANY WEEKS THIS TRANCHE HAS RUN SINCE ITS OWN LAST COUPON DATE — the same number in weeks
 * that `accruedPerFace` states as a fraction of face, and the form the sovereign calendar's holder
 * walk takes (`weeksOf`). Split out so the two cannot disagree about where a bond sits in its
 * period: the seed's sovereign side counted `since % 26` itself, which is the same arithmetic
 * written twice and reads a period the tranche did not state.
 */
/**
 * THE COUPON PERIOD A TRANCHE OF THIS SHAPE CARRIES when it states none — semi-annual for a fixed
 * bond, quarterly for a floater, once at maturity for CP. `engine2/tranches.ts:trancheScheduleOf`
 * applies exactly this to a stored ROW; this is the same answer for a deal whose row does not
 * exist yet, so a book that strikes new paper and the stage that issues it cannot disagree.
 */
export function defaultPeriodWeeks(t: TrancheSchedule): number {
  return Math.max(1, Math.round(52 / trancheePaymentsPerYear(t as DebtTranche)));
}

export function weeksAccrued(t: TrancheSchedule, week: number): number {
  const periodWeeks = defaultPeriodWeeks(t);
  const since = week - tranchePaymentAnchorWeek(t);
  // Commercial paper has no periods: it accrues from ISSUE to maturity and pays once, there.
  return t.isCommercialPaper ? Math.max(0, since) : (since <= 0 ? 0 : since % periodWeeks);
}

export function tranchePaymentAnchorWeek(t: { paymentAnchorWeek?: number; originationWeek: number }): number {
  return t.paymentAnchorWeek ?? t.originationWeek;
}

/**
 * HC3b — HOW FAST A MEASURED WEEK MOVES AN ANNUAL FIGURE.
 *
 * One week of clearing is not a year of trade: a firm that had a quiet week did not lose a
 * twelfth of its business, and one that had a good week did not double. So an annualised receipt
 * enters the firm's own revenue at this weight and the rest is what it was.
 *
 * It has one owner because it is one statement. `sme-pools.ts` had it privately as
 * `MARGIN_MEASUREMENT_WEIGHT` for exactly the same purpose on exactly the same quantity — a
 * pool's measured receipts and margin — and a named firm's revenue is the same measurement of
 * the same auction (rule 4).
 */
export const RECEIPTS_MEASUREMENT_WEIGHT = 0.08;

/** §7.284 — the vehicles this shell manages. The id-equality convention is the stated default,
 *  here and nowhere else; a shell with an explicit link reads the link. */
export function managedEntityIdsOf(comp: { id: EntityId; managesEntityIds?: EntityId[] }): EntityId[] {
  return comp.managesEntityIds ?? [comp.id];
}

/**
 * §5-WIRES D — DERIVED QUANTITIES ARE FUNCTIONS, NEVER FIELDS. A stored sum of stored fields can
 * disagree with its parts (O2's "market cap = price × shares" line existed because it did);
 * the read cannot. Market cap is what the market says a firm's shares are worth: its price times
 * its shares — zero for a firm nobody can buy (no price) or with no shares.
 */
/** Price times shares — the shares handed in by the caller that read them (`marketCapAt` reads
 *  the instrument index; the seed reads its stash). */
export const marketCapOf = (c: { stockPrice: number }, sharesOutstanding: number): number =>
  (c.stockPrice > 0 && sharesOutstanding > 0 ? c.stockPrice * sharesOutstanding : 0);

/**
 * Total debt off the OBJECT ARRAY. §3.13-READ C1 left this with exactly three callers, all in the
 * seed, and they are the only correct ones: `buildSeededGameState` runs before
 * `openSeededBooks`, so the tranche store has no rows yet and `debtTranches` is what the
 * generator wrote rather than a copy of anything.
 *
 * Everywhere else, read `ladderTotalLocal(v2, id)`. `core.ts:450` rebuilds this array from the
 * store ONCE a week, after every stage has run, so a mid-week read of it is the PREVIOUS week's
 * ladder — which is what 07e's equity marks, the borrow book, the LBO takeout, the merger
 * capacity test and the household private-equity line were all silently taking.
 */
export const totalDebtOf = (c: { debtTranches?: DebtTranche[] }): number =>
  (c.debtTranches ?? []).reduce((s, t) => s + t.principalLocal, 0);
