/**
 * HH4 — households as cohorts: the region's household aggregate decomposed into ~20 real
 * occupation x wealth-tier cells, built fresh each week from the same primitives the aggregate
 * is built from, so the sums reproduce the aggregates EXACTLY — the identity is by construction,
 * not by assertion (the invariants harness asserts it anyway, so a future edit that breaks the
 * construction fails loudly).
 *
 * The design rule throughout: the cross-section is real, the aggregate behaviour is unchanged.
 * Every per-tier propensity below is a RELATIVE weight normalized against the aggregate the
 * simulation already runs on (the flat tax rate, the behavioural savings rate, the occupation
 * wage bills), because HH4a's job is to give the household sector its cross-section without
 * moving a single aggregate flow — the dynamic wiring (per-cohort stage-05 bids, the real
 * dividend recycle that lets debt service debit budgets, per-cohort balance sheets) is HH4b/c's,
 * each landing with its own re-derived seed.
 */

import { drawPreferences, patienceWeeksOf, riskAversionOf, PATIENCE_MEDIAN_WEEKS } from '../../domain/preferences';
import {
  OccupationType, WealthTier, WealthTierData, OccupationPool, HouseholdCohort,
  TenureStratum, RETURN_TO_EXPERIENCE_ANNUAL, OCCUPATION_TYPES } from '../../domain/region-macro';
import { PopulationNode, bandMeansOverDistribution } from '../../domain/household-credit';
import {
  HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR,
  HOUSEHOLD_EFFECTIVE_TAX_RATE, UNEMPLOYMENT_REPLACEMENT_RATE, CONSUMPTION_TAX_RATE, splitWageBill, EMPLOYER_PAYROLL_TAX_RATE,
} from '../bootstrap/national-accounts';

export const WEALTH_TIERS = ['BOTTOM_50', 'NEXT_40', 'TOP_9', 'TOP_1'] as const;
// §7.241: complete by construction — a fifth WealthTier fails to compile here until this order
// names it. It was the ONE silent site on an otherwise Record-driven axis: a tier with rows in
// every table whose cohort cells were never built.
type MissingWealthTier = Exclude<WealthTier, (typeof WEALTH_TIERS)[number]>;
const _tiersComplete: MissingWealthTier extends never ? true : never = true;
void _tiersComplete;

/**
 * Each tier's own wage multiplier: the mean premium over its band of the occupation's earnings
 * ranking. Falls back to the seed table only when there is no cross-section to rank yet.
 */
function tierWageMultipliers(
  nodes: PopulationNode[],
  tierShares: number[]
): Record<WealthTier, number> {
  const out = {} as Record<WealthTier, number>;
  if (nodes.length === 0) {
    WEALTH_TIERS.forEach((t) => { out[t] = TIER_WAGE_MULTIPLIER_SEED[t]; });
    return out;
  }
  const bands = bandMeansOverDistribution(nodes, tierShares);
  WEALTH_TIERS.forEach((t, i) => { out[t] = Math.max(0.0001, bands[i]?.mean ?? 1); });
  return out;
}
const OCCUPATIONS = OCCUPATION_TYPES;

/**
 * Which occupations each wealth tier's earners work in — THE membership primitive, moved here
 * from the tier-income drift formula it used to feed in evolution.ts (one matrix, one owner).
 * Transposed at build time into per-occupation tier weights.
 */
export const TIER_OCCUPATION_MIXES: Record<WealthTier, Partial<Record<OccupationType, number>>> = {
  TOP_1: { MANAGERIAL_FINANCIAL: 0.50, SPECIALIZED_PROFESSIONAL: 0.35, TECHNICAL_ENGINEERING: 0.15 },
  TOP_9: { MANAGERIAL_FINANCIAL: 0.30, SPECIALIZED_PROFESSIONAL: 0.40, TECHNICAL_ENGINEERING: 0.20, SKILLED_TRADES: 0.10 },
  NEXT_40: { SKILLED_TRADES: 0.35, GENERAL: 0.35, TECHNICAL_ENGINEERING: 0.15, MANAGERIAL_FINANCIAL: 0.15 },
  BOTTOM_50: { GENERAL: 0.60, SKILLED_TRADES: 0.30, TECHNICAL_ENGINEERING: 0.10 },
};

/**
 * DIST — WITHIN ONE OCCUPATION, WHAT A TIER'S EARNERS MAKE, DERIVED.
 *
 * This was `{0.40, 1.05, 3.4, 13.0}` — a stated 32.5x spread between the top and bottom of one
 * occupation, and rule 2's largest surviving shape parameter. §7.172 measured why it could not
 * be derived then: every firm paid the same (p99/p10 of 1.01x), so a tier split of an occupation
 * was degenerate and deleting the table would have flattened the income distribution rather than
 * deriving it. **Both missing mechanisms now exist.** A more productive firm pays more (§7.173)
 * and a more experienced worker earns more (§7.174), and together they produce ~2.5x.
 *
 * **The judgement §7.174 left open, taken.** 32.5x WITHIN one occupation is not a plausible wage
 * fact — a top practitioner does not out-earn a junior one thirty-fold in the same job. That
 * number is the whole income concentration crammed into a wage multiplier, and the model already
 * measures the part that belongs elsewhere: capital income is ~38% of the top tier's income and
 * is carried separately. So deriving is MORE correct than the table, and it moves top-tier income
 * from wages toward capital, where it belongs.
 *
 * **The derivation needs no mapping table**, for the same reason the credit-tier join does not
 * (`domain/household-credit.ts`): the wealth tiers and the occupation's workers are two partitions
 * of one population, so they go on ONE AXIS rather than being mapped to each other. The axis is
 * the wage premium each worker actually carries — its firm's, times its own experience — and each
 * tier takes the mean over its band of that ranking. The normalisation below is unchanged, so the
 * occupation's wage BILL is still preserved exactly and only the split moves.
 *
 * The seed value survives as the OPENING CONDITION, used before any tenure cross-section or firm
 * premium exists to rank (§7.4).
 */
const TIER_WAGE_MULTIPLIER_SEED: Record<WealthTier, number> = {
  BOTTOM_50: 0.40, NEXT_40: 1.05, TOP_9: 3.4, TOP_1: 13.0,
};

/**
 * The earnings cross-section inside one occupation: every (firm premium × experience premium)
 * pair the occupation's workers actually span, as a population on one axis.
 *
 * The two are independent — which firm a worker is at says nothing about how long it has been
 * there — so the joint distribution is their product over the cross of the two margins.
 */
function occupationWagePremiumNodes(
  tenureStrata: TenureStratum[] | undefined,
  firmPremiums: { shareOfWorkers: number; premium: number }[]
): PopulationNode[] {
  const tenure = (tenureStrata ?? []).filter((t) => t.weight > 0);
  const firms = firmPremiums.filter((f) => f.shareOfWorkers > 0 && f.premium > 0);
  if (tenure.length === 0 || firms.length === 0) return [];
  const nodes: PopulationNode[] = [];
  tenure.forEach((t) => {
    const experience = 1 + RETURN_TO_EXPERIENCE_ANNUAL * Math.max(0, t.tenureYears);
    firms.forEach((f) => {
      nodes.push({ shareOfPopulation: t.weight * f.shareOfWorkers, value: experience * f.premium });
    });
  });
  return nodes;
}

/** Progressive tax RATE multipliers, renormalized by the week's actual income weights so the
 * aggregate take equals the flat HOUSEHOLD_EFFECTIVE_TAX_RATE to the dollar — progressivity
 * without moving the S1 identity. */
const TIER_TAX_RATE_MULTIPLIER: Record<WealthTier, number> = {
  BOTTOM_50: 0.45, NEXT_40: 0.90, TOP_9: 1.30, TOP_1: 1.80,
};

/** Means-tested transfer weights per earner: the excess of government transfers over
 * unemployment benefits flows down the distribution, as it does. */
const TIER_TRANSFER_WEIGHT: Record<WealthTier, number> = {
  BOTTOM_50: 1.6, NEXT_40: 0.9, TOP_9: 0.2, TOP_1: 0.05,
};

/**
 * How the real HH3 debt-service burden distributes across tiers — a blended mortgage/card
 * reality (mortgages sit with the homeowning middle, revolving debt with the bottom half).
 * A stated primitive until HH4c gives cohorts their own balance sheets and the split derives.
 */
/**
 * RULE 19 — `TIER_DEBT_SERVICE_WEIGHT` and `TIER_RESIDUAL_RECEIPT_WEIGHT` are GONE.
 *
 * Eight stated numbers splitting debt service and capital receipts across tiers. The debt one
 * carried its own exit condition — *"a stated primitive until HH4c gives cohorts their own
 * balance sheets and the split derives"* — and §7.145 gave them balance sheets, which have been
 * computing exactly these splits and throwing them away ever since.
 *
 * **Debt service follows DEBT.** A tier's share of what the sector owes is measured, so its share
 * of what the sector pays to service it is that same share — the arithmetic, not a table.
 * **The residual recycle follows INSTITUTIONAL CLAIMS**, for the same reason the stated version
 * gave ("institutional-claim incidence"): the claim is now measured per tier, so the incidence is
 * the claim.
 *
 * Both fall back to income share before any balance sheet has accumulated (§7.4: a seed states
 * what the mechanism then owns), which is the only condition under which they are not measured.
 */
function tierShareOfMeasured(
  wealthDistribution: Record<WealthTier, WealthTierData>,
  field: 'debtUSD' | 'institutionalClaimsUSD'
): Record<WealthTier, number> {
  const raw = {} as Record<WealthTier, number>;
  let total = 0;
  WEALTH_TIERS.forEach((t) => {
    const v = Math.max(0, wealthDistribution[t]?.[field] ?? 0);
    raw[t] = v;
    total += v;
  });
  if (total > 0) {
    WEALTH_TIERS.forEach((t) => { raw[t] = raw[t] / total; });
    return raw;
  }
  let incomeTotal = 0;
  WEALTH_TIERS.forEach((t) => { incomeTotal += Math.max(0, wealthDistribution[t]?.shareOfIncomeUSD ?? 0); });
  WEALTH_TIERS.forEach((t) => {
    raw[t] = incomeTotal > 0 ? Math.max(0, wealthDistribution[t]?.shareOfIncomeUSD ?? 0) / incomeTotal : 0.25;
  });
  return raw;
}

/**
 * What each tier's consumption buys, by price tier. The budget-weighted sums of these mixes ARE
 * the region's spend shares, and since HH4b they are LOAD-BEARING: stage 03 allocates the
 * household consumption pool across categories by them. Calibrated so the seed-weight blend
 * reproduces the tier weights the category buyerMixes already imply ({staple ~0.31,
 * standard ~0.59, luxury ~0.09}) — §7.4: the allocation opens where the old one stood, and
 * moves only when the cohort mix does.
 */
export const TIER_SPEND_MIX: Record<WealthTier, { staple: number; standard: number; luxury: number }> = {
  BOTTOM_50: { staple: 0.48, standard: 0.50, luxury: 0.02 },
  NEXT_40: { staple: 0.30, standard: 0.64, luxury: 0.06 },
  TOP_9: { staple: 0.14, standard: 0.71, luxury: 0.15 },
  TOP_1: { staple: 0.06, standard: 0.62, luxury: 0.32 },
};

/**
 * RULE 19 — `TIER_BALANCE_SHEET_WEIGHTS` IS GONE: 32 stated numbers, retired 2026-08-30 (§7.171).
 *
 * Eight rows of "US SCF-shaped" allocations splitting deposits, equity, private business,
 * institutional claims, the unmodeled residual, housing, mortgages and consumer debt across the
 * four tiers. §7.145 replaced every one of them with a derivation off accumulated savings, risk
 * appetite or income — and they survived only as the OPENING CONDITION, for the single week
 * before any saving had accumulated. Seeding the accumulation itself (one line, from the income
 * that produced it) removes that week, so the fallbacks are unreachable and the table has nothing
 * left to do.
 *
 * **A stated table kept alive only by its own opening condition is a table you can delete by
 * seeding the mechanism instead.**
 */

/**
 * DIST/COH — HOW MUCH OF A WINDFALL A TIER SPENDS, DERIVED FROM ITS OWN BALANCE SHEET.
 *
 * This was four stated numbers (0.10 / 0.06 / 0.03 / 0.015) whose own comment admitted the
 * source — "stated from the empirical literature" — and named the honest version: it falls out
 * of a budget constraint. Rule 4 forbids the observed cross-section; the mechanism behind it is
 * fair game, and the model already measures everything the mechanism needs.
 *
 * Two things decide whether a household spends a windfall, and both are per-tier measurements:
 *
 *   1. **Whether it saves at all.** A tier consuming its whole income has unmet needs and
 *      consumes the windfall too; one saving a third of its income saves a third of the windfall.
 *      `savingsRate` is measured per tier from the cohorts' own budgets.
 *   2. **Whether the wealth is SPENDABLE.** This is the liquid/illiquid split §5-DIST calls
 *      not-optional: a tier whose net worth is a house and a pension cannot spend it however much
 *      it would like to, and the top tier's wealth is overwhelmingly of that kind. That is the
 *      real reason the top's MPC is a fraction of the bottom's — not a different preference.
 *
 * A stock is spent over years, not at once, so the flow propensity is divided by the horizon a
 * household spreads a windfall over — a behavioural primitive, and the only stated number left.
 */
export const WEALTH_SPENDDOWN_YEARS = 8;

/**
 * DIST/MAC — HOW MANY WEEKS OF ITS OWN INCOME A HOUSEHOLD WANTS ON HAND.
 *
 * The one primitive in the saving decision below, and it is a behavioural one (rule 2 allows the
 * primitive; it forbids the outcome). A buffer is held in WEEKS OF INCOME because that is what
 * it is for — covering the gap until the next pay cheque, or until the next job — so a richer
 * household wants a proportionally bigger one, and the ratio is what is stable across them.
 */
export const BUFFER_TARGET_WEEKS = 12;

export function tierWealthMpc(tier: WealthTierData | undefined): number {
  if (!tier) return 0;
  const netWorth = Math.max(1, tier.shareOfNetWorthUSD);
  const illiquidUSD = Math.max(0, tier.homeEquityUSD ?? 0)
    + Math.max(0, tier.equityExposureShare) * netWorth;
  const liquidShare = Math.max(0, Math.min(1, 1 - illiquidUSD / netWorth));
  const consumePropensity = Math.max(0, Math.min(1, 1 - tier.savingsRate));
  return (consumePropensity * liquidShare) / WEALTH_SPENDDOWN_YEARS;
}

export interface CohortBuildInputs {
  /** §5-BRAINS — which region's cohorts these are: the key each cohort's brain is drawn from. */
  regionId?: string;
  occupationPools: Record<OccupationType, OccupationPool>;
  baseAnnualWageUSD: Record<OccupationType, number>;
  /** Labor force per occupation (employed + unemployed), the same figure the benefits sum uses. */
  laborForceByOccupation: Record<OccupationType, number>;
  /**
   * DIST — the region's employers, as a wage-premium cross-section: each firm's own
   * `offeredWageIndex` weighted by the share of the region's workers it employs (§7.173).
   *
   * With the tenure strata this is what derives `TIER_WAGE_MULTIPLIER`. Absent before the labour
   * market has run, where the seed table stands in (§7.4).
   */
  firmWagePremiums?: { shareOfWorkers: number; premium: number }[];
  /** PUB3b: the government's REAL weekly transfer obligation — the one number the budget owns. */
  governmentTransfersWeeklyUSD: number;
  /**
   * DIST/MAC — the household sector's LIQUID assets (deposits + money-fund shares), which the
   * saving decision below reads per tier.
   *
   * What this REPLACES is `aggregateSavingsRate`, and the field it replaces had the problem in
   * its own doc comment: "the anchor the tier cross-section is normalized to, so the aggregate
   * saving flow is unchanged by construction". The aggregate was an INPUT and the tiers were a
   * decomposition of it, so no tier could ever disagree with the whole — which is top-down, and
   * the opposite of what a cross-section is for.
   */
  liquidAssetsUSD: number;
  /**
   * DEM/DIST — the share of the population that is RETIRED, from the real age structure.
   *
   * It is the life-cycle saving rate, exactly: a household saves to fund the years it will not
   * earn, so with `w` of adult life working and `r` retired and smooth consumption the working-life
   * saving rate is `r/(w+r)` — and `w + r = 1` across the population, so it IS `r`. No coefficient
   * (§7.169), and it is what makes a positive steady-state savings rate an OUTCOME rather than the
   * four stated per-stage rates §7.170 deleted.
   */
  retiredShareOfPopulation: number;
  /** HH3's real weekly debt service (interest + required principal), annualized inside. */
  weeklyDebtServiceUSD: number;
  /** HH — the region's MEASURED disposable household income (annual): the sum of what households
   *  were actually paid, less what they actually remitted. The cross-section below is scaled to
   *  it, so the decomposition and the aggregate are one number rather than two derivations.
   *  Absent at the cold start, where the seed identity still sets the level (§7.4). */
  measuredDisposableIncomeUSD?: number;
  /**
   * HH4b — the capital receipts that recycle debt service back into the budget, ANNUAL USD,
   * in three components because their INCIDENCE differs and the incidence is the point:
   * deposit interest lands roughly where wealth is (every tier holds deposits) and dividends land
   * where the equity exposure is (the top). §5-CLOSE C5: there is no residual — both are the
   * payments households received.
   */
  annualCapitalReceiptsUSD: {
    depositInterestUSD: number;
    dividendsUSD: number;
  };
  /** Prior wealth distribution, for the capital-income allocation weights (one-week lag, like
   * every mark this stage reads). */
  wealthDistribution: Record<WealthTier, WealthTierData>;
}

export interface CohortBuildResult {
  cohorts: HouseholdCohort[];
  /** Σ consumption budgets — stage 03's household demand pool C, annual USD. */
  totalConsumptionBudgetUSD: number;
  /** Σ disposable — must equal the aggregate national-accounts derivation to the dollar. */
  totalDisposableIncomeUSD: number;
  /** Σ disposable by tier — what wealthDistribution.shareOfIncomeUSD is derived from now. */
  tierDisposableUSD: Record<WealthTier, number>;
  /** Σ savings by tier (the λ-normalized cross-section of the aggregate saving flow). */
  tierSavingsUSD: Record<WealthTier, number>;
  /** Budget-weighted spend shares — the region's staple/standard/luxury split, derived. */
  spendShares: { staple: number; standard: number; luxury: number };
  /**
   * COH2 — the LIFE-CYCLE half of the saving flow, annual USD: what households set aside to fund
   * the years they will not earn. It is the PENSION CONTRIBUTION, and it is carried out of here
   * so that the pension stage stops applying a flat rate to the whole sector's income.
   */
  lifeCycleSavingAnnualUSD: number;
  /** The same flow by tier, so the wealth distribution can put it where it actually goes. */
  tierLifeCycleSavingUSD: Record<WealthTier, number>;
}

export function buildHouseholdCohorts(inputs: CohortBuildInputs): CohortBuildResult {
  const {
    occupationPools, baseAnnualWageUSD, laborForceByOccupation, firmWagePremiums,
    governmentTransfersWeeklyUSD, liquidAssetsUSD, retiredShareOfPopulation, weeklyDebtServiceUSD,
    wealthDistribution, measuredDisposableIncomeUSD, regionId,
  } = inputs;

  // ---- 1. Membership: transpose the tier→occupation mixes into per-occupation tier weights,
  // scaled by tier household shares so a tier's footprint in an occupation reflects both. ----
  const tierWeightInOcc = (occ: OccupationType): Record<WealthTier, number> => {
    const raw = {} as Record<WealthTier, number>;
    let total = 0;
    WEALTH_TIERS.forEach((t) => {
      const w = (wealthDistribution[t]?.shareOfHouseholds ?? 0.25) * (TIER_OCCUPATION_MIXES[t][occ] ?? 0);
      raw[t] = w; total += w;
    });
    WEALTH_TIERS.forEach((t) => { raw[t] = total > 0 ? raw[t] / total : 0.25; });
    return raw;
  };

  // ---- 2. Wage and benefit flows per cell, occupation bills preserved exactly. ----
  interface Cell {
    occ: OccupationType; tier: WealthTier; employed: number; unemployed: number;
    wageUSD: number; benefitsUSD: number;
  }
  const cells: Cell[] = [];
  OCCUPATIONS.forEach((occ) => {
    const pool = occupationPools[occ];
    if (!pool) return;
    const weights = tierWeightInOcc(occ);
    const unemployedInPool = Math.max(0, (laborForceByOccupation[occ] ?? 0) - pool.employed);
    const occWage = baseAnnualWageUSD[occ] * pool.wageIndex;
    // DIST: what each tier's earners make inside THIS occupation, measured off the two
    // cross-sections that produce wage dispersion — the firm's premium and the worker's own
    // experience — laid on one axis and banded by the tiers' own population shares. The seed
    // table stands in only until both exist to rank (§7.4).
    const multiplier = tierWageMultipliers(
      occupationWagePremiumNodes(pool.tenureStrata, firmWagePremiums ?? []),
      WEALTH_TIERS.map((t) => weights[t])
    );
    // Normalize by this occupation's own tier weights so Σ_t employed_t x wage_t = employed x
    // occWage — the bill is untouched, only the split moves.
    const multNorm = WEALTH_TIERS.reduce((a, t) => a + weights[t] * multiplier[t], 0) || 1;
    WEALTH_TIERS.forEach((tier) => {
      const w = weights[tier];
      if (!(w > 0)) return;
      // PUB1c: the occupation wage is TOTAL COMPENSATION; households are paid it net of the
      // employer's payroll tax, exactly as the aggregate derivation nets it.
      const cellWage = splitWageBill(occWage * (multiplier[tier] / multNorm)).grossWagesUSD;
      const employed = pool.employed * w;
      const unemployed = unemployedInPool * w;
      cells.push({
        occ, tier, employed, unemployed,
        wageUSD: employed * cellWage,
        benefitsUSD: unemployed * cellWage * UNEMPLOYMENT_REPLACEMENT_RATE,
      });
    });
  });

  const totalWageUSD = cells.reduce((a, c) => a + c.wageUSD, 0);
  const totalBenefitsUSD = cells.reduce((a, c) => a + c.benefitsUSD, 0);

  // ---- 3. Transfers and capital income, allocated: the aggregate is the national-accounts
  // number (max of the transfer share and benefits — same asymmetry as the aggregate formula);
  // the excess over benefits is means-tested down the distribution. Capital income follows the
  // prior week's tier equity exposure — where the claims actually sit. ----
  const aggregateTransfersUSD = Math.max(
    governmentTransfersWeeklyUSD * 52, totalBenefitsUSD
  );
  const excessTransfersUSD = aggregateTransfersUSD - totalBenefitsUSD;
  // Keyed off TOTAL COMPENSATION, matching the aggregate derivation — capital income is a share
  // of output and does not shrink because the employer's payroll tax was split out of wages.
  const totalCapitalUSD = totalWageUSD * (1 + EMPLOYER_PAYROLL_TAX_RATE) * HOUSEHOLD_CAPITAL_INCOME_PER_WAGE_DOLLAR;

  const earnersByTier = {} as Record<WealthTier, number>;
  WEALTH_TIERS.forEach((t) => { earnersByTier[t] = 0; });
  cells.forEach((c) => { earnersByTier[c.tier] += c.employed + c.unemployed; });
  const transferNorm = WEALTH_TIERS.reduce((a, t) => a + earnersByTier[t] * TIER_TRANSFER_WEIGHT[t], 0) || 1;
  const capitalNorm = WEALTH_TIERS.reduce(
    (a, t) => a + Math.max(0, wealthDistribution[t]?.shareOfNetWorthUSD ?? 0) * (wealthDistribution[t]?.equityExposureShare ?? 0.25),
    0
  ) || 1;
  const tierCapitalUSD = {} as Record<WealthTier, number>;
  WEALTH_TIERS.forEach((t) => {
    tierCapitalUSD[t] = totalCapitalUSD
      * (Math.max(0, wealthDistribution[t]?.shareOfNetWorthUSD ?? 0) * (wealthDistribution[t]?.equityExposureShare ?? 0.25)) / capitalNorm;
  });

  // ---- 4. Progressive tax, renormalized to the flat aggregate rate to the dollar. ----
  const grossOf = (c: Cell) => {
    const tierEarners = earnersByTier[c.tier] || 1;
    const share = (c.employed + c.unemployed) / tierEarners;
    return c.wageUSD + c.benefitsUSD
      + excessTransfersUSD * (TIER_TRANSFER_WEIGHT[c.tier] * (c.employed + c.unemployed)) / transferNorm
      + tierCapitalUSD[c.tier] * share;
  };
  const totalGrossUSD = cells.reduce((a, c) => a + grossOf(c), 0);
  const taxMultNorm = totalGrossUSD > 0
    ? cells.reduce((a, c) => a + grossOf(c) * TIER_TAX_RATE_MULTIPLIER[c.tier], 0) / totalGrossUSD
    : 1;

  // ---- 5. Savings cross-section, λ-normalized to the aggregate behavioural rate; debt service
  // allocated; consumption the residual. ----
  const annualDebtServiceUSD = Math.max(0, weeklyDebtServiceUSD) * 52;
  // RULE 19 — the split is MEASURED (see `tierShareOfMeasured`).
  const debtShareByTier = tierShareOfMeasured(wealthDistribution, 'debtUSD');

  // HH: the cohorts DISTRIBUTE household income; they do not re-derive it. The cross-section —
  // who earns what, relative to whom — is built above from real employment, real occupation
  // wages, real benefits and the tier tax ladder. The LEVEL is the measured sum of what
  // households were actually paid (`measuredDisposableIncomeUSD`), so the decomposition cannot
  // disagree with the aggregate it decomposes. It used to compute its own total from the same
  // three imposed constants the aggregate used, which made the identity hold only for as long as
  // both derivations stayed identical — they stopped the moment income became a measured sum
  // (measured: cohorts summed to 440.48B against an aggregate of 377.12B).
  const rawPreliminary = cells.map((c) => {
    const grossUSD = grossOf(c);
    const taxRate = HOUSEHOLD_EFFECTIVE_TAX_RATE * (TIER_TAX_RATE_MULTIPLIER[c.tier] / taxMultNorm);
    const taxUSD = grossUSD * taxRate;
    return { c, grossUSD, taxUSD, dispUSD: grossUSD - taxUSD };
  });
  const rawDisposableUSD = rawPreliminary.reduce((a, x) => a + x.dispUSD, 0);
  const incomeScale = (measuredDisposableIncomeUSD !== undefined && rawDisposableUSD > 0)
    ? measuredDisposableIncomeUSD / rawDisposableUSD
    : 1;
  const preliminary = rawPreliminary.map((x) => ({
    c: x.c,
    grossUSD: x.grossUSD * incomeScale,
    taxUSD: x.taxUSD * incomeScale,
    dispUSD: x.dispUSD * incomeScale,
  }));
  const totalDisposableIncomeUSD = preliminary.reduce((a, x) => a + x.dispUSD, 0);

  // ---- DIST/MAC: SAVING IS WHAT IS LEFT OVER, NOT WHAT WAS ASSUMED. ----
  //
  // WHAT THIS REPLACES, and why the shape mattered more than the formula. A stated aggregate
  // savings rate (`0.05 + inflation gap x 0.5 − confidence x 0.1 + real-rate gap x 0.4`, four
  // coefficients) became a TARGET saving flow; the tier rates were then scaled by a λ to hit it,
  // capped at 90% of any cohort's income, and whatever the cap clipped was redistributed into
  // the remaining headroom so the target held anyway. **The cross-section could not disagree
  // with the aggregate by construction** — which is top-down, and is exactly what a distribution
  // is supposed to stop you doing. Every "derived" tier number downstream (§7.142's wealth MPC,
  // §7.145's nine tables) ultimately hung off those four coefficients.
  //
  // THE RULE NOW, and every term in it is measured. A household holds a BUFFER against the gap
  // until the next pay cheque or the next job, and wants it in weeks of its OWN income. Below
  // that buffer it saves to rebuild; above it, it spends the excess down. Both at the same speed
  // — `WEALTH_SPENDDOWN_YEARS`, the horizon a household already spreads a windfall over, so no
  // second constant appears here.
  //
  //     saving = (target buffer − liquid assets) / spend-down horizon
  //
  // The aggregate savings rate is then `Σ saving / Σ income`: A MEASUREMENT (rule 2). The cap
  // and the redistribution go with the target, because a rule that cannot ask for more than a
  // household has needs nothing to stop it (rule 6).
  //
  // WHERE THE POLICY RATE WENT. It used to be a coefficient on the aggregate. It is now the two
  // real things a rate does to a household budget, both already per-tier: it raises DEBT SERVICE
  // for the indebted (measured, and already netted out of `dispUSD`) and it raises DEPOSIT
  // INTEREST for savers (measured, and already in capital receipts). That is a distributional
  // transmission instead of a scalar one, and it runs the right way round for each tier.
  //
  // AND IT PRODUCES THE WEALTHY-HAND-TO-MOUTH MIDDLE CAUSALLY. §7.145 derived that cross-section
  // and this explains it: a tier whose net worth is a house and a pension holds little LIQUID,
  // sits below its buffer, and saves out of income like a poor household — which is what
  // wealthy-hand-to-mouth IS, arrived at rather than assumed.
  // COH1: the LIQUID stock, not the whole accumulation. A buffer is what a household can spend
  // this week; a house and a pension are not it, and using the total made every tier look as
  // liquid as its saving history rather than as its portfolio.
  const liquidOf = (t: WealthTier): number => Math.max(0,
    wealthDistribution[t]?.liquidSavingsUSD ?? wealthDistribution[t]?.accumulatedSavingsUSD ?? 0);
  const accumulatedNorm = WEALTH_TIERS.reduce((a, t) => a + liquidOf(t), 0);
  // Who holds the liquid assets is whose saving accumulated (§7.144's own finding). Before any
  // saving has accumulated there is nothing to split by, so it follows income — which is what
  // the opening weeks of a cold start look like (§7.4).
  // Both branches must return a SHARE. `shareOfIncomeUSD` is a DOLLAR AMOUNT despite reading
  // like a fraction — it holds `tierDisposableUSD[t]` — so it is normalised here. Using it raw
  // was the actual cause of §7.158's blow-up: a 346B liquid stock multiplied by a 1.5e11
  // "share", which is a units error of the §7.149 family and not the story that record told.
  const incomeNorm = WEALTH_TIERS.reduce(
    (a, t) => a + Math.max(0, wealthDistribution[t]?.shareOfIncomeUSD ?? 0), 0);
  const tierLiquidShare = (t: WealthTier): number => accumulatedNorm > 0
    ? liquidOf(t) / accumulatedNorm
    : (incomeNorm > 0 ? Math.max(0, wealthDistribution[t]?.shareOfIncomeUSD ?? 0) / incomeNorm : 0.25);
  const tierIncomeUSD = {} as Record<WealthTier, number>;
  WEALTH_TIERS.forEach((t) => { tierIncomeUSD[t] = 0; });
  preliminary.forEach((x) => { tierIncomeUSD[x.c.tier] += x.dispUSD; });
  // COH2 — the LIFE-CYCLE half of the plan, kept separately because it is a different flow with a
  // different destination: it is the pension contribution (insurance-and-pensions.ts), where the
  // buffer half stays in the household's own liquid stock.
  const cohortLifeCycleSavingUSD: number[] = [];
  const cohortSavingsUSD = preliminary.map((x) => {
    const tier = x.c.tier;
    // This cohort's slice of its tier's liquid assets, by its slice of its tier's income.
    const shareOfTier = tierIncomeUSD[tier] > 0 ? x.dispUSD / tierIncomeUSD[tier] : 0;
    const liquidUSD = Math.max(0, liquidAssetsUSD) * tierLiquidShare(tier) * shareOfTier;
    // §5-BRAINS — this cohort's own two numbers, drawn from its identity (a cohort is rebuilt
    // weekly, so the draw is re-struck from the same key and is the same brain every week): a
    // risk-averse cohort wants a bigger buffer, a patient one closes the gap over more years.
    const brain = drawPreferences(`hh:${regionId ?? '?'}:${x.c.occ}:${tier}`, 0);
    const targetBufferUSD = (x.dispUSD / 52) * BUFFER_TARGET_WEEKS * riskAversionOf(brain);
    // DEM/DIST — THE LIFE-CYCLE, and it is the last piece of the savings rate.
    //
    // The buffer term alone has no motive that survives a stationary economy: once the stock is
    // at target, saving is zero, and §7.165 measured the sector permanently DISSAVING because it
    // opened above target. A household also saves to fund the years it will not earn, and that
    // rate is exactly the retired share of the population (§7.169) — no coefficient, and it comes
    // from the real age structure now that one exists.
    const lifeCycleSavingUSD = x.dispUSD * Math.max(0, Math.min(1, retiredShareOfPopulation));
    cohortLifeCycleSavingUSD.push(lifeCycleSavingUSD);
    return lifeCycleSavingUSD + (targetBufferUSD - liquidUSD)
      / (WEALTH_SPENDDOWN_YEARS * (patienceWeeksOf(brain) / PATIENCE_MEDIAN_WEEKS));
  });

  const tierDisposableUSD = {} as Record<WealthTier, number>;
  const tierSavingsUSD = {} as Record<WealthTier, number>;
  let lifeCycleSavingAnnualUSD = 0;
  const tierLifeCycleSavingUSD = {} as Record<WealthTier, number>;
  WEALTH_TIERS.forEach((t) => { tierDisposableUSD[t] = 0; tierSavingsUSD[t] = 0; tierLifeCycleSavingUSD[t] = 0; });

  const exposureNorm = WEALTH_TIERS.reduce(
    (a, t) => a + Math.max(0, wealthDistribution[t]?.shareOfNetWorthUSD ?? 0) * (wealthDistribution[t]?.equityExposureShare ?? 0.25),
    0
  ) || 1;
  const netWorthNorm = WEALTH_TIERS.reduce(
    (a, t) => a + Math.max(0, wealthDistribution[t]?.shareOfNetWorthUSD ?? 0), 0
  ) || 1;
  const tierReceiptsUSD = {} as Record<WealthTier, number>;
  WEALTH_TIERS.forEach((t) => {
    const nw = Math.max(0, wealthDistribution[t]?.shareOfNetWorthUSD ?? 0);
    const exp = wealthDistribution[t]?.equityExposureShare ?? 0.25;
    tierReceiptsUSD[t] =
      Math.max(0, inputs.annualCapitalReceiptsUSD.depositInterestUSD) * (nw / netWorthNorm)
      + Math.max(0, inputs.annualCapitalReceiptsUSD.dividendsUSD) * ((nw * exp) / exposureNorm);
  });
  const cohorts: HouseholdCohort[] = preliminary.map(({ c, grossUSD, taxUSD, dispUSD }, i) => {
    const tierEarners = earnersByTier[c.tier] || 1;
    const share = (c.employed + c.unemployed) / tierEarners;
    const plannedSavingsUSD = cohortSavingsUSD[i];
    const debtServiceUSD = annualDebtServiceUSD * debtShareByTier[c.tier] * share;
    const capitalReceiptsUSD = tierReceiptsUSD[c.tier] * share;
    const budgetBeforeFloorUSD = dispUSD - plannedSavingsUSD - debtServiceUSD + capitalReceiptsUSD;
    const squeezedSavingsUSD = budgetBeforeFloorUSD < 0
      ? Math.max(0, plannedSavingsUSD + budgetBeforeFloorUSD)
      : plannedSavingsUSD;
    // A cohort cannot pay more debt service than it has: the effective payment is capped at
    // what remains after (already-squeezed) savings, and the unpayable slice is ARREARS — the
    // delinquency the banks' consumer loss rates already price on the other side of the same
    // loans. The cohort's recorded burden is what it actually pays.
    const effectiveDebtServiceUSD = Math.min(
      debtServiceUSD, Math.max(0, dispUSD - squeezedSavingsUSD + capitalReceiptsUSD)
    );
    tierDisposableUSD[c.tier] += dispUSD;
    tierSavingsUSD[c.tier] += squeezedSavingsUSD;
    // The squeeze falls on the whole plan, so the life-cycle half is scaled by what survived it:
    // a cohort that cannot save cannot contribute either, which is what a contribution holiday IS.
    const cohortLifeCycleAfterSqueezeUSD = plannedSavingsUSD > 0
      ? cohortLifeCycleSavingUSD[i] * (squeezedSavingsUSD / plannedSavingsUSD)
      : 0;
    lifeCycleSavingAnnualUSD += cohortLifeCycleAfterSqueezeUSD;
    tierLifeCycleSavingUSD[c.tier] += cohortLifeCycleAfterSqueezeUSD;
    return {
      occupation: c.occ,
      tier: c.tier,
      earnerCount: Math.round(c.employed + c.unemployed),
      employedCount: Math.round(c.employed),
      wageIncomeUSD: Math.round(c.wageUSD),
      unemploymentBenefitsUSD: Math.round(c.benefitsUSD),
      transferIncomeUSD: Math.round((excessTransfersUSD * (TIER_TRANSFER_WEIGHT[c.tier] * (c.employed + c.unemployed)) / transferNorm)),
      capitalIncomeUSD: Math.round((tierCapitalUSD[c.tier] * share)),
      grossIncomeUSD: Math.round(grossUSD),
      taxUSD: Math.round(taxUSD),
      disposableIncomeUSD: Math.round(dispUSD),
      debtServiceUSD: Math.round(effectiveDebtServiceUSD),
      // HH4b: debt service DEBITS the budget and the capital receipts CREDIT it — both sides of
      // the loop together (one alone is the HH1c leak). At seed the two net to zero by the
      // residual's construction; from week 1 they diverge with rates, which is the household
      // rate channel: a hike raises the middle's debt service now while receipts follow banks'
      // payouts later and land mostly at the top. A cohort whose obligations exceed its budget
      // STOPS SAVING before it stops eating (squeezedSavingsUSD below) — the real order of a
      // distressed household's cuts.
      savingsUSD: Math.round(squeezedSavingsUSD),
      // PUB1c: consumption tax is a wedge inside the budget — the cohort's money is unchanged,
      // what it buys is smaller, and the difference is remitted by merchants. Recorded so the
      // treasury can collect it; the budget below is what actually reaches the goods market.
      consumptionTaxUSD: Math.round((Math.max(0, dispUSD - squeezedSavingsUSD - effectiveDebtServiceUSD + capitalReceiptsUSD)
        * (CONSUMPTION_TAX_RATE / (1 + CONSUMPTION_TAX_RATE)))),
      consumptionBudgetUSD: Math.round((Math.max(0, dispUSD - squeezedSavingsUSD - effectiveDebtServiceUSD + capitalReceiptsUSD)
        / (1 + CONSUMPTION_TAX_RATE))),
    };
  });

  // ---- 6. The spend shares the drift formula used to fake, now a budget-weighted derivation. ----
  let staple = 0; let standard = 0; let luxury = 0; let budget = 0;
  cohorts.forEach((ch) => {
    const mix = TIER_SPEND_MIX[ch.tier];
    staple += ch.consumptionBudgetUSD * mix.staple;
    standard += ch.consumptionBudgetUSD * mix.standard;
    luxury += ch.consumptionBudgetUSD * mix.luxury;
    budget += ch.consumptionBudgetUSD;
  });
  const spendShares = budget > 0
    ? { staple: staple / budget, standard: standard / budget, luxury: luxury / budget }
    : { staple: 0.35, standard: 0.50, luxury: 0.15 };

  const totalConsumptionBudgetUSD = cohorts.reduce((a, c) => a + c.consumptionBudgetUSD, 0);
  return { cohorts, totalConsumptionBudgetUSD, totalDisposableIncomeUSD, tierDisposableUSD, tierSavingsUSD, spendShares, lifeCycleSavingAnnualUSD, tierLifeCycleSavingUSD };
}
