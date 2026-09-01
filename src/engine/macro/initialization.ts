import { govBondTrancheId } from '../../domain/sovereign-id';
import { NelsonSiegelParams, calculateTenorZeroRates, calculateNelsonSiegelZeroRate } from '../nelsonSiegel';
import { openingSovereignRating } from './evolution';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, OccupationType, OccupationPool, CreditTierBook, INDUSTRY_SUBUNITS, WealthTier, WealthTierData, HousingMarket, LifeCycleStage, LifeCycleStageData, SmePool, Industry, GovDebtTranche } from '../../types';
import { buildHouseholdCohorts } from './household-cohorts';
import { weeklyInterestExpenseUSD } from '../../domain/government';
import { CENTRAL_BANK_SOVEREIGN_SHARE, TGA_TARGET_WEEKS_OF_SPENDING } from '../../domain/central-bank';
import { governmentPayrollWeeklyUSD, governmentObligationsWeeklyUSD } from '../../domain/government';
import { GOVERNMENT_OCCUPATION_MIX } from '../../domain/region-macro';
import { INDUSTRY_REGISTRY, SME_POOL_INDUSTRIES, smePoolSubUnits, totalOutputFromFinalDemand, smePoolEmployment } from '../../domain/industry-registry';
import { sectorBaselineMarginPct, SME_MARGIN_DISCOUNT, seedPoolLeverageStrata, SME_POOL_STRATA_COUNT } from '../bootstrap/firms';
import { sovBucketKey } from '../simulation/stages/shared-helpers';
import { generate52WeekHistory } from './utils';
import { createSeedCategoryDemandState, CAPEX_SUPPLIER_WEIGHTS } from '../../domain/market-microstructure';
import { INITIAL_WEATHER } from './weather';
import {
  getRegionPopulation, getRegionProductivityPerCapitaUSD, getRegionBirthRateAnnual, getRegionDeathRateAnnual,
  stationaryAgeDistribution, RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS, MAX_AGE_YEARS,
} from '../bootstrap/population';
import { getBaseAnnualWageUSD, BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../bootstrap/labor-and-wages';
import { CPI_BASE_LEVEL, seedCpiHistory } from '../simulation/stages/price-index';
import {
  computeHouseholdDisposableIncomeUSD,
  splitWageBill,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';
import { deriveSubUnitUnitPrice, TARGET_FIRMS_PER_REGION } from '../bootstrap/category-demand';
import { GENERATED_COMMODITIES, GENERATED_FX_PAIR_LEGS, getInitialFxRate, getCommodityBaseSpotPrice } from '../bootstrap/commodities-and-fx';
import { getRegionYieldCurveParams, getRegionNeutralRate, getRegionInitialPolicyRate, getRegionProductivityGrowth, INFLATION_TARGET } from '../bootstrap/yield-curves';
import { fxPairLabel, REGION_IDS_SEED_ORDER } from '../../domain/geography';

export function createWealthDistribution(estimatedHouseholdIncomeUSD: number): Record<WealthTier, WealthTierData> {
  const inc = estimatedHouseholdIncomeUSD;
  const nw = inc * 3.5;
  return {
    BOTTOM_50: {
      shareOfHouseholds: 0.50,
      shareOfIncomeUSD: Math.round((inc * 0.15)),
      // RULE 19 — THE OPENING ACCUMULATION REFLECTS THE INCOME THAT PRODUCED IT, and this one
      // line retires `TIER_BALANCE_SHEET_WEIGHTS` — 32 stated numbers that existed ONLY as the
      // opening condition for §7.145's derived splits. Every one of those splits keys off
      // accumulated savings or income; with a stock here from week 1 the fallbacks are never
      // reached, so the table has nothing left to do (§7.171).
      accumulatedSavingsUSD: Math.round((inc * 0.15)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsUSD: Math.round((inc * 0.15 * 0.95)),
      investedSavingsUSD: Math.round((inc * 0.15 * 0.05)),
      shareOfNetWorthUSD: Math.round((nw * 0.02)),
      savingsRate: 0.01,
      equityExposureShare: 0.05,
      homeEquityUSD: Math.round((nw * 0.01)),
    },
    NEXT_40: {
      shareOfHouseholds: 0.40,
      shareOfIncomeUSD: Math.round((inc * 0.45)),
      accumulatedSavingsUSD: Math.round((inc * 0.45)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsUSD: Math.round((inc * 0.45 * 0.75)),
      investedSavingsUSD: Math.round((inc * 0.45 * 0.25)),
      shareOfNetWorthUSD: Math.round((nw * 0.28)),
      savingsRate: 0.06,
      equityExposureShare: 0.25,
      homeEquityUSD: Math.round((nw * 0.18)),
    },
    TOP_9: {
      shareOfHouseholds: 0.09,
      shareOfIncomeUSD: Math.round((inc * 0.25)),
      accumulatedSavingsUSD: Math.round((inc * 0.25)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsUSD: Math.round((inc * 0.25 * 0.5)),
      investedSavingsUSD: Math.round((inc * 0.25 * 0.5)),
      shareOfNetWorthUSD: Math.round((nw * 0.38)),
      savingsRate: 0.18,
      equityExposureShare: 0.50,
      homeEquityUSD: Math.round((nw * 0.12)),
    },
    TOP_1: {
      shareOfHouseholds: 0.01,
      shareOfIncomeUSD: Math.round((inc * 0.15)),
      accumulatedSavingsUSD: Math.round((inc * 0.15)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsUSD: Math.round((inc * 0.15 * 0.3)),
      investedSavingsUSD: Math.round((inc * 0.15 * 0.7)),
      shareOfNetWorthUSD: Math.round((nw * 0.32)),
      savingsRate: 0.35,
      equityExposureShare: 0.70,
      homeEquityUSD: Math.round((nw * 0.04)),
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
  const basePrice = Math.round((perHouseholdIncome * HOME_PRICE_TO_HOUSEHOLD_INCOME_MULTIPLE));
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

/**
 * DEM — the four stage shares are BANDS of the seed's own stationary age structure now, not four
 * stated numbers (§7.181). The structure follows from the Gompertz hazard and the region's own
 * birth rate, so a region whose fertility the demographic transition put low opens OLDER — which
 * is the difference between regions arriving as an outcome instead of a table (rule 4).
 */
export function createLifeCycleDistribution(birthRateAnnual = 0.0125): Record<LifeCycleStage, LifeCycleStageData> {
  const ages = stationaryAgeDistribution(birthRateAnnual);
  const band = (from: number, to: number) => ages.slice(from, to).reduce((a, b) => a + b, 0);
  const span = RETIREMENT_AGE_YEARS - WORKFORCE_ENTRY_AGE_YEARS;
  const t1 = WORKFORCE_ENTRY_AGE_YEARS + Math.round(span / 3);
  const t2 = WORKFORCE_ENTRY_AGE_YEARS + Math.round((2 * span) / 3);
  return {
    EARLY_CAREER: { shareOfPopulation: band(0, t1) },
    PEAK_EARNING: { shareOfPopulation: band(t1, t2) },
    PRE_RETIREMENT: { shareOfPopulation: band(t2, RETIREMENT_AGE_YEARS) },
    RETIRED: { shareOfPopulation: band(RETIREMENT_AGE_YEARS, MAX_AGE_YEARS) },
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

  // CHAIN-E — C + I + G is FINAL demand, and a product's demand is final demand PLUS what other
  // producers consume of it. Corporate demand above is investment only; without the second term
  // gross output equals final demand by construction and no recipe can change it (§7.117). The
  // registry's BOMs are a real matrix now, so the intermediate half is solved rather than stated.
  const finalDemand: Record<string, number> = {};
  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      // SUPPLY/CHAIN — investment goes where capex is actually spent (the capital-goods basket),
      // not spread across every corporate-bought good. A corporate purchase of a non-capital good
      // is INTERMEDIATE demand, which the solve below produces from the recipes; putting it here
      // too counted it twice and starved the capital-goods industries (§7.180).
      finalDemand[su.unitId] =
        (totalHhWeight > 0 ? (su.buyerMix.HOUSEHOLD / totalHhWeight) * C : 0)
        + (totalGovWeight > 0 ? (su.buyerMix.GOVERNMENT / totalGovWeight) * G : 0)
        + (CAPEX_SUPPLIER_WEIGHTS[su.unitId] ?? 0) * I;
    });
  });
  const totalOutput = totalOutputFromFinalDemand(finalDemand);

  const cd: Record<string, any> = {};
  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      const demandLevelAnnualUSD = totalOutput[su.unitId] ?? finalDemand[su.unitId];
      // §7.127: the price is FINAL demand over final-buyer volume. The demand LEVEL is total
      // output; the PRICE is not, or intermediate demand becomes price instead of quantity.
      const unitPriceUSD = deriveSubUnitUnitPrice(
        finalDemand[su.unitId] ?? 0, su.buyerMix, population, firmCount, su.unitId,
        (totalOutput[su.unitId] ?? 0) - (finalDemand[su.unitId] ?? 0)
      );

      cd[su.unitId] = createSeedCategoryDemandState(demandLevelAnnualUSD, gdpGrowth, unitPriceUSD);
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

/**
 * IDX / RULE 4 — the institution and country NAMES are generated from the region code, the way
 * every ticker and company name in this model already is. What stood here was 'Federal Reserve',
 * 'Bank of England', 'Bank of Japan', 'European Central Bank' and four real countries: rule 4
 * names real tickers and company names first, and "not numeric data" does not exempt a brand.
 *
 * The CURRENCY CODE and SYMBOL stay. They are identifiers the whole model keys on — `FxPair`,
 * every conversion, every quote — and a currency code is a label for a unit of account, not an
 * imported equilibrium. Renaming them would be a sweep with no rule-4 content.
 *
 * FRM removed the second count here: `sovereignRating` was ASSIGNED (USA AA, UK AA, JPN A,
 * EUR AAA), which is a real-world outcome. It is derived below from the seeded stack's own debt
 * ratio and deficit, through the same thresholds the weekly review uses.
 */
const REGION_IDENTITY: Record<RegionId, { name: string; currency: string; symbol: string; centralBank: string }> = {
  USA: { name: 'USA', currency: 'USD', symbol: '$', centralBank: 'USA Central Bank' },
  UK: { name: 'UK', currency: 'GBP', symbol: '£', centralBank: 'UK Central Bank' },
  JPN: { name: 'JPN', currency: 'JPY', symbol: '¥', centralBank: 'JPN Central Bank' },
  EUR: { name: 'EUR', currency: 'EUR', symbol: '€', centralBank: 'EUR Central Bank' },
};

// Structural fiscal/demographic/ownership coefficients shared across regions. These are
// modeling ratios (out of the "no real-world data" scope, same category as sector demand
// intensities elsewhere), not observed per-region statistics.
const LABOR_FORCE_PARTICIPATION = 0.63;
const NON_EMPLOYABLE_PCT = 0.36;
const UNEMPLOYMENT_RATE = 0.045;
// DEM: birth and death are DERIVED per region (bootstrap/population.ts) — fertility from the
// demographic transition against the productivity this model generates by Zipf rank, mortality
// from the region's own retired share. Which region shrinks is an outcome of that draw, not a
// table. Net migration opens at zero and is the endogenous attractiveness signal's to move.
const NET_MIGRATION_RATE_ANNUAL = 0.0;

/** DIST — the level the SME pool's leverage cross-section opens at. §7.113 measured the migrated
 *  tier at 2.7x EBITDA in all four regions; the shape is struck around that and re-centred on the
 *  pool's real book weekly, so this sets the opening spread and never the debt itself. */
const SME_SEED_LEVERAGE_MULTIPLE = 2.7;
/**
 * TAXR — the corporate tax rate each region OPENS at: POLICY primitives (rule 19's admissible
 * class — a statutory choice a legislature made, not a fitted number). Combined statutory
 * corporate rates, national plus local: US federal 21% + state average; Japan's national +
 * enterprise taxes at the high end; the UK's 25% headline at the low end. One owner (rule 3):
 * every corporate tax number in the model reads `region.effectiveTaxRate`, which starts here
 * and which each region's own fiscal stance then moves — so the differential is real policy
 * variation that MNC subsidiaries (taxed where they are booked) now actually face.
 */
export const CORPORATE_TAX_RATE_BY_REGION: Record<RegionId, number> = {
  USA: 0.26, EUR: 0.28, UK: 0.25, JPN: 0.30,
};
/** The seed's TOTAL-government-revenue share of GDP (all bases, not just corporate) — kept for
 *  the week-0 fiscal close only. The live corporate rate is the per-region map above.
 *  §7.301 — RE-STRUCK TO WHAT THE TAX SYSTEM ACTUALLY YIELDS (§7.4: the budget opens in the
 *  shape the engine produces). TAXR's real base collects 27–33% less corporate tax than the
 *  flat-rate accrual this share was closed against (measured week 5–6, like-for-like: the
 *  double-declining shield and carryforwards dominate; the statutory rate cuts are the minor
 *  part), and corporate tax is ~12% of the budget — so a budget struck at 0.31 opened ~3.6%
 *  above sustainable revenue in every region and compounded into the w45+ sovereign-yield
 *  blowout the first fixed-tree reference measured (10Y 4.7 → 12.9). One number, one owner. */
export const EFFECTIVE_TAX_RATE = 0.2988;
/**
 * The size of the opening sovereign stack, as a multiple of nominal GDP. A SEED primitive with
 * one use: it sizes `govDebtTranches` at week 0 and nothing thereafter. FRM deleted the weekly
 * `debtToGdpPct` field it used to seed alongside — from week 1 the ratio is measured from the
 * real stack over measured GDP (`debtToGdpPctBottomUp`), which is also what rates the sovereign.
 */
const DEBT_TO_GDP_PCT = 1.0;
/** The opening deficit, used once: to derive the seed's own sovereign rating, and by
 *  `national-accounts.ts` to close the seed's government-spending share. */
const FISCAL_DEFICIT_PCT_GDP = 0.05;
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


const INSTITUTIONAL_SECTOR_RATIOS = { cashToGdp: 0.010, sectorEquityToGdp: 0.012, investmentIncomeMargin: 0.028 };


// WS5: ~18% of the stock is bills (13/26/52-week paper) — the real treasury mix runs 15-25%
// bills; the bond weights carry the rest in the same proportions as before.
const GOV_DEBT_TENOR_WEIGHTS: { tenorYears: number; tenorWeeks: number; weight: number }[] = [
  { tenorYears: 0.25, tenorWeeks: 13, weight: 0.06 },
  { tenorYears: 0.5, tenorWeeks: 26, weight: 0.06 },
  { tenorYears: 1, tenorWeeks: 52, weight: 0.06 },
  { tenorYears: 2, tenorWeeks: 104, weight: 0.246 },
  { tenorYears: 5, tenorWeeks: 260, weight: 0.246 },
  { tenorYears: 10, tenorWeeks: 520, weight: 0.205 },
  { tenorYears: 30, tenorWeeks: 1560, weight: 0.123 },
];

// RULE 4: observed household balance-sheet ratios. `equityHoldingsToIncome` is the one the
// household state's `unmodeledFinancialAssetsUSD` doc already names as the source of its own
// named gap ("real households hold roughly 1.5x income in financial assets and the seed says
// so"). Cohort balance sheets (§6.1 / MAC) replace the whole line with accumulation.
const HOUSEHOLD_DEBT_RATIOS = { creditCardToIncome: 0.075, otherConsumerLoanToIncome: 0.133, mortgageToIncome: 0.90, depositsToIncome: 0.65, equityHoldingsToIncome: 1.8 };
const HOUSEHOLD_SAVINGS_RATE = 0.065;

/**
 * A region does not come into existence in its first week — it has been running at its trend
 * rate for years. Seeding a real trailing year of nominal GDP says exactly that, and it is what
 * lets the headline growth rate be a genuine year-over-year comparison from week 1.
 *
 * Without it `nominalGdpHistory` started empty, so for the whole first year the growth rate fell
 * back to annualizing one smoothed weekly rate via (1+x)^52 — which turned the cold-start level
 * transient into a headline growth rate that reached ~110%, and from there poisoned the Taylor
 * rule, the yield curve's beta2, the cycle regime, FX capital flows and equity flows. The
 * transient itself is fixed at its source (see bootstrap/national-accounts.ts); this makes sure
 * that no residual first-year wobble can ever again be exponentiated into a fake growth number.
 *
 * The path is deterministic rather than noisy on purpose: a synthetic past should carry the
 * region's real trend and nothing else, so week 1 reads growth equal to trend instead of reading
 * invented volatility.
 */
function seedNominalGdpHistory(currentLevelUSD: number, nominalAnnualGrowth: number): number[] {
  const weeks = 52;
  return Array.from({ length: weeks }, (_, i) =>
    Math.round((currentLevelUSD * Math.pow(1 + nominalAnnualGrowth, (i - (weeks - 1)) / 52)))
  );
}

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
  const estimatedNominalGdpUSD = Math.round((totalEmployed * productivityPerCapita));
  const governmentEmployment = Math.round(totalPopulation * GOV_EMPLOYMENT_SHARE_OF_POPULATION);

  const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);
  const occupationLaborForceShare: Record<OccupationType, number> = { ...BASELINE_OCCUPATION_LABOR_FORCE_SHARE };
  const occupationPools: Record<OccupationType, OccupationPool> = {} as Record<OccupationType, OccupationPool>;
  (Object.keys(occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
    occupationPools[occ] = {
      employed: Math.round(totalEmployed * occupationLaborForceShare[occ]),
      wageIndex: 1.0,
      wageGrowthAnnual: wageGrowth,
    };
  });

  const governmentRevenueUSD = Math.round(((estimatedNominalGdpUSD * EFFECTIVE_TAX_RATE) / 52));

  // Household income comes from the one shared national-accounts derivation (wages + capital
  // income + government transfers, net of household tax) that the weekly evolution also uses,
  // so the cold start and week 1 describe the same economy. At init the unemployment-benefit
  // component sits well inside the government's standing transfer budget, so it does not raise
  // the total — it becomes the variable part of it once unemployment moves.
  const totalWageIncomeUSD = (Object.keys(occupationPools) as OccupationType[]).reduce(
    (sum, occ) => sum + baseAnnualWageUSD[occ] * occupationPools[occ].employed, 0
  );
  const initialUnemploymentBenefitsUSD = (Object.keys(occupationPools) as OccupationType[]).reduce((sum, occ) => {
    const unemployedInPool = totalLaborForce * occupationLaborForceShare[occ] - occupationPools[occ].employed;
    return sum + baseAnnualWageUSD[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
  }, 0);
  const totalGovDebtUSD = estimatedNominalGdpUSD * DEBT_TO_GDP_PCT;
  const govDebtTranches: GovDebtTranche[] = GOV_DEBT_TENOR_WEIGHTS.map(({ tenorYears, tenorWeeks, weight }) => ({
    id: govBondTrancheId(regionId, tenorYears, 'INIT'),
    principalUSD: Math.round((totalGovDebtUSD * weight)),
    couponRate: Number(calculateNelsonSiegelZeroRate(tenorYears, yieldCurveParams).toFixed(4)),
    originationWeek: -Math.round(tenorWeeks / 2),
    maturityWeek: Math.round(tenorWeeks / 2),
    tenorAtIssuanceYears: tenorYears,
  }));

  // PUB1 (§7.4): the debt stack exists at week 0, so its interest is in the decomposition from
  // week 0 too — otherwise the seed opens on a transfer base the engine immediately shrinks.
  const seedInterestWeeklyUSD = weeklyInterestExpenseUSD(govDebtTranches);
  const seedWageSplit = splitWageBill(totalWageIncomeUSD);
  // PUB3 (§7.4): the government has its staff at week 0, so it owes them at week 0 — computed by
  // the same function the weekly step uses, off the same pools.
  const seedPayrollWeeklyUSD = governmentPayrollWeeklyUSD({
    governmentEmployment,
    baseAnnualWageUSD,
    wageIndexByOccupation: Object.fromEntries(
      (Object.keys(occupationPools) as OccupationType[]).map(o => [o, occupationPools[o].wageIndex])
    ),
    occupationMix: GOVERNMENT_OCCUPATION_MIX,
  });
  const seedLifeCycle = createLifeCycleDistribution(getRegionBirthRateAnnual(regionId));
  // PUB3b (§7.4): the seed budget is the same sum of real obligations the weekly step computes,
  // so week 0's fiscal state and week 1's are the same shape rather than two derivations.
  const seedAvgAnnualWageUSD = totalEmployed > 0 ? totalWageIncomeUSD / totalEmployed : 0;
  const seedObligations = governmentObligationsWeeklyUSD({
    interestWeeklyUSD: seedInterestWeeklyUSD,
    payrollWeeklyUSD: seedPayrollWeeklyUSD,
    unemploymentBenefitsWeeklyUSD: initialUnemploymentBenefitsUSD / 52,
    retiredPopulation: totalPopulation * (seedLifeCycle.RETIRED?.shareOfPopulation ?? 0),
    averageAnnualWageUSD: seedAvgAnnualWageUSD,
    fiscalStanceScore: 0,
  });
  const governmentSpendingWeeklyUSD = Math.round(seedObligations.totalUSD);
  const estimatedHouseholdIncomeUSD = Math.round(computeHouseholdDisposableIncomeUSD({
    wageIncomeUSD: totalWageIncomeUSD,
    transfersWeeklyUSD: seedObligations.transfersUSD,
  }));
  // COH3 — `assertHouseholdIncomeIdentity` is GONE, and the reason is that it could not fail.
  // Both sides of it came from the same four constants, so it was a tautology dressed as a check
  // — and its real effect was to PIN the seed to an identity the model stopped using in week 1,
  // when household income became the measured sum of what employers actually pay (§7.96). A check
  // that cannot fire is not a check; what would catch a real break is the cohort identity the
  // harness already asserts, which compares two things that are separately derived.
  const lastWeekNominalGdpUSD = estimatedNominalGdpUSD;

  // HH4 — §7.4: the cohorts are seeded by the same builder the weekly evolution runs, off the
  // same pools and wages, so week 0 decomposes into exactly the cells week 1 will. Debt service
  // is 0 here because the itemized books do not exist until the simulation-side seed migration
  // runs; the first weekly pass fills it, and the field feeds only the recorded burden.
  const seedWealthDistribution = createWealthDistribution(estimatedHouseholdIncomeUSD);
  const laborForceByOccupation = {} as Record<OccupationType, number>;
  (Object.keys(occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
    laborForceByOccupation[occ] = totalLaborForce * occupationLaborForceShare[occ];
  });
  const seedCohorts = buildHouseholdCohorts({
    occupationPools,
    baseAnnualWageUSD,
    laborForceByOccupation,
    governmentTransfersWeeklyUSD: seedObligations.transfersUSD,
    // The seed has no accumulated deposits yet, so every tier opens below its buffer and saves
    // toward it — which is the opening condition a cold start should have (§7.4).
    liquidAssetsUSD: 0,
    // DEM/DIST — the seed's own stationary age structure decides it, like every other week.
    retiredShareOfPopulation: seedLifeCycle.RETIRED.shareOfPopulation,
    weeklyDebtServiceUSD: 0,
    // Zero here to match the zero debt service: both sides of the budget loop arrive together
    // at the HH3 seed migration, which re-derives the cohorts with the real books.
    annualCapitalReceiptsUSD: { depositInterestUSD: 0, dividendsUSD: 0, residualUSD: 0 },
    wealthDistribution: seedWealthDistribution,
  });
  // The tier income lines open as the DERIVED sums they will be every week from here on —
  // the income-ranked 15/45/25/15 shape the raw seed carried was a different ranking (income
  // deciles) misapplied to wealth tiers, and week 1 would overwrite it anyway.
  (Object.keys(seedWealthDistribution) as WealthTier[]).forEach((t) => {
    seedWealthDistribution[t].shareOfIncomeUSD = Math.round((seedCohorts.tierDisposableUSD[t] ?? 0));
  });

  const netInterestMarginPct = Number(Math.max(NIM_FLOOR, policyRate * NIM_TO_POLICY_RATE_RATIO + 0.005).toFixed(4));
  const bankingSector = {
    businessLoanBookUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.businessLoanBookToGdp)),
    consumerLoanBookUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.consumerLoanBookToGdp)),
    depositsUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.depositsToGdp)),
    sovereignBondHoldingsUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.sovereignBondHoldingsToGdp)),
    cashReservesUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.cashReservesToGdp)),
    bankEquityUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.bankEquityToGdp)),
    bankCapitalRatio: BANK_CAPITAL_RATIO,
    netInterestMarginPct,
    loanLossProvisionRateAnnualPct: LOAN_LOSS_PROVISION_RATE,
    creditConditionsIndex: 0,
    centralBankReservesUSD: Math.round((estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.centralBankReservesToGdp)),
    moneySupplyM2USD: 0,
    itemizedHoldings: [],
    srfBorrowingUSD: 0,
    onRrpLendingUSD: 0,
    corpBondDealerInventory: [],
    sovereignBondHoldingsByTenor: {},
    sovBondDealerInventory: [],
    loanDealerInventory: [],
    // WS6: overnight positions are struck weekly and mature at the next session, so a cold
    // start opens with an empty book — the same shape the weekly engine produces (§7.4).
    repoLentUSD: 0,
    repoBorrowedUSD: 0,
    repoEncumberedCollateralUSD: 0,
    businessLoans: [],
    householdLoans: [],
    wholesaleFundingUSD: 0,
    corporateDepositsUSD: 0,
  };

  const institutionalSector = {
    corpBondHoldingsUSD: 0,
    sovBondHoldingsUSD: 0,
    equityHoldingsUSD: 0,
    cashUSD: Math.round((estimatedNominalGdpUSD * INSTITUTIONAL_SECTOR_RATIOS.cashToGdp)),
    sectorEquityUSD: Math.round((estimatedNominalGdpUSD * INSTITUTIONAL_SECTOR_RATIOS.sectorEquityToGdp)),
    investmentIncomeMarginPct: INSTITUTIONAL_SECTOR_RATIOS.investmentIncomeMargin,
    itemizedHoldings: [],
  };


  const creditCardDebtUSD = Math.round((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.creditCardToIncome));
  const otherConsumerLoanDebtUSD = Math.round((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.otherConsumerLoanToIncome));
  const mortgageDebtUSD = Math.round((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.mortgageToIncome));
  const depositsUSD = Math.round((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.depositsToIncome));
  const equityHoldingsUSD = Math.round((estimatedHouseholdIncomeUSD * HOUSEHOLD_DEBT_RATIOS.equityHoldingsToIncome));
  const householdDebtToIncomeRatio = Number(((mortgageDebtUSD + creditCardDebtUSD + otherConsumerLoanDebtUSD) / Math.max(1, estimatedHouseholdIncomeUSD)).toFixed(3));

  // SEG-A: the SME pools are seeded from the region's REAL demand, so they are built after
  // `categoryDemand` exists (below, once the region object is assembled).
  const smePools: SmePool[] = [];

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
    // OWN1: the three ownership registers are MEASURED off the real books at the end of every
    // week (stage 11), never assigned. A region is born owning nothing because nothing has been
    // placed yet; the seed places the books a few hundred lines later in simulation/
    // initialization.ts and the first measurement reads them.
    equityOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    corpBondOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    sovBondOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    institutionalSector,
    centralBankBalanceSheet: estimatedNominalGdpUSD * BANK_BALANCE_SHEET_RATIOS.centralBankBalanceSheetToGdp,
    // PUB2b: at birth the rule sits at neutral, so the floor blocks nothing.
    taylorTargetRate: neutralRate,
    policyRate,
    // WS6: a cleared market print from week 1. The cold start opens at the corridor floor —
    // where an overnight market with no funding need prints, and exactly what the first
    // session computes when the seeded sheets open at their buffers.
    repoRateAnnual: Math.max(0, policyRate - 20 / 10000),
    neutralRate,
    inflation: targetInflation,
    coreInflation: targetInflation,
    // Seeded empty here and filled once every region's sub-unit prices exist (see
    // simulation/initialization.ts) — a price index needs the prices before it can be built.
    consumerPriceIndex: CPI_BASE_LEVEL,
    coreConsumerPriceIndex: CPI_BASE_LEVEL,
    cpiHistory: seedCpiHistory(CPI_BASE_LEVEL, targetInflation),
    coreCpiHistory: seedCpiHistory(CPI_BASE_LEVEL, targetInflation),
    cpiBasket: { weightBySubUnit: {}, basePriceBySubUnit: {}, baseIndexLevel: CPI_BASE_LEVEL, baseWeek: 1 },
    expectedInflation: targetInflation,
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
    fxReservesUSD: Math.round((estimatedNominalGdpUSD * 0.002)),
    fiscalStanceScore: 0,
    // FRM: an outcome of this region's own seeded position, through the weekly rater's own
    // thresholds — not a label.
    sovereignRating: openingSovereignRating(DEBT_TO_GDP_PCT, FISCAL_DEFICIT_PCT_GDP),
    laggedPolicyRateEMA: policyRate,
    laborForceParticipation: LABOR_FORCE_PARTICIPATION,
    inflationDeviationStreak: 0, policyRateLagBuffer: [], demandShockLagBuffer: [],
    totalPopulation,
    birthRateAnnual: getRegionBirthRateAnnual(regionId),
    deathRateAnnual: getRegionDeathRateAnnual(seedLifeCycle.RETIRED.shareOfPopulation),
    netMigrationRateAnnual: NET_MIGRATION_RATE_ANNUAL,
    nonEmployablePct: NON_EMPLOYABLE_PCT,
    governmentEmployment,
    smePools,
    occupationPools,
    occupationLaborForceShare,
    estimatedNominalGdpUSD,
    derivedNominalGdpUSD: estimatedNominalGdpUSD,
    gdpGrowthBottomUp: 0,
    smoothedWeeklyGrowthRate: 0,
    lastWeekNominalGdpUSD,
    nominalGdpHistory: seedNominalGdpHistory(estimatedNominalGdpUSD, gdpGrowth + targetInflation),
    consumptionComponentUSD: 0,
    investmentComponentUSD: 0,
    effectiveTaxRate: CORPORATE_TAX_RATE_BY_REGION[regionId],
    governmentRevenueUSD,
    governmentSpendingWeeklyUSD,
    governmentPayrollWeeklyUSD: Math.round(seedPayrollWeeklyUSD),
    governmentInterestWeeklyUSD: Math.round(seedInterestWeeklyUSD),
    employerPayrollTaxWeeklyUSD: Math.round((seedWageSplit.employerPayrollTaxUSD / 52)),
    // PUB2 (§7.4): the CB opens holding its real share of the stock, with the TGA at its
    // operating balance and currency as the residual that closes the balance sheet. Bank
    // reserves are the banks' own cash and are not stored here — one representation.
    centralBankSheet: {
      region: regionId,
      sovereignHoldingsByTenor: govDebtTranches.reduce((acc, t) => {
        const k = sovBucketKey(t.tenorAtIssuanceYears);
        acc[k] = (acc[k] ?? 0) + t.principalUSD * CENTRAL_BANK_SOVEREIGN_SHARE;
        return acc;
      }, {} as Record<string, number>),
      treasuryAccountUSD: Math.round((governmentSpendingWeeklyUSD * TGA_TARGET_WEEKS_OF_SPENDING)),
      // Closes the balance sheet at birth; the weekly stage re-derives it (§7.4).
      currencyInCirculationUSD: 0,
      unbackedBankCashUSD: 0,
      lastRemittanceUSD: 0,
      // PUB2b: no order outstanding at birth — the first week's redemptions set the first one.
      plannedPurchasesByTenor: {},
      reinvestmentShare: 1,
      lastOpenMarketPurchasesUSD: 0,
      lastOrderPlacedUSD: 0,
      lastReserveDrainUSD: 0,
    },
    govDebtTranches,
    // Seeded from the stack this function just built, so week 0 rates the sovereign off the same
    // ratio week 1 will (§7.4).
    debtToGdpPctBottomUp: estimatedNominalGdpUSD > 0 ? totalGovDebtUSD / estimatedNominalGdpUSD : 0,
    householdState: {
      consumerConfidence: 100,
      creditTierBooks: generateCreditTierBooks(creditCardDebtUSD, otherConsumerLoanDebtUSD),
      wageGrowth,
      savingsRate: HOUSEHOLD_SAVINGS_RATE,
      realConsumptionGrowth: Number((gdpGrowth * 0.7).toFixed(4)),
      householdDebtToIncomeRatio,
      // HH4: derived from the seed cohorts' budgets, the same way every later week derives them.
      stapleSpendShare: Number(seedCohorts.spendShares.staple.toFixed(4)),
      standardSpendShare: Number(seedCohorts.spendShares.standard.toFixed(4)),
      luxurySpendShare: Number(seedCohorts.spendShares.luxury.toFixed(4)),
      cohorts: seedCohorts.cohorts,
      depositsUSD,
      // MS1: the real components are struck by the simulation's first weekly pass, which is the
      // only place that knows the cleared prices and the private tier. The seed therefore opens
      // with the whole stock UNMODELED and lets that line be paid down as real claims are found —
      // §7.4's seed-shape rule: seed the shape the engine produces, never a second version of it.
      equityHoldingsUSD,
      directEquityUSD: 0,
      housingStockUSD: 0,
      priorNetWorthUSD: 0,
      homeEquityUSD: 0,
      institutionalClaims: [],
      institutionalClaimsUSD: 0,
      etfShares: [],
      etfHoldingsUSD: 0,
      privateBusinessEquityUSD: 0,
      unmodeledFinancialAssetsUSD: equityHoldingsUSD,
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
    wealthDistribution: seedWealthDistribution,
    housingMarket: createHousingMarket(regionId, estimatedHouseholdIncomeUSD, totalPopulation),
    // DEM — the age structure the stage shares above are bands OF (rule 3).
    ageDistribution: stationaryAgeDistribution(getRegionBirthRateAnnual(regionId)),
    lifeCycleDistribution: seedLifeCycle,
  };

  region.categoryDemand = createInitialCategoryDemand(gdpGrowth, estimatedHouseholdIncomeUSD, lastWeekNominalGdpUSD, totalPopulation, TARGET_FIRMS_PER_REGION);

  // ---- SEG-A: the SME tier, one pool per registry industry, sized by REAL DEMAND ----
  //
  // Each industry's pool opens at its industry's own demand times that industry's stated SME
  // intensity (`smeShareOfActivity`) — so the tier's composition is an outcome of where demand
  // actually is, and an industry added to the registry gets a pool automatically. What this
  // replaces: five buckets whose sizes were `revenueToGdp` constants, frozen forever.
  //
  // Employment is VALUE ADDED OVER PRODUCTIVITY, the same rule the named tiers use
  // (companyGenerator.ts and bootstrap/private-firms.ts). It used to be
  // `totalEmployed x SME_TIER_EMPLOYMENT_SHARE` split across pools by revenue — an IMPOSED
  // employment share (rule 13), and the last of the three tiers to state its headcount rather
  // than derive it. A pool's revenue is gross output like anyone else's, so its value added is
  // what is left after the inputs its industry consumes, and its headcount is that over output
  // per worker. One rule for all three tiers means a change to it cannot land in one and miss
  // the others, which is exactly how the named tiers came to disagree (§7.119).
  //
  // Margin is the named tier's own sector margin less the SME discount — read from the SAME
  // `SECTOR_PROFILE` the company generator uses, so there is one margin primitive, not two.
  {
    const demandOf = (unitId: string) => region.categoryDemand[unitId]?.demandLevelAnnualUSD ?? 0;
    const revenueByIndustry = new Map<Industry, number>();
    SME_POOL_INDUSTRIES.forEach((industry) => {
      const industryDemandUSD = smePoolSubUnits(industry).reduce((a, su) => a + demandOf(su.unitId), 0);
      revenueByIndustry.set(industry, industryDemandUSD * INDUSTRY_REGISTRY[industry].smeShareOfActivity);
    });
    SME_POOL_INDUSTRIES.forEach((industry) => {
      const annualRevenueUSD = Math.round((revenueByIndustry.get(industry) ?? 0));
      if (annualRevenueUSD <= 0) return;
      const sector = INDUSTRY_REGISTRY[industry].sector;
      smePools.push({
        industry,
        employment: smePoolEmployment(industry, annualRevenueUSD, productivityPerCapita),
        annualRevenueUSD,
        marginPct: Number((sectorBaselineMarginPct(sector) * (1 - SME_MARGIN_DISCOUNT)).toFixed(4)),
        // No lender yet: the seed migration (bank-lending.ts) itemizes what the banks can
        // actually carry onto real loans and writes this back as their derived sum (rule 3).
        debtUSD: 0,
        defaultRateAnnualPct: 0.02,
        // DIST — the pool's leverage cross-section, struck from the same rule the named tier
        // uses. Its debt is migrated later (bank-lending's seed), so the mean is re-centred on
        // the pool's real book every week; what is seeded here is the SHAPE.
        strata: seedPoolLeverageStrata(SME_SEED_LEVERAGE_MULTIPLE, SME_POOL_STRATA_COUNT),
        capexUSD: Math.round((annualRevenueUSD * 0.05)),
      });
    });
  }

  return region;
}

/**
 * Builds a FRESH world every call — deliberately not memoized. A cache here was tried and
 * reverted the same day: createInitialGameState runs more than once per process (the harness's
 * A/B shock checks build baseline and shocked worlds), and a cached return aliased one mutable
 * region graph across all of them — every "independent" world was the same object. The §6
 * hoist is done where it belongs instead: generateInitialCompanies takes the already-built
 * regions as a parameter rather than rebuilding four regions (and consuming their RNG draws)
 * once per company.
 */
export function getInitialRegions(): Record<RegionId, Region> {
  const regionIds = REGION_IDS_SEED_ORDER;
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
      pair: fxPairLabel(base, quote),
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
