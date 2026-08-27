
/**
 * Company & Corporate Fundamentals Domain Model
 *
 * Models corporate entities, product lines, debt tranches, 3-statement financial snapshots,
 * consensus estimates, credit ratings, and segment reporting.
 * Owned and updated by company fundamentals, bidding, and M&A/IPO simulation stages.
 */

import { RegionId } from './geography';
import { Industry } from './industry';
import { ItemizedHolding, BankingSector } from './banking';

export type FinancialStatementProfile = 'STANDARD_OPERATING' | 'INSURER' | 'ASSET_MANAGER' | 'BANK' | 'REIT';

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
  financialStatementProfile?: FinancialStatementProfile;
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
  rndExpense?: number;
  baselineGrowthCapexToRevenueRatio: number;
  maintenanceShortfallStreak: number;
  executionQuality: number;
  occupationMixDrift: Partial<Record<string, number>>;

  // Quarterly Earnings
  earningsWeekModulo: number;
  lastEarningsReportWeek: number;
  reportedThisWeek: boolean;
  dealerConsensus: ConsensusForecast;
  lastEarningsSurprisePct: number;
  lastManagementCommentary: string;

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
   * Absent on companies generated before this field existed — treat undefined as 'PUBLIC'
   * (see isPubliclyListed below).
   */
  listingStatus?: 'PUBLIC' | 'PRIVATE';
  /**
   * Who owns a private company's equity. Founders/family by default; PE sponsor fields are
   * filled by HC4/HC6 when sponsors become real entities with real committed capital. On public
   * companies the real register is the share-ownership model (WS4) — this block is only
   * meaningful while listingStatus is PRIVATE.
   */
  ownership?: { founderPct: number; peSponsorId?: string; peSponsorPct?: number };
  // Mirrors InstitutionalEntityType in domain/institutions.ts; inlined because that module
  // already imports from this one and a type import here would close the cycle.
  /** Week this company first defaulted — lets credit contagion decay out of a rolling window
   *  instead of counting every default that ever happened (S8). */
  defaultedWeek?: number;
  institutionalRole: 'INSURER' | 'ASSET_MANAGER' | 'PENSION_FUND' | 'HEDGE_FUND' | null;
  institutionalMarketShare?: number;
  beta: number;

  // Debt & CDS Pricing
  seniorBondYield: number;
  oasSpreadBps: number;
  cdsSpreadBps: number;
  // Rolling weekly history of real cleared oasSpreadBps (most recent last, capped length) — real
  // credit investors weigh recent spread momentum (a name that's been widening fast is a riskier
  // "catch the falling knife" buy even if it already looks cheap) alongside static fair value.
  // See 07b-corporate-bond-clearing.ts's attractiveness scoring.
  oasSpreadBpsHistory?: number[];

  // Sentiment & Production
  sentiment: number;
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
  // bought from (a real company ticker, or a private-segment id like "PRIVATE:MANUFACTURING")
  // and the real price paid — credited in 05-unit-bidding.ts when a purchase clears (both
  // contract-settlement and open-market, the latter via an explicit buyer/seller lot allocation,
  // not just an aggregate total), consumed oldest-lot-first in 08-company-fundamentals.ts.
  inputInventoryBySubUnit?: Record<string, InputLot[]>;
  inventoryCarryingCostRate: number;
  recentFulfillmentEMA: number;
  _targetProductionUSD?: number;
  // 1$ is 1$ Phase 6: this week's real settled sales/purchases (from 05-unit-bidding.ts's
  // actual bid/offer clearing — open-market plus active-contract volume) — persisted onto the
  // company so the UI can show real weekly production/purchasing activity, not just the target.
  lastWeekSalesUSD?: number;
  lastWeekPurchasesUSD?: number;
  treasuryHoldings: ItemizedHolding[];
  producedCommodityId?: string;
  demandShockLagBuffer?: number[];
}
/** Public-market membership test. Undefined (pre-HC companies) reads as PUBLIC. */
export function isPubliclyListed(c: Pick<Company, 'listingStatus'>): boolean {
  return c.listingStatus !== 'PRIVATE';
}

export function isActiveCompany(c: Company): boolean { return !c.isDefaulted && !c.mergerAcquired; }

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
