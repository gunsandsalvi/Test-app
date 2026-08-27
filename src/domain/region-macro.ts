/**
 * Regional Macroeconomy Domain Model
 *
 * Models regional macroeconomic aggregates, labor markets, wealth & income tiers, demographic life cycles,
 * housing markets, government debt, fiscal stance, central banking dot plots, and weather anomalies.
 * Written and updated by macro evolution, labor, and fiscal/monetary policy simulation stages.
 */

import { RegionId } from './geography';
import { BankingSector, AssetOwnershipShares } from './banking';
import { InstitutionalSector } from './institutions';
import { SupplyContract, CategoryDemandState, SupplyRelationship } from './market-microstructure';

export type WealthTier = 'BOTTOM_50' | 'NEXT_40' | 'TOP_9' | 'TOP_1';

export interface WealthTierData {
  shareOfHouseholds: number;
  shareOfIncomeUSD: number;
  shareOfNetWorthUSD: number;
  savingsRate: number;
  equityExposureShare: number;
  homeEquityUSD?: number;
}

export type LifeCycleStage = 'EARLY_CAREER' | 'PEAK_EARNING' | 'PRE_RETIREMENT' | 'RETIRED';

export interface LifeCycleStageData {
  shareOfPopulation: number;
  savingsRate: number;
  consumptionMultiplier: number;
}

export interface HousingMarket {
  regionId: RegionId;
  medianHomePriceUSD: number;
  baselineHomePriceUSD: number;
  priceIndex: number;
  historicalPrices: number[];
  ownershipRatePct: number;
  mortgageOriginationVolumeUSD: number;
}

export interface WeatherAnomaly {
  region: RegionId;
  title: string;
  type: 'Drought' | 'Heatwave' | 'Polar Vortex' | 'Monsoon' | 'Normal';
  severity: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  tempDeltaC: number;
  economicImpact: string;
  affectedCommodityId?: string;
  commodityImpactPct: number;
  gdpImpactPct: number;
  inflationImpactPct: number;
  weeksActive: number;
  minDurationWeeks?: number;
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
  consumerConfidence: number;
  creditTierBooks: CreditTierBook[];
  wageGrowth: number;
  savingsRate: number;
  realConsumptionGrowth: number;
  householdDebtToIncomeRatio: number;
  stapleSpendShare: number;
  standardSpendShare: number;
  luxurySpendShare: number;
  netWorthUSD: number;
  durableGoodsStockUnits?: number;
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
  tenorAtIssuanceYears: number;
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
  // This week's real capex-derived contribution to annualRevenueUSD, keyed by capex sub-unit
  // category (see 05-unit-bidding.ts) — tracked per category, not one shared scalar, because
  // several capex categories can route to the SAME segment (e.g. heavy_equipment,
  // industrial_automation, and commercial_fleet all fall to MANUFACTURING); a single shared
  // field meant each category's weekly update wrongly subtracted a DIFFERENT category's
  // just-written contribution as if it were its own prior week's value, corrupting
  // annualRevenueUSD every week multiple categories touched the same segment. Each category
  // subtracts only its own prior entry and writes only its own new one, so contributions from
  // different categories to the same segment add up instead of clobbering each other.
  capexDerivedAnnualRevenueUSDBySubUnit?: Record<string, number>;
  // 1$ is 1$ Phase 3: this week's real annualized contribution from acting as a named seller in
  // 05-unit-bidding.ts's auction (e.g. specialty_metals, which can otherwise have zero real
  // public-company suppliers in a region), keyed by sub-unit category for the identical
  // multiple-categories-one-segment reason as capexDerivedAnnualRevenueUSDBySubUnit above.
  realSupplySalesDerivedAnnualRevenueUSDBySubUnit?: Record<string, number>;
}

export type OccupationType = 'GENERAL' | 'SKILLED_TRADES' | 'TECHNICAL_ENGINEERING' | 'SPECIALIZED_PROFESSIONAL' | 'MANAGERIAL_FINANCIAL';

// Base annual wage by occupation is generated per-region from productivity — see
// engine/bootstrap/labor-and-wages.ts's getBaseAnnualWageUSD(regionId).

export interface OccupationPool {
  employed: number;
  wageIndex: number;
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
  estimatedHouseholdIncomeUSD: number;
  
  // Macro fundamentals
  policyRate: number;
  /**
   * WS6 — the cleared overnight general-collateral repo rate, an ANNUALISED decimal (same
   * convention as policyRate; the weekly accrual is this over 52). A market print solved each
   * week in stages/repo-clearing.ts from real bank funding needs against real lender cash,
   * with the administered facilities as the participants' own outside options — which is why
   * it lives inside the corridor without a clamp anywhere. One owner, region level; the banks'
   * sheets carry positions, never a second copy of the rate.
   */
  repoRateAnnual: number;
  neutralRate: number;
  inflation: number;
  coreInflation: number;
  /**
   * Real measured price level and its trailing year, produced by the CPI basket in
   * simulation/stages/price-index.ts from the prices stage 05's auction actually clears.
   * `inflation` and `coreInflation` above are the 52-week changes in these, not free parameters.
   */
  consumerPriceIndex: number;
  coreConsumerPriceIndex: number;
  cpiHistory: number[];
  coreCpiHistory: number[];
  cpiBasket: import('../engine/simulation/stages/price-index').CpiBasket;
  expectedInflation: number;
  centralBankBalanceSheet: number;
  balanceSheetStance: number;
  creditConditionsSpilloverAdjustment?: number;
  targetInflation: number;
  gdpGrowth: number;
  potentialGdpGrowth: number;
  nairu: number;
  weeksAboveNairu: number;
  unemploymentRate: number;
  wageGrowth: number;
  tradeBalance: number;
  exportsUSD: number;
  importsUSD: number;
  currentAccountPctGdp: number;
  fxReservesUSD: number;
  structuralDeficitPctGdp: number;
  cyclicalDeficitComponent?: number;
  govEmploymentGrowthRate?: number;
  fiscalDeficitPctGdp: number;
  debtToGdpPct: number;
  fiscalStanceScore: number;
  sovereignRating: 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D';
  laggedPolicyRateEMA: number;
  laborForceParticipation: number;
  inflationDeviationStreak: number;
  smoothedSlackGap?: number;
  policyRateLagBuffer: number[];
  wageGrowthLagBuffer: number[];
  demandShockLagBuffer: number[];

  // Population & Labor Force Accounting
  totalPopulation: number;
  birthRateAnnual: number;
  deathRateAnnual: number;
  netMigrationRateAnnual: number;
  nonEmployablePct: number;
  governmentEmployment: number;
  privateSectorSegments: PrivateSectorSegment[];
  supplyRelationships?: SupplyRelationship[];
  occupationPools: Record<OccupationType, OccupationPool>;
  occupationLaborForceShare: Record<OccupationType, number>;
  unemploymentRateBottomUp: number;

  // Government & Nominal GDP
  estimatedNominalGdpUSD: number;
  derivedNominalGdpUSD: number;
  gdpGrowthBottomUp: number;
  smoothedWeeklyGrowthRate: number;
  lastWeekNominalGdpUSD: number;
  nominalGdpHistory: number[];
  consumptionComponentUSD: number;
  investmentComponentUSD: number;
  effectiveTaxRate: number;
  governmentRevenueUSD: number;
  governmentSpendingUSD: number;
  govDebtTranches: GovDebtTranche[];
  pendingUnfundedDeficitUSD?: number;
  debtToGdpPctBottomUp: number;

  householdState: HouseholdState;

  // Wealth, Demographics & Housing
  wealthDistribution: Record<WealthTier, WealthTierData>;
  housingMarket: HousingMarket;
  lifeCycleDistribution: Record<LifeCycleStage, LifeCycleStageData>;

  // Central Banking Dot Plot Projections
  dotPlot1Y: number;
  dotPlot2Y: number;

  // Historical tracks
  historicalPolicyRates: number[];
  historicalInflation: number[];
  historicalCoreInflation: number[];
  historicalGdpGrowth: number[];
  historicalWageGrowth: number[];
  historicalDebtToGdp: number[];

  // Weather
  weather: WeatherAnomaly;

  // Sovereign Yield Curve
  yieldCurveParams: {
    beta0: number;
    beta1: number;
    beta2: number;
    lambda: number;
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
