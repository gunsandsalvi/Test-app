import { NelsonSiegelParams, calculateTenorZeroRates } from '../nelsonSiegel';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, BASE_ANNUAL_WAGE_USD, OccupationType, OccupationPool, CreditTierBook, INDUSTRY_SUBUNITS } from '../../types';
import { generate52WeekHistory } from './utils';
import { INITIAL_WEATHER } from './weather';

export function deriveSubUnitPrice(subUnitId: string, inflation: number, gdpGrowth: number): number {
  const basePrices: Record<string, number> = {
    upstream_extraction: 75.0,
    refined_products: 3.5,
    industrial_chemicals: 120.0,
    household_chemicals: 15.0,
    agricultural_chemicals: 45.0,
    specialty_metals: 1500.0,
    heavy_equipment: 250000.0,
    industrial_automation: 80000.0,
    defense_systems: 5000000.0,
    commercial_aerospace: 12000000.0,
    passenger_vehicles: 35000.0,
    commercial_fleet: 90000.0,
    semiconductors: 25.0,
    consumer_devices: 800.0,
    enterprise_software: 5000.0,
    consumer_software: 100.0,
    network_infrastructure: 45000.0,
    pharmaceuticals: 50.0,
    medtech_devices: 15000.0,
    food_beverage: 10.0,
    household_essentials: 12.0,
    apparel_retail: 40.0,
    home_furnishings: 200.0,
    luxury_goods: 2500.0,
    media_content: 15.0,
    residential_construction: 350000.0,
    commercial_construction: 2500000.0,
  };
  const base = basePrices[subUnitId] ?? 100.0;
  const multiplier = 1.0 + (inflation * 0.5) + (gdpGrowth * 0.3);
  return Number((base * Math.max(0.2, multiplier)).toFixed(2));
}

export function createInitialCategoryDemand(
  inflation: number,
  gdpGrowth: number,
  estimatedHouseholdIncome: number,
  estimatedNominalGdp: number
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
      su.unitPriceUSD = deriveSubUnitPrice(su.unitId, inflation, gdpGrowth);
      
      const suHhDemand = totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0;
      const suGovDemand = totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0;
      const suCorpDemand = totalCorpWeight > 0 ? (su.buyerMix.CORPORATE / totalCorpWeight) * I : 0;
      const demandLevelUSD = suHhDemand + suGovDemand + suCorpDemand;

      cd[su.unitId] = {
        demandLevelUSD,
        demandGrowthAnnual: gdpGrowth,
        demandHistory: [demandLevelUSD],
        crowdingIntensity: 0.1,
        inventoryLevelUSD: demandLevelUSD * 0.10,
        inputCostPressure: 0,
        clearedInputPriceIndex: 1.0,
        lastWeekInventoryLevelUSD: demandLevelUSD * 0.10,
        unitPriceUSD: su.unitId === 'industrial_automation' ? 80000.0 : undefined,
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

export function getInitialRegions(): Record<RegionId, Region> {
  const usaParams: NelsonSiegelParams = { beta0: 0.044, beta1: -0.004, beta2: 0.010, lambda: 1.8 };
  const ukParams: NelsonSiegelParams = { beta0: 0.046, beta1: -0.005, beta2: 0.012, lambda: 1.9 };
  const jpnParams: NelsonSiegelParams = { beta0: 0.012, beta1: -0.010, beta2: 0.006, lambda: 2.5 };
  const eurParams: NelsonSiegelParams = { beta0: 0.030, beta1: -0.003, beta2: 0.008, lambda: 2.0 };

  const usaZeros = calculateTenorZeroRates(usaParams);
  const ukZeros = calculateTenorZeroRates(ukParams);
  const jpnZeros = calculateTenorZeroRates(jpnParams);
  const eurZeros = calculateTenorZeroRates(eurParams);

  const regions: Record<RegionId, Region> = {
    USA: {
      id: 'USA',
      name: 'United States',
      categoryDemand: createInitialCategoryDemand(0.026, 0.022, 12_000_000_000_000, 19_500_000_000_000),
      activeContracts: [],
      currency: 'USD',
      symbol: '$',
      centralBank: 'Federal Reserve',
      cycleRegime: 'Expansion',
      laggedCorporateDemandBase: 0,
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      estimatedHouseholdIncomeUSD: 12_000_000_000_000,
      bankingSector: { businessLoanBookUSD: 800_000_000_000, consumerLoanBookUSD: 1_400_000_000_000, depositsUSD: 2_100_000_000_000, sovereignBondHoldingsUSD: 400_000_000_000, cashReservesUSD: 210_000_000_000, bankEquityUSD: 280_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.028, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0, centralBankReservesUSD: 1_200_000_000_000, moneySupplyM2USD: 0, itemizedHoldings: [] },
      equityOwnership: {
        bankShare: 0.03, institutionalShare: 0.42,
        foreignShare: { USA: 0, EUR: 0.06, UK: 0.05, JPN: 0.04 },
        centralBankShare: 0,
      },
      corpBondOwnership: {
        bankShare: 0.28, institutionalShare: 0.45,
        foreignShare: { USA: 0, EUR: 0.05, UK: 0.04, JPN: 0.03 },
        centralBankShare: 0,
      },
      sovBondOwnership: {
        bankShare: 0.22, institutionalShare: 0.30,
        foreignShare: { USA: 0, EUR: 0.10, UK: 0.06, JPN: 0.08 },
        centralBankShare: 0.15,
      },
      institutionalSector: {
        corpBondHoldingsUSD: 0, sovBondHoldingsUSD: 0, equityHoldingsUSD: 0,
        cashUSD: 180_000_000_000, sectorEquityUSD: 220_000_000_000, investmentIncomeMarginPct: 0.032,
        itemizedHoldings: [],
      },
      centralBankBalanceSheet: 8.5e12,
      balanceSheetStance: 0,
      policyRate: 0.0450,
      neutralRate: 0.0100, // r* = 1.00%
      inflation: 0.0260,
      coreInflation: 0.0240,
      expectedInflation: 0.0240,
      wagePushInflation: 0.012,
      monetaryInflationPressure: 0.005,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0220,
      potentialGdpGrowth: 0.0210,
      nairu: 0.045,
      weeksAboveNairu: 0,
      unemploymentRate: 0.040,
      wageGrowth: 0.0360,
      tradeBalance: 0,
      exportsUSD: 0,
      importsUSD: 0,
      currentAccountPctGdp: -0.030,
      fxReservesUSD: 38_500_000_000,
      structuralDeficitPctGdp: 0.062,
      fiscalDeficitPctGdp: 0.062, // 6.2% of GDP (generates supply term premium)
      debtToGdpPct: 1.210, // 121.0% gross debt to GDP
      fiscalStanceScore: 0,
      sovereignRating: 'AA',
      laggedPolicyRateEMA: 0.0550,
      laborForceParticipation: 0.63,
      inflationDeviationStreak: 0, policyRateLagBuffer: [], wageGrowthLagBuffer: [], demandShockLagBuffer: [],
      totalPopulation: 145_000_000,
      birthRateAnnual: 0.011,
      deathRateAnnual: 0.009,
      netMigrationRateAnnual: 0.003,
      nonEmployablePct: 0.35,
      governmentEmployment: 9_000_000,
      privateSectorSegments: [
        { segmentType: 'MANUFACTURING', employment: 10_650_000, annualRevenueUSD: 2_130_000_000_000, marginPct: 0.09 , debtUSD: 2_130_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 2_130_000_000_000 * 0.05, producedCommodityIds: ['COPPER', 'WHEAT', 'CORN', 'SOYBEANS'], commoditySupplyShareUSD: { COPPER: 79_875_000_000, WHEAT: 79_875_000_000, CORN: 79_875_000_000, SOYBEANS: 79_875_000_000 } },
        { segmentType: 'PROFESSIONAL_SERVICES', employment: 8_520_000, annualRevenueUSD: 1_700_000_000_000, marginPct: 0.14, debtUSD: 1_700_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_700_000_000_000 * 0.05 },
        { segmentType: 'RETAIL_TRADE', employment: 12_780_000, annualRevenueUSD: 1_850_000_000_000, marginPct: 0.05 , debtUSD: 1_850_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_850_000_000_000 * 0.05 },
        { segmentType: 'CONSTRUCTION_REALESTATE', employment: 6_390_000, annualRevenueUSD: 1_250_000_000_000, marginPct: 0.10 , debtUSD: 1_250_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_250_000_000_000 * 0.05 },
        { segmentType: 'HEALTHCARE_SERVICES', employment: 4_260_000, annualRevenueUSD: 1_000_000_000_000, marginPct: 0.12, debtUSD: 1_000_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_000_000_000_000 * 0.05 },
      ],
      occupationPools: {
        GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
      },
      occupationLaborForceShare: {
        GENERAL: 0.55,
        SKILLED_TRADES: 0.15,
        TECHNICAL_ENGINEERING: 0.12,
        SPECIALIZED_PROFESSIONAL: 0.08,
        MANAGERIAL_FINANCIAL: 0.10,
      },
      unemploymentRateBottomUp: 0.040,
      estimatedNominalGdpUSD: 19_500_000_000_000,
      derivedNominalGdpUSD: 19_500_000_000_000,
      gdpGrowthBottomUp: 0,
      lastWeekNominalGdpUSD: 19_500_000_000_000,
      nominalGdpHistory: [],
      consumptionComponentUSD: 0,
      investmentComponentUSD: 0,
      effectiveTaxRate: 0.30,
      governmentRevenueUSD: 0,
      governmentSpendingUSD: 0,
      govDebtTranches: [
        { id: 'USA-GOV-2Y-INIT', principalUSD: 6_900_000_000_000, couponRate: 0.042, originationWeek: -50, maturityWeek: 54, tenorAtIssuanceYears: 2 },
        { id: 'USA-GOV-5Y-INIT', principalUSD: 6_900_000_000_000, couponRate: 0.044, originationWeek: -130, maturityWeek: 130, tenorAtIssuanceYears: 5 },
        { id: 'USA-GOV-10Y-INIT', principalUSD: 5_750_000_000_000, couponRate: 0.045, originationWeek: -260, maturityWeek: 260, tenorAtIssuanceYears: 10 },
        { id: 'USA-GOV-30Y-INIT', principalUSD: 3_450_000_000_000, couponRate: 0.048, originationWeek: -780, maturityWeek: 780, tenorAtIssuanceYears: 30 },
      ],
      debtToGdpPctBottomUp: 0,
      householdState: {
        consumerConfidence: 100,
        creditTierBooks: generateCreditTierBooks(900_000_000_000, 1_600_000_000_000),
        wageGrowth: 0.0360,
        savingsRate: 0.055,
        realConsumptionGrowth: 0.02,
        householdDebtToIncomeRatio: 1.05,
        stapleSpendShare: 0.35,
        standardSpendShare: 0.50,
        luxurySpendShare: 0.15,
        depositsUSD: 8_000_000_000_000,
        equityHoldingsUSD: 22_000_000_000_000,
        mortgageDebtUSD: 11_000_000_000_000,
        creditCardDebtUSD: 900_000_000_000,
        otherConsumerLoanDebtUSD: 1_600_000_000_000,
        netWorthUSD: 0,
      },
      dotPlot1Y: 0.0400,
      dotPlot2Y: 0.0325,
      historicalPolicyRates: generate52WeekHistory(0.0450, 0.008, 0.005),
      historicalInflation: generate52WeekHistory(0.0260, 0.006, 0.005),
      historicalCoreInflation: generate52WeekHistory(0.0240, 0.005, 0.005),
      historicalGdpGrowth: generate52WeekHistory(0.0220, 0.010, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0360, 0.006, 0.01),
      historicalDebtToGdp: generate52WeekHistory(1.210, 0.004, 0.8),
      weather: INITIAL_WEATHER.USA,
      yieldCurveParams: usaParams,
      zeroRates: usaZeros,
      historicalZeroCurves: [{ week: 1, ...usaZeros }],
    },
    UK: {
      id: 'UK',
      name: 'United Kingdom',
      categoryDemand: createInitialCategoryDemand(0.028, 0.018, 2_000_000_000_000, 3_200_000_000_000),
      activeContracts: [],
      currency: 'GBP',
      symbol: '£',
      centralBank: 'Bank of England',
      cycleRegime: 'Expansion',
      laggedCorporateDemandBase: 0,
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      estimatedHouseholdIncomeUSD: 2_000_000_000_000,
      bankingSector: { businessLoanBookUSD: 150_000_000_000, consumerLoanBookUSD: 260_000_000_000, depositsUSD: 400_000_000_000, sovereignBondHoldingsUSD: 80_000_000_000, cashReservesUSD: 40_000_000_000, bankEquityUSD: 55_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.025, loanLossProvisionRateAnnualPct: 0.008, creditConditionsIndex: 0, centralBankReservesUSD: 200_000_000_000, moneySupplyM2USD: 0, itemizedHoldings: [] },
      equityOwnership: {
        bankShare: 0.03, institutionalShare: 0.42,
        foreignShare: { UK: 0, USA: 0.06, EUR: 0.05, JPN: 0.04 },
        centralBankShare: 0,
      },
      corpBondOwnership: {
        bankShare: 0.28, institutionalShare: 0.45,
        foreignShare: { UK: 0, USA: 0.05, EUR: 0.04, JPN: 0.03 },
        centralBankShare: 0,
      },
      sovBondOwnership: {
        bankShare: 0.22, institutionalShare: 0.30,
        foreignShare: { UK: 0, USA: 0.10, EUR: 0.06, JPN: 0.08 },
        centralBankShare: 0.15,
      },
      institutionalSector: {
        corpBondHoldingsUSD: 0, sovBondHoldingsUSD: 0, equityHoldingsUSD: 0,
        cashUSD: 40_000_000_000, sectorEquityUSD: 50_000_000_000, investmentIncomeMarginPct: 0.030,
        itemizedHoldings: [],
      },
      centralBankBalanceSheet: 1.2e12,
      balanceSheetStance: 0,
      policyRate: 0.0475,
      neutralRate: 0.0075, // r* = 0.75%
      inflation: 0.0280,
      coreInflation: 0.0260,
      expectedInflation: 0.0260,
      wagePushInflation: 0.015,
      monetaryInflationPressure: 0.006,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0130,
      potentialGdpGrowth: 0.0150,
      nairu: 0.050,
      weeksAboveNairu: 0,
      unemploymentRate: 0.042,
      wageGrowth: 0.0420,
      tradeBalance: 0,
      exportsUSD: 0,
      importsUSD: 0,
      currentAccountPctGdp: -0.034,
      fxReservesUSD: 185_200_000_000,
      structuralDeficitPctGdp: 0.046,
      fiscalDeficitPctGdp: 0.046,
      debtToGdpPct: 0.975,
      fiscalStanceScore: 0,
      sovereignRating: 'AA',
      laggedPolicyRateEMA: 0.0450,
      laborForceParticipation: 0.65,
      inflationDeviationStreak: 0, policyRateLagBuffer: [], wageGrowthLagBuffer: [], demandShockLagBuffer: [],
      totalPopulation: 38_000_000,
      birthRateAnnual: 0.010,
      deathRateAnnual: 0.009,
      netMigrationRateAnnual: 0.002,
      nonEmployablePct: 0.36,
      governmentEmployment: 2_800_000,
      privateSectorSegments: [
        { segmentType: 'MANUFACTURING', employment: 2_025_000, annualRevenueUSD: 360_000_000_000, marginPct: 0.09 , debtUSD: 360_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 360_000_000_000 * 0.05, producedCommodityIds: ['COPPER', 'WHEAT', 'CORN', 'SOYBEANS'], commoditySupplyShareUSD: { COPPER: 13_500_000_000, WHEAT: 13_500_000_000, CORN: 13_500_000_000, SOYBEANS: 13_500_000_000 } },
        { segmentType: 'PROFESSIONAL_SERVICES', employment: 1_620_000, annualRevenueUSD: 300_000_000_000, marginPct: 0.14, debtUSD: 300_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 300_000_000_000 * 0.05 },
        { segmentType: 'RETAIL_TRADE', employment: 2_430_000, annualRevenueUSD: 320_000_000_000, marginPct: 0.05 , debtUSD: 320_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 320_000_000_000 * 0.05 },
        { segmentType: 'CONSTRUCTION_REALESTATE', employment: 1_215_000, annualRevenueUSD: 220_000_000_000, marginPct: 0.10 , debtUSD: 220_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 220_000_000_000 * 0.05 },
        { segmentType: 'HEALTHCARE_SERVICES', employment: 810_000, annualRevenueUSD: 170_000_000_000, marginPct: 0.12, debtUSD: 170_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 170_000_000_000 * 0.05 },
      ],
      occupationPools: {
        GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
      },
      occupationLaborForceShare: {
        GENERAL: 0.55,
        SKILLED_TRADES: 0.15,
        TECHNICAL_ENGINEERING: 0.12,
        SPECIALIZED_PROFESSIONAL: 0.08,
        MANAGERIAL_FINANCIAL: 0.10,
      },
      unemploymentRateBottomUp: 0.042,
      estimatedNominalGdpUSD: 3_200_000_000_000,
      derivedNominalGdpUSD: 3_200_000_000_000,
      gdpGrowthBottomUp: 0,
      lastWeekNominalGdpUSD: 3_200_000_000_000,
      nominalGdpHistory: [],
      consumptionComponentUSD: 0,
      investmentComponentUSD: 0,
      effectiveTaxRate: 0.32,
      governmentRevenueUSD: 0,
      governmentSpendingUSD: 0,
      govDebtTranches: [
        { id: 'UK-GOV-2Y-INIT', principalUSD: 936_000_000_000, couponRate: 0.045, originationWeek: -50, maturityWeek: 54, tenorAtIssuanceYears: 2 },
        { id: 'UK-GOV-5Y-INIT', principalUSD: 936_000_000_000, couponRate: 0.047, originationWeek: -130, maturityWeek: 130, tenorAtIssuanceYears: 5 },
        { id: 'UK-GOV-10Y-INIT', principalUSD: 780_000_000_000, couponRate: 0.048, originationWeek: -260, maturityWeek: 260, tenorAtIssuanceYears: 10 },
        { id: 'UK-GOV-30Y-INIT', principalUSD: 468_000_000_000, couponRate: 0.050, originationWeek: -780, maturityWeek: 780, tenorAtIssuanceYears: 30 },
      ],
      debtToGdpPctBottomUp: 0,
      householdState: {
        consumerConfidence: 100,
        creditTierBooks: generateCreditTierBooks(100_000_000_000, 180_000_000_000),
        wageGrowth: 0.0420,
        savingsRate: 0.060,
        realConsumptionGrowth: 0.015,
        householdDebtToIncomeRatio: 1.10,
        stapleSpendShare: 0.35,
        standardSpendShare: 0.50,
        luxurySpendShare: 0.15,
        depositsUSD: 900_000_000_000,
        equityHoldingsUSD: 2_200_000_000_000,
        mortgageDebtUSD: 1_200_000_000_000,
        creditCardDebtUSD: 100_000_000_000,
        otherConsumerLoanDebtUSD: 180_000_000_000,
        netWorthUSD: 0,
      },
      dotPlot1Y: 0.0425,
      dotPlot2Y: 0.0350,
      historicalPolicyRates: generate52WeekHistory(0.0475, 0.008, 0.005),
      historicalInflation: generate52WeekHistory(0.0280, 0.006, 0.005),
      historicalCoreInflation: generate52WeekHistory(0.0260, 0.005, 0.005),
      historicalGdpGrowth: generate52WeekHistory(0.0130, 0.010, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0420, 0.006, 0.01),
      historicalDebtToGdp: generate52WeekHistory(0.975, 0.004, 0.6),
      weather: INITIAL_WEATHER.UK,
      yieldCurveParams: ukParams,
      zeroRates: ukZeros,
      historicalZeroCurves: [{ week: 1, ...ukZeros }],
    },    JPN: {
      id: 'JPN',
      name: 'Japan',
      categoryDemand: createInitialCategoryDemand(0.015, 0.012, 3_500_000_000_000, 5_500_000_000_000),
      activeContracts: [],
      currency: 'JPY',
      symbol: '¥',
      centralBank: 'Bank of Japan',
      cycleRegime: 'Expansion',
      laggedCorporateDemandBase: 0,
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      estimatedHouseholdIncomeUSD: 3_500_000_000_000,
      bankingSector: { businessLoanBookUSD: 300_000_000_000, consumerLoanBookUSD: 420_000_000_000, depositsUSD: 900_000_000_000, sovereignBondHoldingsUSD: 260_000_000_000, cashReservesUSD: 90_000_000_000, bankEquityUSD: 90_000_000_000, bankCapitalRatio: 0.11, netInterestMarginPct: 0.012, loanLossProvisionRateAnnualPct: 0.004, creditConditionsIndex: 0, centralBankReservesUSD: 1_500_000_000_000, moneySupplyM2USD: 0, itemizedHoldings: [] },
      equityOwnership: {
        bankShare: 0.03, institutionalShare: 0.42,
        foreignShare: { JPN: 0, USA: 0.06, EUR: 0.05, UK: 0.04 },
        centralBankShare: 0,
      },
      corpBondOwnership: {
        bankShare: 0.28, institutionalShare: 0.45,
        foreignShare: { JPN: 0, USA: 0.05, EUR: 0.04, UK: 0.03 },
        centralBankShare: 0,
      },
      sovBondOwnership: {
        bankShare: 0.22, institutionalShare: 0.30,
        foreignShare: { JPN: 0, USA: 0.10, EUR: 0.06, UK: 0.08 },
        centralBankShare: 0.15,
      },
      institutionalSector: {
        corpBondHoldingsUSD: 0, sovBondHoldingsUSD: 0, equityHoldingsUSD: 0,
        cashUSD: 60_000_000_000, sectorEquityUSD: 140_000_000_000, investmentIncomeMarginPct: 0.018,
        itemizedHoldings: [],
      },
      centralBankBalanceSheet: 4.8e12,
      balanceSheetStance: 0,
      policyRate: 0.0025,
      neutralRate: -0.0025, // r* = -0.25%
      inflation: 0.0180,
      coreInflation: 0.0160,
      expectedInflation: 0.0160,
      wagePushInflation: 0.005,
      monetaryInflationPressure: 0.002,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0100,
      potentialGdpGrowth: 0.0080,
      nairu: 0.028,
      weeksAboveNairu: 0,
      unemploymentRate: 0.024,
      wageGrowth: 0.0250,
      tradeBalance: 0,
      exportsUSD: 0,
      importsUSD: 0,
      currentAccountPctGdp: 0.036,
      fxReservesUSD: 1_240_000_000_000,
      structuralDeficitPctGdp: 0.055,
      fiscalDeficitPctGdp: 0.055,
      debtToGdpPct: 2.550,
      fiscalStanceScore: 0,
      sovereignRating: 'A',
      laggedPolicyRateEMA: 0.0525,
      laborForceParticipation: 0.64,
      inflationDeviationStreak: 0, policyRateLagBuffer: [], wageGrowthLagBuffer: [], demandShockLagBuffer: [],
      totalPopulation: 65_000_000,
      birthRateAnnual: 0.007,
      deathRateAnnual: 0.011,
      netMigrationRateAnnual: 0.0005,
      nonEmployablePct: 0.40,
      governmentEmployment: 3_200_000,
      privateSectorSegments: [
        { segmentType: 'MANUFACTURING', employment: 4_050_000, annualRevenueUSD: 700_000_000_000, marginPct: 0.09 , debtUSD: 700_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 700_000_000_000 * 0.05, producedCommodityIds: ['COPPER', 'WHEAT', 'CORN', 'SOYBEANS'], commoditySupplyShareUSD: { COPPER: 26_250_000_000, WHEAT: 26_250_000_000, CORN: 26_250_000_000, SOYBEANS: 26_250_000_000 } },
        { segmentType: 'PROFESSIONAL_SERVICES', employment: 3_240_000, annualRevenueUSD: 580_000_000_000, marginPct: 0.14, debtUSD: 580_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 580_000_000_000 * 0.05 },
        { segmentType: 'RETAIL_TRADE', employment: 4_860_000, annualRevenueUSD: 620_000_000_000, marginPct: 0.05 , debtUSD: 620_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 620_000_000_000 * 0.05 },
        { segmentType: 'CONSTRUCTION_REALESTATE', employment: 2_430_000, annualRevenueUSD: 420_000_000_000, marginPct: 0.10 , debtUSD: 420_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 420_000_000_000 * 0.05 },
        { segmentType: 'HEALTHCARE_SERVICES', employment: 1_620_000, annualRevenueUSD: 330_000_000_000, marginPct: 0.12, debtUSD: 330_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 330_000_000_000 * 0.05 },
      ],
      occupationPools: {
        GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
      },
      occupationLaborForceShare: {
        GENERAL: 0.55,
        SKILLED_TRADES: 0.15,
        TECHNICAL_ENGINEERING: 0.12,
        SPECIALIZED_PROFESSIONAL: 0.08,
        MANAGERIAL_FINANCIAL: 0.10,
      },
      unemploymentRateBottomUp: 0.024,
      estimatedNominalGdpUSD: 5_500_000_000_000,
      derivedNominalGdpUSD: 5_500_000_000_000,
      gdpGrowthBottomUp: 0,
      lastWeekNominalGdpUSD: 5_500_000_000_000,
      nominalGdpHistory: [],
      consumptionComponentUSD: 0,
      investmentComponentUSD: 0,
      effectiveTaxRate: 0.29,
      governmentRevenueUSD: 0,
      governmentSpendingUSD: 0,
      govDebtTranches: [
        { id: 'JPN-GOV-2Y-INIT', principalUSD: 4_207_500_000_000, couponRate: 0.002, originationWeek: -50, maturityWeek: 54, tenorAtIssuanceYears: 2 },
        { id: 'JPN-GOV-5Y-INIT', principalUSD: 4_207_500_000_000, couponRate: 0.005, originationWeek: -130, maturityWeek: 130, tenorAtIssuanceYears: 5 },
        { id: 'JPN-GOV-10Y-INIT', principalUSD: 3_506_250_000_000, couponRate: 0.009, originationWeek: -260, maturityWeek: 260, tenorAtIssuanceYears: 10 },
        { id: 'JPN-GOV-30Y-INIT', principalUSD: 2_103_750_000_000, couponRate: 0.015, originationWeek: -780, maturityWeek: 780, tenorAtIssuanceYears: 30 },
      ],
      debtToGdpPctBottomUp: 0,
      householdState: {
        consumerConfidence: 100,
        creditTierBooks: generateCreditTierBooks(120_000_000_000, 200_000_000_000),
        wageGrowth: 0.0250,
        savingsRate: 0.080,
        realConsumptionGrowth: 0.01,
        householdDebtToIncomeRatio: 0.80,
        stapleSpendShare: 0.35,
        standardSpendShare: 0.50,
        luxurySpendShare: 0.15,
        depositsUSD: 2_500_000_000_000,
        equityHoldingsUSD: 2_800_000_000_000,
        mortgageDebtUSD: 1_800_000_000_000,
        creditCardDebtUSD: 120_000_000_000,
        otherConsumerLoanDebtUSD: 200_000_000_000,
        netWorthUSD: 0,
      },
      dotPlot1Y: 0.0050,
      dotPlot2Y: 0.0075,
      historicalPolicyRates: generate52WeekHistory(0.0025, 0.004, -0.001),
      historicalInflation: generate52WeekHistory(0.0180, 0.006, 0.002),
      historicalCoreInflation: generate52WeekHistory(0.0160, 0.005, 0.002),
      historicalGdpGrowth: generate52WeekHistory(0.0100, 0.008, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0250, 0.005, 0.005),
      historicalDebtToGdp: generate52WeekHistory(2.550, 0.004, 1.5),
      weather: INITIAL_WEATHER.JPN,
      yieldCurveParams: jpnParams,
      zeroRates: jpnZeros,
      historicalZeroCurves: [{ week: 1, ...jpnZeros }],
    },
    EUR: {
      id: 'EUR',
      name: 'Eurozone',
      categoryDemand: createInitialCategoryDemand(0.020, 0.015, 9_000_000_000_000, 14_500_000_000_000),
      activeContracts: [],
      currency: 'EUR',
      symbol: '€',
      centralBank: 'European Central Bank',
      cycleRegime: 'Expansion',
      laggedCorporateDemandBase: 0,
      inversionWeeksCount: 0,
      recessionShockQueue: [],
      estimatedHouseholdIncomeUSD: 9_000_000_000_000,
      bankingSector: { businessLoanBookUSD: 650_000_000_000, consumerLoanBookUSD: 1_000_000_000_000, depositsUSD: 1_600_000_000_000, sovereignBondHoldingsUSD: 350_000_000_000, cashReservesUSD: 160_000_000_000, bankEquityUSD: 200_000_000_000, bankCapitalRatio: 0.13, netInterestMarginPct: 0.022, loanLossProvisionRateAnnualPct: 0.007, creditConditionsIndex: 0, centralBankReservesUSD: 800_000_000_000, moneySupplyM2USD: 0, itemizedHoldings: [] },
      equityOwnership: {
        bankShare: 0.03, institutionalShare: 0.42,
        foreignShare: { EUR: 0, USA: 0.06, UK: 0.05, JPN: 0.04 },
        centralBankShare: 0,
      },
      corpBondOwnership: {
        bankShare: 0.28, institutionalShare: 0.45,
        foreignShare: { EUR: 0, USA: 0.05, UK: 0.04, JPN: 0.03 },
        centralBankShare: 0,
      },
      sovBondOwnership: {
        bankShare: 0.22, institutionalShare: 0.30,
        foreignShare: { EUR: 0, USA: 0.10, UK: 0.06, JPN: 0.08 },
        centralBankShare: 0.15,
      },
      institutionalSector: {
        corpBondHoldingsUSD: 0, sovBondHoldingsUSD: 0, equityHoldingsUSD: 0,
        cashUSD: 140_000_000_000, sectorEquityUSD: 170_000_000_000, investmentIncomeMarginPct: 0.028,
        itemizedHoldings: [],
      },
      centralBankBalanceSheet: 7.2e12,
      balanceSheetStance: 0,
      policyRate: 0.0325,
      neutralRate: 0.0050, // r* = 0.50%
      inflation: 0.0230,
      coreInflation: 0.0220,
      expectedInflation: 0.0220,
      wagePushInflation: 0.010,
      monetaryInflationPressure: 0.004,
      targetInflation: 0.0200, // pi* = 2.00%
      gdpGrowth: 0.0120,
      potentialGdpGrowth: 0.0140,
      nairu: 0.070,
      weeksAboveNairu: 0,
      unemploymentRate: 0.063,
      wageGrowth: 0.0320,
      tradeBalance: 0,
      exportsUSD: 0,
      importsUSD: 0,
      currentAccountPctGdp: 0.022,
      fxReservesUSD: 890_500_000_000,
      structuralDeficitPctGdp: 0.034,
      fiscalDeficitPctGdp: 0.034,
      debtToGdpPct: 0.880,
      fiscalStanceScore: 0,
      sovereignRating: 'AAA',
      laggedPolicyRateEMA: 0.0010,
      laborForceParticipation: 0.62,
      inflationDeviationStreak: 0, policyRateLagBuffer: [], wageGrowthLagBuffer: [], demandShockLagBuffer: [],
      totalPopulation: 190_000_000,
      birthRateAnnual: 0.009,
      deathRateAnnual: 0.010,
      netMigrationRateAnnual: 0.002,
      nonEmployablePct: 0.37,
      governmentEmployment: 14_000_000,
      privateSectorSegments: [
        { segmentType: 'MANUFACTURING', employment: 12_150_000, annualRevenueUSD: 2_200_000_000_000, marginPct: 0.09 , debtUSD: 2_200_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 2_200_000_000_000 * 0.05, producedCommodityIds: ['COPPER', 'WHEAT', 'CORN', 'SOYBEANS'], commoditySupplyShareUSD: { COPPER: 82_500_000_000, WHEAT: 82_500_000_000, CORN: 82_500_000_000, SOYBEANS: 82_500_000_000 } },
        { segmentType: 'PROFESSIONAL_SERVICES', employment: 9_720_000, annualRevenueUSD: 1_800_000_000_000, marginPct: 0.14, debtUSD: 1_800_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_800_000_000_000 * 0.05 },
        { segmentType: 'RETAIL_TRADE', employment: 14_580_000, annualRevenueUSD: 1_950_000_000_000, marginPct: 0.05 , debtUSD: 1_950_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_950_000_000_000 * 0.05 },
        { segmentType: 'CONSTRUCTION_REALESTATE', employment: 7_290_000, annualRevenueUSD: 1_350_000_000_000, marginPct: 0.10 , debtUSD: 1_350_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_350_000_000_000 * 0.05 },
        { segmentType: 'HEALTHCARE_SERVICES', employment: 4_860_000, annualRevenueUSD: 1_100_000_000_000, marginPct: 0.12, debtUSD: 1_100_000_000_000 * 2, defaultRateAnnualPct: 0.02, capexUSD: 1_100_000_000_000 * 0.05 },
      ],
      occupationPools: {
        GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
        MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
      },
      occupationLaborForceShare: {
        GENERAL: 0.55,
        SKILLED_TRADES: 0.15,
        TECHNICAL_ENGINEERING: 0.12,
        SPECIALIZED_PROFESSIONAL: 0.08,
        MANAGERIAL_FINANCIAL: 0.10,
      },
      unemploymentRateBottomUp: 0.063,
      estimatedNominalGdpUSD: 14_500_000_000_000,
      derivedNominalGdpUSD: 14_500_000_000_000,
      gdpGrowthBottomUp: 0,
      lastWeekNominalGdpUSD: 14_500_000_000_000,
      nominalGdpHistory: [],
      consumptionComponentUSD: 0,
      investmentComponentUSD: 0,
      effectiveTaxRate: 0.34,
      governmentRevenueUSD: 0,
      governmentSpendingUSD: 0,
      govDebtTranches: [
        { id: 'EUR-GOV-2Y-INIT', principalUSD: 3_828_000_000_000, couponRate: 0.031, originationWeek: -50, maturityWeek: 54, tenorAtIssuanceYears: 2 },
        { id: 'EUR-GOV-5Y-INIT', principalUSD: 3_828_000_000_000, couponRate: 0.033, originationWeek: -130, maturityWeek: 130, tenorAtIssuanceYears: 5 },
        { id: 'EUR-GOV-10Y-INIT', principalUSD: 3_190_000_000_000, couponRate: 0.034, originationWeek: -260, maturityWeek: 260, tenorAtIssuanceYears: 10 },
        { id: 'EUR-GOV-30Y-INIT', principalUSD: 1_914_000_000_000, couponRate: 0.036, originationWeek: -780, maturityWeek: 780, tenorAtIssuanceYears: 30 },
      ],
      debtToGdpPctBottomUp: 0,
      householdState: {
        consumerConfidence: 100,
        creditTierBooks: generateCreditTierBooks(350_000_000_000, 700_000_000_000),
        wageGrowth: 0.0320,
        savingsRate: 0.070,
        realConsumptionGrowth: 0.008,
        householdDebtToIncomeRatio: 0.95,
        stapleSpendShare: 0.35,
        standardSpendShare: 0.50,
        luxurySpendShare: 0.15,
        depositsUSD: 4_500_000_000_000,
        equityHoldingsUSD: 9_000_000_000_000,
        mortgageDebtUSD: 5_500_000_000_000,
        creditCardDebtUSD: 350_000_000_000,
        otherConsumerLoanDebtUSD: 700_000_000_000,
        netWorthUSD: 0,
      },
      dotPlot1Y: 0.0275,
      dotPlot2Y: 0.0225,
      historicalPolicyRates: generate52WeekHistory(0.0325, 0.008, 0.002),
      historicalInflation: generate52WeekHistory(0.0230, 0.006, 0.002),
      historicalCoreInflation: generate52WeekHistory(0.0220, 0.005, 0.002),
      historicalGdpGrowth: generate52WeekHistory(0.0120, 0.008, -0.01),
      historicalWageGrowth: generate52WeekHistory(0.0320, 0.006, 0.005),
      historicalDebtToGdp: generate52WeekHistory(0.880, 0.004, 0.5),
      weather: INITIAL_WEATHER.EUR,
      yieldCurveParams: eurParams,
      zeroRates: eurZeros,
      historicalZeroCurves: [{ week: 1, ...eurZeros }],
    },
  };

  Object.values(regions).forEach(reg => {
    const totalLaborForce = reg.totalPopulation * (1 - reg.nonEmployablePct) * reg.laborForceParticipation;
    const totalEmployed = totalLaborForce * (1 - reg.unemploymentRate);
    const shares = reg.occupationLaborForceShare;
    const pools: Record<OccupationType, OccupationPool> = { ...reg.occupationPools };
    (Object.keys(shares) as OccupationType[]).forEach(occ => {
      pools[occ] = {
        employed: Math.round(totalEmployed * shares[occ]),
        wageIndex: 1.0,
        wageGrowthAnnual: reg.wageGrowth || 0.03,
      };
    });
    reg.occupationPools = pools;
    const totalWageIncomeUSD = (Object.keys(pools) as OccupationType[]).reduce((sum, occ) => {
      return sum + BASE_ANNUAL_WAGE_USD[occ] * pools[occ].wageIndex * pools[occ].employed;
    }, 0);
    const capitalIncomeUSD = totalWageIncomeUSD * 0.15;
    reg.estimatedHouseholdIncomeUSD = Number((totalWageIncomeUSD + capitalIncomeUSD).toFixed(0));

    // Dynamically calculate non-zero starting government spending and revenue to avoid week-52 YoY spike
    const effectiveTaxRate = reg.effectiveTaxRate || 0.30;
    const initialFiscalDeficitPctGdp = reg.fiscalDeficitPctGdp || 0.05;
    const initialGdp = reg.estimatedNominalGdpUSD;
    reg.governmentRevenueUSD = Number(((initialGdp * effectiveTaxRate) / 52).toFixed(0));
    reg.governmentSpendingUSD = Number((reg.governmentRevenueUSD + (initialGdp * initialFiscalDeficitPctGdp) / 52).toFixed(0));
  });

  return regions;
}

/**
 * Initial FX Pairs Matrix
 */

export function getInitialFxPairs(): FxPair[] {
  return [
    {
      pair: 'EUR/USD',
      base: 'EUR',
      quote: 'USA',
      rate: 1.0860,
      historicalRates: generate52WeekHistory(1.0860, 0.015, 0.95),
      change1W: 0.0010,
      basisSpreadBps: -18,
    },
    {
      pair: 'GBP/USD',
      base: 'UK',
      quote: 'USA',
      rate: 1.2940,
      historicalRates: generate52WeekHistory(1.2940, 0.015, 1.10),
      change1W: 0.0015,
      basisSpreadBps: -12,
    },
    {
      pair: 'USD/JPY',
      base: 'USA',
      quote: 'JPN',
      rate: 154.20,
      historicalRates: generate52WeekHistory(154.20, 0.02, 130.0),
      change1W: 0.30,
      basisSpreadBps: -34,
    },
    {
      pair: 'EUR/GBP',
      base: 'EUR',
      quote: 'UK',
      rate: 0.8390,
      historicalRates: generate52WeekHistory(0.8390, 0.01, 0.78),
      change1W: 0.0,
      basisSpreadBps: -6,
    },
  ];
}

/**
 * Initial Commodities (9 Coverage assets across Energy, Metals, Agriculture)
 */

export function getInitialCommodities(): Commodity[] {
  const rf = 0.0475;
  return [
    // 1. Energy
    {
      id: 'WTI',
      name: 'WTI Light Sweet Crude',
      symbol: 'WTI',
      category: 'Energy',
      unit: '$/bbl',
      spotPrice: 73.80,
      historicalPrices: generate52WeekHistory(73.80, 0.035, 45.0),
      convenienceYield: 0.032,
      futures1M: priceCommodityFutures(73.80, rf, 0.032, 1 / 12),
      futures3M: priceCommodityFutures(73.80, rf, 0.032, 3 / 12),
      futures6M: priceCommodityFutures(73.80, rf, 0.032, 6 / 12),
      change1W: 0.65,
      volatility: 0.30,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 46, 
    },
    {
      id: 'BRENT',
      name: 'Brent Crude Oil',
      symbol: 'BRENT',
      category: 'Energy',
      unit: '$/bbl',
      spotPrice: 78.50,
      historicalPrices: generate52WeekHistory(78.50, 0.035, 50.0),
      convenienceYield: 0.035,
      futures1M: priceCommodityFutures(78.50, rf, 0.035, 1 / 12),
      futures3M: priceCommodityFutures(78.50, rf, 0.035, 3 / 12),
      futures6M: priceCommodityFutures(78.50, rf, 0.035, 6 / 12),
      change1W: 0.50,
      volatility: 0.28,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 48, 
    },
    {
      id: 'NATGAS',
      name: 'Henry Hub Natural Gas',
      symbol: 'NATGAS',
      category: 'Energy',
      unit: '$/MMBtu',
      spotPrice: 2.85,
      historicalPrices: generate52WeekHistory(2.85, 0.06, 1.8),
      convenienceYield: 0.060,
      futures1M: priceCommodityFutures(2.85, rf, 0.060, 1 / 12),
      futures3M: priceCommodityFutures(2.85, rf, 0.060, 3 / 12),
      futures6M: priceCommodityFutures(2.85, rf, 0.060, 6 / 12),
      change1W: 0.05,
      volatility: 0.45,
      supplyDemandBalance: 'Deficit (Tight Supply)',
      inventoryLevelPct: 38, 
    },
    // 2. Metals
    {
      id: 'GOLD',
      name: 'Gold Spot',
      symbol: 'GOLD',
      category: 'Metals',
      unit: '$/oz',
      spotPrice: 2680.0,
      historicalPrices: generate52WeekHistory(2680.0, 0.015, 2000.0),
      convenienceYield: 0.005,
      futures1M: priceCommodityFutures(2680.0, rf, 0.005, 1 / 12),
      futures3M: priceCommodityFutures(2680.0, rf, 0.005, 3 / 12),
      futures6M: priceCommodityFutures(2680.0, rf, 0.005, 6 / 12),
      change1W: 15.0,
      volatility: 0.16,
      supplyDemandBalance: 'Deficit (Tight Supply)',
      inventoryLevelPct: 35, 
    },
    {
      id: 'SILVER',
      name: 'Silver Spot',
      symbol: 'SILVER',
      category: 'Metals',
      unit: '$/oz',
      spotPrice: 31.50,
      historicalPrices: generate52WeekHistory(31.50, 0.03, 22.0),
      convenienceYield: 0.010,
      futures1M: priceCommodityFutures(31.50, rf, 0.010, 1 / 12),
      futures3M: priceCommodityFutures(31.50, rf, 0.010, 3 / 12),
      futures6M: priceCommodityFutures(31.50, rf, 0.010, 6 / 12),
      change1W: 0.42,
      volatility: 0.26,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 44, 
    },
    {
      id: 'COPPER',
      name: 'LME High Grade Copper',
      symbol: 'COPPER',
      category: 'Metals',
      unit: '$/lb',
      spotPrice: 4.45,
      historicalPrices: generate52WeekHistory(4.45, 0.025, 3.2),
      convenienceYield: 0.020,
      futures1M: priceCommodityFutures(4.45, rf, 0.020, 1 / 12),
      futures3M: priceCommodityFutures(4.45, rf, 0.020, 3 / 12),
      futures6M: priceCommodityFutures(4.45, rf, 0.020, 6 / 12),
      change1W: 0.04,
      volatility: 0.22,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 52, 
    },
    // 3. Agriculture
    {
      id: 'WHEAT',
      name: 'Chicago SRW Wheat',
      symbol: 'WHEAT',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 5.85,
      historicalPrices: generate52WeekHistory(5.85, 0.035, 4.5),
      convenienceYield: 0.040,
      futures1M: priceCommodityFutures(5.85, rf, 0.040, 1 / 12),
      futures3M: priceCommodityFutures(5.85, rf, 0.040, 3 / 12),
      futures6M: priceCommodityFutures(5.85, rf, 0.040, 6 / 12),
      change1W: -0.08,
      volatility: 0.28,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 54, 
    },
    {
      id: 'CORN',
      name: 'US Corn Futures Proxy',
      symbol: 'CORN',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 4.30,
      historicalPrices: generate52WeekHistory(4.30, 0.03, 3.6),
      convenienceYield: 0.035,
      futures1M: priceCommodityFutures(4.30, rf, 0.035, 1 / 12),
      futures3M: priceCommodityFutures(4.30, rf, 0.035, 3 / 12),
      futures6M: priceCommodityFutures(4.30, rf, 0.035, 6 / 12),
      change1W: 0.06,
      volatility: 0.25,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 51, 
    },
    {
      id: 'SOYBEANS',
      name: 'Chicago Soybeans',
      symbol: 'SOYBEANS',
      category: 'Agriculture',
      unit: '$/bu',
      spotPrice: 10.25,
      historicalPrices: generate52WeekHistory(10.25, 0.03, 8.5),
      convenienceYield: 0.030,
      futures1M: priceCommodityFutures(10.25, rf, 0.030, 1 / 12),
      futures3M: priceCommodityFutures(10.25, rf, 0.030, 3 / 12),
      futures6M: priceCommodityFutures(10.25, rf, 0.030, 6 / 12),
      change1W: 0.12,
      volatility: 0.24,
      supplyDemandBalance: 'Balanced',
      inventoryLevelPct: 49, 
    },
  ];
}

/**
 * Weekly Central Bank Inertial Taylor Rule & Yield Curve Evolution with Micro Feedback
 */
