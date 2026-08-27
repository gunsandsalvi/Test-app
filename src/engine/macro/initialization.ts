import { NelsonSiegelParams, calculateTenorZeroRates, calculateNelsonSiegelZeroRate } from '../nelsonSiegel';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, OccupationType, OccupationPool, CreditTierBook, INDUSTRY_SUBUNITS, WealthTier, WealthTierData, HousingMarket, LifeCycleStage, LifeCycleStageData, PrivateSectorSegment, PrivateSegmentType, GovDebtTranche } from '../../types';
import { generate52WeekHistory } from './utils';
import { INITIAL_WEATHER } from './weather';
import { getRegionPopulation, getRegionProductivityPerCapitaUSD } from '../bootstrap/population';
import { getBaseAnnualWageUSD } from '../bootstrap/labor-and-wages';
import { deriveSubUnitUnitPrice, TARGET_FIRMS_PER_REGION } from '../bootstrap/category-demand';
import { GENERATED_COMMODITIES, GENERATED_FX_PAIR_LEGS, getInitialFxRate, getCommodityBaseSpotPrice } from '../bootstrap/commodities-and-fx';
import { getRegionYieldCurveParams, getRegionNeutralRate, getRegionInitialPolicyRate, getRegionProductivityGrowth, INFLATION_TARGET } from '../bootstrap/yield-curves';

export function createWealthDistribution(estimatedHouseholdIncomeUSD: number): Record<WealthTier, WealthTierData> {
  const inc = estimatedHouseholdIncomeUSD;
  const nw = inc * 3.5;
  return {
    BOTTOM_50: {
      shareOfHouseholds: 0.50,
      shareOfIncomeUSD: Number((inc * 0.15).toFixed(0)),
      shareOfNetWorthUSD: Number((nw * 0.02).toFixed(0)),
      savingsRate: 0.01,
      equityExposureShare: 0.05,
      homeEquityUSD: Number((nw * 0.01).toFixed(0)),
    },
    NEXT_40: {
      shareOfHouseholds: 0.40,
      shareOfIncomeUSD: Number((inc * 0.45).toFixed(0)),
      shareOfNetWorthUSD: Number((nw * 0.28).toFixed(0)),
      savingsRate: 0.06,
      equityExposureShare: 0.25,
      homeEquityUSD: Number((nw * 0.18).toFixed(0)),
    },
    TOP_9: {
      shareOfHouseholds: 0.09,
      shareOfIncomeUSD: Number((inc * 0.25).toFixed(0)),
      shareOfNetWorthUSD: Number((nw * 0.38).toFixed(0)),
      savingsRate: 0.18,
      equityExposureShare: 0.50,
      homeEquityUSD: Number((nw * 0.12).toFixed(0)),
    },
    TOP_1: {
      shareOfHouseholds: 0.01,
      shareOfIncomeUSD: Number((inc * 0.15).toFixed(0)),
      shareOfNetWorthUSD: Number((nw * 0.32).toFixed(0)),
      savingsRate: 0.35,
      equityExposureShare: 0.70,
      homeEquityUSD: Number((nw * 0.04).toFixed(0)),
    },
  };
}

// Structural house-price-to-income and household-size coefficients, applied to the region's
// own generated income primitive — replacing the previous per-region literal base prices.
const AVG_HOUSEHOLD_SIZE = 2.5;
const HOME_PRICE_TO_HOUSEHOLD_INCOME_MULTIPLE = 4.2;
const HOME_OWNERSHIP_RATE = 0.62;

export function createHousingMarket(regionId: RegionId, estimatedHouseholdIncomeUSD: number, population: number): HousingMarket {
  const households = Math.max(1, population / AVG_HOUSEHOLD_SIZE);
  const perHouseholdIncome = estimatedHouseholdIncomeUSD / households;
  const basePrice = Number((perHouseholdIncome * HOME_PRICE_TO_HOUSEHOLD_INCOME_MULTIPLE).toFixed(0));
  return {
    regionId,
    medianHomePriceUSD: basePrice,
    baselineHomePriceUSD: basePrice,
    priceIndex: 1.0,
    historicalPrices: Array(52).fill(basePrice),
    ownershipRatePct: HOME_OWNERSHIP_RATE,
    mortgageOriginationVolumeUSD: estimatedHouseholdIncomeUSD * 0.05,
  };
}

export function createLifeCycleDistribution(): Record<LifeCycleStage, LifeCycleStageData> {
  return {
    EARLY_CAREER: { shareOfPopulation: 0.28, savingsRate: 0.02, consumptionMultiplier: 1.10 },
    PEAK_EARNING: { shareOfPopulation: 0.35, savingsRate: 0.12, consumptionMultiplier: 1.00 },
    PRE_RETIREMENT: { shareOfPopulation: 0.17, savingsRate: 0.20, consumptionMultiplier: 0.85 },
    RETIRED: { shareOfPopulation: 0.20, savingsRate: -0.05, consumptionMultiplier: 0.75 },
  };
}

export function createInitialCategoryDemand(
  gdpGrowth: number,
  estimatedHouseholdIncome: number,
  estimatedNominalGdp: number,
  population: number,
  firmCount: number
): Record<string, any> {
  const C = estimatedHouseholdIncome * 0.94;
  const G = estimatedNominalGdp * 0.35;
  const I = estimatedNominalGdp * 0.15;

  let totalHhWeight = 0;
  let totalGovWeight = 0;
  let totalCorpWeight = 0;

  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      totalHhWeight += su.buyerMix.HOUSEHOLD;
      totalGovWeight += su.buyerMix.GOVERNMENT;
      totalCorpWeight += su.buyerMix.CORPORATE;
    });
  });

  const cd: Record<string, any> = {};
  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
      const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
      const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
      const demandLevelUSD = suHhDemand + suGovDemand + suCorpDemand;
      const unitPriceUSD = deriveSubUnitUnitPrice(demandLevelUSD, su.buyerMix, population, firmCount);

      cd[su.unitId] = {
        demandLevelUSD,
        demandGrowthAnnual: gdpGrowth,
        demandHistory: [demandLevelUSD],
        crowdingIntensity: 0.1,
        inventoryLevelUSD: demandLevelUSD * 0.10,
        inputCostPressure: 0,
        clearedInputPriceIndex: 1.0,
        upstreamScarcityIndex: 1.0,
        lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
        unitPriceUSD,
      };
    });
  });
  return cd;
}

function generateCreditTierBooks(creditCardDebtUSD: number, otherConsumerLoanDebtUSD: number): CreditTierBook[] {
  const totalDebt = creditCardDebtUSD + otherConsumerLoanDebtUSD;
  return [
    { tier: 'SUPER_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: totalDebt * 0.25, avgInterestRate: 0.08, delinquencyRatePct: 0.005 },
    { tier: 'PRIME', shareOfHouseholds: 0.35, debtBalanceUSD: totalDebt * 0.35, avgInterestRate: 0.12, delinquencyRatePct: 0.02 },
    { tier: 'NEAR_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: totalDebt * 0.25, avgInterestRate: 0.18, delinquencyRatePct: 0.06 },
    { tier: 'SUBPRIME', shareOfHouseholds: 0.15, debtBalanceUSD: totalDebt * 0.15, avgInterestRate: 0.25, delinquencyRatePct: 0.15 },
  ];
}

// Structural region identifiers (currency/central-bank labels), not numeric data.
const REGION_IDENTITY: Record<RegionId, { name: string; currency: string; symbol: string; centralBank: string; sovereignRating: Region['sovereignRating'] }> = {
  USA: { name: 'United States', currency: 'USD', symbol: '$', centralBank: 'Federal Reserve', sovereignRating: 'AA' },
  UK: { name: 'United Kingdom', currency: 'GBP', symbol: '£', centralBank: 'Bank of England', sovereignRating: 'AA' },
  JPN: { name: 'Japan', currency: 'JPY', symbol: '¥', centralBank: 'Bank of Japan', sovereignRating: 'A' },
  EUR: { name: 'Eurozone', currency: 'EUR', symbol: '€', centralBank: 'European Central Bank', sovereignRating: 'AAA' },
};

// Structural fiscal/demographic/ownership coefficients shared across regions. These are
// modeling ratios (out of the "no real-world data" scope, same category as sector demand
// intensities elsewhere), not observed per-region statistics.
const LABOR_FORCE_PARTICIPATION = 0.63;
const NON_EMPLOYABLE_PCT = 0.36;
const UNEMPLOYMENT_RATE = 0.045;
const BIRTH_RATE_ANNUAL = 0.010;
const DEATH_RATE_ANNUAL = 0.0095;
const NET_MIGRATION_RATE_ANNUAL = 0.002;
const EFFECTIVE_TAX_RATE = 0.31;
const FISCAL_DEFICIT_PCT_GDP = 0.05;
const DEBT_TO_GDP_PCT = 1.0;
const GOV_EMPLOYMENT_SHARE_OF_POPULATION = 0.055;

const BANK_BALANCE_SHEET_RATIOS = {
  businessLoanBookToGdp: 0.040,
  consumerLoanBookToGdp: 0.070,
  depositsToGdp: 0.110,
  sovereignBondHoldingsToGdp: 0.020,
  cashReservesToGdp: 0.011,
  bankEquityToGdp: 0.014,
  centralBankReservesToGdp: 0.060,
  centralBankBalanceSheetToGdp: 0.44,
};
const NIM_TO_POLICY_RATE_RATIO = 0.55;
const NIM_FLOOR = 0.008;
const BANK_CAPITAL_RATIO = 0.13;
const LOAN_LOSS_PROVISION_RATE = 0.008;

const OWNERSHIP_SHARES = {
  equity: { bankShare: 0.03, institutionalShare: 0.42, foreignShareEach: 0.05, centralBankShare: 0 },
  corpBond: { bankShare: 0.28, institutionalShare: 0.45, foreignShareEach: 0.04, centralBankShare: 0 },
  sovBond: { bankShare: 0.22, institutionalShare: 0.30, foreignShareEach: 0.08, centralBankShare: 0.15 },
};

function buildForeignShare(regionId: RegionId, each: number): Record<RegionId, number> {
  const all: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const result = {} as Record<RegionId, number>;
  all.forEach((r) => { result[r] = r === regionId ? 0 : each; });
  return result;
}

const INSTITUTIONAL_SECTOR_RATIOS = { cashToGdp: 0.010, sectorEquityToGdp: 0.012, investmentIncomeMargin: 0.028 };

const PRIVATE_SEGMENT_PROFILE: Record<PrivateSegmentType, { employmentShare: number; revenueToGdp: number; marginPct: number }> = {
  MANUFACTURING: { employmentShare: 0.150, revenueToGdp: 0.110, marginPct: 0.09 },
  PROFESSIONAL_SERVICES: { employmentShare: 0.120, revenueToGdp: 0.090, marginPct: 0.14 },
  RETAIL_TRADE: { employmentShare: 0.180, revenueToGdp: 0.095, marginPct: 0.05 },
  CONSTRUCTION_REALESTATE: { employmentShare: 0.090, revenueToGdp: 0.065, marginPct: 0.10 },
  HEALTHCARE_SERVICES: { employmentShare: 0.060, revenueToGdp: 0.050, marginPct: 0.12 },
};
const MANUFACTURING_COMMODITY_SUPPLY_SHARE = 0.0375; // share of MANUFACTURING segment revenue, per linked commodity
const MANUFACTURING_LINKED_COMMODITIES = ['COPPER', 'WHEAT', 'CORN', 'SOYBEANS'];

const GOV_DEBT_TENOR_WEIGHTS: { tenorYears: number; tenorWeeks: number; weight: number }[] = [
  { tenorYears: 2, tenorWeeks: 104, weight: 0.30 },
  { tenorYears: 5, tenorWeeks: 260, weight: 0.30 },
  { tenorYears: 10, tenorWeeks: 520, weight: 0.25 },
  { tenorYears: 30, tenorWeeks: 1560, weight: 0.15 },
];

const HOUSEHOLD_DEBT_RATIOS = { creditCardToIncome: 0.075, otherConsumerLoanToIncome: 0.133, mortgageToIncome: 0.90, depositsToIncome: 0.65, equityHoldingsToIncome: 1.8 };
const HOUSEHOLD_SAVINGS_RATE = 0.065;
const HOUSEHOLD_SPEND_SHARES = { staple: 0.35, standard: 0.50, luxury: 0.15 };

function buildRegion(regionId: RegionId): Region {
  const identity = REGION_IDENTITY[regionId];
  const totalPopulation = getRegionPopulation(regionId);
  const productivityPerCapita = getRegionProductivityPerCapitaUSD(regionId);

  const yieldCurveParams = getRegionYieldCurveParams(regionId);
  const zeroRates = calculateTenorZeroRates(yieldCurveParams);
  const neutralRate = getRegionNeutralRate(regionId);
  const policyRate = getRegionInitialPolicyRate(regionId);
  const gdpGrowth = getRegionProductivityGrowth(regionId);
  const targetInflation = INFLATION_TARGET;
  const wageGrowth = Number((gdpGrowth + targetInflation).toFixed(4));

  const totalLaborForce = totalPopulation * (1 - NON_EMPLOYABLE_PCT) * LABOR_FORCE_PARTICIPATION;
  const totalEmployed = totalLaborForce * (1 - UNEMPLOYMENT_RATE);
  const estimatedNominalGdpUSD = Number((totalEmployed * productivityPerCapita).toFixed(0));
  const governmentEmployment = Math.round(totalPopulation * GOV_EMPLOYMENT_SHARE_OF_POPULATION);

  const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
  const occupationLaborForceShare: Record<OccupationType, number> = {
    GENERAL: 0.55,
    SKILLED_TRADES: 0.15,
    TECHNICAL_ENGINEERING: 0.12,
    SPECIALIZED_PROFESSIONAL: 0.08,
    MANAGERIAL_FINANCIAL: 0.10,
  };
  const occupationPools: Record<OccupationType, OccupationPool> = {} as Record<OccupationType, OccupationPool>;
  (Object.keys(occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
    occupationPools[occ] = {
      employed: Math.round(totalEmployed * occupationLaborForceShare[occ]),
      wageIndex: 1.0,
      wageGrowthAnnual: wageGrowth,
    };
  });
  const estimatedHouseholdIncomeUSD = Number(((Object.keys(occupationPools) as OccupationType[]).reduce(
    (sum, occ) => sum + baseAnnualWageUSD[occ] * occupationPools[occ].employed, 0
  ) * 1.15).toFixed(0)); // wage income + 15% capital income, matching the downstream capital-income convention

  const governmentRevenueUSD = Number(((estimatedNominalGdpUSD * EFFECTIVE_TAX_RATE) / 52).toFixed(0));
  const governmentSpendingUSD = Number((governmentRevenueUSD + (estimatedNominalGdpUSD * FISCAL_DEFICIT_PCT_GDP) / 52).toFixed(0));
  const lastWeekNominalGdpUSD = estimatedNominalGdpUSD;

  const netInterestMarginPct = Number(Math.max(NIM_FLOOR, policyRate * NIM_TO_POLICY_RATE_RATIO + 0.005).toFixed(4));
  const bankingSector = {
    businessLoanBookUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.businessLoanBookToGdp).toFixed(0)),
    consumerLoanBookUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.consumerLoanBookToGdp).toFixed(0)),
    depositsUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.depositsToGdp).toFixed(0)),
    sovereignBondHoldingsUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.sovereignBondHoldingsToGdp).toFixed(0)),
    cashReservesUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.cashReservesToGdp).toFixed(0)),
    bankEquityUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.bankEquityToGdp).toFixed(0)),
    bankCapitalRatio: BANK_CAPITAL_RATIO,
    netInterestMarginPct,
    loanLossProvisionRateAnnualPct: LOAN_LOSS_PROVISION_RATE,
    creditConditionsIndex: 0,
    centralBankReservesUSD: Number((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.centralBankReservesToGdp).toFixed(0)),
    moneySupplyM2USD: 0,
    itemizedHoldings: [],
    srfBorrowingUSD: 0,
    onRrpLendingUSD: 0,
  };

  const institutionalSector = {
    corpBondHoldingsUSD: 0,
    sovBondHoldingsUSD: 0,
    equityHoldingsUSD: 0,
    cashUSD: Number((estimatedNominalGdpUSD * INSTITUTIONAL_SECTOR_RATIOS.cashToGdp).toFixed(0)),
    sectorEquityUSD: Number((estimatedNominalGdpUSD * INSTITUTIONAL_SECTOR_RATIOS.sectorEquityToGdp).toFixed(0)),
    investmentIncomeMarginPct: INSTITUTIONAL_SECTOR_RATIOS.investmentIncomeMargin,
    itemizedHoldings: [],
  };

  const totalGovDebtUSD = estimatedNominalGdpUSD * DEBT_TO_GDP_PCT;
  const govDebtTranches: GovDebtTranche[] = GOV_DEBT_TENOR_WEIGHTS.map(({ tenorYears, tenorWeeks, weight }) => ({
    id: `${regionId}-GOV-${tenorYears}Y-INIT`,
    principalUSD: Number((totalGovDebtUSD * weight).toFixed(0)),
    couponRate: Number(calculateNelsonSiegelZeroRate(tenorYears, yieldCurveParams).toFixed(4)),
    originationWeek: -Math.round(tenorWeeks / 2),
    maturityWeek: Math.round(tenorWeeks / 2),
    tenorAtIssuanceYears: tenorYears,
  }));

  const creditCardDebtUSD = Number((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.creditCardToIncome).toFixed(0));
  const otherConsumerLoanDebtUSD = Number((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.otherConsumerLoanToIncome).toFixed(0));
  const mortgageDebtUSD = Number((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.mortgageToIncome).toFixed(0));
  const depositsUSD = Number((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.depositsToIncome).toFixed(0));
  const equityHoldingsUSD = Number((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.equityHoldingsToIncome).toFixed(0));
  const householdDebtToIncomeRatio = Number(((mortgageDebtUSD + creditCardDebtUSD + otherConsumerLoanDebtUSD) / Math.max(1, estimatedHouseholdIncomeUSD)).toFixed(3));

  const privateSectorSegments: PrivateSectorSegment[] = (Object.keys(PRIVATE_SEGMENT_PROFILE) as PrivateSegmentType[]).map((segmentType) => {
    const profile = PRIVATE_SEGMENT_PROFILE[segmentType];
    const annualRevenueUSD = Number((estimatedNominalGdpUSD * profile.revenueToGdp).toFixed(0));
    const segment: PrivateSectorSegment = {
      segmentType,
      employment: Math.round(totalEmployed * profile.employmentShare),
      annualRevenueUSD,
      marginPct: profile.marginPct,
      debtUSD: annualRevenueUSD * 2,
      defaultRateAnnualPct: 0.02,
      capexUSD: annualRevenueUSD * 0.05,
    };
    if (segmentType === 'MANUFACTURING') {
      segment.producedCommodityIds = MANUFACTURING_LINKED_COMMODITIES;
      segment.commoditySupplyShareUSD = MANUFACTURING_LINKED_COMMODITIES.reduce((acc, id) => {
        acc[id] = Number((annualRevenueUSD * MANUFACTURING_COMMODITY_SUPPLY_SHARE).toFixed(0));
        return acc;
      }, {} as Record<string, number>);
    }
    return segment;
  });

  const region: Region = {
    id: regionId,
    name: identity.name,
    categoryDemand: {},
    activeContracts: [],
    currency: identity.currency,
    symbol: identity.symbol,
    centralBank: identity.centralBank,
    cycleRegime: 'Expansion',
    laggedCorporateDemandBase: 0,
    inversionWeeksCount: 0,
    recessionShockQueue: [],
    estimatedHouseholdIncomeUSD,
    bankingSector,
    equityOwnership: { bankShare: OWNERSHIP_SHARES.equity.bankShare, institutionalShare: OWNERSHIP_SHARES.equity.institutionalShare, foreignShare: buildForeignShare(regionId, OWNERSHIP_SHARES.equity.foreignShareEach), centralBankShare: OWNERSHIP_SHARES.equity.centralBankShare },
    corpBondOwnership: { bankShare: OWNERSHIP_SHARES.corpBond.bankShare, institutionalShare: OWNERSHIP_SHARES.corpBond.institutionalShare, foreignShare: buildForeignShare(regionId, OWNERSHIP_SHARES.corpBond.foreignShareEach), centralBankShare: OWNERSHIP_SHARES.corpBond.centralBankShare },
    sovBondOwnership: { bankShare: OWNERSHIP_SHARES.sovBond.bankShare, institutionalShare: OWNERSHIP_SHARES.sovBond.institutionalShare, foreignShare: buildForeignShare(regionId, OWNERSHIP_SHARES.sovBond.foreignShareEach), centralBankShare: OWNERSHIP_SHARES.sovBond.centralBankShare },
    institutionalSector,
    centralBankBalanceSheet: estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.centralBankBalanceSheetToGdp,
    balanceSheetStance: 0,
    policyRate,
    neutralRate,
    inflation: targetInflation,
    coreInflation: targetInflation,
    expectedInflation: targetInflation,
    wagePushInflation: Number((targetInflation * 0.5).toFixed(4)),
    monetaryInflationPressure: Number((targetInflation * 0.2).toFixed(4)),
    targetInflation,
    gdpGrowth,
    potentialGdpGrowth: gdpGrowth,
    nairu: UNEMPLOYMENT_RATE,
    weeksAboveNairu: 0,
    unemploymentRate: UNEMPLOYMENT_RATE,
    wageGrowth,
    tradeBalance: 0,
    exportsUSD: 0,
    importsUSD: 0,
    currentAccountPctGdp: 0,
    fxReservesUSD: Number((estimatedNominalGdpUSD * 0.002).toFixed(0)),
    structuralDeficitPctGdp: FISCAL_DEFICIT_PCT_GDP,
    fiscalDeficitPctGdp: FISCAL_DEFICIT_PCT_GDP,
    debtToGdpPct: DEBT_TO_GDP_PCT,
    fiscalStanceScore: 0,
    sovereignRating: identity.sovereignRating,
    laggedPolicyRateEMA: policyRate,
    laborForceParticipation: LABOR_FORCE_PARTICIPATION,
    inflationDeviationStreak: 0, policyRateLagBuffer: [], wageGrowthLagBuffer: [], demandShockLagBuffer: [],
    totalPopulation,
    birthRateAnnual: BIRTH_RATE_ANNUAL,
    deathRateAnnual: DEATH_RATE_ANNUAL,
    netMigrationRateAnnual: NET_MIGRATION_RATE_ANNUAL,
    nonEmployablePct: NON_EMPLOYABLE_PCT,
    governmentEmployment,
    privateSectorSegments,
    occupationPools,
    occupationLaborForceShare,
    unemploymentRateBottomUp: UNEMPLOYMENT_RATE,
    estimatedNominalGdpUSD,
    derivedNominalGdpUSD: estimatedNominalGdpUSD,
    gdpGrowthBottomUp: 0,
    smoothedWeeklyGrowthRate: 0,
    lastWeekNominalGdpUSD,
    nominalGdpHistory: [],
    consumptionComponentUSD: 0,
    investmentComponentUSD: 0,
    effectiveTaxRate: EFFECTIVE_TAX_RATE,
    governmentRevenueUSD,
    governmentSpendingUSD,
    govDebtTranches,
    debtToGdpPctBottomUp: 0,
    householdState: {
      consumerConfidence: 100,
      creditTierBooks: generateCreditTierBooks(creditCardDebtUSD, otherConsumerLoanDebtUSD),
      wageGrowth,
      savingsRate: HOUSEHOLD_SAVINGS_RATE,
      realConsumptionGrowth: Number((gdpGrowth * 0.7).toFixed(4)),
      householdDebtToIncomeRatio,
      stapleSpendShare: HOUSEHOLD_SPEND_SHARES.staple,
      standardSpendShare: HOUSEHOLD_SPEND_SHARES.standard,
      luxurySpendShare: HOUSEHOLD_SPEND_SHARES.luxury,
      depositsUSD,
      equityHoldingsUSD,
      mortgageDebtUSD,
      creditCardDebtUSD,
      otherConsumerLoanDebtUSD,
      netWorthUSD: 0,
    },
    dotPlot1Y: policyRate,
    dotPlot2Y: neutralRate,
    historicalPolicyRates: generate52WeekHistory(policyRate, 0.008, 0.001),
    historicalInflation: generate52WeekHistory(targetInflation, 0.006, 0.001),
    historicalCoreInflation: generate52WeekHistory(targetInflation, 0.005, 0.001),
    historicalGdpGrowth: generate52WeekHistory(gdpGrowth, 0.010, -0.01),
    historicalWageGrowth: generate52WeekHistory(wageGrowth, 0.006, 0.005),
    historicalDebtToGdp: generate52WeekHistory(DEBT_TO_GDP_PCT, 0.004, 0.5),
    weather: INITIAL_WEATHER[regionId],
    yieldCurveParams,
    zeroRates,
    historicalZeroCurves: [{ week: 1, ...zeroRates }],
    wealthDistribution: createWealthDistribution(estimatedHouseholdIncomeUSD),
    housingMarket: createHousingMarket(regionId, estimatedHouseholdIncomeUSD, totalPopulation),
    lifeCycleDistribution: createLifeCycleDistribution(),
  };

  region.categoryDemand = createInitialCategoryDemand(gdpGrowth, estimatedHouseholdIncomeUSD, lastWeekNominalGdpUSD, totalPopulation, TARGET_FIRMS_PER_REGION);

  return region;
}

export function getInitialRegions(): Record<RegionId, Region> {
  const regionIds: RegionId[] = ['USA', 'UK', 'JPN', 'EUR'];
  const regions = {} as Record<RegionId, Region>;
  regionIds.forEach((regionId) => {
    regions[regionId] = buildRegion(regionId);
  });
  return regions;
}

/**
 * Initial FX Pairs Matrix — derived from relative purchasing power (see bootstrap/commodities-and-fx.ts)
 */
export function getInitialFxPairs(): FxPair[] {
  return GENERATED_FX_PAIR_LEGS.map(({ base, quote }) => {
    const rate = getInitialFxRate(base, quote);
    return {
      pair: `${base}/${quote}`,
      base,
      quote,
      rate,
      historicalRates: generate52WeekHistory(rate, 0.015, rate * 0.8),
      change1W: 0,
      basisSpreadBps: -15,
    };
  });
}

/**
 * Initial Commodities — generic, non-real-ticker names/ids (see bootstrap/commodities-and-fx.ts)
 */
export function getInitialCommodities(): Commodity[] {
  const rf = 0.045;
  return GENERATED_COMMODITIES.map((def) => {
    const spotPrice = getCommodityBaseSpotPrice(def);
    return {
      id: def.id,
      name: def.name,
      symbol: def.id,
      category: def.category,
      unit: def.unit,
      spotPrice,
      historicalPrices: generate52WeekHistory(spotPrice, def.volatility * 0.1, spotPrice * 0.6),
      convenienceYield: def.convenienceYield,
      futures1M: priceCommodityFutures(spotPrice, rf, def.convenienceYield, 1 / 12),
      futures3M: priceCommodityFutures(spotPrice, rf, def.convenienceYield, 3 / 12),
      futures6M: priceCommodityFutures(spotPrice, rf, def.convenienceYield, 6 / 12),
      change1W: 0,
      volatility: def.volatility,
      supplyDemandBalance: 'Balanced' as const,
      inventoryLevelPct: 48,
      allTimeBaselinePrice: spotPrice,
    };
  });
}
