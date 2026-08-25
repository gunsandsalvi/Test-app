export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';
export type NecessityTier = 'Staple' | 'Standard' | 'Luxury';

export type Industry =
  | 'Energy' | 'MaterialsChemicals' | 'IndustrialsMachinery' | 'AerospaceDefense'
  | 'AutomotiveTransport' | 'TechHardwareSemis' | 'SoftwareDigitalServices' | 'Telecommunications'
  | 'HealthcarePharma' | 'ConsumerStaples' | 'ConsumerDiscretionaryRetail' | 'LuxuryGoods'
  | 'MediaEntertainment' | 'RealEstateConstruction';

export type BuyerType = 'HOUSEHOLD' | 'GOVERNMENT' | 'CORPORATE';

export interface IndustrySubUnit {
  unitId: string;
  label: string;
  buyerMix: Record<BuyerType, number>;
  unitPriceUSD: number;
}

export const INDUSTRY_SUBUNITS: Record<Industry, IndustrySubUnit[]> = {
  Energy: [
    { unitId: 'upstream_extraction', label: 'Upstream Extraction', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 }, unitPriceUSD: 0 },
    { unitId: 'refined_products', label: 'Refined Products', buyerMix: { HOUSEHOLD: 0.35, GOVERNMENT: 0.10, CORPORATE: 0.55 }, unitPriceUSD: 0 },
  ],
  MaterialsChemicals: [
    { unitId: 'industrial_chemicals', label: 'Industrial Chemicals', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0, CORPORATE: 1.0 }, unitPriceUSD: 0 },
    { unitId: 'household_chemicals', label: 'Household Chemicals', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 }, unitPriceUSD: 0 },
    { unitId: 'agricultural_chemicals', label: 'Agricultural Chemicals', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 }, unitPriceUSD: 0 },
    { unitId: 'specialty_metals', label: 'Specialty Metals & Mining', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 }, unitPriceUSD: 0 },
  ],
  IndustrialsMachinery: [
    { unitId: 'heavy_equipment', label: 'Heavy Equipment', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.20, CORPORATE: 0.80 }, unitPriceUSD: 0 },
    { unitId: 'industrial_automation', label: 'Industrial Automation', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.05, CORPORATE: 0.95 }, unitPriceUSD: 0 },
  ],
  AerospaceDefense: [
    { unitId: 'defense_systems', label: 'Defense Systems', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.90, CORPORATE: 0.10 }, unitPriceUSD: 0 },
    { unitId: 'commercial_aerospace', label: 'Commercial Aerospace', buyerMix: { HOUSEHOLD: 0.05, GOVERNMENT: 0.10, CORPORATE: 0.85 }, unitPriceUSD: 0 },
  ],
  AutomotiveTransport: [
    { unitId: 'passenger_vehicles', label: 'Passenger Vehicles', buyerMix: { HOUSEHOLD: 0.80, GOVERNMENT: 0.05, CORPORATE: 0.15 }, unitPriceUSD: 0 },
    { unitId: 'commercial_fleet', label: 'Commercial Fleet & Logistics Equipment', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.10, CORPORATE: 0.90 }, unitPriceUSD: 0 },
  ],
  TechHardwareSemis: [
    { unitId: 'semiconductors', label: 'Semiconductors', buyerMix: { HOUSEHOLD: 0.10, GOVERNMENT: 0.05, CORPORATE: 0.85 }, unitPriceUSD: 0 },
    { unitId: 'consumer_devices', label: 'Consumer Devices', buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0.02, CORPORATE: 0.13 }, unitPriceUSD: 0 },
  ],
  SoftwareDigitalServices: [
    { unitId: 'enterprise_software', label: 'Enterprise Software & Cloud', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.10, CORPORATE: 0.90 }, unitPriceUSD: 0 },
    { unitId: 'consumer_software', label: 'Consumer Software & Subscriptions', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 }, unitPriceUSD: 0 },
  ],
  Telecommunications: [
    { unitId: 'network_infrastructure', label: 'Network Infrastructure', buyerMix: { HOUSEHOLD: 0.55, GOVERNMENT: 0.10, CORPORATE: 0.35 }, unitPriceUSD: 0 },
  ],
  HealthcarePharma: [
    { unitId: 'pharmaceuticals', label: 'Pharmaceuticals', buyerMix: { HOUSEHOLD: 0.40, GOVERNMENT: 0.45, CORPORATE: 0.15 }, unitPriceUSD: 0 },
    { unitId: 'medtech_devices', label: 'Medical Devices', buyerMix: { HOUSEHOLD: 0.15, GOVERNMENT: 0.50, CORPORATE: 0.35 }, unitPriceUSD: 0 },
  ],
  ConsumerStaples: [
    { unitId: 'food_beverage', label: 'Food & Beverage', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 }, unitPriceUSD: 0 },
    { unitId: 'household_essentials', label: 'Household Essentials', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0.02, CORPORATE: 0.03 }, unitPriceUSD: 0 },
  ],
  ConsumerDiscretionaryRetail: [
    { unitId: 'apparel_retail', label: 'Apparel & General Retail', buyerMix: { HOUSEHOLD: 0.95, GOVERNMENT: 0, CORPORATE: 0.05 }, unitPriceUSD: 0 },
    { unitId: 'home_furnishings', label: 'Home Furnishings', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0, CORPORATE: 0.10 }, unitPriceUSD: 0 },
  ],
  LuxuryGoods: [
    { unitId: 'luxury_goods', label: 'Luxury Goods', buyerMix: { HOUSEHOLD: 1.0, GOVERNMENT: 0, CORPORATE: 0 }, unitPriceUSD: 0 },
  ],
  MediaEntertainment: [
    { unitId: 'media_content', label: 'Media & Content', buyerMix: { HOUSEHOLD: 0.85, GOVERNMENT: 0, CORPORATE: 0.15 }, unitPriceUSD: 0 },
  ],
  RealEstateConstruction: [
    { unitId: 'residential_construction', label: 'Residential Construction', buyerMix: { HOUSEHOLD: 0.90, GOVERNMENT: 0.05, CORPORATE: 0.05 }, unitPriceUSD: 0 },
    { unitId: 'commercial_construction', label: 'Commercial & Infrastructure Construction', buyerMix: { HOUSEHOLD: 0, GOVERNMENT: 0.45, CORPORATE: 0.55 }, unitPriceUSD: 0 },
  ],
};

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

export interface UnitBid { companyId: string; quantityUnits: number; maxPriceUSD: number; }
export interface UnitOffer { companyId: string; quantityUnits: number; minPriceUSD: number; }
export interface SupplyContract {
  supplierCompanyId: string; customerCompanyId: string; subUnitId: string;
  priceUSD: number; quantityUnitsPerWeek: number; weeksRemaining: number;
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
  unitPriceUSD?: number;
  totalUnitsSuppliedThisWeek?: number;
  totalUnitsDemandedThisWeek?: number;
}

export const CATEGORY_INPUT_REQUIREMENTS: Record<string, Partial<Record<string, number>>> = {
  TechHardwareSemis: { upstream_extraction: 0.008, specialty_metals: 0.010 },
  SoftwareDigitalServices: { upstream_extraction: 0.002 },
  AutomotiveTransport: { upstream_extraction: 0.025, specialty_metals: 0.030 },
  AerospaceDefense: { upstream_extraction: 0.020, specialty_metals: 0.025 },
  IndustrialsMachinery: { upstream_extraction: 0.015, specialty_metals: 0.020 },
  ConsumerStaples: { upstream_extraction: 0.001 },
  ConsumerDiscretionaryRetail: { upstream_extraction: 0.002 },
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
  _refinanceInitiated?: boolean;
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

export type CreditTier = 'SUPER_PRIME' | 'PRIME' | 'NEAR_PRIME' | 'SUBPRIME';
export interface CreditTierBook {
  tier: CreditTier;
  shareOfHouseholds: number;
  debtBalanceUSD: number;
  avgInterestRate: number;
  delinquencyRatePct: number;
}

export interface HouseholdState {
  consumerConfidence: number; // CCI, baseline 100
  creditTierBooks: CreditTierBook[];
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
  Energy: 0.80,
  MaterialsChemicals: 0.70,
  IndustrialsMachinery: 0.50,
  AerospaceDefense: 0.60,
  AutomotiveTransport: 0.55,
  TechHardwareSemis: 0.75,
  SoftwareDigitalServices: 0.85,
  Telecommunications: 0.20,
  HealthcarePharma: 0.30,
  ConsumerStaples: 0.05,
  ConsumerDiscretionaryRetail: 0.15,
  LuxuryGoods: 0.40,
  MediaEntertainment: 0.50,
  RealEstateConstruction: 0.02,
};

export type PrivateSegmentType = 'MANUFACTURING' | 'PROFESSIONAL_SERVICES' | 'RETAIL_TRADE' | 'CONSTRUCTION_REALESTATE' | 'HEALTHCARE_SERVICES';

export interface PrivateSectorSegment {
  segmentType: PrivateSegmentType;
  debtUSD: number;
  defaultRateAnnualPct: number;
  capexUSD: number;
  employment: number;
  annualRevenueUSD: number;
  marginPct: number;
  producedCommodityIds?: string[];
  commoditySupplyShareUSD?: Record<string, number>;
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


export interface SupplyRelationship {
  supplierCompanyId: string;
  customerCompanyId: string;
  category: string;
  weeklyVolumeUSD: number;
  relationshipStrength: number;
}

export interface Region {
  id: RegionId;
  name: string;
  categoryDemand: Record<string, CategoryDemandState>;
  activeContracts: SupplyContract[];
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
  estimatedHouseholdIncomeUSD: number; // aggregate regional household income proxy, grows with GDP
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
  fxReservesUSD: number; // raw USD
  structuralDeficitPctGdp: number;
  fiscalDeficitPctGdp: number; // e.g. 0.065 = 6.5% deficit
  debtToGdpPct: number; // e.g. 1.224 = 122.4% gross debt
  fiscalStanceScore: number;
  sovereignRating: CreditRating; // e.g. 'AAA', 'AA'
  laggedPolicyRateEMA: number;
  laborForceParticipation: number;
  inflationDeviationStreak: number;
  smoothedSlackGap?: number;
  policyRateLagBuffer: number[];
  wageGrowthLagBuffer: number[];
  demandShockLagBuffer: number[];

  // Population & Labor Force Accounting (Phase 1, Private-Sector Segments & Occupation Pools)
  totalPopulation: number;              // raw headcount, this world's own organic figure — not calibrated to any real country
  birthRateAnnual: number;
  deathRateAnnual: number;
  netMigrationRateAnnual: number;
  nonEmployablePct: number;             // fraction of population outside the labor force for demographic reasons (children, retired, students, disabled)
  governmentEmployment: number;         // raw headcount employed by government
  privateSectorSegments: PrivateSectorSegment[];
  supplyRelationships?: SupplyRelationship[]; // 5 real, distinct aggregate entities per region
  occupationPools: Record<OccupationType, OccupationPool>;
  occupationLaborForceShare: Record<OccupationType, number>;
  unemploymentRateBottomUp: number;     // diagnostic only this phase — residual of the labor-force identity, not yet driving anything

  // Government & Nominal GDP (Phase 2 & Phase 4)
  estimatedNominalGdpUSD: number;    // proxy until Phase 4 — replaced by the true C+I+G+NX sum then
  derivedNominalGdpUSD: number;      // C+I+G+NX, this world's own bottom-up sum
  gdpGrowthBottomUp: number;         // derived % change YoY
  lastWeekNominalGdpUSD: number;
  nominalGdpHistory: number[];       // rolling 52-week history of derivedNominalGdpUSD for YoY calculation
  consumptionComponentUSD: number;   // C, exposed for inspection
  investmentComponentUSD: number;    // I, exposed for inspection
  effectiveTaxRate: number;          // 0.28-0.35 typical; can drift with fiscal stance
  governmentRevenueUSD: number;
  governmentSpendingUSD: number;
  govDebtTranches: GovDebtTranche[];
  pendingUnfundedDeficitUSD?: number;
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

export interface QuarterlyIncomeStatement {
  revenue: number;
  cogs: number;
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
  annualRevenue?: number; // legacy optional fallback
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
  isBankEntity?: boolean;
  baselineAnnualRevenue: number;
  annualRevenue: number;
  productLines?: ProductLine[];
  primarySubUnitId?: string;
  finishedGoodsUnits?: number;
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
  rndExpense?: number;
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
  producedCommodityId?: string;
  demandShockLagBuffer?: number[];
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


export type CommodityQuantityUnit = 'BARREL' | 'MMBTU' | 'TROY_OZ' | 'TONNE';
export const COMMODITY_QUANTITY_UNIT: Record<string, CommodityQuantityUnit> = {
  WTI: 'BARREL', BRENT: 'BARREL', NATGAS: 'MMBTU',
  GOLD: 'TROY_OZ', SILVER: 'TROY_OZ',
  COPPER: 'TONNE', WHEAT: 'TONNE', CORN: 'TONNE', SOYBEANS: 'TONNE',
};
export const COMMODITY_CATEGORY_LINKAGE: Record<string, { subUnitId: string; intensityShare: number }> = {
  WTI: { subUnitId: 'upstream_extraction', intensityShare: 0.35 },
  BRENT: { subUnitId: 'upstream_extraction', intensityShare: 0.30 },
  NATGAS: { subUnitId: 'upstream_extraction', intensityShare: 0.20 },
  GOLD: { subUnitId: 'specialty_metals', intensityShare: 0.05 },
  SILVER: { subUnitId: 'specialty_metals', intensityShare: 0.08 },
  COPPER: { subUnitId: 'specialty_metals', intensityShare: 0.15 },
  WHEAT: { subUnitId: 'food_beverage', intensityShare: 0.04 },
  CORN: { subUnitId: 'food_beverage', intensityShare: 0.04 },
  SOYBEANS: { subUnitId: 'food_beverage', intensityShare: 0.03 },
  industrial_automation: { subUnitId: 'industrial_automation', intensityShare: 0.15 },
};

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
  weeklySupplyUnits?: number;
  weeklyDemandUnits?: number;
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

export type ProductCategory = Industry;
