export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';
export type NecessityTier = 'Staple' | 'Standard' | 'Luxury';
export type ProductCategory =
  | 'StapleHousehold' | 'StandardHousehold' | 'LuxuryHousehold'
  | 'CorporateIndustrial' | 'CorporateTech'
  | 'GovernmentDefense' | 'GovernmentInfrastructure' | 'GovernmentHealthcare';

export interface ProductLine {
  category: ProductCategory;
  revenueShare: number;
  categoryMarketShare: number;
  previousCategoryMarketShare: number;
  categoryMarketShare13WeeksAgo?: number;
  competitiveness: number;
}

export interface CategoryDemandState {
  demandLevelUSD: number;
  demandGrowthAnnual: number;
  demandHistory: number[];
  crowdingIntensity: number;
  inventoryLevelUSD: number;
  inputCostPressure: number;
  clearedInputPriceIndex: number; // 1.0 = baseline; rises/falls with genuine scarcity/glut
  lastWeekInventoryLevelUSD: number; // explicit lag anchor — bidders always react to this, never same-week inventory
  _fulfillmentRatio?: number; // transient, read by AA3 same week, not persisted
}

export const CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> = {
  CorporateTech: { CorporateIndustrial: 0.008 },
  StandardHousehold: { CorporateIndustrial: 0.00010 },
  LuxuryHousehold: { CorporateIndustrial: 0.00015 },
};


export type Sector = 'Tech' | 'Energy' | 'Financials' | 'Industrials' | 'Consumer' | 'Banks';

export interface DebtTranche {
  id: string;                  // format: "{ticker}-T{n}"
  principalUSD: number;
  rateType: 'FIXED' | 'FLOATING';
  couponRate?: number;         // FIXED only — locked annual rate, paid on principalUSD, never changes until maturity
  floatingMarginBps?: number;  // FLOATING only — locked spread over policyRate, never changes until maturity
  originationWeek: number;
  maturityWeek: number;
  seniority: 'SENIOR' | 'SUBORDINATED';
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
}

export interface AssetOwnershipShares {
  bankShare: number;
  institutionalShare: number; // insurers + asset managers
  foreignShare: Record<RegionId, number>; // this region's assets held by each of the other three
  centralBankShare: number; // meaningful only for sovereign bonds — 0 elsewhere
}

export interface ItemizedHolding {
  instrumentId: string; // for equity: company.id; for CORP_BOND/LEVERAGED_LOAN: the DebtTranche.id; for GOV_BOND: the GovDebtTranche.id
  instrumentType: 'EQUITY' | 'CORP_BOND' | 'LEVERAGED_LOAN' | 'GOV_BOND';
  issuerRegion: RegionId;
  quantityOrNotionalUSD: number; // dollar-denominated market value at cost, not share count — consistent with how the rest of this codebase tracks position size
}

export interface InstitutionalSector {
  corpBondHoldingsUSD: number;
  sovBondHoldingsUSD: number;
  equityHoldingsUSD: number;
  cashUSD: number;
  sectorEquityUSD: number;          // capital base of the insurers/asset managers as a group — analogous to bankEquityUSD
  investmentIncomeMarginPct: number; // analogous to netInterestMarginPct
  itemizedHoldings: ItemizedHolding[];
}

export type CreditRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';

export interface WeatherAnomaly {
  region: RegionId;
  title: string;
  type: 'Drought' | 'Heatwave' | 'Polar Vortex' | 'Monsoon' | 'Normal';
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  tempDeltaC: number;
  economicImpact: string;
  affectedCommodityId?: string;
  commodityImpactPct: number; // e.g. +0.08
  gdpImpactPct: number; // e.g. -0.002
  inflationImpactPct: number; // e.g. +0.003
  weeksActive: number;
}

export interface HouseholdState {
  consumerConfidence: number; // CCI, baseline 100
  wageGrowth: number;         // Average Hourly Earnings YoY %
  savingsRate: number;        // Personal Savings Rate %
  realConsumptionGrowth: number; // Real Consumer Spending Growth %
  householdDebtToIncomeRatio: number;
  stapleSpendShare: number;
  standardSpendShare: number;
  luxurySpendShare: number;
  netWorthUSD: number;
  depositsUSD: number;
  equityHoldingsUSD: number;
  mortgageDebtUSD: number;
  creditCardDebtUSD: number;
  otherConsumerLoanDebtUSD: number;
}

export interface GovDebtTranche {
  id: string;
  principalUSD: number;
  couponRate: number;
  originationWeek: number;
  maturityWeek: number;
  tenorAtIssuanceYears: number; // 2, 5, 10, or 30 — for curve-allocation tracking
}

export const CATEGORY_TRADABILITY: Record<string, number> = {
  StapleHousehold: 0.05,
  StandardHousehold: 0.15,
  LuxuryHousehold: 0.25,
  GovernmentDefense: 0.10,
  GovernmentInfrastructure: 0.05,
  GovernmentHealthcare: 0.05,
  CorporateIndustrial: 0.60,
  CorporateTech: 0.55,
};

export type PrivateSegmentType = 'MANUFACTURING' | 'PROFESSIONAL_SERVICES' | 'RETAIL_TRADE' | 'CONSTRUCTION_REALESTATE' | 'HEALTHCARE_SERVICES';

export interface PrivateSectorSegment {
  segmentType: PrivateSegmentType;
  employment: number;
  annualRevenueUSD: number;
  marginPct: number;
}

export type OccupationType = 'GENERAL' | 'SKILLED_TRADES' | 'TECHNICAL_ENGINEERING' | 'SPECIALIZED_PROFESSIONAL' | 'MANAGERIAL_FINANCIAL';

export const BASE_ANNUAL_WAGE_USD: Record<OccupationType, number> = {
  GENERAL: 42_000,
  SKILLED_TRADES: 62_000,
  TECHNICAL_ENGINEERING: 98_000,
  SPECIALIZED_PROFESSIONAL: 145_000,
  MANAGERIAL_FINANCIAL: 118_000,
};

export interface OccupationPool {
  employed: number;
  wageIndex: number; // relative wage level for this occupation, starts at 1.0, drifts with tightness
  wageGrowthAnnual: number;
}

export const SECTOR_OCCUPATION_MIX: Record<string, Partial<Record<OccupationType, number>>> = {
  Tech: { TECHNICAL_ENGINEERING: 0.55, MANAGERIAL_FINANCIAL: 0.15, GENERAL: 0.30 },
  Energy: { SKILLED_TRADES: 0.45, TECHNICAL_ENGINEERING: 0.25, GENERAL: 0.30 },
  Financials: { MANAGERIAL_FINANCIAL: 0.60, GENERAL: 0.40 },
  Banks: { MANAGERIAL_FINANCIAL: 0.55, GENERAL: 0.45 },
  Industrials: { SKILLED_TRADES: 0.40, TECHNICAL_ENGINEERING: 0.20, GENERAL: 0.40 },
  Consumer: { GENERAL: 0.85, MANAGERIAL_FINANCIAL: 0.15 },
  Healthcare: { SPECIALIZED_PROFESSIONAL: 0.50, GENERAL: 0.50 },
  Utilities: { SKILLED_TRADES: 0.40, TECHNICAL_ENGINEERING: 0.20, GENERAL: 0.40 },
};

export const PRIVATE_SEGMENT_OCCUPATION_MIX: Record<PrivateSegmentType, Partial<Record<OccupationType, number>>> = {
  MANUFACTURING: { SKILLED_TRADES: 0.45, TECHNICAL_ENGINEERING: 0.15, GENERAL: 0.40 },
  PROFESSIONAL_SERVICES: { TECHNICAL_ENGINEERING: 0.30, SPECIALIZED_PROFESSIONAL: 0.25, MANAGERIAL_FINANCIAL: 0.15, GENERAL: 0.30 },
  RETAIL_TRADE: { GENERAL: 0.92, MANAGERIAL_FINANCIAL: 0.08 },
  CONSTRUCTION_REALESTATE: { SKILLED_TRADES: 0.65, GENERAL: 0.35 },
  HEALTHCARE_SERVICES: { SPECIALIZED_PROFESSIONAL: 0.55, GENERAL: 0.45 },
};

export interface Region {
  id: RegionId;
  name: string;
  categoryDemand: Record<string, CategoryDemandState>;
  currency: string;
  symbol: string;
  centralBank: string;
  cycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery';
  inversionWeeksCount: number;
  recessionShockQueue: { week: number; shock: number }[];
  bankingSector: BankingSector;
  equityOwnership: AssetOwnershipShares;
  corpBondOwnership: AssetOwnershipShares;
  sovBondOwnership: AssetOwnershipShares;
  institutionalSector: InstitutionalSector;
  laggedCorporateDemandBase: number;
  estimatedHouseholdIncomeUSD: number; // aggregate regional household income proxy, in $M, grows with GDP
  // Macro fundamentals
  policyRate: number; // e.g. 0.045 = 4.50%
  neutralRate: number; // r* (e.g. 0.025)
  inflation: number; // pi_t headline (e.g. 0.029)
  coreInflation: number; // core CPI (e.g. 0.026)
  expectedInflation: number;
  wagePushInflation: number;
  monetaryInflationPressure: number;
  centralBankBalanceSheet: number;
  balanceSheetStance: number;
  creditConditionsSpilloverAdjustment?: number;
  targetInflation: number; // pi* (e.g. 0.020)
  gdpGrowth: number; // y_t (annualized, e.g. 0.022)
  potentialGdpGrowth: number; // y* (e.g. 0.020)
  nairu: number;
  weeksAboveNairu: number;
  unemploymentRate: number; // e.g. 0.041 = 4.1%
  wageGrowth: number; // e.g. 0.038 = 3.8%
  tradeBalance: number; // in USD equivalent (exportsUSD - importsUSD)
  exportsUSD: number;
  importsUSD: number;
  currentAccountPctGdp: number; // e.g. -0.031 = -3.1% of GDP
  fxReservesBlnUSD: number; // e.g. 38.5B USD
  structuralDeficitPctGdp: number;
  fiscalDeficitPctGdp: number; // e.g. 0.065 = 6.5% deficit
  debtToGdpPct: number; // e.g. 1.224 = 122.4% gross debt
  fiscalStanceScore: number;
  sovereignRating: CreditRating; // e.g. 'AAA', 'AA'
  laggedPolicyRateEMA: number;
  laborForceParticipation: number;
  inflationDeviationStreak: number;

  // Population & Labor Force Accounting (Phase 1, Private-Sector Segments & Occupation Pools)
  totalPopulation: number;              // raw headcount, this world's own organic figure — not calibrated to any real country
  birthRateAnnual: number;
  deathRateAnnual: number;
  netMigrationRateAnnual: number;
  nonEmployablePct: number;             // fraction of population outside the labor force for demographic reasons (children, retired, students, disabled)
  governmentEmployment: number;         // raw headcount employed by government
  privateSectorSegments: PrivateSectorSegment[]; // 5 real, distinct aggregate entities per region
  occupationPools: Record<OccupationType, OccupationPool>;
  occupationLaborForceShare: Record<OccupationType, number>;
  unemploymentRateBottomUp: number;     // diagnostic only this phase — residual of the labor-force identity, not yet driving anything

  // Government & Nominal GDP (Phase 2 & Phase 4)
  estimatedNominalGdpUSD: number;    // proxy until Phase 4 — replaced by the true C+I+G+NX sum then
  derivedNominalGdpUSD: number;      // C+I+G+NX, this world's own bottom-up sum
  gdpGrowthBottomUp: number;         // derived % change YoY
  nominalGdpHistory: number[];       // rolling 52-week history of derivedNominalGdpUSD for YoY calculation
  consumptionComponentUSD: number;   // C, exposed for inspection
  investmentComponentUSD: number;    // I, exposed for inspection
  effectiveTaxRate: number;          // 0.28-0.35 typical; can drift with fiscal stance
  governmentRevenueUSD: number;
  governmentSpendingUSD: number;
  govDebtTranches: GovDebtTranche[];
  debtToGdpPctBottomUp: number;

  householdState: HouseholdState;

  // Central Banking Dot Plot Projections (1Y & 2Y terminal target rates)
  dotPlot1Y: number; // Projected rate in 1 year
  dotPlot2Y: number; // Projected rate in 2 years
  
  // Historical tracks for time-series charts (at least 52 weeks buffered)
  historicalPolicyRates: number[];
  historicalInflation: number[];
  historicalCoreInflation: number[];
  historicalGdpGrowth: number[];
  historicalWageGrowth: number[];
  historicalDebtToGdp: number[];
  
  // Weather
  weather: WeatherAnomaly;
  
  // Sovereign Yield Curve (Nelson-Siegel parameters)
  yieldCurveParams: {
    beta0: number; // Long term level
    beta1: number; // Short term slope
    beta2: number; // Medium term curvature
    lambda: number; // Scale parameter
  };
  zeroRates: {
    tenor3M: number;
    tenor2Y: number;
    tenor5Y: number;
    tenor10Y: number;
    tenor30Y: number;
  };
  historicalZeroCurves: {
    week: number;
    tenor3M: number;
    tenor2Y: number;
    tenor5Y: number;
    tenor10Y: number;
    tenor30Y: number;
  }[];
}

export interface FxPair {
  pair: string; // e.g. "EUR/USD", "GBP/USD", "USD/JPY"
  base: RegionId;
  quote: RegionId;
  rate: number; // Units of quote per 1 base (e.g. 1.0850 USD per EUR)
  historicalRates: number[];
  change1W: number;
  basisSpreadBps: number; // Cross currency basis spread in bps (e.g. -15 bps)
}

export type TabKey = 'macro' | 'indices' | 'equities' | 'commodities' | 'bonds_cds' | 'derivatives' | 'risk';

export interface FundamentalSnapshot {
  week: number;
  filingPeriod: string;
  filingDate: string;
  annualRevenue: number;
  ebitda: number;
  ebit: number;
  netIncome: number;
  cash: number;
  totalDebt: number;
  leverage: number;
  interestCoverage: number;
  eps: number;
  creditRating: CreditRating;
}

export interface DealerEstimate {
  eps: number;
  revenue: number; // in millions
}

export interface ConsensusForecast {
  alpha: DealerEstimate; // Fundamentalist (margins, leverage)
  beta: DealerEstimate;  // Macro-driven (GDP, FX)
  gamma: DealerEstimate; // Momentum (aggressive growth)
  consensusEps: number;
  consensusRevenue: number;
}

export interface LeveragedLoanInfo {
  quotedMarginBps: number; // e.g. 375 bps
  referenceBenchmark: 'SOFR' | 'EURIBOR' | 'SONIA' | 'TONA';
  pricePar: number; // Points of par (e.g. 98.50)
  discountMarginBps: number; // Discount margin (e.g. 410 bps)
  tenorYears: number;
  seniority: 'Senior Secured First Lien';
  recoveryRate: number; // 0.65
}

export interface Company {
  id: string;
  ticker: string;
  name: string;
  region: RegionId;
  sector: Sector;
  
  // 3-Statement Fundamentals (Vectorized state)
  baselineAnnualRevenue: number;
  annualRevenue: number; // in millions
  productLines?: ProductLine[];
  employeeCount: number;
  previousEmployeeCount: number;
  baselineEmployeeCount: number;
  ebitda: number;
  baselineEbitdaMargin?: number;
  ebit: number;
  netIncome: number;
  eps: number;
  sharesOutstanding: number; // in millions
  cash: number; // in millions
  totalDebt: number; // in millions
  currentLiabilities: number; // in millions (for debt prepayment check)
  debtTranches: DebtTranche[];
  capex: number;
  previousCapex?: number;
  maintenanceCapex: number;
  growthCapex: number;
  baselineGrowthCapexToRevenueRatio: number;
  maintenanceShortfallStreak: number;
  executionQuality: number;
  occupationMixDrift: Partial<Record<OccupationType, number>>;
  
  // Asynchronous Quarterly Earnings Cycles (13-week staggered schedule)
  earningsWeekModulo: number; // 1 to 13
  lastEarningsReportWeek: number;
  reportedThisWeek: boolean;
  dealerConsensus: ConsensusForecast;
  lastEarningsSurprisePct: number; // e.g. +0.06 = +6.0% surprise
  lastManagementCommentary: string;
  
  // Capital Structure: Leveraged Loans, Senior Bonds, CDS, Options
  leveragedLoan: LeveragedLoanInfo;
  
  // Historical 4-turn statements
  historicalFundamentals: FundamentalSnapshot[];
  
  // Credit Metrics
  leverage: number; // Debt / EBITDA
  interestCoverage: number; // EBIT / Interest Expense
  creditRating: CreditRating;
  ratingHistory: CreditRating[];
  isDefaulted: boolean;
  recoveryRate: number; // 0.40 for bonds, 0.65 for senior secured loans
  baselineRecoveryRate: number;
  
  // Market & Pricing
  stockPrice: number;
  historicalPrices: number[];
  forwardPE: number;
  marketCap: number;
  dividendYield: number;
  baselineDividendYield: number;
  bankMarketShare?: number;
  institutionalRole: 'INSURER' | 'ASSET_MANAGER' | null;
  institutionalMarketShare?: number; // mirrors bankMarketShare exactly
  beta: number;
  
  // Debt & CDS Pricing
  seniorBondYield: number; // Sovereign benchmark + OAS
  oasSpreadBps: number; // Option adjusted spread in bps
  cdsSpreadBps: number; // CDS spread in bps
  
  // Dynamic Sentiment
  sentiment: number; // -1.0 (bearish) to +1.0 (bullish)
  inputSupplyConstraintFactor: number; // 0-1, how much of desired output this company can actually produce given input access this week

  // Production Economics & Finished Goods Inventory
  finishedGoodsInventoryUSD: number; // unsold output, carried at production cost
  inventoryCarryingCostRate: number; // small, sector-typical — storage, obsolescence, spoilage
  recentFulfillmentEMA: number; // EMA of supplier fulfillment ratio for responsive production
  _targetProductionUSD?: number; // transient
  treasuryHoldings: ItemizedHolding[];
}

export type AssetType = 
  | 'EQUITY' 
  | 'CORP_BOND' 
  | 'LEVERAGED_LOAN'
  | 'SOV_BOND' 
  | 'CDS' 
  | 'IRS' 
  | 'TRS' 
  | 'XCS' 
  | 'COMMODITY' 
  | 'OPTION'
  | 'FX_SPOT';

export interface Position {
  id: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  region: RegionId;
  dealerId: string;
  
  direction: 'LONG' | 'SHORT' | 'PAY_FIXED' | 'RECEIVE_FIXED' | 'BUY_PROTECTION' | 'SELL_PROTECTION';
  quantity: number; // Shares, Contracts, or Notional
  entryPrice: number; // Or entry rate / spread / points of par
  currentPrice: number;
  notional: number; // in USD
  
  trancheId?: string;              // set for CORP_BOND/LEVERAGED_LOAN positions — the specific tranche this position tracks
  rateType?: 'FIXED' | 'FLOATING'; // mirrors the tranche's type at entry
  entryOasSpreadBps?: number;
  entryPolicyRate?: number;
  entryBenchmarkYield?: number;
  isClosed?: boolean;

  // Derivative specifics
  tenorYears?: number;
  maturityWeek?: number;
  fixedRate?: number;
  strike?: number;
  optionType?: 'CALL' | 'PUT';
  expiryWeek?: number;
  underlyingPrice?: number;
  impliedVol?: number;
  
  // Margining & MTM
  marginRequirement: number; // Required initial margin
  maintenanceMargin: number;
  unrealizedPnL: number;
  realizedPnL: number;
  weeklyFinancingCost: number; // Repo or funding leg accrual
  expectedWeeklyCarryUSD?: number; // Pre-calculated or current 1W carry
  
  // Greeks / DV01
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  dv01?: number; // Dollar value of 1 bp shift
  
  openedWeek: number;
}

export interface Dealer {
  id: string;
  name: string;
  tagline: string;
  inventoryAxe: string; // e.g. "Axes: Credit & CDS Tight"
  axeBadge: string; // e.g. "Axe: Tight Credit/CDS"
  axeDescription: string;
  axeAssetClasses: AssetType[];
  axeDiscountPct: number; // e.g. 0.40 = 40% spread discount on axed classes
  spreadMultiplier: number; // Alpha = 1.0, Beta = 1.2, Gamma = 1.4
  baseSpreadBps: number;
  creditLimitUSD: number;
  currentExposureUSD: number;
  acceptedAssetClasses: AssetType[];
  color: string;
}

export interface ReturnAttribution {
  carryUSD: number; // Coupons, dividends, cash yield, financing costs
  macroRatesUSD: number; // Yield curve & DV01 shifts
  creditSpreadUSD: number; // OAS / CDS spread compression/widening
  equityDeltaUSD: number; // Stock & commodity directional moves
  volThetaUSD: number; // Option vega & theta time decay
}

export interface HistoricalBenchmarkRecord {
  week: number;
  nav: number;
  benchmark6040: number;
  cashHurdle: number;
}

export interface Portfolio {
  cashUSD: number;
  startingCapitalUSD: number;
  navUSD: number;
  previousNavUSD: number;
  historicalNav: number[];
  historicalBenchmarks: HistoricalBenchmarkRecord[];
  positions: Position[];
  closedPositionsCount: number;
  realizedPnLTotal: number;
  
  // Performance attribution breakdown
  cumulativeAttribution: ReturnAttribution;
  lastWeekAttribution: ReturnAttribution;
  
  // Margining & Risk
  totalRequiredMarginUSD: number;
  maintenanceMarginUSD: number;
  marginUtilizationPct: number; // 0 to 100%
  isMarginCall: boolean;
  marginCallWarning: string | null;
  totalLeverage: number;
  
  // Aggregate Portfolio Greeks
  netDeltaUSD: number;
  netGammaUSD: number;
  netVegaUSD: number;
  netDV01USD: number;
}

export interface Commodity {
  id: string;
  name: string;
  symbol: string;
  category: 'Energy' | 'Metals' | 'Agriculture';
  unit: string;
  spotPrice: number;
  historicalPrices: number[];
  convenienceYield: number; // q
  futures1M: number;
  futures3M: number;
  futures6M: number;
  change1W: number;
  volatility: number;
  // Cash and carry supply / demand balance
  supplyDemandBalance: 'Deficit (Tight Supply)' | 'Balanced' | 'Surplus (Oversupplied)';
  inventoryLevelPct: number; // e.g. 42% (low = backwardation)
}

export interface IndexMetric {
  name: string;
  symbol: string;
  value: number;
  change1W: number;
  historical: number[];
  unit: string;
}

export interface CompositeBenchmarkIndices {
  us500: IndexMetric;
  usIgOas: IndexMetric;
  usHyOas: IndexMetric;
  
  euStoxx: IndexMetric;
  euIgOas: IndexMetric;
  euHyOas: IndexMetric;
  
  uk100: IndexMetric;
  ukIgOas: IndexMetric;
  ukHyOas: IndexMetric;
  
  jp225: IndexMetric;
  jpIgOas: IndexMetric;
  jpHyOas: IndexMetric;
  
  global10YBenchmark: IndexMetric;
  gsciCommodity: IndexMetric;
  
  techIndex: IndexMetric;
  financialsIndex: IndexMetric;
  energyIndex: IndexMetric;
  industrialsIndex: IndexMetric;
  
  globalCreditComposite: IndexMetric;
  marketBreadth: number;
  pmiComposite: {
    headline: number;
    demandComponent: number;
    capexComponent: number;
    employmentComponent: number;
  };
}

export interface NewsItem {
  id: string;
  week: number;
  title: string;
  description: string;
  category: 'CENTRAL_BANK' | 'MACRO' | 'EARNINGS' | 'CREDIT' | 'GEOPOLITICS' | 'COMMODITY' | 'WEATHER';
  impactBadge: string; // e.g. '[HIGH IMPACT]', '[RATES +25bps]', '[CREDIT DOWNGRADE]', '[WEATHER ALERT]'
  impactRegion?: RegionId;
  impactSector?: Sector;
  sentimentDelta: number; // e.g. +0.15 or -0.20
  affectedTicker?: string;
  urgent: boolean;
  tradeShortcut?: TradeableInstrument;
}

export interface DiagnosticsLog {
  week: number;
  timestamp: string;
  category: 'MACRO' | 'MICRO' | 'EARNINGS' | 'CREDIT' | 'CONTAGION' | 'EXECUTION';
  message: string;
  deltaText?: string;
  data?: Record<string, any>;
}

export interface ChartModalData {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  ticker?: string;
  unit: string;
  currentVal: number;
  change1W: number;
  historicalSeries: number[];
  tradeableInstrument?: TradeableInstrument;
}

export interface GameState {
  currentWeek: number;
  year: number;
  regions: Record<RegionId, Region>;
  fxPairs: FxPair[];
  companies: Company[];
  commodities: Commodity[];
  compositeIndices: CompositeBenchmarkIndices;
  recentIPOs: { ticker: string; name: string; category: string; week: number }[];
  recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[];
  marketVolPremium?: number;
  dealers: Dealer[];
  portfolio: Portfolio;
  newsFeed: NewsItem[];
  watchlist: string[]; // Tickers or symbol IDs
  turnSummary: {
    week: number;
    pnlDeltaUSD: number;
    pnlDeltaPct: number;
    interestIncomeUSD: number;
    financingCostUSD: number;
    defaultedCompanies: string[];
    ratingsChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[];
    earningsReported: { ticker: string; name: string; actualEps: number; consensusEps: number; surprisePct: number }[];
    marginAlert: string | null;
    attribution: ReturnAttribution;
  } | null;
  selectedTab: TabKey;
  isTradeModalOpen: boolean;
  selectedInstrument: TradeableInstrument | null;
  isNewsDrawerOpen: boolean;
  isWatchlistDrawerOpen: boolean;
  isCheatsheetOpen: boolean;
  isDiagnosticsOpen: boolean;
  diagnosticsLogs: DiagnosticsLog[];
  chartModalData: ChartModalData | null;
  isGameOver: boolean;
  gameOverReason: string | null;
}

export interface TradeableInstrument {
  assetType: AssetType;
  id: string;
  symbol: string;
  name: string;
  region: RegionId;
  price: number;
  quoteUnit: string;
  details: {
    sector?: Sector;
    rating?: CreditRating;
    leverage?: number;
    tenorYears?: number;
    couponRate?: number;
    trancheId?: string;
    rateType?: "FIXED" | "FLOATING";
    fixedRate?: number;
    floatingMarginBps?: number;
    oasSpreadBps?: number;
    cdsSpreadBps?: number;
    quotedMarginBps?: number;
    discountMarginBps?: number;
    referenceBenchmark?: string;
    impliedVol?: number;
    delta?: number;
    gamma?: number;
    vega?: number;
    strike?: number;
    optionType?: 'CALL' | 'PUT';
    baseCurrency?: string;
    quoteCurrency?: string;
    convenienceYield?: number;
    dividendYield?: number;
  };
}
