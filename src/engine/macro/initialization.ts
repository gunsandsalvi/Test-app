import { stashOpeningCash, stashSeedHouseholdLine, stashSeedGovLadder, stashSeedCentralBankBook, stashSeedSovereignBookLocal } from '../ledger/accounts';
import { govBondTrancheId } from '../../domain/sovereign-id';
import { SEED_BUSINESS_LOAN_BOOK_TO_GDP, SEED_CONSUMER_LOAN_BOOK_TO_GDP } from '../../domain/stated';
import { calculateTenorZeroRates, curvePointAt, TradedCurve } from '../nelsonSiegel';
import { openingSovereignRating } from './evolution';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, OccupationType, OccupationPool, CreditTierBook, INDUSTRY_SUBUNITS, WealthTier, WealthTierData, HousingMarket, LifeCycleStage, LifeCycleStageData, SmePool, Industry, GovDebtTranche } from '../../types';
import { buildHouseholdCohorts } from './household-cohorts';
import { weeklyInterestExpenseLocal, govTrancheView } from '../../domain/government';
import { CENTRAL_BANK_SOVEREIGN_SHARE, TGA_TARGET_WEEKS_OF_SPENDING } from '../../domain/central-bank';
import { governmentPayrollWeeklyLocal, governmentObligationsWeeklyLocal } from '../../domain/government';
import { GOVERNMENT_OCCUPATION_MIX } from '../../domain/region-macro';
import { INDUSTRY_REGISTRY, SME_POOL_INDUSTRIES, smePoolSubUnits, smePoolEmployment, seedDemandFromCIG } from '../../domain/industry-registry';
import { sectorBaselineMarginPct, SME_MARGIN_DISCOUNT, seedPoolLeverageStrata, SME_POOL_STRATA_COUNT } from '../bootstrap/firms';
import { generate52WeekHistory } from './utils';
import { createSeedCategoryDemandState, CAPEX_SUPPLIER_WEIGHTS, CategoryDemandState } from '../../domain/market-microstructure';
import { INITIAL_WEATHER } from './weather';
import {
  getRegionPopulation, getRegionProductivityPerCapitaLocal, getRegionBirthRateAnnual, getRegionDeathRateAnnual,
  stationaryAgeDistribution, RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS, MAX_AGE_YEARS,
} from '../bootstrap/population';
import { getBaseAnnualWageLocal, BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../bootstrap/labor-and-wages';
import { CPI_BASE_LEVEL, openingCpiHistory } from '../simulation/stages/price-index';
import {
  computeHouseholdDisposableIncomeLocal,
  splitWageBill,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';
import { deriveSubUnitUnitPrice, TARGET_FIRMS_PER_REGION } from '../bootstrap/category-demand';
import { GENERATED_COMMODITIES, GENERATED_FX_PAIR_LEGS, getInitialFxRate, getCommodityBaseSpotPrice } from '../bootstrap/commodities-and-fx';
import { commodityLinkageOf, goodsUnitsPerCommodityUnitOf, markCommodityToAuction } from '../../domain/commodity-spot';
import { FxToUsd } from '../../domain/currency';
import { getRegionYieldCurveParams, getRegionNeutralRate, getRegionInitialPolicyRate, getRegionProductivityGrowth, INFLATION_TARGET } from '../bootstrap/yield-curves';
import { fxPairLabel, REGION_IDS_SEED_ORDER } from '../../domain/geography';

/** Stash a seed object's provisional cash beside it (§5-WIRES A3.4) and hand it back. */
function withOpeningCash<T extends object>(o: T, usd: number): T { stashOpeningCash(o, usd); return o; }

export function createWealthDistribution(estimatedHouseholdIncomeLocal: number): Record<WealthTier, WealthTierData> {
  const inc = estimatedHouseholdIncomeLocal;
  const nw = inc * 3.5;
  return {
    BOTTOM_50: {
      shareOfHouseholds: 0.50,
      shareOfIncomeLocal: Math.round((inc * 0.15)),
      // RULE 19 — THE OPENING ACCUMULATION REFLECTS THE INCOME THAT PRODUCED IT, and this one
      // line retires `TIER_BALANCE_SHEET_WEIGHTS` — 32 stated numbers that existed ONLY as the
      // opening condition for §7.145's derived splits. Every one of those splits keys off
      // accumulated savings or income; with a stock here from week 1 the fallbacks are never
      // reached, so the table has nothing left to do (§7.171).
      accumulatedSavingsLocal: Math.round((inc * 0.15)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsLocal: Math.round((inc * 0.15 * 0.95)),
      investedSavingsLocal: Math.round((inc * 0.15 * 0.05)),
      shareOfNetWorthLocal: Math.round((nw * 0.02)),
      savingsRate: 0.01,
      equityExposureShare: 0.05,
      homeEquityLocal: Math.round((nw * 0.01)),
    },
    NEXT_40: {
      shareOfHouseholds: 0.40,
      shareOfIncomeLocal: Math.round((inc * 0.45)),
      accumulatedSavingsLocal: Math.round((inc * 0.45)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsLocal: Math.round((inc * 0.45 * 0.75)),
      investedSavingsLocal: Math.round((inc * 0.45 * 0.25)),
      shareOfNetWorthLocal: Math.round((nw * 0.28)),
      savingsRate: 0.06,
      equityExposureShare: 0.25,
      homeEquityLocal: Math.round((nw * 0.18)),
    },
    TOP_9: {
      shareOfHouseholds: 0.09,
      shareOfIncomeLocal: Math.round((inc * 0.25)),
      accumulatedSavingsLocal: Math.round((inc * 0.25)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsLocal: Math.round((inc * 0.25 * 0.5)),
      investedSavingsLocal: Math.round((inc * 0.25 * 0.5)),
      shareOfNetWorthLocal: Math.round((nw * 0.38)),
      savingsRate: 0.18,
      equityExposureShare: 0.50,
      homeEquityLocal: Math.round((nw * 0.12)),
    },
    TOP_1: {
      shareOfHouseholds: 0.01,
      shareOfIncomeLocal: Math.round((inc * 0.15)),
      accumulatedSavingsLocal: Math.round((inc * 0.15)),
      // COH1: the opening stock split by this tier's own exposure — spendable and invested
      // are two things from week 0, and the weekly rule only accumulates from here (§7.4).
      liquidSavingsLocal: Math.round((inc * 0.15 * 0.3)),
      investedSavingsLocal: Math.round((inc * 0.15 * 0.7)),
      shareOfNetWorthLocal: Math.round((nw * 0.32)),
      savingsRate: 0.35,
      equityExposureShare: 0.70,
      homeEquityLocal: Math.round((nw * 0.04)),
    },
  };
}

// Structural house-price-to-income and household-size coefficients, applied to the region's
// own generated income primitive — replacing the previous per-region literal base prices.
const AVG_HOUSEHOLD_SIZE = 2.5;
const HOME_PRICE_TO_HOUSEHOLD_INCOME_MULTIPLE = 4.2;
const HOME_OWNERSHIP_RATE = 0.62;

export function createHousingMarket(regionId: RegionId, estimatedHouseholdIncomeLocal: number, population: number): HousingMarket {
  const households = Math.max(1, population / AVG_HOUSEHOLD_SIZE);
  const perHouseholdIncome = estimatedHouseholdIncomeLocal / households;
  const basePrice = Math.round((perHouseholdIncome * HOME_PRICE_TO_HOUSEHOLD_INCOME_MULTIPLE));
  return {
    regionId,
    medianHomePriceLocal: basePrice,
    baselineHomePriceLocal: basePrice,
    priceIndex: 1.0,
    historicalPrices: Array(52).fill(basePrice),
    ownershipRate: HOME_OWNERSHIP_RATE,
    mortgageOriginationVolumeLocal: estimatedHouseholdIncomeLocal * 0.05,
  };
}

/**
 * DEM — the four stage shares are BANDS of the seed's own stationary age structure now, not four
 * stated numbers (§7.181). The structure follows from the Gompertz hazard and the region's own
 * birth rate, so a region whose fertility the demographic transition put low opens OLDER — which
 * is the difference between regions arriving as an outcome instead of a table (rule 2).
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

function createInitialCategoryDemand(
  gdpGrowth: number,
  estimatedHouseholdIncome: number,
  estimatedNominalGdp: number,
  population: number,
  firmCount: number
): Record<string, CategoryDemandState> {
  const C = estimatedHouseholdIncome * 0.94;
  const G = estimatedNominalGdp * 0.35;
  const I = estimatedNominalGdp * 0.15;

  // CHAIN-E / §3.13-READ D12 — C + I + G is FINAL demand, and a product's demand is final demand
  // PLUS what other producers consume of it. The identity, the capital-goods basket and the
  // Leontief solve are stated once in `seedDemandFromCIG`; this is the PLACEHOLDER seed, which
  // `simulation/initialization.ts` overwrites once the real firms and government exist.
  const { householdBySubUnit: householdFinalDemand, finalBySubUnit: finalDemand, totalOutputBySubUnit: totalOutput } =
    seedDemandFromCIG(C, I, G, CAPEX_SUPPLIER_WEIGHTS);

  const cd: Record<string, CategoryDemandState> = {};
  Object.values(INDUSTRY_SUBUNITS).forEach(subUnits => {
    subUnits.forEach(su => {
      const demandLevelAnnualLocal = totalOutput[su.unitId] ?? finalDemand[su.unitId];
      // §7.127: the price is FINAL demand over final-buyer volume. The demand LEVEL is total
      // output; the PRICE is not, or intermediate demand becomes price instead of quantity.
      const unitPriceLocal = deriveSubUnitUnitPrice(
        finalDemand[su.unitId] ?? 0, su.buyerMix, population, firmCount, su.unitId,
        (totalOutput[su.unitId] ?? 0) - (finalDemand[su.unitId] ?? 0),
        householdFinalDemand[su.unitId] ?? 0
      );

      cd[su.unitId] = createSeedCategoryDemandState(demandLevelAnnualLocal, gdpGrowth, unitPriceLocal);
    });
  });
  return cd;
}

function generateCreditTierBooks(creditCardDebtLocal: number, otherConsumerLoanDebtLocal: number): CreditTierBook[] {
  const totalDebt = creditCardDebtLocal + otherConsumerLoanDebtLocal;
  return [
    { tier: 'SUPER_PRIME', shareOfHouseholds: 0.25, debtBalanceLocal: totalDebt * 0.25, avgInterestRate: 0.08, delinquencyRatePct: 0.005 },
    { tier: 'PRIME', shareOfHouseholds: 0.35, debtBalanceLocal: totalDebt * 0.35, avgInterestRate: 0.12, delinquencyRatePct: 0.02 },
    { tier: 'NEAR_PRIME', shareOfHouseholds: 0.25, debtBalanceLocal: totalDebt * 0.25, avgInterestRate: 0.18, delinquencyRatePct: 0.06 },
    { tier: 'SUBPRIME', shareOfHouseholds: 0.15, debtBalanceLocal: totalDebt * 0.15, avgInterestRate: 0.25, delinquencyRatePct: 0.15 },
  ];
}

/**
 * IDX / RULE 4 — the institution and country NAMES are generated from the region code, the way
 * every ticker and company name in this model already is. What stood here was 'Federal Reserve',
 * 'Bank of England', 'Bank of Japan', 'European Central Bank' and four real countries: rule 2
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
 * TAXR — the corporate tax rate each region OPENS at: POLICY primitives (rule 2's admissible
 * class — a statutory choice a legislature made, not a fitted number). Combined statutory
 * corporate rates, national plus local: US federal 21% + state average; Japan's national +
 * enterprise taxes at the high end; the UK's 25% headline at the low end. One owner (rule 4):
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
  // R: the two loan-book ratios are declared in the registry (domain/stated.ts).
  businessLoanBookToGdp: SEED_BUSINESS_LOAN_BOOK_TO_GDP,
  consumerLoanBookToGdp: SEED_CONSUMER_LOAN_BOOK_TO_GDP,
  depositsToGdp: 0.110,
  sovereignBondHoldingsToGdp: 0.020,
  cashReservesToGdp: 0.011,
  bankEquityToGdp: 0.014,
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
// household state's `unmodeledFinancialAssetsLocal` doc already names as the source of its own
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
function seedNominalGdpHistory(currentLevelLocal: number, nominalAnnualGrowth: number): number[] {
  const weeks = 52;
  return Array.from({ length: weeks }, (_, i) =>
    Math.round((currentLevelLocal * Math.pow(1 + nominalAnnualGrowth, (i - (weeks - 1)) / 52)))
  );
}

function buildRegion(regionId: RegionId): Region {
  const identity = REGION_IDENTITY[regionId];
  const totalPopulation = getRegionPopulation(regionId);
  const productivityPerCapita = getRegionProductivityPerCapitaLocal(regionId);

  const yieldCurveParams = getRegionYieldCurveParams(regionId);
  const zeroRates = calculateTenorZeroRates(yieldCurveParams);
  // §3.25: the seed's curve has traded nothing; every point read off it says so.
  const sovereignCurve: TradedCurve & { tradedTenorsYears: number[] } = { fittedWeek: 0, tradedTenorsYears: [] };
  const neutralRate = getRegionNeutralRate(regionId);
  const policyRate = getRegionInitialPolicyRate(regionId);
  const gdpGrowth = getRegionProductivityGrowth(regionId);
  const targetInflation = INFLATION_TARGET;
  const wageGrowth = Number((gdpGrowth + targetInflation).toFixed(4));

  const totalLaborForce = totalPopulation * (1 - NON_EMPLOYABLE_PCT) * LABOR_FORCE_PARTICIPATION;
  const totalEmployed = totalLaborForce * (1 - UNEMPLOYMENT_RATE);
  const estimatedNominalGdpLocal = Math.round((totalEmployed * productivityPerCapita));
  const governmentEmployment = Math.round(totalPopulation * GOV_EMPLOYMENT_SHARE_OF_POPULATION);

  const baseAnnualWageLocal = getBaseAnnualWageLocal(regionId);
  const occupationLaborForceShare: Record<OccupationType, number> = { ...BASELINE_OCCUPATION_LABOR_FORCE_SHARE };
  const occupationPools: Record<OccupationType, OccupationPool> = {} as Record<OccupationType, OccupationPool>;
  (Object.keys(occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
    occupationPools[occ] = {
      employed: Math.round(totalEmployed * occupationLaborForceShare[occ]),
      wageIndex: 1.0,
      wageGrowthAnnual: wageGrowth,
    };
  });

  const governmentRevenueLocal = Math.round(((estimatedNominalGdpLocal * EFFECTIVE_TAX_RATE) / 52));

  // Household income comes from the one shared national-accounts derivation (wages + capital
  // income + government transfers, net of household tax) that the weekly evolution also uses,
  // so the cold start and week 1 describe the same economy. At init the unemployment-benefit
  // component sits well inside the government's standing transfer budget, so it does not raise
  // the total — it becomes the variable part of it once unemployment moves.
  const totalWageIncomeLocal = (Object.keys(occupationPools) as OccupationType[]).reduce(
    (sum, occ) => sum + baseAnnualWageLocal[occ] * occupationPools[occ].employed, 0
  );
  const initialUnemploymentBenefitsLocal = (Object.keys(occupationPools) as OccupationType[]).reduce((sum, occ) => {
    const unemployedInPool = totalLaborForce * occupationLaborForceShare[occ] - occupationPools[occ].employed;
    return sum + baseAnnualWageLocal[occ] * Math.max(0, unemployedInPool) * UNEMPLOYMENT_REPLACEMENT_RATE;
  }, 0);
  const totalGovDebtLocal = estimatedNominalGdpLocal * DEBT_TO_GDP_PCT;
  const govDebtTranches: GovDebtTranche[] = GOV_DEBT_TENOR_WEIGHTS.map(({ tenorYears, tenorWeeks, weight }) => ({
    id: govBondTrancheId(regionId, tenorYears, 'INIT'),
    principalLocal: Math.round((totalGovDebtLocal * weight)),
    couponRate: Number(curvePointAt(tenorYears, yieldCurveParams, sovereignCurve).rate.toFixed(4)),
    // §3.13-SOV: the two dates are ONE span, so they are rounded ONCE. Rounding each end
    // separately made an odd tenor a week longer than it claimed — a 13-week bill seeded at
    // origination −7 and maturity +7 is a 14-week bill, and `(maturity − origination) / 52` then
    // disagreed with the `tenorAtIssuanceYears` beside it on 20 of 260 rungs. Two representations
    // of one fact, disagreeing (rule 4); with one rounding they agree exactly, which is what lets
    // the stored tenor be deleted rather than reconciled.
    originationWeek: -Math.floor(tenorWeeks / 2),
    maturityWeek: tenorWeeks - Math.floor(tenorWeeks / 2),
    // §3.13-SOV: a sovereign is a bond. FIXED (`bond.md` N5.a) and SENIOR (N13.a — all sovereign
    // claims rank equally; the answer is stated rather than left absent).
    rateType: 'FIXED' as const,
    seniority: 'SENIOR' as const,
  }));

  // PUB1 (§7.4): the debt stack exists at week 0, so its interest is in the decomposition from
  // week 0 too — otherwise the seed opens on a transfer base the engine immediately shrinks.
  const seedInterestWeeklyLocal = weeklyInterestExpenseLocal(govDebtTranches.map(govTrancheView));
  const seedWageSplit = splitWageBill(totalWageIncomeLocal);
  // PUB3 (§7.4): the government has its staff at week 0, so it owes them at week 0 — computed by
  // the same function the weekly step uses, off the same pools.
  const seedPayrollWeeklyLocal = governmentPayrollWeeklyLocal({
    governmentEmployment,
    baseAnnualWageLocal,
    wageIndexByOccupation: Object.fromEntries(
      (Object.keys(occupationPools) as OccupationType[]).map(o => [o, occupationPools[o].wageIndex])
    ),
    occupationMix: GOVERNMENT_OCCUPATION_MIX,
  });
  const seedLifeCycle = createLifeCycleDistribution(getRegionBirthRateAnnual(regionId));
  // PUB3b (§7.4): the seed budget is the same sum of real obligations the weekly step computes,
  // so week 0's fiscal state and week 1's are the same shape rather than two derivations.
  const seedAvgAnnualWageLocal = totalEmployed > 0 ? totalWageIncomeLocal / totalEmployed : 0;
  const seedObligations = governmentObligationsWeeklyLocal({
    interestWeeklyLocal: seedInterestWeeklyLocal,
    payrollWeeklyLocal: seedPayrollWeeklyLocal,
    unemploymentBenefitsWeeklyLocal: initialUnemploymentBenefitsLocal / 52,
    retiredPopulation: totalPopulation * (seedLifeCycle.RETIRED?.shareOfPopulation ?? 0),
    averageAnnualWageLocal: seedAvgAnnualWageLocal,
    fiscalStanceScore: 0,
  });
  const governmentSpendingWeeklyLocal = Math.round(seedObligations.totalLocal);
  const estimatedHouseholdIncomeLocal = Math.round(computeHouseholdDisposableIncomeLocal({
    wageIncomeLocal: totalWageIncomeLocal,
    transfersWeeklyLocal: seedObligations.transfersLocal,
  }));
  // COH3 — `assertHouseholdIncomeIdentity` is GONE, and the reason is that it could not fail.
  // Both sides of it came from the same four constants, so it was a tautology dressed as a check
  // — and its real effect was to PIN the seed to an identity the model stopped using in week 1,
  // when household income became the measured sum of what employers actually pay (§7.96). A check
  // that cannot fire is not a check; what would catch a real break is the cohort identity the
  // harness already asserts, which compares two things that are separately derived.
  const lastWeekNominalGdpLocal = estimatedNominalGdpLocal;

  // HH4 — §7.4: the cohorts are seeded by the same builder the weekly evolution runs, off the
  // same pools and wages, so week 0 decomposes into exactly the cells week 1 will. Debt service
  // is 0 here because the itemized books do not exist until the simulation-side seed migration
  // runs; the first weekly pass fills it, and the field feeds only the recorded burden.
  const seedWealthDistribution = createWealthDistribution(estimatedHouseholdIncomeLocal);
  const laborForceByOccupation = {} as Record<OccupationType, number>;
  (Object.keys(occupationLaborForceShare) as OccupationType[]).forEach((occ) => {
    laborForceByOccupation[occ] = totalLaborForce * occupationLaborForceShare[occ];
  });
  const seedCohorts = buildHouseholdCohorts({
    regionId,
    occupationPools,
    baseAnnualWageLocal,
    laborForceByOccupation,
    governmentTransfersWeeklyLocal: seedObligations.transfersLocal,
    // The seed has no accumulated deposits yet, so every tier opens below its buffer and saves
    // toward it — which is the opening condition a cold start should have (§7.4).
    liquidAssetsLocal: 0,
    // DEM/DIST — the seed's own stationary age structure decides it, like every other week.
    retiredShareOfPopulation: seedLifeCycle.RETIRED.shareOfPopulation,
    weeklyDebtServiceLocal: 0,
    // Zero here to match the zero debt service: both sides of the budget loop arrive together
    // at the HH3 seed migration, which re-derives the cohorts with the real books.
    annualCapitalReceiptsLocal: { depositInterestLocal: 0, dividendsLocal: 0 },
    wealthDistribution: seedWealthDistribution,
  });
  // The tier income lines open as the DERIVED sums they will be every week from here on —
  // the income-ranked 15/45/25/15 shape the raw seed carried was a different ranking (income
  // deciles) misapplied to wealth tiers, and week 1 would overwrite it anyway.
  (Object.keys(seedWealthDistribution) as WealthTier[]).forEach((t) => {
    seedWealthDistribution[t].shareOfIncomeLocal = Math.round((seedCohorts.tierDisposableLocal[t] ?? 0));
  });

  const netInterestMarginPct = Number(Math.max(NIM_FLOOR, policyRate * NIM_TO_POLICY_RATE_RATIO + 0.005).toFixed(4));
  // §5-WIRES D: the seed states no loan-book scalar — the books are the rows the seed migrations
  // build (SME pools from segment EBITDA, household pools from the households' own debt). The
  // stated loan-to-GDP ratios survive only where the seed SIZES something off them
  // (`seedLoanBookLocal`: a bank's opening revenue, the consumer scalar the HH3 migration replaced).
  const bankingSector = {
    bankEquityLocal: Math.round((estimatedNominalGdpLocal * BANK_BALANCE_SHEET_RATIOS.bankEquityToGdp)),
    bankCapitalRatio: BANK_CAPITAL_RATIO,
    netInterestMarginPct,
    loanLossProvisionRateAnnualPct: LOAN_LOSS_PROVISION_RATE,
    creditConditionsIndex: 0,
    moneySupplyM2Local: 0,
    itemizedHoldings: [],
    srfBorrowingLocal: 0,
    onRrpLendingLocal: 0,
    // WS6: overnight positions are struck weekly and mature at the next session, so a cold
    // start opens with an empty book — the same shape the weekly engine produces (§7.4).
    repoLentLocal: 0,
    repoBorrowedLocal: 0,
    businessLoans: [],
    householdLoans: [],
    wholesaleFundingLocal: 0,
  };
  // §3.13-BOOK d3b: the provisional sovereign-book scalar (a GDP ratio) sizes a bank's opening
  // revenue in the generator and nothing else; it rides a stash, never a field.
  stashSeedSovereignBookLocal(bankingSector, Math.round((estimatedNominalGdpLocal * BANK_BALANCE_SHEET_RATIOS.sovereignBondHoldingsToGdp)));
  // §5-WIRES A3.6c: the seed's stated reserves ride the opening-cash stash (the same channel a
  // firm's opening cash rides) until close-seed opens each bank's account; no sheet carries them.
  stashOpeningCash(bankingSector, Math.round(estimatedNominalGdpLocal * BANK_BALANCE_SHEET_RATIOS.cashReservesToGdp));
  stashSeedHouseholdLine(bankingSector, Math.round(estimatedNominalGdpLocal * BANK_BALANCE_SHEET_RATIOS.depositsToGdp));

  const institutionalSector = {
    corpBondHoldingsLocal: 0,
    sovBondHoldingsLocal: 0,
    equityHoldingsLocal: 0,
    cashLocal: Math.round((estimatedNominalGdpLocal * INSTITUTIONAL_SECTOR_RATIOS.cashToGdp)),
    sectorEquityLocal: Math.round((estimatedNominalGdpLocal * INSTITUTIONAL_SECTOR_RATIOS.sectorEquityToGdp)),
    investmentIncomeMarginPct: INSTITUTIONAL_SECTOR_RATIOS.investmentIncomeMargin,
    itemizedHoldings: [],
  };

  const creditCardDebtLocal = Math.round((estimatedHouseholdIncomeLocal * HOUSEHOLD_DEBT_RATIOS.creditCardToIncome));
  const otherConsumerLoanDebtLocal = Math.round((estimatedHouseholdIncomeLocal * HOUSEHOLD_DEBT_RATIOS.otherConsumerLoanToIncome));
  const mortgageDebtLocal = Math.round((estimatedHouseholdIncomeLocal * HOUSEHOLD_DEBT_RATIOS.mortgageToIncome));
  const depositsLocal = Math.round((estimatedHouseholdIncomeLocal * HOUSEHOLD_DEBT_RATIOS.depositsToIncome));
  const equityHoldingsLocal = Math.round((estimatedHouseholdIncomeLocal * HOUSEHOLD_DEBT_RATIOS.equityHoldingsToIncome));
  const householdDebtToIncomeRatio = Number(((mortgageDebtLocal + creditCardDebtLocal + otherConsumerLoanDebtLocal) / Math.max(1, estimatedHouseholdIncomeLocal)).toFixed(3));

  // SEG-A: the SME pools are seeded from the region's REAL demand, so they are built after
  // `categoryDemand` exists (below, once the region object is assembled).
  const smePools: SmePool[] = [];

  const region: Region = {
    id: regionId,
    name: identity.name,
    categoryDemand: {},
    currency: identity.currency,
    symbol: identity.symbol,
    centralBank: identity.centralBank,
    cycleRegime: 'Expansion',
    laggedCorporateDemandBase: 0,
    inversionWeeksCount: 0,
    recessionShockQueue: [],
    estimatedHouseholdIncomeLocal,
    bankingSector,
    // OWN1: the three ownership registers are MEASURED off the real books at the end of every
    // week (stage 11), never assigned. A region is born owning nothing because nothing has been
    // placed yet; the seed places the books a few hundred lines later in simulation/
    // initialization.ts and the first measurement reads them.
    equityOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    corpBondOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    sovBondOwnership: { bankShare: 0, institutionalShare: 0, centralBankShare: 0 },
    institutionalSector,
    centralBankBalanceSheet: estimatedNominalGdpLocal * BANK_BALANCE_SHEET_RATIOS.centralBankBalanceSheetToGdp,
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
    cpiHistory: openingCpiHistory(CPI_BASE_LEVEL),
    coreCpiHistory: openingCpiHistory(CPI_BASE_LEVEL),
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
    exportsLocal: 0,
    importsLocal: 0,
    fxReservesLocal: Math.round((estimatedNominalGdpLocal * 0.002)),
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
    estimatedNominalGdpLocal,
    derivedNominalGdpLocal: estimatedNominalGdpLocal,
    gdpGrowthBottomUp: 0,
    smoothedWeeklyGrowthRate: 0,
    lastWeekNominalGdpLocal,
    nominalGdpHistory: seedNominalGdpHistory(estimatedNominalGdpLocal, gdpGrowth + targetInflation),
    consumptionComponentLocal: 0,
    investmentComponentLocal: 0,
    effectiveTaxRate: CORPORATE_TAX_RATE_BY_REGION[regionId],
    governmentRevenueLocal,
    governmentSpendingWeeklyLocal,
    governmentPayrollWeeklyLocal: Math.round(seedPayrollWeeklyLocal),
    governmentInterestWeeklyLocal: Math.round(seedInterestWeeklyLocal),
    employerPayrollTaxWeeklyLocal: Math.round((seedWageSplit.employerPayrollTaxLocal / 52)),
    // PUB2 (§7.4): the CB opens holding its real share of the stock, with the TGA at its
    // operating balance and currency as the residual that closes the balance sheet. Bank
    // reserves are the banks' own cash and are not stored here — one representation.
    centralBankSheet: {
      region: regionId,
      // §3.13-SOV row 3 / §3.13-BOOK d3a: the central bank's book names the BONDS it holds, and
      // it is REGISTER ROWS — the seed's sizing is stashed below and issued by wire at
      // `openSeededBooks`, not a field on this sheet.
      // §5-WIRES A3.5: the treasury's account opens at its operating balance — stashed here,
      // opened as the government's row before close-seed (initialization.ts). No field.
      // §5-CLOSE: a stored liability at zero — never a residual.
      currencyInCirculationLocal: 0,
      // The window opens empty: nothing is parked until the first repo session runs.
      reverseRepoBorrowedLocal: 0,
      loansToBanksLocal: 0,
      foreignOfficialClaimsUSD: 0,
      standingFacilityLentLocal: 0,
      lastRemittanceLocal: 0,
      // PUB2b: no order outstanding at birth — the first week's redemptions set the first one.
      plannedPurchasesByBond: {},
      reinvestmentShare: 1,
      lastOpenMarketPurchasesLocal: 0,
      lastOrderPlacedLocal: 0,
      lastReserveDrainLocal: 0,
    },
    // Seeded from the stack this function just built, so week 0 rates the sovereign off the same
    // ratio week 1 will (§7.4).
    debtToGdpPctBottomUp: estimatedNominalGdpLocal > 0 ? totalGovDebtLocal / estimatedNominalGdpLocal : 0,
    // §5-WIRES A3.4: the sector's deposits are its rows at the banks; the seed's provisional
    // sizing rides a stash until close-seed strikes the lines and opens the rows.
    householdState: withOpeningCash({
      creditTierBooks: generateCreditTierBooks(creditCardDebtLocal, otherConsumerLoanDebtLocal),
      wageGrowth,
      savingsRate: HOUSEHOLD_SAVINGS_RATE,
      realConsumptionGrowth: Number((gdpGrowth * 0.7).toFixed(4)),
      householdDebtToIncomeRatio,
      // HH4: derived from the seed cohorts' budgets, the same way every later week derives them.
      stapleSpendShare: Number(seedCohorts.spendShares.staple.toFixed(4)),
      standardSpendShare: Number(seedCohorts.spendShares.standard.toFixed(4)),
      luxurySpendShare: Number(seedCohorts.spendShares.luxury.toFixed(4)),
      cohorts: seedCohorts.cohorts,
      // MS1: the real components are struck by the simulation's first weekly pass, which is the
      // only place that knows the cleared prices and the private tier. The seed therefore opens
      // with the whole stock UNMODELED and lets that line be paid down as real claims are found —
      // §7.4's seed-shape rule: seed the shape the engine produces, never a second version of it.
      equityHoldingsLocal,
      directEquityLocal: 0,
      housingStockLocal: 0,
      priorNetWorthLocal: 0,
      homeEquityLocal: 0,
      institutionalClaims: [],
      institutionalClaimsLocal: 0,
      etfShares: [],
      etfHoldingsLocal: 0,
      privateBusinessEquityLocal: 0,
      mortgageDebtLocal,
      creditCardDebtLocal,
      otherConsumerLoanDebtLocal,
      netWorthLocal: 0,
    }, depositsLocal),
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
    sovereignCurve,
    historicalZeroCurves: [{ week: 1, ...zeroRates }],
    wealthDistribution: seedWealthDistribution,
    housingMarket: createHousingMarket(regionId, estimatedHouseholdIncomeLocal, totalPopulation),
    // DEM — the age structure the stage shares above are bands OF (rule 4).
    ageDistribution: stationaryAgeDistribution(getRegionBirthRateAnnual(regionId)),
    lifeCycleDistribution: seedLifeCycle,
  };
  stashOpeningCash(region.centralBankSheet!, Math.round(governmentSpendingWeeklyLocal * TGA_TARGET_WEEKS_OF_SPENDING));
  // PUB2 (§7.4): the CB opens holding its real share of the stock, bond by bond (§3.13-SOV row 3).
  stashSeedCentralBankBook(region.centralBankSheet!, govDebtTranches.reduce((acc, t) => {
    acc[t.id] = (acc[t.id] ?? 0) + t.principalLocal * CENTRAL_BANK_SOVEREIGN_SHARE;
    return acc;
  }, {} as Record<string, number>));

  region.categoryDemand = createInitialCategoryDemand(gdpGrowth, estimatedHouseholdIncomeLocal, lastWeekNominalGdpLocal, totalPopulation, TARGET_FIRMS_PER_REGION);

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
  // employment share (rule 2), and the last of the three tiers to state its headcount rather
  // than derive it. A pool's revenue is gross output like anyone else's, so its value added is
  // what is left after the inputs its industry consumes, and its headcount is that over output
  // per worker. One rule for all three tiers means a change to it cannot land in one and miss
  // the others, which is exactly how the named tiers came to disagree (§7.119).
  //
  // Margin is the named tier's own sector margin less the SME discount — read from the SAME
  // `SECTOR_PROFILE` the company generator uses, so there is one margin primitive, not two.
  {
    const demandOf = (unitId: string) => region.categoryDemand[unitId]?.demandLevelAnnualLocal ?? 0;
    const revenueByIndustry = new Map<Industry, number>();
    SME_POOL_INDUSTRIES.forEach((industry) => {
      const industryDemandLocal = smePoolSubUnits(industry).reduce((a, su) => a + demandOf(su.unitId), 0);
      revenueByIndustry.set(industry, industryDemandLocal * INDUSTRY_REGISTRY[industry].smeShareOfActivity);
    });
    SME_POOL_INDUSTRIES.forEach((industry) => {
      const annualRevenueLocal = Math.round((revenueByIndustry.get(industry) ?? 0));
      if (annualRevenueLocal <= 0) return;
      const sector = INDUSTRY_REGISTRY[industry].sector;
      smePools.push({
        industry,
        employment: smePoolEmployment(industry, annualRevenueLocal, productivityPerCapita),
        annualRevenueLocal,
        marginPct: Number((sectorBaselineMarginPct(sector) * (1 - SME_MARGIN_DISCOUNT)).toFixed(4)),
        // No lender yet: the seed migration (bank-lending.ts) itemizes what the banks can
        // actually carry onto real loans and writes this back as their derived sum (rule 4).
        debtLocal: 0,
        defaultRateAnnualPct: 0.02,
        // DIST — the pool's leverage cross-section, struck from the same rule the named tier
        // uses. Its debt is migrated later (bank-lending's seed), so the mean is re-centred on
        // the pool's real book every week; what is seeded here is the SHAPE.
        strata: seedPoolLeverageStrata(SME_SEED_LEVERAGE_MULTIPLE, SME_POOL_STRATA_COUNT),
        capexLocal: Math.round((annualRevenueLocal * 0.05)),
      });
    });
  }

  // §3.13-SOV row 2: the ladder the seed just built is the STORE's, not a field on the region.
  // It rides a stash until `openSeededBooks` issues its rows and then it is gone.
  stashSeedGovLadder(region, govDebtTranches);
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
/** The seed's STATED loan book for one region and book, off its nominal GDP — a stated number
 *  (R's registry), read only by the seed's own sizing arithmetic, never stored on a sheet. */
export function seedLoanBookLocal(nominalGdpLocal: number, book: 'business' | 'consumer'): number {
  return Math.round(nominalGdpLocal * (book === 'business' ? BANK_BALANCE_SHEET_RATIOS.businessLoanBookToGdp : BANK_BALANCE_SHEET_RATIOS.consumerLoanBookToGdp));
}

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
    };
  });
}

/**
 * Initial Commodities — generic, non-real-ticker names/ids (see bootstrap/commodities-and-fx.ts)
 *
 * §3.22: the seed level is the marginal producer's cost per unit (NAT1), and stating it against
 * the linked sub-unit's seed print is what fixes the commodity's UNIT (rule 8 — a barrel is so
 * many units of `upstream_extraction`, the way a tonne is so many bushels). The seed's print is
 * then the same read every week makes (`domain/commodity-spot.ts`), so week 0 and week 1 are one
 * shape (§7.4). Runs after the linkage is calibrated, because the week's units are read in the
 * commodity's share.
 */
export function getInitialCommodities(regions: Record<RegionId, Region>, fxToUsd: FxToUsd): Commodity[] {
  const rf = 0.045;
  return GENERATED_COMMODITIES.map((def) => {
    const spotPrice = getCommodityBaseSpotPrice(def);
    const linkage = commodityLinkageOf(def.id);
    const seed: Commodity = {
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
      goodsUnitsPerUnit: goodsUnitsPerCommodityUnitOf(spotPrice, linkage.subUnitId, regions, fxToUsd),
    };
    return markCommodityToAuction(seed, regions, fxToUsd);
  });
}
