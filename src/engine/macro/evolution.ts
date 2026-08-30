import { isActiveCompany } from '../../domain/company';
import { NelsonSiegelParams } from '../nelsonSiegel';
import { priceCommodityFutures } from '../pricing';
import { RegionId, Region, FxPair, Commodity, HouseholdState, Industry, OccupationType, OccupationPool, Company, COMMODITY_CATEGORY_LINKAGE, WealthTier, HousingMarket } from '../../types';
import { getBaseAnnualWageUSD, BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../bootstrap/labor-and-wages';
import {
  computeHouseholdDisposableIncomeUSD,
  UNEMPLOYMENT_REPLACEMENT_RATE,
} from '../bootstrap/national-accounts';
import { evolveBankingSector, computeSovereignBookAnnualYield } from './banking';
import {
  CREDIT_FILE_CURE_WEEKLY, CONSUMER_CREDIT_RISK_WEIGHT, CARD_OPERATING_COST_BPS,
  MORTGAGE_SPREAD_OVER_10Y_BPS, MORTGAGE_TERM_WEEKS, MORTGAGE_DSTI_LIMIT, MORTGAGE_LTV_AT_ORIGINATION,
  HOUSING_TURNOVER_RATE_ANNUAL,
} from '../../domain/banking';
import { quoteHouseholdMarginBps } from '../simulation/stages/bank-lending';
import { GOVERNMENT_OCCUPATION_MIX, AVERAGE_HOUSEHOLD_SIZE } from '../../domain/region-macro';
import { smePoolLinkedCommodities } from '../../domain/industry-registry';
import { evolveRegionalWeather } from './weather';
import { createWealthDistribution, createHousingMarket, createLifeCycleDistribution } from './initialization';
import { random } from '../rng';
import {
  weeklyInterestExpenseUSD, governmentPayrollWeeklyUSD, governmentObligationsWeeklyUSD,
  GOV_HIRING_RESPONSE_TO_STANCE,
} from '../../domain/government';
import { EFFECTIVE_LOWER_BOUND } from '../../domain/central-bank';
import { splitWageBill } from '../bootstrap/national-accounts';
import { buildHouseholdCohorts, tierWealthMpc, WEALTH_TIERS } from './household-cohorts';
import {
  getRegionDeathRateAnnual, stationaryAgeDistribution, mortalityHazardAnnual, MAX_AGE_YEARS,
  RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS,
} from '../bootstrap/population';

/**
 * Cents of extra consumption per dollar of extra wealth — the marginal propensity to consume out
 * of wealth, which every empirical study puts at three to five cents. A structural primitive with
 * one owner; it becomes an outcome in HH4, where cohorts differ in how much of a windfall they
 * spend (a low-income cohort spends nearly all of it, a wealthy one almost none).
 */
const WEALTH_MARGINAL_PROPENSITY_TO_CONSUME = 0.04;

/**
 * FRM — the sovereign's own budget position, both figures MEASURED.
 *
 * `debtToGdpPctBottomUp` is stage 11's real debt stack over measured GDP; the deficit is what
 * the government's real obligations exceeded its real receipts by (PUB3b), annualised. Before
 * this the rating read a `debtToGdpPct` walked from a stance step-function and a `tanh` of the
 * output gap — a second representation of a quantity the model already measured, and the one the
 * sovereign spread actually followed.
 */
/**
 * FRM — the opening rating, from the seeded stack's own position through the same two thresholds
 * the weekly review uses (§7.4: seed by the engine's own code). It replaces four ASSIGNED labels
 * (USA AA, UK AA, JPN A, EUR AAA) — real-world outcomes, which rule 4 forbids. Regions that open
 * with identical fiscal positions open at the same rating, and that is correct: nothing about
 * the seed makes one of them a weaker credit than another.
 */
export function openingSovereignRating(debtToGdp: number, deficitPctGdp: number): Region['sovereignRating'] {
  if (debtToGdp > 1.2 && deficitPctGdp > 0.05) return 'BBB';
  if (debtToGdp < 0.9 && deficitPctGdp < 0.03) return 'AAA';
  return 'AA';
}

export function sovereignDebtToGdpRatio(region: Region): number {
  return region.debtToGdpPctBottomUp || 0;
}

export function sovereignDeficitPctGdp(region: Region): number {
  const gdpUSD = region.derivedNominalGdpUSD || region.estimatedNominalGdpUSD || 0;
  if (!(gdpUSD > 0)) return 0;
  return ((region.governmentOutlaysUSD - region.governmentRevenueUSD) * 52) / gdpUSD;
}

export function getBlendedWageGrowth(mix: Partial<Record<OccupationType, number>>, pools: Record<OccupationType, OccupationPool>): number {
  if (!pools) return 0.03;
  return Object.entries(mix).reduce((s, [occ, share]) => s + (pools[occ as OccupationType]?.wageGrowthAnnual ?? 0.03) * (share ?? 0), 0);
}


function pushAndReadLagged(buffer: number[], newValue: number, lagWeeks: number): { updatedBuffer: number[]; laggedValue: number } {
  const updatedBuffer = [...buffer, newValue].slice(-8);
  const laggedValue = updatedBuffer.length > lagWeeks ? updatedBuffer[updatedBuffer.length - 1 - lagWeeks] : updatedBuffer[0] ?? newValue;
  return { updatedBuffer, laggedValue };
}

export function evolveRegionMacro(
  region: Region,
  globalShock: { gdpShock: number; inflationShock: number },
  microFeedback: {
    capexGdpContribution: number;
    bottomUpUnemploymentDelta: number;
    trackedHealthSignal: number;
    publicCompanyEmployment: number;
    occupationDemand?: Record<OccupationType, number>;
    /** HH4b: market-cap-weighted average dividend yield of this region's listed companies —
     * what the households' direct equity actually pays. Computed in stage 02 from real state. */
    avgListedDividendYieldAnnual?: number;
  },
  week: number,
  equityReturn: number = 0,
  prevCommodities: Commodity[] = [],
  /** NAT2: the firms in this region — what it produces is what its weather can take from it. */
  allCompanies: Company[] = []
): {
  updatedRegion: Region;
  rateChanged: boolean;
  rateDeltaBps: number;
  isMeeting: boolean;
  diagnosticString: string;
} {
  const { updatedBuffer: newPolicyRateLagBuffer, laggedValue: laggedPolicyRate } = pushAndReadLagged(region.policyRateLagBuffer || [], region.policyRate, 6);
  const { updatedBuffer: newDemandShockLagBuffer, laggedValue: laggedDemandShock } = pushAndReadLagged(region.demandShockLagBuffer || [], globalShock.gdpShock, 4);
  
  const updatedWeather = evolveRegionalWeather(region.id, region.weather, week, allCompanies);

  // A weather event's effect on inflation is no longer injected into a CPI formula here. It was
  // an assumed 3% "share of CPI basket" applied to one commodity's price change — a second,
  // parallel account of something the simulation already models for real: bad weather cuts a real
  // commodity's real supply, that commodity's price clears higher in stage 07, its buyers' input
  // costs rise, and the goods households buy clear higher in stage 05's auction, which the price
  // index then measures. The real chain is the transmission; the shortcut around it was double
  // counting with an invented weight. `updatedWeather` still drives that real supply effect.

  // GDP Growth is derived bottom-up from C+I+G+NX identity in simulation core (Phase 4)
  const potentialGdp = region.potentialGdpGrowth;
  const newGdpGrowth = region.gdpGrowth;

  const prevHS: HouseholdState = region.householdState || {
    consumerConfidence: 100,
    wageGrowth: region.wageGrowth,
    savingsRate: 0.06,
    realConsumptionGrowth: 0.02,
    householdDebtToIncomeRatio: 1.05,
    stapleSpendShare: 0.35,
    standardSpendShare: 0.50,
    luxurySpendShare: 0.15,
    depositsUSD: region.estimatedHouseholdIncomeUSD * 0.6,
    equityHoldingsUSD: region.estimatedHouseholdIncomeUSD * 1.5,
    directEquityUSD: 0,
    housingStockUSD: 0,
    priorNetWorthUSD: 0,
    homeEquityUSD: 0,
    institutionalClaims: [],
    institutionalClaimsUSD: 0,
    etfShares: [],
    etfHoldingsUSD: 0,
    privateBusinessEquityUSD: 0,
    unmodeledFinancialAssetsUSD: region.estimatedHouseholdIncomeUSD * 1.5,
    mortgageDebtUSD: region.estimatedHouseholdIncomeUSD * 0.8,
    creditCardDebtUSD: region.estimatedHouseholdIncomeUSD * 0.05,
    otherConsumerLoanDebtUSD: region.estimatedHouseholdIncomeUSD * 0.1,
    netWorthUSD: region.estimatedHouseholdIncomeUSD * 1.0,
    creditTierBooks: [
      { tier: 'SUPER_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: 0, avgInterestRate: 0.06, delinquencyRatePct: 0.002 },
      { tier: 'PRIME', shareOfHouseholds: 0.35, debtBalanceUSD: 0, avgInterestRate: 0.12, delinquencyRatePct: 0.015 },
      { tier: 'NEAR_PRIME', shareOfHouseholds: 0.25, debtBalanceUSD: 0, avgInterestRate: 0.19, delinquencyRatePct: 0.045 },
      { tier: 'SUBPRIME', shareOfHouseholds: 0.15, debtBalanceUSD: 0, avgInterestRate: 0.28, delinquencyRatePct: 0.11 },
    ],
  };

  // RULE 13, OPEN: the fiscal stance is a step function on a regime LABEL — +0.15 in a labelled
  // recession above 7% unemployment, -0.10 in a labelled expansion 3pp above target, else decay
  // by 0.95. Five invented numbers deciding fiscal policy, and none of them is the government's
  // own budget position, which is what actually constrains a real stimulus. Owner: MAC.
  let newFiscalStanceScore = region.fiscalStanceScore;
  const piStar = region.targetInflation;

  // Evaluate once per quarter, same cadence as monetary policy meetings
  if (week % 13 === 0) {
    if (region.cycleRegime === 'Recession' && region.unemploymentRate > 0.07) {
      newFiscalStanceScore = Math.min(1, region.fiscalStanceScore + 0.15); // stimulus package
    } else if (region.cycleRegime === 'Expansion' && region.inflation > piStar + 0.03) {
      newFiscalStanceScore = Math.max(-1, region.fiscalStanceScore - 0.10); // austerity/consolidation
    } else {
      newFiscalStanceScore = region.fiscalStanceScore * 0.95; // slow decay back to neutral
    }
  }

  // Process recession shocks
  const remainingShocks = region.recessionShockQueue.filter(s => s.week !== week);

  // Inflation is NOT computed here. It is measured, in simulation/stages/price-index.ts, as the
  // year-over-year change in a real consumer basket priced at what stage 05's auction actually
  // clears. This carries last week's measured figure forward for the stages that read it before
  // the new measurement exists — most importantly the Taylor rule below, which is supposed to
  // react to the most recently published statistic, exactly as a real central bank does.
  const newInflation = region.inflation;

  const newEstimatedNominalGdpUSD = (region as any).lastWeekNominalGdpUSD > 0 ? (region as any).lastWeekNominalGdpUSD : region.estimatedNominalGdpUSD;

  // Tax rate is a slow second fiscal lever — austerity nudges it up, stimulus nudges it down, same cadence as fiscalStanceScore
  const taxRateDrift = week % 13 === 0 ? -newFiscalStanceScore * 0.001 : 0;
  const newEffectiveTaxRate = Math.max(0.10, Math.min(0.50, isFinite(region.effectiveTaxRate + taxRateDrift) ? region.effectiveTaxRate + taxRateDrift : 0.25));

  // FRM: revenue is MEASURED — stage 11 sums what the bases actually paid (PUB1b/1c). This
  // carries last week's measurement forward for the stages that read it before the new one
  // exists, exactly as inflation does above. The `GDP x tax rate` formula that used to sit here
  // was a second representation of the same quantity, and it was the one every stage between 02
  // and 11 saw.
  const newGovernmentRevenueUSD = region.governmentRevenueUSD;
  // PUB1: what the debt stack actually costs. Not added to spending — carved out of it.
  const govInterestWeeklyUSD = weeklyInterestExpenseUSD(region.govDebtTranches);

  let newCycleRegime: 'Expansion' | 'Slowdown' | 'Recession' | 'Recovery' = 'Slowdown';
  if (newGdpGrowth < 0) newCycleRegime = 'Recession';
  else if (newGdpGrowth > potentialGdp + 0.005) newCycleRegime = region.cycleRegime === 'Recession' ? 'Recovery' : 'Expansion';
  else if (region.cycleRegime === 'Recession' && newGdpGrowth >= 0) newCycleRegime = 'Recovery';

  const participationDrift = newCycleRegime === 'Recession' ? -0.0003 : (newCycleRegime === 'Recovery' ? 0.0002 : 0);
  const newParticipation = (region.laborForceParticipation + participationDrift);

  // Slow demographic drift — independent of the business cycle
  const nonEmployableDrift = (random() - 0.5) * 0.00002; // tiny, structural, not cycle-driven
  const newNonEmployablePct = (region.nonEmployablePct + nonEmployableDrift);


  let newPotentialGdpGrowth = region.potentialGdpGrowth;
  if (week % 52 === 0) {
    const laborForceTrend = (newParticipation - region.laborForceParticipation) * 52;
    const capexIntensityTrend = (microFeedback.capexGdpContribution * 0.15);
    const potentialGdpDrift = laborForceTrend * 0.3 + capexIntensityTrend;
    newPotentialGdpGrowth = (Number((region.potentialGdpGrowth + potentialGdpDrift).toFixed(4)));
  }

  const potentialGdpDelta = newPotentialGdpGrowth - region.potentialGdpGrowth;
  const newNeutralRate = Number((region.neutralRate + potentialGdpDelta).toFixed(4));

  const isHighUnemp = region.unemploymentRate > region.nairu + 0.005;
  const weeksAboveNairu = isHighUnemp ? (region.weeksAboveNairu ?? 0) + 1 : Math.max(0, (region.weeksAboveNairu ?? 0) - 2);
  const hysteresis = Math.min(0.015, weeksAboveNairu * 0.00005);
  const hysteresisDelta = isHighUnemp ? hysteresis / 52 : -hysteresis / 104;
  const baseNairu = week % 52 === 0
    ? (Number((region.nairu + (newParticipation - region.laborForceParticipation) * 52 * 0.15).toFixed(4)))
    : region.nairu;
  const newNairu = Number((baseNairu + hysteresisDelta).toFixed(4));

  // HH5: unemployment is no longer a formula here. It is the MEASURED outcome of the labor
  // market stage — real vacancies matched against real seekers — which runs after this one, so
  // this week's reading is the one that stage produced last week. The GDP-gap/NAIRU-pull/
  // participation drift that used to sit here is deleted along with `unemploymentRateBottomUp`,
  // a third representation that was written weekly, read by NOTHING, and wrong anyway (it
  // omitted the entire private tier and printed 37% against a full-employment economy).
  const newUnemployment = region.unemploymentRate;
  const unempDelta = 0;

  // Occupation Pools & Retraining Dynamics (Stage 2: X3 & X4)
  const defaultOccupationShares: Record<OccupationType, number> = BASELINE_OCCUPATION_LABOR_FORCE_SHARE;
  const currentLaborForceShares = region.occupationLaborForceShare || defaultOccupationShares;
  const currentOccupationPools = region.occupationPools || {
    GENERAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    SKILLED_TRADES: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    TECHNICAL_ENGINEERING: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    SPECIALIZED_PROFESSIONAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
    MANAGERIAL_FINANCIAL: { employed: 0, wageIndex: 1.0, wageGrowthAnnual: 0.03 },
  };


  // Consumer & Household Sector Simulation
  const nairu = newNairu; 
  const slackGap = nairu - newUnemployment;
  
  // Wage Lag (Part QC) - Smooth slackGap with EMA representing a multi-week lag structure
  const prevSmoothedSlackGap = region.smoothedSlackGap !== undefined ? region.smoothedSlackGap : slackGap;
  const newSmoothedSlackGap = prevSmoothedSlackGap * 0.85 + slackGap * 0.15;
  
  // FRM: households spend out of the wage they are actually paid. LAB made the wage a real
  // price — each firm sets `offeredWageIndex` from its own unfilled postings and its own margin
  // headroom, and each occupation pool's `wageGrowthAnnual` is the employment-weighted average
  // of what firms actually offered — and stage 08 and the UI have read that all along. The
  // Phillips curve that used to sit here (an intercept, a slack coefficient and an
  // expected-inflation coefficient, all invented) fed consumption and confidence instead, so
  // what households were paid and what they spent out of were two different numbers.
  //
  // Blended by the pools' own EMPLOYMENT, which is what "the region's wage growth" means. The
  // three-week lag buffer went with the formula: a measured wage is already the average of what
  // was offered over the weeks it took to fill those postings.
  const employedTotal = (Object.values(currentOccupationPools) as OccupationPool[])
    .reduce((s, p) => s + p.employed, 0);
  const newWageGrowth = employedTotal > 0
    ? (Object.values(currentOccupationPools) as OccupationPool[])
        .reduce((s, p) => s + p.wageGrowthAnnual * (p.employed / employedTotal), 0)
    : getBlendedWageGrowth(currentLaborForceShares, currentOccupationPools);
  const laggedWageGrowth = newWageGrowth;
  
  const cciUnempMultiplier = (newCycleRegime === 'Recession' || newCycleRegime === 'Slowdown') && unempDelta > 0 ? 0.75 : 0.5;
  const cciEquilibrium = 100 + (newWageGrowth - region.inflation) * 150 - Math.max(0, newUnemployment - nairu) * 200 - Math.max(0, region.expectedInflation - piStar) * 80 + laggedDemandShock * 1000;
  const cciReversion = (cciEquilibrium - prevHS.consumerConfidence) * 0.08;
  const unempShock = unempDelta > 0 ? cciUnempMultiplier * unempDelta * 100 : 0;
  const boundedEquityReturn = Math.max(-0.5, Math.min(0.5, isFinite(equityReturn) ? equityReturn : 0));
  const rawCCI = prevHS.consumerConfidence + cciReversion + 0.05 * (boundedEquityReturn * 100) - unempShock;
  const newCCI = isFinite(rawCCI) ? Math.max(30, Math.min(170, Number(rawCCI.toFixed(2)))) : 100;

  // Population Growth & Net Migration Dynamics (Part AG)
  // DEM — both clamps gone (rule 2). Population growth was held inside [−3%, +4%] and the
  // migration signal inside ±1%, so a region could neither shrink nor boom however its own
  // fertility, mortality and attractiveness moved — which is the whole quantity this project
  // exists to make vary. A population cannot go negative; that is arithmetic and stays below.
  const migrationAttractivenessSignal = ((newCCI - 100) / 100) * 0.0006;
  const birthRate = region.birthRateAnnual ?? 0.010;
  // DEM: mortality follows the share of the population that is old, which drifts every week, so
  // an ageing region's death rate rises on its own rather than sitting at a seeded constant.
  // DEM — THE DEATH RATE IS THE AGE STRUCTURE'S OWN, not a linear proxy off the retired share.
  //
  // `MORTALITY_PER_RETIRED_SHARE x retiredShare` was a fitted stand-in for an age structure the
  // model did not have; now it does, so the crude rate is what the hazard actually kills:
  // the population-weighted integral of the Gompertz hazard over every age. An ageing region's
  // death rate rises because its people are older, which is the mechanism the proxy was imitating.
  const agesForDeaths = region.ageDistribution && region.ageDistribution.length === MAX_AGE_YEARS
    ? region.ageDistribution
    : stationaryAgeDistribution(birthRate);
  const deathRate = agesForDeaths.reduce((a, w, age) => a + w * mortalityHazardAnnual(age), 0);
  const migrationRate = region.netMigrationRateAnnual ?? 0;
  const netAnnualGrowthRate = birthRate - deathRate + migrationRate + migrationAttractivenessSignal;
  const netPopulationGrowthRate = netAnnualGrowthRate / 52;
  const newTotalPopulation = Math.max(1, Math.round(region.totalPopulation * (1 + netPopulationGrowthRate)));
  const totalLaborForce = newTotalPopulation * (1 - newNonEmployablePct) * newParticipation;

  // PUB3b: government headcount follows the POPULATION IT SERVES, leaning on the fiscal stance —
  // austerity freezes hiring, stimulus adds staff. It used to respond to spending growth, which
  // is now circular: payroll is the biggest line of the budget, so a budget derived from staffing
  // cannot also determine it. Population and stance are both real and neither depends on the
  // budget this week.
  const targetGovEmploymentGrowthRate =
    netPopulationGrowthRate + newFiscalStanceScore * GOV_HIRING_RESPONSE_TO_STANCE;
  const prevGovEmploymentGrowthRate = (region as any).govEmploymentGrowthRate ?? targetGovEmploymentGrowthRate;
  const govEmploymentGrowthRate = prevGovEmploymentGrowthRate * 0.85 + targetGovEmploymentGrowthRate * 0.15;
  const newGovernmentEmployment = Math.max(1, Math.round(region.governmentEmployment * (1 + govEmploymentGrowthRate)));

  // DIST/MAC — `newSavingsRate` is no longer decided here. It used to be
  // `0.05 + inflation gap x 0.5 − confidence x 0.1 + real-rate gap x 0.4`, four coefficients
  // deciding the most consequential number in the model, with the tier cross-section normalised
  // to whatever they produced. It is now MEASURED off the cohorts' own budgets, below the point
  // where they are built — see `household-cohorts.ts` for the buffer rule that replaces it and
  // for where the policy rate went (debt service and deposit interest, both per tier).


  // 1. Asset side — HH4d: the household deposit stock is OWNED by the banking pass now (one
  // representation: the banks' household-deposit lines, summed back onto this state by the
  // bank-diversification stage, with real flows — savings in, money-fund diversion out, the
  // banks' own competitive deposit interest, mortgage credit, lagged ETF settlements). This
  // stage carries the stock forward untouched.
  const newDepositsUSD = Math.max(0, prevHS.depositsUSD || 0);

  // MS1: household equity is no longer a stock that appreciates by a formula return. It is the
  // sum of real claims — index-fund shares, listed float, founder stakes in the private tier —
  // plus the named gap for assets the universe cannot yet back, and every one of those is MARKED
  // from cleared prices in `stages/etf-flows.ts`, which runs after the clearing books. This stage
  // runs before them, so it carries the line forward and lets the marking stage own its value.
  // The one-week lag is the same one stage 08 has against the prices it reads.
  const newEquityHoldingsUSD = Math.max(0, prevHS.equityHoldingsUSD || 0);

  // 2. Liability side — HH3: household debt is no longer evolved here by paydown constants
  // and a borrowing multiplier. The three lines are DERIVED SUMS of the itemized pools on the
  // named banks' books; the bank-diversification stage originates (priced, capital-gated,
  // demand off the same confidence-and-rate appetite that used to live here), amortizes by
  // annuity arithmetic on each pool's own terms, and writes the sums back. This stage carries
  // last week's lines forward and reads last week's real flows.
  const newMortgageDebtUSD = prevHS.mortgageDebtUSD || 0;
  const newCreditCardDebtUSD = prevHS.creditCardDebtUSD || 0;
  const newOtherLoanDebtUSD = prevHS.otherConsumerLoanDebtUSD || 0;

  // HH5/HH6: this stage no longer sets employment OR wages. Employment is matched in the
  // labor market stage; the going wage per occupation is the employment-weighted average of
  // what real firms offer, set there too. The tightness->wage formula that used to live here
  // walked an index no employer's payroll referred to — the last piece of the wage that was
  // nobody's decision. The pools pass through untouched.
  const newOccupationPools = currentOccupationPools;

  // X4: Retraining friction — slow, asymmetric flow between pools
  const avgWageIndex = (Object.values(newOccupationPools) as OccupationPool[]).reduce((s, p) => s + p.wageIndex, 0) / 5;
  const newLaborForceShares: Record<OccupationType, number> = { ...currentLaborForceShares };
  (Object.keys(newOccupationPools) as OccupationType[]).forEach(occ => {
    const wageGapVsAvg = newOccupationPools[occ].wageIndex / Math.max(0.01, avgWageIndex) - 1;
    const retrainingSpeed = occ === 'GENERAL' ? 0.015 : (occ === 'SPECIALIZED_PROFESSIONAL' || occ === 'TECHNICAL_ENGINEERING') ? 0.003 : 0.008;
    newLaborForceShares[occ] = ((currentLaborForceShares[occ] ?? defaultOccupationShares[occ]) + wageGapVsAvg * retrainingSpeed);
  });

  const shareSum = Object.values(newLaborForceShares).reduce((s, v) => s + v, 0);
  if (shareSum > 0) {
    (Object.keys(newLaborForceShares) as OccupationType[]).forEach(occ => {
      newLaborForceShares[occ] = Number((newLaborForceShares[occ] / shareSum).toFixed(4));
    });
  }

  // Private-Sector Segments evolution driven by specific demand signals & occupational wage costs
  // HH3: the real book change — this week's derived sum against last week's (both written by
  // the lending pass), not a paydown formula's drift.
  const rawMortgageGrowthSignal = (prevHS.priorMortgageDebtUSD ?? 0) > 0
    ? (newMortgageDebtUSD / (prevHS.priorMortgageDebtUSD ?? newMortgageDebtUSD) - 1) * 52
    : 0;
  const mortgageGrowthSignal = Number.isFinite(rawMortgageGrowthSignal) ? Math.max(-0.15, Math.min(0.20, rawMortgageGrowthSignal)) : 0;
  // SEG-A/D: the pools are NOT walked here any more. Revenue used to move by
  // `demandSignal x 0.06` and employment by `x 0.05`, both clamped to +/-4%/wk, off a
  // hand-written switch mapping five buckets to a few category growth rates (with
  // CONSTRUCTION_REALESTATE hardcoded to `return 0`). That is an imposed outcome (rule 13) and
  // it froze the tier's composition at its seed shares forever, because every bucket got the
  // same treatment and nothing ever reallocated between them.
  //
  // What replaces it: a pool's revenue is what it MEASURABLY SOLD in stage 05's auctions
  // (SEG-B credits it there), its employment is set by the labor market off that revenue like
  // any named firm's, its margin moves with its own measured costs, and its debt is the derived
  // sum of the banks' pool loans. This stage carries the state forward and owns nothing of it.
  const newSmePools: any[] = (region.smePools || []).map(seg => ({ ...seg }));



  const totalHouseholdDebtUSD = newMortgageDebtUSD + newCreditCardDebtUSD + newOtherLoanDebtUSD;
  const newHouseholdDebtToIncomeRatio = region.estimatedHouseholdIncomeUSD > 0
    ? totalHouseholdDebtUSD / region.estimatedHouseholdIncomeUSD
    : prevHS.householdDebtToIncomeRatio;

  // 3. Net worth
  const newNetWorthUSD = newDepositsUSD + newEquityHoldingsUSD - totalHouseholdDebtUSD;
  const netWorthToIncomeRatio = region.estimatedHouseholdIncomeUSD > 0
    ? newNetWorthUSD / region.estimatedHouseholdIncomeUSD
    : 1.0;

  // 4. Wealth-effect correction in CCI & consumption.
  //
  // Driven by the CHANGE in wealth, not its level. The old form was
  // `(netWorthToIncomeRatio - 1.0) * 0.006` — a LEVEL feeding a GROWTH rate, which is a units
  // error (rule 9) that stayed invisible while the ratio sat near 1.5 and the term was worth
  // 0.3%. HH2 put the house on the balance sheet, the ratio went to 4.6x, and the same expression
  // started adding ~1.9 percentage points to real consumption growth every week forever.
  //
  // A wealth effect is a marginal propensity to consume out of a CHANGE in wealth: a dollar more
  // wealth buys a few cents more consumption, once. Expressed against income it is a rate, which
  // is what this line needs to be.
  // HH4c: the wealth effect is TIER-WEIGHTED — each tier's real marked net-worth change times
  // that tier's own propensity to consume it. A housing move (middle-held, high MPC) now moves
  // consumption roughly twice as hard per dollar as an equity rally (top-held, low MPC), which
  // is what the literature finds and the single constant could not express. Falls back to the
  // aggregate constant only while the tier marks have not run yet.
  const tierWealthEffectUSD = WEALTH_TIERS.reduce((a, t) => {
    const tier = region.wealthDistribution?.[t];
    if (!tier || tier.priorNetWorthUSD === undefined) return a;
    // DIST/COH: the propensity is DERIVED from this tier's own savings rate and how much of its
    // wealth is actually liquid — not a stated per-tier constant (§7.142).
    return a + tierWealthMpc(tier) * (tier.shareOfNetWorthUSD - tier.priorNetWorthUSD);
  }, 0);
  const anyTierMarked = WEALTH_TIERS
    .some((t) => region.wealthDistribution?.[t]?.priorNetWorthUSD !== undefined);
  const wealthChangeUSD = (prevHS.netWorthUSD ?? 0) - (prevHS.priorNetWorthUSD ?? prevHS.netWorthUSD ?? 0);
  const balanceSheetWealthEffect = (anyTierMarked
    ? tierWealthEffectUSD
    : WEALTH_MARGINAL_PROPENSITY_TO_CONSUME * wealthChangeUSD) / Math.max(1, region.estimatedHouseholdIncomeUSD);
  // HH3: the real card/term origination the banks actually granted last week — the same flow
  // that left their sheets as cash to the merchants.
  const creditFundedSpendingUSD = (prevHS.weeklyNewConsumerCreditUSD ?? 0) * 0.8; // credit directly buying goods
  const weeklyIncomeUSD = region.estimatedHouseholdIncomeUSD / 52;
  const creditSpendingBoostPct = weeklyIncomeUSD > 0 ? (creditFundedSpendingUSD / weeklyIncomeUSD) * 0.05 : 0;

  // HH3: the debt service burden is MEASURED — the interest and scheduled principal the
  // itemized books actually accrued last week, over weekly income — not a liability-weighted
  // guess at rates the books don't carry. (The books' own consumption debit waits on HH4's
  // cohort budgets AND a real dividend channel back to household income: debiting one side of
  // that loop alone is the HH1c leak in a new costume.)
  const baselineDebtServiceBurden = 0.055; // Baseline ~5.5% debt service burden of household income
  const newDebtServiceBurden = prevHS.weeklyDebtServiceUSD !== undefined
    ? prevHS.weeklyDebtServiceUSD / Math.max(1, weeklyIncomeUSD)
    : baselineDebtServiceBurden;
  const debtServiceDrag = (newDebtServiceBurden - baselineDebtServiceBurden) * 0.4;

  // Update newRealConsumptionGrowth with real balance-sheet channels:
  const trendConsumptionGrowth = region.potentialGdpGrowth * (newCCI / 100);
  // DIST/MAC — LAST week's measured savings rate. This term runs before the cohorts are built,
  // and the rate is now their output, so it reads the most recent one that exists. A lag here is
  // right anyway: what a household spends out of a real wage gain this week is governed by the
  // saving behaviour it already had, not by the one this week's budgets will turn out to imply.
  const priorSavingsRate = prevHS.savingsRate ?? 0.06;
  const realWageGainEffect = (1 - priorSavingsRate) * (laggedWageGrowth - region.inflation - 0.005);
  const newRealConsumptionGrowth = trendConsumptionGrowth
    + realWageGainEffect
    + balanceSheetWealthEffect
    + creditSpendingBoostPct
    - debtServiceDrag;


  const baseAnnualWageUSD = getBaseAnnualWageUSD(region.id);
  const totalWageIncomeUSD = (Object.keys(newOccupationPools) as OccupationType[]).reduce((sum, occ) => {
    const pool = newOccupationPools[occ];
    return sum + baseAnnualWageUSD[occ] * pool.wageIndex * pool.employed;
  }, 0);
  const totalEmployedForWages = (Object.keys(newOccupationPools) as OccupationType[])
    .reduce((sum, occ) => sum + newOccupationPools[occ].employed, 0);
  // PUB1c: the wage bill is total compensation; the employer's payroll tax leaves it first.
  const { grossWagesUSD, employerPayrollTaxUSD } = splitWageBill(totalWageIncomeUSD);
  // PUB3: the government's own share of that bill — the employees it really has, at the wages
  // the pools really cleared. Computed once here and read by the budget, the outlays and the
  // household transfer line, so the jobs and the payroll that pays for them cannot disagree.
  const newGovernmentPayrollWeeklyUSD = governmentPayrollWeeklyUSD({
    governmentEmployment: newGovernmentEmployment,
    baseAnnualWageUSD,
    wageIndexByOccupation: Object.fromEntries(
      (Object.keys(newOccupationPools) as OccupationType[]).map(o => [o, newOccupationPools[o].wageIndex])
    ),
    occupationMix: GOVERNMENT_OCCUPATION_MIX,
  });
  const unemploymentBenefitsUSD = (Object.keys(newOccupationPools) as OccupationType[]).reduce((sum, occ) => {
    const pool = newOccupationPools[occ];
    const availableSupplyForOcc = totalLaborForce * (currentLaborForceShares[occ] ?? defaultOccupationShares[occ]);
    const unemployedInPool = Math.max(0, availableSupplyForOcc - pool.employed);
    return sum + baseAnnualWageUSD[occ] * pool.wageIndex * unemployedInPool * UNEMPLOYMENT_REPLACEMENT_RATE;
  }, 0);
  // ---- PUB3b: the budget IS the sum of what the government really owes this week. The old
  // `revenue + deficit x GDP` made the whole fiscal state a share of a LAGGED nominal aggregate,
  // which is why revenue (real bases at real prices since PUB1b/1c) drifted away from outlays
  // whenever the price level moved. The deficit is now an OUTCOME, and the automatic stabilizer
  // is real: a recession puts people on benefits and takes the tax base down at the same time.
  const govObligations = governmentObligationsWeeklyUSD({
    interestWeeklyUSD: govInterestWeeklyUSD,
    payrollWeeklyUSD: newGovernmentPayrollWeeklyUSD,
    unemploymentBenefitsWeeklyUSD: unemploymentBenefitsUSD / 52,
    retiredPopulation: newTotalPopulation * (region.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0),
    averageAnnualWageUSD: totalEmployedForWages > 0 ? totalWageIncomeUSD / totalEmployedForWages : 0,
    fiscalStanceScore: newFiscalStanceScore,
  });
  const newGovernmentSpendingUSD = Math.max(1e8, govObligations.totalUSD);

  // The same national-accounts derivation the cold-start bootstrap uses. It used to be written
  // out separately here (wages + unemployment transfers + a flat 15% capital income, no tax and
  // no government transfers), so the week-1 economy did not describe the same one the bootstrap
  // had built — the two definitions have to be one definition.
  // HH4b — the capital receipts that recycle debt service back into the consumption budget:
  // real deposit interest, real dividends on the households' direct equity, and the named seed
  // residual (see the builder's input doc). At seed the sum equals debt service by the
  // residual's construction; from week 1 the two move apart with rates and payouts, and that
  // differential is the household rate channel.
  const annualCapitalReceiptsUSD = {
    // HH: what the banks MEASURABLY paid their household depositors last week, at their own
    // competitive deposit rates (02b sums it). The `deposits x policyRate x 0.6` this replaces
    // was a second derivation of a flow the banks already compute and post — rule 3, and it
    // disagreed with them by whatever the deposit competition was doing.
    depositInterestUSD: (region.householdDepositInterestWeeklyUSD ?? 0) * 52,
    dividendsUSD: (prevHS.directEquityUSD ?? 0) * (microFeedback.avgListedDividendYieldAnnual ?? 0),
    // HH: a LEVEL carried forward, not a share of the income it is an input to — the share form
    // made income depend on itself the moment income became the measured sum. It shrinks only
    // when one of HH4b's unbuilt receipt channels becomes a real payment (§6 watches it down).
    residualUSD: prevHS.unmodeledCapitalReceiptResidualAnnualUSD
      ?? (prevHS.unmodeledCapitalReceiptShareOfIncome ?? 0) * region.estimatedHouseholdIncomeUSD,
  };
  // HH — INCOME IS THE SUM OF PAYMENTS. It used to be
  // `computeHouseholdDisposableIncomeUSD(totalWageIncomeUSD, transfers)`: wages as
  // productivity x LABOR_SHARE_OF_OUTPUT across the occupation pools, capital income as a fixed
  // ratio to wages, tax as a flat effective rate. Three imposed constants deciding what half the
  // economy earns, while the employers who actually pay it were paying a different number
  // through settlement (rule 3, and the last big one in the household sector).
  //
  // What replaces it: what households MEASURABLY received last week — every employer's wage
  // payment, the government's transfers, and the interest the banks really paid on their
  // deposits — less the tax they really remitted, annualised. The dividend leg on their direct
  // equity is a real holding at a real cleared yield and stays; `capitalReceiptsAnnualUSD`
  // carries the ONE named residual left (HH4b's unbuilt receipt channels), as a level that
  // shrinks when a channel becomes real rather than as a share of the income it feeds.
  //
  // Non-circular by construction: wages come from each employer's own offer and headcount, not
  // from this number. The seed still opens on the identity (§7.4) and week 1 is the first week
  // this measurement exists.
  const measuredWeeklyReceiptsUSD = region.lastWeekHouseholdReceiptsUSD;
  const newEstimatedHouseholdIncomeUSD = measuredWeeklyReceiptsUSD !== undefined
    ? Number(Math.max(0,
      (measuredWeeklyReceiptsUSD - (region.lastWeekHouseholdTaxPaidUSD ?? 0)) * 52
      + annualCapitalReceiptsUSD.dividendsUSD
      + annualCapitalReceiptsUSD.residualUSD
    ).toFixed(0))
    : Number(computeHouseholdDisposableIncomeUSD({
      wageIncomeUSD: totalWageIncomeUSD,
      transfersWeeklyUSD: govObligations.transfersUSD,
    }).toFixed(0));

  // HH4: the same income, decomposed — ~20 occupation x wealth-tier cohorts built from the
  // same pools, wages and transfer arithmetic, so their sums reproduce the aggregate above to
  // the dollar (the invariants harness asserts it). The tier income shares, the savings
  // cross-section and the spend-mix shares are all derived from these cells now.
  const laborForceByOccupation = {} as Record<OccupationType, number>;
  (Object.keys(newOccupationPools) as OccupationType[]).forEach((occ) => {
    laborForceByOccupation[occ] = totalLaborForce * (currentLaborForceShares[occ] ?? defaultOccupationShares[occ] ?? 0);
  });
  const cohortResult = buildHouseholdCohorts({
    occupationPools: newOccupationPools,
    baseAnnualWageUSD,
    laborForceByOccupation,
    governmentTransfersWeeklyUSD: govObligations.transfersUSD,
    // DIST/MAC — the sector's real liquid assets, which each tier's buffer is measured against.
    // The savings RATE is no longer passed in: it is what comes out.
    liquidAssetsUSD: Math.max(0, prevHS.depositsUSD ?? 0) + Math.max(0, prevHS.mmfSharesUSD ?? 0),
    // DEM/DIST — the life-cycle saving rate, read off the real age structure (§7.181). Last
    // week's, because the cohorts are built before this week's ages are advanced; a week's lag on
    // a demographic share is not a lag anyone can measure.
    retiredShareOfPopulation: region.lifeCycleDistribution?.RETIRED?.shareOfPopulation ?? 0.20,
    weeklyDebtServiceUSD: prevHS.weeklyDebtServiceUSD ?? 0,
    measuredDisposableIncomeUSD: newEstimatedHouseholdIncomeUSD,
    annualCapitalReceiptsUSD,
    wealthDistribution: region.wealthDistribution ?? createWealthDistribution(region.estimatedHouseholdIncomeUSD),
  });

  // DIST/MAC — THE SAVINGS RATE, MEASURED. Every tier decided its own saving against its own
  // buffer; this is what those decisions add up to, over the income they were taken out of. It
  // is an outcome now (rule 13), and nothing normalises the parts to it.
  const measuredSavingsUSD = WEALTH_TIERS.reduce((a, t) => a + (cohortResult.tierSavingsUSD[t] ?? 0), 0);
  const newSavingsRate = cohortResult.totalDisposableIncomeUSD > 0
    ? measuredSavingsUSD / cohortResult.totalDisposableIncomeUSD
    : (prevHS.savingsRate ?? 0.06);

  // HH4: the spend shares are DERIVED — each tier's consumption budget times its real spend
  // mix, summed. The old form walked `luxurySpendShare` by a wealth-signal drift that no stage
  // ever read; now a boom that lifts top-tier budgets genuinely tilts the mix toward luxury,
  // because that is where the money is.
  const newLuxuryShare = Number(cohortResult.spendShares.luxury.toFixed(4));
  const newStapleShare = Number(cohortResult.spendShares.staple.toFixed(4));
  const newStandardShare = Number(cohortResult.spendShares.standard.toFixed(4));

  const householdStressSignal = (newUnemployment - region.nairu) * 0.02; // no clamp
  
  const specializedStress = (newOccupationPools.SPECIALIZED_PROFESSIONAL.wageGrowthAnnual < 0 ? 1 : 0) + (newOccupationPools.TECHNICAL_ENGINEERING.wageGrowthAnnual < 0 ? 1 : 0);
  const generalStress = (newOccupationPools.GENERAL.wageGrowthAnnual < 0 ? 1 : 0);

  // DIST/CRD — CREDIT MIGRATION IS TWO-WAY, AND IT RUNS ON MEASURED DELINQUENCY.
  //
  // What this replaces was a ONE-WAY RATCHET: `shiftFraction = Math.max(0, stress x 1.5)` moved
  // households down the tiers whenever unemployment was above NAIRU and did NOTHING otherwise —
  // never up. Nobody ever recovered a credit tier, so over any long run the whole population
  // ends in SUBPRIME and stays there. It is the same defect shape as a household that can buy
  // equity and never sell it: an absorbing direction with no return.
  //
  // The mechanism is what a credit file actually is. A household that goes DELINQUENT drops a
  // tier; one that stays current long enough has the blemish age off and climbs back. Both flows
  // are measured — the down-flow off each tier's own delinquency rate, which the tiers already
  // carry — and the only stated number is how long a record persists, which is an institutional
  // primitive (credit-reporting periods are set by regulation, §5-DIST-P's third category).
  const tierOf = (t: string, fallback: number) =>
    region.householdState.creditTierBooks.find(x => x.tier === t)?.shareOfHouseholds ?? fallback;
  const delinquencyOf = (t: string) =>
    Math.max(0, region.householdState.creditTierBooks.find(x => x.tier === t)?.delinquencyRatePct ?? 0);

  const superPrimePrev = tierOf('SUPER_PRIME', 0.25);
  const primePrev = tierOf('PRIME', 0.50);
  const nearPrimePrev = tierOf('NEAR_PRIME', 0.15);
  const subprimePrev = tierOf('SUBPRIME', 0.10);

  // Down: the delinquent share of each tier drops one rung, weekly.
  const downFrom = (share: number, tier: string) => share * (delinquencyOf(tier) / 52);
  // Up: a clean file ages its blemish off, so a fixed share of each lower tier climbs one rung —
  // net of whoever in it just went delinquent, which is what makes the two flows one balance.
  const upFrom = (share: number) => share * CREDIT_FILE_CURE_WEEKLY;

  const spDown = downFrom(superPrimePrev, 'SUPER_PRIME');
  const pDown = downFrom(primePrev, 'PRIME');
  const npDown = downFrom(nearPrimePrev, 'NEAR_PRIME');
  const pUp = upFrom(primePrev);
  const npUp = upFrom(nearPrimePrev);
  const spUp = upFrom(subprimePrev);

  const newSuperPrime = Math.max(0.001, superPrimePrev - spDown + pUp);
  const newPrime = Math.max(0.001, primePrev + spDown - pDown - pUp + npUp);
  const newNearPrime = Math.max(0.001, nearPrimePrev + pDown - npDown - npUp + spUp);
  const newSubprime = Math.max(0.001, subprimePrev + npDown - spUp);

  const updatedTiers = region.householdState.creditTierBooks.map(tier => {
    let newShare = tier.shareOfHouseholds;
    if (tier.tier === 'SUPER_PRIME') newShare = newSuperPrime;
    else if (tier.tier === 'PRIME') newShare = newPrime;
    else if (tier.tier === 'NEAR_PRIME') newShare = newNearPrime;
    else if (tier.tier === 'SUBPRIME') newShare = newSubprime;

    const tierStress = householdStressSignal + (tier.tier === 'SUBPRIME' || tier.tier === 'NEAR_PRIME' ? generalStress * 0.01 : specializedStress * 0.01);

    // DIST/CRD — DELINQUENCY IS A STOCK THAT HEALS, NOT AN ACCUMULATOR.
    //
    // It was `delinquency + tierStress x multiplier` every week, and `tierStress` is positive
    // whenever unemployment is above NAIRU — so a delinquency rate could only ever climb, for as
    // long as the economy was slack, without bound and with no way back. Arrears CURE: a
    // borrower catches up, or the loan is written off and leaves the book. Both remove it from
    // the delinquent stock, on the same clock a file takes to clear.
    const arrivalRate = Math.max(0, tierStress) * (tier.tier === 'SUBPRIME' ? 1.5 : tier.tier === 'NEAR_PRIME' ? 0.8 : tier.tier === 'PRIME' ? 0.3 : 0.1);
    const newDelinquency = Math.max(0.001,
      tier.delinquencyRatePct * (1 - CREDIT_FILE_CURE_WEEKLY * 52) + arrivalRate);

    // DIST/CRD — THE TIER'S RATE IS QUOTED, NOT DRIFTED (rules 1 and 3).
    //
    // It was `rate + creditConditionsIndex x k` EVERY WEEK — an accumulator with no anchor, so a
    // sustained credit squeeze compounded a household lending rate to anything at all. It was
    // also a SECOND representation of household credit pricing: `quoteHouseholdMarginBps` already
    // prices exactly this for the banks' own pools, off measured loss, capital and cost to serve.
    // One price, from one place, at this tier's OWN measured loss rate.
    const newAvgInterestRate = region.policyRate + quoteHouseholdMarginBps({
      annualLossRate: newDelinquency,
      riskWeight: CONSUMER_CREDIT_RISK_WEIGHT,
      operatingCostBps: CARD_OPERATING_COST_BPS,
    }) / 10000;

    return {
      ...tier,
      shareOfHouseholds: newShare,
      avgInterestRate: Math.max(0.02, newAvgInterestRate),
      delinquencyRatePct: newDelinquency
    };
  });

  const totalShare = updatedTiers.reduce((s, t) => s + t.shareOfHouseholds, 0);
  const normalizedTiers = updatedTiers.map(t => ({
    ...t,
    shareOfHouseholds: t.shareOfHouseholds / totalShare,
    debtBalanceUSD: (newCreditCardDebtUSD + newOtherLoanDebtUSD) * (t.shareOfHouseholds / totalShare)
  }));

  // PUB2b: the balance-sheet STANCE scalar is gone. It was a formula on unemployment and
  // inflation that fed a "monetization share" printing deposits straight into households —
  // which is not what a central bank does. The balance sheet is now the real sovereign book
  // written by stages/central-bank.ts, and it moves by bidding in 07c/07f.
  const newCbBalance = region.centralBankBalanceSheet;
  const cbChangePct = 0;

  const newBankingSector = evolveBankingSector(
    region.bankingSector,
    newEstimatedHouseholdIncomeUSD,
    newSavingsRate,
    region.policyRate,
    newUnemployment,
    // The aggregate book's real yield at the real cleared curve — the per-bank truth is
    // recomputed in 02b, which overwrites this aggregate with the sum of named banks.
    computeSovereignBookAnnualYield(region.bankingSector.sovereignBondHoldingsByTenor, region.zeroRates),
    region.creditConditionsSpilloverAdjustment ?? 0
  );

  // The wage-push and monetary-pressure terms that used to be added to CPI here are gone. Both
  // were formulas layered on top of an already-formulaic inflation series, and together they were
  // the runaway: an AR(1) with 0.98 persistence multiplies any persistent addition roughly
  // fiftyfold in equilibrium, and the monetary term's `m2Growth - gdpGrowth` grew without bound as
  // measured real growth fell — a feedback loop from inflation, through fake real growth, back
  // into inflation. If higher wages or faster money growth genuinely raise prices, they do it by
  // raising what buyers bid in stage 05's real auction, and the price index measures that. A
  // separate term for them counts the same economics twice, once through the market and once
  // around it.
  const newCoreInflation = region.coreInflation;
  const rawExp = region.expectedInflation * 0.9 + newInflation * 0.1;
  const newExpectedInflation = isFinite(rawExp) ? Number(Math.max(-0.20, Math.min(0.50, rawExp)).toFixed(4)) : 0.025;

  // Calibrated Inertial Taylor Rule:
  // Target: i*_t = r* + pi_t + 0.5(pi_t - pi*) + 0.5(y_t - y*)
  const rStar = region.neutralRate; // US: 1.00%, UK: 0.75%, EU: 0.50%, JP: -0.25%
  
  const output_gap = Math.max(-0.10, Math.min(0.10, newGdpGrowth - potentialGdp));
  const inflation_gap = Math.max(-0.10, Math.min(0.10, newExpectedInflation - piStar));
  const taylorTarget = rStar + newExpectedInflation + 0.5 * inflation_gap + 0.5 * output_gap;
  const clampedTaylorTarget = Math.max(EFFECTIVE_LOWER_BOUND, Math.min(0.20, taylorTarget));

  let rateChanged = false;
  let rateDeltaBps = 0;
  let newInflationDeviationStreak = region.inflationDeviationStreak || 0;

  // Policy Lag: Smooth movement toward Taylor Target each week (moves 15% of the way)
  let targetPolicyRate = Math.max(-0.01, Math.min(0.20, region.policyRate + 0.15 * (clampedTaylorTarget - region.policyRate)));

  // Update inflation deviation streak
  const isAboveTarget = region.inflation > piStar + 0.01;
  newInflationDeviationStreak = isAboveTarget ? (region.inflationDeviationStreak || 0) + 1 : Math.max(0, (region.inflationDeviationStreak || 0) - 2);

  const isMeeting = (week % 13 === 0);

  let newPolicyRate = region.policyRate;
  if (isMeeting) {
    const rawMove = targetPolicyRate - region.policyRate;
    // Round to nearest 25 bps (0.0025)
    const roundedMove = Math.round(rawMove / 0.0025) * 0.0025;
    newPolicyRate = region.policyRate + roundedMove;
    newPolicyRate = Math.max(-0.01, Math.min(0.20, newPolicyRate));
  }

  if (Math.abs(newPolicyRate - region.policyRate) > 0.0001) {
    rateChanged = true;
    rateDeltaBps = Math.round((newPolicyRate - region.policyRate) * 10000);
  }

  const smoothedTargetRate = taylorTarget; // Used for dot plot and curve parameters

  // --- DIAGNOSTIC TELEMETRY OUTPUT ---
  const capexBps = Math.round((microFeedback.capexGdpContribution ?? 0) * 10000);
  const consBps = Math.round(((prevHS.consumerConfidence ?? 100) - 100) * 0.0001 * 10000);
  const outGapBps = Math.round(output_gap * 10000);
  const infGapBps = Math.round(inflation_gap * 10000);
  
  const diagnosticString = `Prior GDP: ${(region.gdpGrowth * 100).toFixed(2)}% | CapEx Boost: ${capexBps > 0 ? '+' : ''}${capexBps} bps | Cons Demand: ${consBps > 0 ? '+' : ''}${consBps} bps | Net Realized GDP: ${(newGdpGrowth * 100).toFixed(2)}%
Potential GDP: ${(potentialGdp * 100).toFixed(2)}% | Output Gap: ${outGapBps > 0 ? '+' : ''}${outGapBps} bps | CPI: ${(newInflation * 100).toFixed(2)}% (Gap ${infGapBps > 0 ? '+' : ''}${infGapBps} bps)
Taylor Target: ${(taylorTarget * 100).toFixed(2)}% | Current Policy: ${(region.policyRate * 100).toFixed(2)}% | Meeting Decision: ${rateChanged ? `${rateDeltaBps > 0 ? '+' : ''}${rateDeltaBps} bps -> ${(newPolicyRate * 100).toFixed(2)}%` : 'Hold'}`;

  // Dot Plot projections converging toward Taylor target & long-run neutral
  const dotPlot1Y = Number((newPolicyRate * 0.4 + smoothedTargetRate * 0.6).toFixed(4));
  const dotPlot2Y = Number((smoothedTargetRate * 0.35 + (rStar + piStar) * 0.65).toFixed(4));

  // The yield curve is NOT set here. It has exactly one owner: the real sovereign auction in
  // 07c-sovereign-bond-clearing.ts, where named banks and institutions trade real tenor buckets
  // against the government's real outstanding stock and the Nelson-Siegel parameters are refit
  // to the yields that actually clear.
  //
  // This block used to recompute beta0/beta1/beta2 from macro formulas every week and overwrite
  // whatever the auction had cleared — two price-setters for one curve, with the formula running
  // first and the market's answer discarded a stage later. `targetBeta2 = (gdpGrowth -
  // potentialGdpGrowth) * 2.0` in particular was the path that turned the cold-start GDP
  // transient into a 4% -> 26% two-year yield spiral.
  //
  // Macro conditions still reach the curve, but the way they do in reality — through what
  // participants are willing to pay. The policy rate reaches the front end because banks
  // arbitrage bonds against reserves at the central bank; inflation expectations reach the long
  // end because what a bond is worth to its holder is its real yield. Both now live in 07c's
  // attractiveness functions. The one rate still set here is the policy rate itself, which is
  // genuinely administered rather than traded — a posted central-bank rate IS the real-world
  // mechanism, not a formula standing in for a missing market.
  //
  // Central-bank balance-sheet policy (QE/QT) reached the curve here too, via qePremium. That
  // is real, but it belongs in the auction as real central-bank demand for real bonds rather
  // than as a nudge to a curve parameter; it is tracked as its own work item (G9) and is
  // deliberately absent rather than approximated in the meantime.
  const newCurveParams: NelsonSiegelParams = region.yieldCurveParams;
  const newZeroRates = region.zeroRates;

  let newInversionCount = region.inversionWeeksCount;
  if (newZeroRates.tenor2Y > newZeroRates.tenor10Y) {
    newInversionCount++;
    if (newInversionCount === 8) {
      // Push shock 13 weeks out
      remainingShocks.push({ week: week + 13, shock: -0.015 });
    }
  } else {
    newInversionCount = 0;
  }

  // FRM: the sovereign is rated off the numbers that are MEASURED. There were two debt ratios
  // and the rating read the invented one: `debtToGdpPct` was walked weekly from a stance
  // step-function plus `0.15 x tanh(outputGap x 2)`, while stage 11 computed
  // `debtToGdpPctBottomUp` from the real stack over measured GDP and PUB3b made the deficit an
  // outcome of real obligations less real revenue. The walk, `fiscalDeficitPctGdp` and
  // `structuralDeficitPctGdp` are gone; the same thresholds now read the real ratio and the
  // real deficit, so a downgrade is something the government's own budget did.
  const newDebtToGdpPct = sovereignDebtToGdpRatio(region);
  const newDeficitPctGdp = sovereignDeficitPctGdp(region);

  let newSovereignRating = region.sovereignRating;
  if (week % 26 === 0) {
    if (newDebtToGdpPct > 1.2 && newDeficitPctGdp > 0.05) {
      if (newSovereignRating === 'AAA') newSovereignRating = 'AA';
      else if (newSovereignRating === 'AA') newSovereignRating = 'A';
      else if (newSovereignRating === 'A') newSovereignRating = 'BBB';
    } else if (newDebtToGdpPct < 0.9 && newDeficitPctGdp < 0.03) {
      if (newSovereignRating === 'BBB') newSovereignRating = 'A';
      else if (newSovereignRating === 'A') newSovereignRating = 'AA';
      else if (newSovereignRating === 'AA') newSovereignRating = 'AAA';
    }
  }

  const histPolicy = [...region.historicalPolicyRates.slice(-51), newPolicyRate];
  const histInf = [...region.historicalInflation.slice(-51), newInflation];
  const histCore = [...(region.historicalCoreInflation || region.historicalInflation).slice(-51), newCoreInflation];
  const histGdp = [...region.historicalGdpGrowth.slice(-51), newGdpGrowth];
  const histWage = [...(region.historicalWageGrowth || region.historicalInflation).slice(-51), Number((newWageGrowth).toFixed(4))];
  const histDebt = [...(region.historicalDebtToGdp || [1.0]).slice(-51), newDebtToGdpPct];
  const histCurves = [...region.historicalZeroCurves.slice(-51), { week, ...newZeroRates }];

  // Housing market evolution as a real asset class
  const prevHousing = region.housingMarket ?? createHousingMarket(region.id, region.estimatedHouseholdIncomeUSD, region.totalPopulation);
  // S8: housing supply is the real cleared OUTPUT of the residential_construction auction, not
  // its `inventoryLevelUSD` — that field is frozen at initialization for output-only categories,
  // so the ratio below was a constant pretending to be a market signal and house prices drifted
  // on a number that never changed. Units cleared this week x the cleared price is the real
  // weekly supply, against the same week's real demand.
  const resCat = region.categoryDemand?.['residential_construction'];
  const resDemandUnits = resCat?.totalUnitsDemandedThisWeek ?? 0;
  const resSupplyUnits = resCat?.totalUnitsSuppliedThisWeek ?? 0;
  const supplyDemandRatio = resDemandUnits > 0
    ? resSupplyUnits / resDemandUnits
    : 1.0; // no real demand cleared this week — treat as balanced rather than inventing pressure
  // ---- HSG: THE HOUSE PRICE CLEARS. It was a walked index and every term in it was stated. ----
  //
  // `priceIndex += (1 − supplyDemandRatio) x 0.002 x creditFactor`, bounded to [0.5, 3.0] and
  // multiplied by a 400,000 baseline: a stated speed, a stated credit nudge (±0.02 on one side of
  // a policy-rate threshold), a clamp on the outcome, and a stated level. **A bound is not a
  // price** (rule 15), and none of it was anybody's decision.
  //
  // A house sells at what the MARGINAL BUYER can pay. Each wealth tier's affordability is its own
  // income against the going mortgage rate — the same `DSTI x income / annuity factor` that sizes
  // borrowing capacity (§7.160), grossed up by the origination LTV because the buyer funds the
  // deposit too. Rank the tiers by what they can pay, walk down until the week's supply is
  // absorbed, and the price is what the last buyer needed to bid. More supply reaches further
  // down the distribution and prices lower; a rate rise cuts every tier's capacity and prices
  // lower; richer households price higher. Nothing is walked and nothing is clamped.
  const householdsCount = Math.max(1, newTotalPopulation / AVERAGE_HOUSEHOLD_SIZE);
  const mortgageRateForPricing = Math.max(0.005,
    (region.zeroRates?.tenor10Y ?? newPolicyRate) + MORTGAGE_SPREAD_OVER_10Y_BPS / 10000);
  const rWeekly = mortgageRateForPricing / 52;
  const annuityFactorForPricing = rWeekly / (1 - Math.pow(1 + rWeekly, -MORTGAGE_TERM_WEEKS));
  const affordabilityByTier = WEALTH_TIERS.map((t) => {
    const tier = region.wealthDistribution?.[t];
    const tierHouseholds = Math.max(1, householdsCount * Math.max(0, tier?.shareOfHouseholds ?? 0.25));
    const weeklyIncomePerHouseholdUSD = Math.max(0, tier?.shareOfIncomeUSD ?? 0) / 52 / tierHouseholds;
    const affordableLoanUSD = (weeklyIncomePerHouseholdUSD * MORTGAGE_DSTI_LIMIT) / annuityFactorForPricing;
    return { households: tierHouseholds, priceUSD: affordableLoanUSD / MORTGAGE_LTV_AT_ORIGINATION };
  }).sort((a, b) => b.priceUSD - a.priceUSD);
  // The week's supply: existing owners selling, plus what construction actually completed.
  const owningHouseholdsCount = householdsCount * Math.max(0, prevHousing.ownershipRatePct ?? 0.6);
  const supplyUnitsThisWeek = owningHouseholdsCount * (HOUSING_TURNOVER_RATE_ANNUAL / 52) + resSupplyUnits;
  let absorbed = 0;
  let marginalPriceUSD = affordabilityByTier[affordabilityByTier.length - 1]?.priceUSD ?? 0;
  for (const tier of affordabilityByTier) {
    marginalPriceUSD = tier.priceUSD;
    absorbed += tier.households * (HOUSING_TURNOVER_RATE_ANNUAL / 52);
    if (absorbed >= supplyUnitsThisWeek) break;
  }
  // A house cannot clear below what it costs to build: the construction sector's own cleared
  // price is the seller's floor, exactly as it is for every other produced good (§7.130).
  const buildCostUSD = Math.max(0, (resCat?.unitPriceUSD ?? 0));
  const newMedianHomePriceUSD = Math.round(Math.max(marginalPriceUSD, buildCostUSD));
  const newPriceIndex = (prevHousing.baselineHomePriceUSD || 400000) > 0
    ? newMedianHomePriceUSD / (prevHousing.baselineHomePriceUSD || 400000)
    : 1;
  const histPrices = [...(prevHousing.historicalPrices || []).slice(-51), newMedianHomePriceUSD];

  const updatedHousingMarket: HousingMarket = {
    ...prevHousing,
    medianHomePriceUSD: newMedianHomePriceUSD,
    baselineHomePriceUSD: prevHousing.baselineHomePriceUSD || 400000,
    priceIndex: Number(newPriceIndex.toFixed(4)),
    historicalPrices: histPrices,
    // HSG — what the banks actually originated, summed by the bank pass. The 5%-of-income x a
    // credit nudge this replaces was a statistic beside the real lending, not a measure of it.
    mortgageOriginationVolumeUSD: Number((region.housingMarket?.mortgageOriginationVolumeUSD ?? 0).toFixed(0)),
  };

  // ---- DEM: PEOPLE AGE. The age structure is a real stock now, not four drifting shares. ----
  //
  // What this replaces: `EARLY_CAREER/PEAK/PRE/RETIRED` shares walked by stated drift constants
  // (`retirementDrift = 0.0003`) and renormalised. Nobody aged; four numbers moved. With a death
  // rate that was a linear proxy off the retired share, it implied a 33-year retirement and a
  // 133-year working life (§7.169), which is why no life-cycle could be derived from it.
  //
  // Now everyone ages 1/52 of a year a week, births enter at age zero, and deaths leave at the
  // Gompertz hazard for their OWN age. The four stage shares become age BANDS of the result — one
  // representation of who is how old (rule 3) — and life expectancy, retirement duration and the
  // length of a working life stop being stated anywhere.
  const prevAges = region.ageDistribution && region.ageDistribution.length === MAX_AGE_YEARS
    ? region.ageDistribution
    : stationaryAgeDistribution(birthRate);
  const nextAges = new Array(MAX_AGE_YEARS).fill(0);
  const weekFraction = 1 / 52;
  for (let a = 0; a < MAX_AGE_YEARS; a++) {
    const survivors = prevAges[a] * (1 - mortalityHazardAnnual(a) * weekFraction);
    const movingUp = survivors * weekFraction;
    nextAges[a] += survivors - movingUp;
    if (a + 1 < MAX_AGE_YEARS) nextAges[a + 1] += movingUp;
  }
  nextAges[0] += birthRate * weekFraction;
  const ageTotal = nextAges.reduce((x, y) => x + y, 0) || 1;
  const newAgeDistribution = nextAges.map((x) => x / ageTotal);
  const bandShare = (from: number, to: number) =>
    newAgeDistribution.slice(from, to).reduce((x, y) => x + y, 0);

  const prevLifeCycle = region.lifeCycleDistribution ?? createLifeCycleDistribution();
  const updatedLifeCycle = { ...prevLifeCycle };
  // The two boundaries that are POLICY — workforce entry and retirement age — are named; the two
  // inside the working span split it evenly, because nothing in the model distinguishes them.
  const workingSpan = RETIREMENT_AGE_YEARS - WORKFORCE_ENTRY_AGE_YEARS;
  let ecShare = bandShare(0, WORKFORCE_ENTRY_AGE_YEARS + Math.round(workingSpan / 3));
  let peShare = bandShare(WORKFORCE_ENTRY_AGE_YEARS + Math.round(workingSpan / 3),
    WORKFORCE_ENTRY_AGE_YEARS + Math.round((2 * workingSpan) / 3));
  let prShare = bandShare(WORKFORCE_ENTRY_AGE_YEARS + Math.round((2 * workingSpan) / 3), RETIREMENT_AGE_YEARS);
  let retShare = bandShare(RETIREMENT_AGE_YEARS, MAX_AGE_YEARS);

  const totalLifeCycleShare = ecShare + peShare + prShare + retShare;
  updatedLifeCycle.EARLY_CAREER = { ...prevLifeCycle.EARLY_CAREER, shareOfPopulation: ecShare / totalLifeCycleShare };
  updatedLifeCycle.PEAK_EARNING = { ...prevLifeCycle.PEAK_EARNING, shareOfPopulation: peShare / totalLifeCycleShare };
  updatedLifeCycle.PRE_RETIREMENT = { ...prevLifeCycle.PRE_RETIREMENT, shareOfPopulation: prShare / totalLifeCycleShare };
  updatedLifeCycle.RETIRED = { ...prevLifeCycle.RETIRED, shareOfPopulation: retShare / totalLifeCycleShare };

  // Household wealth and income distribution segmentation
  const prevWealthDist = region.wealthDistribution ?? createWealthDistribution(region.estimatedHouseholdIncomeUSD);
  const updatedWealthDist = { ...prevWealthDist };

  // HH4: the tier→occupation membership matrix moved to macro/household-cohorts.ts — one
  // matrix, one owner. The tier income drift it fed here is gone: tier income is now the
  // DERIVED SUM of the cohorts' real disposable income.

  // HH4c: tier NET WORTH is no longer evolved here. The equity-gain/savings-gain/retired-
  // drawdown drift is gone — the household-balance-sheet stage derives each tier's net worth
  // as a split of the same marked components the aggregate is built from, every week, after
  // the clearing books. Only the income line (the cohorts' summed disposable) is written here.
  (Object.keys(updatedWealthDist) as WealthTier[]).forEach(t => {
    // DIST/COH: the tier's cumulative saving, which its deposit share is derived from. The
    // cohorts already measure what each tier saved this week; this is the stock that flow builds.
    // A tier that saves more now gets richer, which is the mechanism the stated split replaced.
    const priorAccumulated = updatedWealthDist[t].accumulatedSavingsUSD;
    const savedThisWeekUSD = (cohortResult.tierSavingsUSD[t] ?? 0) / 52;

    // COH1 — THE SAVING IS ALLOCATED AS IT ARRIVES, and dissaving draws the buffer first.
    //
    // One stock was driving the deposit split, the equity split, the private-business split and
    // the institutional-claims split at once — so a tier that put everything into a house and a
    // pension looked exactly as liquid as one that held cash, and the buffer rule had nothing
    // real to be a buffer of. What a tier does not put at risk stays LIQUID; the rest is
    // INVESTED, by the appetite the model already measures for it.
    //
    // The dissaving branch is the half that matters behaviourally: a household spends its buffer
    // before it sells anything, so the liquid stock drains first and only what it cannot cover
    // comes out of the invested one. That is what makes forced selling (§7.166) the END of a
    // squeeze rather than its beginning.
    const exposure = Math.max(0, Math.min(1, updatedWealthDist[t].equityExposureShare ?? 0.25));
    let liquidUSD = Math.max(0, updatedWealthDist[t].liquidSavingsUSD
      ?? Math.max(0, priorAccumulated ?? 0) * (1 - exposure));
    let investedUSD = Math.max(0, updatedWealthDist[t].investedSavingsUSD
      ?? Math.max(0, priorAccumulated ?? 0) * exposure);
    if (savedThisWeekUSD >= 0) {
      liquidUSD += savedThisWeekUSD * (1 - exposure);
      investedUSD += savedThisWeekUSD * exposure;
    } else {
      const drawUSD = -savedThisWeekUSD;
      const fromLiquidUSD = Math.min(liquidUSD, drawUSD);
      liquidUSD -= fromLiquidUSD;
      investedUSD = Math.max(0, investedUSD - (drawUSD - fromLiquidUSD));
    }
    updatedWealthDist[t] = {
      ...updatedWealthDist[t],
      shareOfIncomeUSD: Number(Math.max(1000, cohortResult.tierDisposableUSD[t] ?? updatedWealthDist[t].shareOfIncomeUSD).toFixed(0)),
      liquidSavingsUSD: Number(liquidUSD.toFixed(0)),
      investedSavingsUSD: Number(investedUSD.toFixed(0)),
      // Their SUM, kept as the one number readers that want the whole stock should use (rule 3:
      // it is derived here, never accumulated separately).
      accumulatedSavingsUSD: Number((liquidUSD + investedUSD).toFixed(0)),
    };
  });

  const updatedRegion: Region = {
    ...region,
    wealthDistribution: updatedWealthDist,
    housingMarket: updatedHousingMarket,
    // DEM — the age structure itself, of which `lifeCycleDistribution` is a view.
    ageDistribution: newAgeDistribution,
    lifeCycleDistribution: updatedLifeCycle,
    cycleRegime: newCycleRegime,
    inversionWeeksCount: newInversionCount,
    recessionShockQueue: remainingShocks,
    centralBankBalanceSheet: newCbBalance,
    taylorTargetRate: taylorTarget,
    govEmploymentGrowthRate,
    fiscalStanceScore: newFiscalStanceScore,
    sovereignRating: newSovereignRating,
    laggedPolicyRateEMA: region.laggedPolicyRateEMA * 0.96 + newPolicyRate * 0.04,
    laborForceParticipation: newParticipation,
    inflationDeviationStreak: newInflationDeviationStreak,
    smoothedSlackGap: newSmoothedSlackGap,
    policyRateLagBuffer: newPolicyRateLagBuffer,
    demandShockLagBuffer: newDemandShockLagBuffer,
    potentialGdpGrowth: newPotentialGdpGrowth,
    neutralRate: newNeutralRate,
    nairu: newNairu,
    weeksAboveNairu,
    policyRate: newPolicyRate,
    inflation: newInflation,
    coreInflation: newCoreInflation,
    expectedInflation: newExpectedInflation,
    gdpGrowth: newGdpGrowth,
    wageGrowth: Number(newWageGrowth.toFixed(4)),
    unemploymentRate: newUnemployment,
    totalPopulation: newTotalPopulation,
    birthRateAnnual: birthRate,
    deathRateAnnual: Number(deathRate.toFixed(5)),
    netMigrationRateAnnual: migrationRate,
    nonEmployablePct: newNonEmployablePct,
    governmentEmployment: newGovernmentEmployment,
    smePools: newSmePools as any,
    occupationPools: newOccupationPools,
    occupationLaborForceShare: newLaborForceShares,
    estimatedNominalGdpUSD: newEstimatedNominalGdpUSD,
    derivedNominalGdpUSD: region.derivedNominalGdpUSD ?? newEstimatedNominalGdpUSD,
    gdpGrowthBottomUp: region.gdpGrowthBottomUp ?? 0,
    nominalGdpHistory: region.nominalGdpHistory ?? [],
    lastWeekNominalGdpUSD: region.lastWeekNominalGdpUSD ?? (region.derivedNominalGdpUSD || newEstimatedNominalGdpUSD),
    activeContracts: region.activeContracts ?? [],
    consumptionComponentUSD: region.consumptionComponentUSD ?? 0,
    investmentComponentUSD: region.investmentComponentUSD ?? 0,
    effectiveTaxRate: newEffectiveTaxRate,
    governmentRevenueUSD: newGovernmentRevenueUSD,
    governmentSpendingUSD: newGovernmentSpendingUSD,
    governmentPayrollWeeklyUSD: newGovernmentPayrollWeeklyUSD,
    governmentTransfersWeeklyUSD: govObligations.transfersUSD,
    governmentInterestWeeklyUSD: Number(govInterestWeeklyUSD.toFixed(0)),
    employerPayrollTaxWeeklyUSD: Number((employerPayrollTaxUSD / 52).toFixed(0)),
    householdState: {
      consumerConfidence: newCCI,
      creditTierBooks: normalizedTiers,
      wageGrowth: newWageGrowth,
      savingsRate: newSavingsRate,
      realConsumptionGrowth: newRealConsumptionGrowth,
      householdDebtToIncomeRatio: newHouseholdDebtToIncomeRatio,
      stapleSpendShare: newStapleShare,
      standardSpendShare: newStandardShare,
      luxurySpendShare: newLuxuryShare,
      netWorthUSD: newNetWorthUSD,
      depositsUSD: newDepositsUSD,
      equityHoldingsUSD: newEquityHoldingsUSD,
      // Carried forward untouched; `stages/etf-flows.ts` marks them against this week's clears.
      directEquityUSD: prevHS.directEquityUSD ?? 0,
      // Marked in `stages/household-balance-sheet.ts` against this week's home price.
      housingStockUSD: prevHS.housingStockUSD ?? 0,
      priorNetWorthUSD: prevHS.priorNetWorthUSD ?? 0,
      homeEquityUSD: prevHS.homeEquityUSD ?? 0,
      institutionalClaims: prevHS.institutionalClaims ?? [],
      institutionalClaimsUSD: prevHS.institutionalClaimsUSD ?? 0,
      etfShares: prevHS.etfShares ?? [],
      etfHoldingsUSD: prevHS.etfHoldingsUSD ?? 0,
      // §7.41's trap, third time: this rebuild takes a FIXED FIELD LIST, so anything not named
      // here is dropped weekly. `mmfSharesUSD` was not named, so the household's money-fund claim
      // was destroyed every week and recreated from that week's diversion alone — while the fund
      // kept the cumulative total. Measured: the fund's shares outstanding ran 2.5% above what
      // every holder together owned by week 6 and growing (§7.126).
      mmfSharesUSD: prevHS.mmfSharesUSD ?? 0,
      privateBusinessEquityUSD: prevHS.privateBusinessEquityUSD ?? 0,
      unmodeledFinancialAssetsUSD: prevHS.unmodeledFinancialAssetsUSD ?? newEquityHoldingsUSD,
      // HH4: this week's cohort decomposition — the cross-section the aggregates above sum from.
      cohorts: cohortResult.cohorts,
      capitalReceiptsAnnualUSD: Number((annualCapitalReceiptsUSD.depositInterestUSD + annualCapitalReceiptsUSD.dividendsUSD + annualCapitalReceiptsUSD.residualUSD).toFixed(0)),
      unmodeledCapitalReceiptShareOfIncome: prevHS.unmodeledCapitalReceiptShareOfIncome,
      // HH3: derived sums of the banks' itemized pools, carried through and overwritten by the
      // bank-diversification stage after its lending passes run.
      mortgageDebtUSD: newMortgageDebtUSD,
      creditCardDebtUSD: newCreditCardDebtUSD,
      otherConsumerLoanDebtUSD: newOtherLoanDebtUSD,
      priorMortgageDebtUSD: prevHS.priorMortgageDebtUSD ?? newMortgageDebtUSD,
      weeklyMortgageOriginationUSD: prevHS.weeklyMortgageOriginationUSD ?? 0,
      weeklyNewConsumerCreditUSD: prevHS.weeklyNewConsumerCreditUSD ?? 0,
      weeklyDebtServiceUSD: prevHS.weeklyDebtServiceUSD ?? 0,
    },
    bankingSector: newBankingSector,
    estimatedHouseholdIncomeUSD: newEstimatedHouseholdIncomeUSD,
    dotPlot1Y,
    dotPlot2Y,
    exportsUSD: region.exportsUSD ?? 0,
    importsUSD: region.importsUSD ?? 0,
    tradeBalance: region.tradeBalance ?? 0,
    yieldCurveParams: newCurveParams,
    zeroRates: newZeroRates,
    weather: updatedWeather,
    historicalPolicyRates: histPolicy,
    historicalInflation: histInf,
    historicalCoreInflation: histCore,
    historicalGdpGrowth: histGdp,
    historicalWageGrowth: histWage,
    historicalDebtToGdp: histDebt,
    historicalZeroCurves: histCurves,
  };

  return { updatedRegion, rateChanged, rateDeltaBps, isMeeting, diagnosticString };
}

/**
 * FX Uncovered Interest Rate Parity with stochastic drift and trade balance shocks
 */

/**
 * WS9/XB2d: the RATE is no longer computed here. It clears in stages/fx-clearing.ts against every
 * participant's real demand — dealers flattening inventory, cross-border settlement, trade
 * receipts, speculators and central banks. What used to live here was a drift: an interest
 * differential, a trade-imbalance term, an attractiveness comparison and a noise term, none of
 * which had a counterparty on the other side of the trade.
 *
 * What remains is the cross-currency basis quote, which is a dealer's price and not a rate.
 */
export function evolveFxPair(fx: FxPair, regions: Record<RegionId, Region>): FxPair {
  const rDomestic = regions[fx.quote].policyRate;
  const rForeign = regions[fx.base].policyRate;
  const basisNoise = (random() - 0.5) * 2.0;
  return {
    ...fx,
    basisSpreadBps: Math.round(fx.basisSpreadBps + basisNoise + (rDomestic - rForeign) * 20),
  };
}

/**
 * Evolve Commodities with Weather & Supply/Demand shocks
 */

export function computePrivateSegmentCommoditySupplyUSD(commodityId: string, regions: Record<RegionId, Region>): number {
  // SEG-A: which pools supply a commodity comes from the REGISTRY's own sub-unit linkages —
  // the industries whose output is actually linked to it — rather than from a hardcoded list
  // bolted onto one bucket (MANUFACTURING_LINKED_COMMODITIES, deleted). A pool's contribution
  // is its revenue times the linkage's own intensity share, so adding a linked sub-unit to the
  // registry brings its SME tier's supply with it.
  return (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => {
    return s + (regions[r].smePools || []).reduce((s2, pool) => {
      const linkage = smePoolLinkedCommodities(pool.industry).find(l => l.commodityId === commodityId);
      if (!linkage) return s2;
      return s2 + (pool.annualRevenueUSD * linkage.intensityShare) / 52;
    }, 0);
  }, 0);
}

export function calibrateIntensityShare(commodityId: string, allCompanies: Company[], regions: Record<RegionId, Region>, subUnitId: string): number {
  // §6: the `industrial_automation` pseudo-commodity branches are deleted — it left the
  // linkage table (see BASE_COMMODITY_CATEGORY_LINKAGE) and is a plain sub-unit category whose
  // supply and demand already clear in stages 04/05. This function now only ever sees real
  // producedCommodityId-tagged producers.
  const producers = allCompanies.filter(c => c.producedCommodityId === commodityId && isActiveCompany(c));
  const publicWeeklySupplyUSD = producers.reduce((s, c) =>
    s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52, 0);
  const privateWeeklySupplyUSD = computePrivateSegmentCommoditySupplyUSD(commodityId, regions);
  const weeklySupplyUSD = publicWeeklySupplyUSD + privateWeeklySupplyUSD;
  const totalCategoryDemandUSD = (['USA','EUR','UK','JPN'] as RegionId[]).reduce((s, r) => s + ((regions[r].categoryDemand as any)[subUnitId]?.demandLevelUSD ?? 0), 0);
  return totalCategoryDemandUSD > 0 ? (weeklySupplyUSD * 52) / totalCategoryDemandUSD : 0.01;
}

function computeCommodityClearingRatio(commodityId: string, allCompanies: Company[], comm: Commodity, regions: Record<RegionId, Region>, privateSegmentSupplyUSD: number): { ratio: number; supplyUnits: number; demandUnits: number } {
  const linkage = COMMODITY_CATEGORY_LINKAGE[commodityId] || COMMODITY_CATEGORY_LINKAGE[comm.symbol];
  const intensityShare = linkage?.intensityShare ?? 0;

  // §7.128 — BOTH SIDES OF THIS MARKET ON THE SAME BASE.
  //
  // Demand was `intensityShare x the whole category's output, summed over four regions`; supply
  // was `the entire annual revenue of the two firms tagged with this commodityId`. Two different
  // bases for the two sides of one market (rule 3), and the gap was invisible while recipes were
  // shallow. CHAIN-D tripled intermediate demand for extraction, refining, chemicals and power,
  // demand moved with it, supply did not, and the input market drained: measured USA week 12,
  // upstream extraction supplying 2,458 units against 20,954 demanded, inventory zero, stage 04
  // fulfilment 0.00 and its price down 92% — read as deflation for the model's whole life
  // (§7.127).
  //
  // What the linkage actually says is that a commodity is a SHARE OF A SUB-UNIT'S VALUE. So its
  // supply is that share of the sub-unit's real cleared supply and its demand is that share of
  // the sub-unit's demand — whoever makes the good brings the commodity to market, not only the
  // two firms carrying the tag. The elasticities below then move a ratio that means something.
  const perRegion = (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).reduce((acc, r) => {
    const catDemand = linkage ? (regions[r].categoryDemand as any)[linkage.subUnitId] : undefined;
    if (!catDemand) return acc;
    acc.demandAnnualUSD += catDemand.demandLevelUSD ?? 0;
    // Rule 9: `totalUnitsSuppliedThisWeek` is WEEKLY and `demandLevelUSD` is ANNUAL.
    acc.supplyWeeklyUSD += (catDemand.totalUnitsSuppliedThisWeek ?? 0) * (catDemand.unitPriceUSD ?? 0);
    return acc;
  }, { demandAnnualUSD: 0, supplyWeeklyUSD: 0 });

  // Before this market has ever cleared (week 1) there is no supplied figure yet, so fall back to
  // the tagged producers' own output, which is what the seed had.
  const producers = allCompanies.filter(c => c.producedCommodityId === commodityId && isActiveCompany(c));
  const taggedWeeklySupplyUSD = producers.reduce((s, c) => s + (c.annualRevenue * (c.ebitda / Math.max(1, c.annualRevenue) > 0 ? 1 : 0.7)) / 52, 0);
  const weeklySupplyUSD = perRegion.supplyWeeklyUSD > 0
    ? perRegion.supplyWeeklyUSD * intensityShare
    : taggedWeeklySupplyUSD + privateSegmentSupplyUSD;

  const baselineWeeklyDemandUSD = (perRegion.demandAnnualUSD * intensityShare) / 52;

  const baselineHistoricalPrice = comm.historicalPrices.length > 0 ? comm.historicalPrices[0] : comm.spotPrice;
  const referencePrice = baselineHistoricalPrice > 0 ? baselineHistoricalPrice : comm.spotPrice;
  const priceRatio = referencePrice > 0 ? comm.spotPrice / referencePrice : 1.0;
  const demandElasticity = -0.7; // low spot prices stimulate real industrial & consumer demand
  const supplyElasticity = 0.5; // low spot prices cause real production curtailment

  const demandUnits = comm.spotPrice > 0 ? (baselineWeeklyDemandUSD / referencePrice) * Math.pow(priceRatio, demandElasticity) : 0;
  const supplyUnits = comm.spotPrice > 0 ? (weeklySupplyUSD / referencePrice) * Math.pow(priceRatio, supplyElasticity) : 0;

  const ratio = supplyUnits > 0.001 ? demandUnits / supplyUnits : 1.0;
  return { ratio, supplyUnits, demandUnits };
}

export function evolveCommodity(
  comm: Commodity,
  globalGrowth: number,
  rfUSD: number,
  regions: Record<RegionId, Region>,
  allCompanies: Company[]
): Commodity {
  const dt = 1 / 52;
  const demandShock = globalGrowth * 0.8;
  const randomEps = (random() - 0.5) * comm.volatility * Math.sqrt(dt);

  // NAT3: an event does not move the price. It destroys SUPPLY — the share of this commodity's
  // yield it took — and the clearing ratio below prices the shortage, input costs rise through
  // the recipes, and the measured index reports it. That is the chain this comment used to name
  // while the code added the event's own price impact to the drift instead.
  let yieldLossShare = 0;
  Object.values(regions).forEach((r) => {
    if (r.weather.affectedCommodityId === comm.id || r.weather.affectedCommodityId === comm.symbol) {
      const decay = Math.pow(0.55, Math.max(0, (r.weather.weeksActive || 0) - 1));
      yieldLossShare += (r.weather.yieldImpactPct ?? 0) * decay;
    }
  });
  yieldLossShare = Math.max(0, Math.min(0.9, yieldLossShare));

  const drift = demandShock * dt + randomEps;
  
  const privateSegmentSupplyUSD = computePrivateSegmentCommoditySupplyUSD(comm.id, regions);
  const { ratio: rawClearingRatio, supplyUnits: rawSupplyUnits, demandUnits } = computeCommodityClearingRatio(comm.id, allCompanies, comm, regions, privateSegmentSupplyUSD);
  const supplyUnits = rawSupplyUnits * (1 - yieldLossShare);
  const clearingRatio = rawClearingRatio * (1 - yieldLossShare);
  const supplyDemandDrift = Math.max(-0.04, Math.min(0.04, (clearingRatio - 1.0) * 0.12));
  const rawDriftExponent = drift * 0.4 + supplyDemandDrift;
  const safeDriftExponent = isFinite(rawDriftExponent) ? rawDriftExponent : 0;
  const newSpot = Math.max(0.5, Number((comm.spotPrice * Math.exp(safeDriftExponent)).toFixed(2))); // 0.5 floor stays
  
  const change1W = Number((newSpot - comm.spotPrice).toFixed(2));

  const f1M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 1 / 12).toFixed(2));
  const f3M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 3 / 12).toFixed(2));
  const f6M = Number(priceCommodityFutures(newSpot, rfUSD, comm.convenienceYield, 6 / 12).toFixed(2));

  const hist = [...comm.historicalPrices.slice(-51), newSpot];

  const inventoryLevelPct = Math.max(0, Math.min(100, Math.round(comm.inventoryLevelPct + (random() - 0.5) * 3 - yieldLossShare * 40)));
  // Derived from the same clearing ratio actually driving price/supply/demand above, not the
  // independent inventoryLevelPct random walk — previously the two could (and regularly did)
  // disagree, e.g. showing "Balanced" next to a ~2x demand/supply gap.
  const supplyDemandBalance = clearingRatio > 1.15 ? 'Deficit (Tight Supply)' : clearingRatio < 0.85 ? 'Surplus (Oversupplied)' : 'Balanced';

  return {
    ...comm,
    spotPrice: newSpot,
    weeklySupplyUnits: supplyUnits,
    weeklyDemandUnits: demandUnits,
    change1W,
    historicalPrices: hist,
    futures1M: f1M,
    futures3M: f3M,
    futures6M: f6M,
    inventoryLevelPct,
    supplyDemandBalance,
  };
}

/**
 * Calculate Non-Tradable Composite Benchmark Indices
 */
