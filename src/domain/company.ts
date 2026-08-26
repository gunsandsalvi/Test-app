
/**
 * Company & Corporate Fundamentals Domain Model
 *
 * Models corporate entities, product lines, debt tranches, 3-statement financial snapshots,
 * consensus estimates, credit ratings, and segment reporting.
 * Owned and updated by company fundamentals, bidding, and M&A/IPO simulation stages.
 */

import { RegionId } from './geography';
import { Industry } from './industry';
import { ItemizedHolding } from './banking';

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

  // Capital Structure
  leveragedLoan: LeveragedLoanInfo;
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
  institutionalRole: 'INSURER' | 'ASSET_MANAGER' | null;
  institutionalMarketShare?: number;
  beta: number;

  // Debt & CDS Pricing
  seniorBondYield: number;
  oasSpreadBps: number;
  cdsSpreadBps: number;

  // Sentiment & Production
  sentiment: number;
  inputSupplyConstraintFactor: number;
  // Output (finished-goods) inventory, keyed by sub-unit — a company producing multiple
  // product lines (e.g. semiconductors + consumer_devices + enterprise_software at once) holds
  // a genuinely separate inventory for each; a single shared scalar here was silently
  // overwritten by whichever line's weekly bidding pass ran last. See getOutputInventoryUSD /
  // getOutputInventoryUnits below for the aggregate reads most call sites actually want.
  outputInventoryBySubUnit: Record<string, { unitsHeld: number; valueUSD: number }>;
  inventoryCarryingCostRate: number;
  recentFulfillmentEMA: number;
  _targetProductionUSD?: number;
  treasuryHoldings: ItemizedHolding[];
  producedCommodityId?: string;
  demandShockLagBuffer?: number[];
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
