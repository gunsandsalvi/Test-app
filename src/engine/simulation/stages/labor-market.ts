/**
 * HH5 — the labor market, as a market.
 *
 * Employment used to be three disagreeing numbers. `reg.unemploymentRate` was a formula on the
 * GDP gap, a NAIRU pull and a participation term — 4.5% seeded, drifting to whatever the
 * formula said, and read by everything. `reg.unemploymentRateBottomUp` was written weekly and
 * READ BY NOTHING, and it was wrong anyway: it summed public-company employment and forgot the
 * entire private tier, so it printed 37% while the economy ran at full employment. And the
 * occupation pools implied a third rate — 8% to 17% by region — because firms' real headcounts
 * and the population primitives were seeded independently and nobody reconciled them.
 *
 * The plan's instruction was to make BOTH SIDES REAL rather than write one into the other (that
 * was tried in S1 and reverted, correctly — it hid the disagreement instead of closing it).
 * So this stage is a real market:
 *
 *  - **Demand.** Every firm's target headcount is what its own real output needs at its own
 *    measured productivity: annualized cleared sales (stage 05's real fills) over revenue per
 *    employee. Not a cash/margin/regime drift multiplier — the firm hires because it is
 *    selling more, which is why labor demand is cyclical without anything saying so.
 *  - **Vacancies and separations.** The gap to target opens vacancies (fast) or triggers
 *    layoffs (slow — severance and notice are real frictions, and their asymmetry is why
 *    employment falls slowly into a downturn and climbs slowly out). Quits run on top, and
 *    rise when the market is tight because a worker with options uses them.
 *  - **Matching with friction.** Hires come from a Cobb-Douglas matching function on the real
 *    stocks of vacancies and seekers, per occupation. A vacancy is not filled the instant it
 *    opens; an unfilled one stays open. This is what produces a Beveridge relation instead of
 *    asserting one.
 *  - **One unemployment rate.** `u = (labor force − matched employment) / labor force`, from
 *    the real matched stock. The GDP-gap formula is deleted, `unemploymentRateBottomUp` is
 *    deleted, and the wage response reads real vacancy tightness (V/U) rather than a ratio of
 *    two stocks that were never allowed to disagree.
 *
 * Runs after 02b (credit is priced, so a distressed firm's cash position is known) and before
 * 03 (category demand reads the household income this stage's employment determines).
 */

import { plantNetLocal } from '../../../domain/plant';
import { laborForceCount } from '../../../domain/region-macro';
import { GameState, Region, RegionId, Company, OccupationType } from '../../../types';
import { ensureV2, rowOf, revHistFill } from '../../../engine2/world';
const revHistScratch: number[] = [];
import {
  SECTOR_OCCUPATION_MIX, LABOR_PRODUCTIVITY_GROWTH_ANNUAL,
  MATCHING_EFFICIENCY, MATCHING_ELASTICITY,
  HIRING_ADJUSTMENT_SPEED_MULTIPLE, LAYOFF_SPEED_MULTIPLE, DISTRESS_LAYOFF_SPEED,
  VACANCY_WITHDRAWAL_RATE_WEEKLY,
  GOVERNMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { UNEMPLOYMENT_REPLACEMENT_RATE } from '../../bootstrap/national-accounts';
import { clearLabourMatches, remainingLabourBids, labourPrintOf, LabourBid } from '../../../domain/labour-clearing';
import { BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../../bootstrap/labor-and-wages';
import { isActiveCompany, fullStaffingCapHeads, RECEIPTS_MEASUREMENT_WEIGHT } from '../../../domain/company';
import { SmePool } from '../../../domain/region-macro';
import { WeeklyStepContext } from './context';
import { INDUSTRY_REGISTRY, smePoolSubUnits } from '../../../domain/industry-registry';
import { weeklyWageBillLocal, getBaseAnnualWageLocal } from '../../bootstrap/labor-and-wages';
import { costOfCapitalOf, riskFreeRateOf } from '../../../domain/company-week/cost-of-capital';
import { patienceWeeksOf, riskAversionOf, adaptiveExpectation } from '../../../domain/preferences';
import { RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS } from '../../bootstrap/population';
import {
  RENT_SHARE_TO_LABOUR, TenureStratum, TENURE_COHORTS,
  OCCUPATION_TYPES,
} from '../../../domain/region-macro';
import {
  ownPriceGrowthAnnual, outputPriceVsBaseline, demandPullFromFill,
  revenueGrowthWindow, realEmploymentGrowthAnnual,
  quitRateWeeklyAt, firmQuitMultiplier, smoothedPriceAt, employerWeekPosting, PriceGrowthRow,
} from '../../../domain/company-week/labor-demand';
import { cashOf, poolCashOf } from '../../ledger/accounts';

const OCCUPATIONS = OCCUPATION_TYPES;

/** An employer's occupation mix — a named firm's by sector, a segment pool's by segment type. */
function occupationMixFor(sector: string): Partial<Record<OccupationType, number>> {
  return SECTOR_OCCUPATION_MIX[sector] ?? { GENERAL: 1.0 };
}

/**
 * How fast a firm's real output is growing, annualized, from its own revenue history deflated
 * by the region's inflation. This is the demand signal — NOT a level ratio.
 *
 * The first design here was `target = plannedOutput / revenuePerEmployee`, a ratio of two
 * levels, and levels are exactly what this model cannot keep commensurable over time: nominal
 * revenue and a persisted nominal productivity drift apart at whatever rate the price level and
 * the revenue path happen to differ, and the ratio reads that drift as a hiring need. Measured
 * at week 30 it had every firm wanting 29% more staff than it had, unemployment at 0.00%, and
 * employment past the labor force — while real GDP was flat. Growing productivity with
 * inflation did not fix it, because the defect was the SHAPE, not the deflator.
 *
 * A growth-on-growth form has no level to drift: employment follows real output growth net of
 * productivity growth, which is the textbook labor demand and is stable by construction. At the
 * seed the two are equal and hiring is flat — §7.4 satisfied without a reconciliation step.
 */
/**
 * LAB — this firm's own output price, against the price it was SEEDED at.
 *
 * `outputNeedHeads` below compares this week's revenue to the revenue per head the firm was
 * BUILT with, and those are dollars from two different price levels. The growth path in
 * `desiredEmploymentGrowthAnnual` already knew this — it subtracts inflation from nominal
 * revenue growth — and the LEVEL path did not, so the two halves of one decision disagreed
 * about units.
 *
 * What that cost: with prices falling, every firm's current-dollar revenue divided by its
 * seed-dollar revenue per head reads BELOW its headcount, so `understaffedHeads` is zero for
 * everybody and the hiring branch never fires — while the shedding branch, which reads real
 * earnings against a real capital charge, fires for the 30-43% of firms below the line. One
 * direction was nominal and one was real, and only the shedding direction could happen.
 *
 * The deflator is a MEASUREMENT, not an index anyone chose: each good's own cleared price
 * against the price it was seeded at (`unitPriceLocal / baseUnitPriceLocal`), revenue-weighted
 * across the firm's lines. A firm whose own product has halved in price is not overstaffed.
 */
function outputPriceVsBaselineOf(comp: Company, reg: Region): number {
  // Gatherer only — the rule is domain/company-week/labor-demand.ts's (§5-STRUCT step 2).
  return outputPriceVsBaseline((comp.productLines ?? []).map((line) => {
    const cd = reg.categoryDemand[line.subUnitId];
    return {
      weight: Math.max(0, line.revenueShare ?? 0),
      base: cd?.baseUnitPriceLocal ?? 0,
      now: cd?.unitPriceLocal ?? 0,
    };
  }));
}

/**
 * §7.249 — the deflator is THE PRICE OF WHAT THIS EMPLOYER SELLS, over THE SAME WINDOW as the
 * nominal growth it deflates. The old form subtracted the REGION's 52-WEEK CPI from a 12-week
 * annualized firm growth: rule 8 twice over — a different population (dispersion in category
 * prices became phantom real growth per firm) and a different period (a base effect in the YoY
 * measure at week 53 read as +90pp of real growth for every firm at once, and the labour market
 * answered with mass rehiring, a demand surge, a ×3 price week and a mass shed — §7.247's
 * week-52+ seam, measured end to end). Own-price over own-window has neither seam.
 */
function desiredGrowthAnnualOf(
  history: number[] | undefined,
  currentRevenueLocal: number,
  fallbackInflationAnnual: number,
  lines: { subUnitId: string; revenueShare?: number }[] | undefined,
  reg: Region,
  /** §5-PROD — the employer's OWN measured learning rate; the pools keep the legacy drift
   *  until DIST gives them their own experience. */
  ownProductivityGrowthAnnual: number
): number {
  // Gatherer only — the window, the deflator and the growth rule live in
  // domain/company-week/labor-demand.ts (§5-STRUCT step 2), where their tests are.
  const w = revenueGrowthWindow(history, currentRevenueLocal);
  if (!w) return 0;
  const rows: PriceGrowthRow[] = [];
  (lines ?? []).forEach((l) => {
    const ph = reg.categoryDemand[l.subUnitId]?.priceHistory;
    if (!ph || ph.length < w.windowWeeks + 1) return;
    rows.push({
      weight: Math.max(0, l.revenueShare ?? 0),
      // §7.345 — the print smoothed with the revenue's own weight, at both ends of the window.
      p0: smoothedPriceAt(ph, ph.length - 1 - w.windowWeeks, RECEIPTS_MEASUREMENT_WEIGHT),
      p1: smoothedPriceAt(ph, ph.length - 1, RECEIPTS_MEASUREMENT_WEIGHT),
    });
  });
  return realEmploymentGrowthAnnual(
    w.nominalGrowthAnnual, ownPriceGrowthAnnual(rows, w.windowWeeks, fallbackInflationAnnual),
    ownProductivityGrowthAnnual);
}

const laborCauseTotals = new Map<string, number>();

export function runLaborMarketStage(state: GameState, ctx: WeeklyStepContext): void {
  const v2L = ensureV2(state);
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];

    const employers = [...ctx.prevActiveFirms, ...ctx.prevActivePrivateFirms]
      .filter((c) => c.region === regionId && isActiveCompany(c));

    // ---- 1. Every employer's desired headcount change, and the friction it moves through. ----
    const vacanciesByOcc: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    const separationsByOcc = { ...vacanciesByOcc };

    // Real output growth is what hiring follows, so the revenue signal is deflated.
    const inflationAnnual = reg.inflation ?? 0.02;
    // LAB: the occupation wage table this region's employers pay against.
    const baseAnnualWageLocal = getBaseAnnualWageLocal(regionId);

    // Last week's tightness sets this week's quit rate: a worker with options uses them.
    const priorTightness = reg.laborMarketTightness ?? 1.0;
    //
    // HOW EASILY A JOB IS FOUND HAS ONE REPRESENTATION, AND IT IS THE MATCHING FUNCTION'S.
    //
    // A quit is a bet on finding another job, so the quit rate moves with the rate at which a
    // seeker actually finds one — and this stage computes that rate two hundred lines below:
    // `f(theta) = A x theta^MATCHING_ELASTICITY`, concave, because a vacancy takes time to fill.
    // This was LINEAR in tightness, which is the same claim with an elasticity of 1 — that every
    // extra vacancy finds its worker instantly — and it contradicted the matching function in its
    // own file (rule 4). It was not normalised to the rest point either, so a neutral market quit
    // 5% below baseline.
    //
    // Linear, it was also unbounded upward, and tightness is `vacancies / seekers` — a ratio whose
    // denominator goes to zero in a fully employed market. §7.209's seed opens JPN at 0.31%
    // unemployment and a tightness of 215, where the linear form put the WEEKLY quit rate at 1.69:
    // clipped to 1, so every worker in the country quit in week one and firms could rehire only
    // what a single week of matching allows. Measured: headcount 3.72M -> 0.85M and unemployment
    // 0.31% -> 65%, with revenue FLAT — a labour market destroying itself with nothing happening
    // in the economy at all. The concave form says 11.8% a week at that same tightness, which is a
    // very hot market rather than a national resignation.
    //
    // A rate cannot exceed 1 — that is arithmetic, not a clamp. The [0.3, 2.5] band that used to
    // bound TIGHTNESS was a behavioural clamp: it kept quits alive in a market with no vacancies,
    // where nobody in fact quits.
    const quitRateWeekly = quitRateWeeklyAt(priorTightness);

    interface Posting { comp: Company; vacancies: number; layoffs: number; quits: number }
    const postings: Posting[] = [];
    const segmentPostings: { seg: SmePool; vacancies: number; layoffs: number; quits: number }[] = [];

    employers.forEach((comp) => {
      const current = Math.max(0, comp.employeeCount);
      if (current <= 0) return;
      const growthAnnual = desiredGrowthAnnualOf(
        revHistFill(v2L, rowOf(v2L, comp.id), revHistScratch), comp.annualRevenue, inflationAnnual, comp.productLines, reg,
        comp.lastLearningGrowthAnnual ?? LABOR_PRODUCTIVITY_GROWTH_ANNUAL);
      const desiredWeeklyChange = current * (growthAnnual / 52);

      // §5-BRAINS — THIS management's horizon and risk weight (domain/preferences.ts). The
      // affordability test below runs on the earnings it EXPECTS — an adaptive expectation at
      // its own horizon — not on one week's print: a one-month management reacts to last month,
      // a one-year management to the year. That dispersion is what stops every firm in a region
      // shedding in the same week (§7.344). One owner for the expectation: this stage.
      const patienceWeeks = patienceWeeksOf(comp.management);
      const riskAversion = riskAversionOf(comp.management);
      const expectedEbitdaLocal = adaptiveExpectation(comp.expectedEbitdaLocal, comp.ebitda, patienceWeeks);
      (ctx.companyUpdates[comp.ticker] ??= {}).expectedEbitdaLocal = expectedEbitdaLocal;

      // HH6: a firm's OWN quit rate. Paying below the going rate loses people faster; paying
      // above keeps them, which is what makes a raise do something rather than just cost money.
      // Execution quality retains too — a well-run firm loses fewer of them.
      const quits = current * Math.min(1,
        quitRateWeekly * firmQuitMultiplier(comp.offeredWageIndex ?? 1.0, comp.executionQuality ?? 1.0));

      // ---- LAB: WHAT THE FIRM CAN AFFORD. ----
      //
      // Output growth says how many workers the firm WANTS. This says how many it can PAY FOR,
      // and it is the constraint the model never had. A firm's earnings have to cover the return
      // its capital requires — its own beta against the region's own risk-free rate, the same
      // cost of capital its equity is valued at — and payroll is what it can cut when they do
      // not. A firm short by X dollars a year is short X/wage workers.
      //
      // Without this, wages were a price with no quantity response: a wage the firms could not
      // fund did not reduce hiring, it just accumulated as an unpayable payroll, and the entire
      // adjustment fell on cash-exhaustion layoffs that arrived too late and cascaded (measured:
      // 30-50% unemployment in all four regions, hidden by the 50% clamp on the print).
      const netPpeLocal = plantNetLocal(comp.plant, ctx.nextWeek);
      // §5-BRAINS — the return THIS management requires of its plant: the premium weighted by its own
      // risk aversion. A risk-averse board wants more for the same beta and sheds sooner.
      // §3.26-d: one owner of that number (`domain/company-week/cost-of-capital.ts`).
      const costOfCapital = costOfCapitalOf(comp, riskFreeRateOf(reg));
      const capitalChargeLocal = netPpeLocal * costOfCapital;
      const earningsShortfallLocal = capitalChargeLocal - expectedEbitdaLocal;
      const annualWagePerWorkerLocal = current > 0
        ? (weeklyWageBillLocal(current, occupationMixFor(comp.sector), baseAnnualWageLocal, reg.occupationPools,
          comp.offeredWageIndex ?? 1.0) * 52) / current
        : 0;
      const earningsShortfallHeads = (earningsShortfallLocal > 0 && annualWagePerWorkerLocal > 0)
        ? earningsShortfallLocal / annualWagePerWorkerLocal
        : 0;

      // EMP (§7.109/§7.110): THE OTHER SIDE OF THE SAME CONSTRAINT.
      //
      // A firm below its cost of capital sheds. A firm above it was doing nothing at all, so a
      // world seeded at aggregate break-even — which is exactly what the seed solves for — put
      // half the distribution below the line and had nothing absorbing the workers it released.
      // Employment fell monotonically from week 1 and never recovered: 10.6% → 19.3% in five
      // weeks, and every unemployment-band violation in the harness was this.
      //
      // The seed's own comment already assumed the symmetry — "Above it firms are shedding from
      // week 1; below it they are hiring" — and only the shedding half existed.
      //
      // Money CONSTRAINS hiring; it does not drive it. So a firm hires the smaller of what its
      // output needs and what its earnings can carry. The need is the level target this stage's
      // header has always described — its own annualised output at its own baseline
      // productivity — which is a measurement off the firm's own books and not a new parameter.
      const baselineRevPerHeadLocal = (comp.baselineEmployeeCount ?? 0) > 0
        ? (comp.baselineAnnualRevenue || comp.annualRevenue) / comp.baselineEmployeeCount!
        : 0;
      // Both sides of this ratio in the SAME dollars: this week's revenue deflated back to the
      // price level the baseline was struck at (see `outputPriceVsBaseline`).
      const realRevenueLocal = comp.annualRevenue / Math.max(0.05, outputPriceVsBaselineOf(comp, reg));
      // §7.247 — THE LEVEL TARGET SEES THE DEMAND THE FIRM'S MARKETS LEFT UNSERVED.
      //
      // Realized revenue is what the firm's CURRENT staff produced, so a target built on it
      // alone is self-referential: a firm that shed produced less, read its own smaller revenue
      // as "need met", and could never see the demand it did not serve. Measured on §7.246's
      // world: goods fill 0.45 — buyers received less than half of what they bid — while 75% of
      // firms read negative real growth every week and the hiring branch never fired. §7.110
      // built the symmetry and this is why it stayed nominal (§7.146: a mechanism that binds on
      // nothing is a mechanism that is not there).
      //
      // The pull is the DEFINITIONAL ratio of what the firm's markets asked for to what they
      // received (last week's books — the labour stage runs before this week's auctions), a
      // measurement with no coefficient. It reaches Infinity honestly when a market received
      // nothing; what bounds hiring is what always bounds it — affordability and the matching
      // friction — not a cap on the signal.
      const demandPull = demandPullFromFill((comp.productLines ?? []).map((l) => {
        const cd = reg.categoryDemand[l.subUnitId];
        return {
          weight: Math.max(0, l.revenueShare ?? 0),
          demanded: Number(cd?.totalUnitsDemandedThisWeek) || 0,
          supplied: Number(cd?.totalUnitsSuppliedThisWeek) || 0,
        };
      }));
      // …AND IS CAPPED BY THE HEADS PRODUCTION CAN USE. Stage 05 caps `staffedShare` at 1: a
      // worker beyond the plant's full staffing adds ZERO output. An uncapped pull kept firms
      // bidding for workers with no marginal product once the economy reached full staffing —
      // wage bill and wage pressure with no output behind them — and the first 60-week run of
      // this mechanism ended at nominal GDP 2.6e+37 (weeks 55–60; the 30-week probe sat at 3–6%
      // unemployment and missed it). This is the SAME physical statement stage 05 makes, on the
      // hiring side (rule 4): demand beyond full staffing is served by CAPEX building plant
      // (§7.129's response reads the shortage), not by hiring.
      // §7.269 — the ceiling is the PLANT's, not the seed's (domain/company.ts). A firm whose
      // delivered capex grew its PP&E can staff the bigger plant; frozen at the seed headcount,
      // no profitable firm could ever absorb a released worker and unemployment only ratcheted.
      const productiveHeadsCap = Math.max(1, fullStaffingCapHeads(comp, ctx.nextWeek));
      // §5-PROD, CORRECTED BY MEASUREMENT (§7.301) — THE LEVEL TARGET DOES **NOT** LEARN.
      // Multiplying revenue-per-head by the Wright's-law multiplier here was §5-PROD's third
      // labour consumer, and the inside-commit bisection priced it alone at +3.6pts of USA
      // unemployment by week 30: the §7.247 override is a THRESHOLD (it rescues a firm only
      // while outputNeedHeads exceeds its books), so even the clean ~0.5%/yr multiplier shaved
      // marginal firms out of the rescue every week and released exactly the growth-signal
      // layoffs the override exists to veto — a ratchet, not a level shift. It was also a
      // §1.8 periodicity mismatch (a trailing, baseline-priced demand read divided by an
      // instant multiplier) and a double-count: the firm's OWN learning already reaches its
      // labour demand through the netting (the flow) and the ceiling below (the cap). Both
      // sides of this ratio are struck at the BASELINE vintage, deliberately.
      const outputNeedHeads = baselineRevPerHeadLocal > 0
        ? Math.min((realRevenueLocal * demandPull) / baselineRevPerHeadLocal, productiveHeadsCap)
        : current;
      // §7.345 — A CUT THAT LOWERS EARNINGS CANNOT CLOSE AN EARNINGS SHORTFALL. The affordability
      // rule fired a head for every wage of shortfall, and outranked the level target — so a
      // firm below its cost of capital with its markets SHORT shed workers who each produced
      // more than they cost, earned less next week, and shed again: the u-ratchet was this rule
      // feeding itself (the burn-in's first trace, §7.345: shedding from week 1, output and
      // fill after it, prices last). What a shortfall can honestly cut is the staff output does
      // not need — heads beyond the level target; those cost a wage and produce nothing. The
      // productive core is a capital-allocation question (capex, mothball, exit), not payroll's,
      // and a firm out of cash still sheds on the acute rule below regardless.
      const affordableCutHeads = Math.min(earningsShortfallHeads, Math.max(0, current - outputNeedHeads));
      // §7.345 — A HIRE PAYS FOR ITSELF OR IT DOES NOT HAPPEN; THE PLANT'S RETURN IS NOT THE
      // TEST. Gating hiring on earnings above the capital charge (§7.110's symmetry) meant
      // that at a 10% ten-year yield almost no firm could hire at all — the burn-in's cause
      // trace read ZERO vacancies in every region at 25% unemployment, which is not a labour
      // market anybody works in (rule 3). The marginal hire's own test is value added per head
      // against the wage per head, both measured on the firm's books, and a firm out of cash
      // hires nobody. What it may hire toward is still the level target, and the matching
      // friction still paces it.
      const cashLocal = cashOf(ctx.v2, comp);
      const valueAddedPerHeadLocal = current > 0
        ? (comp.annualRevenue - Math.max(0, (comp.realInputConsumptionCostWeeklyLocal ?? 0) * 52)) / current
        : 0;
      const affordableHireHeads = (cashLocal >= 0 && valueAddedPerHeadLocal > annualWagePerWorkerLocal)
        ? Math.max(0, outputNeedHeads - current)
        : 0;

      // The posting rule — precedence and bounds — is domain/company-week/labor-demand.ts's
      // `employerWeekPosting` (§5-STRUCT step 2); this stage only gathers its inputs.
      const { vacancies, layoffs } = employerWeekPosting({
        currentHeads: current,
        desiredWeeklyChangeHeads: desiredWeeklyChange,
        quitsHeads: quits,
        productiveHeadsCap,
        outputNeedHeads,
        affordableHireHeads,
        affordableCutHeads,
        cashIsNegative: cashLocal < 0,
        layoffSpeedMultiple: LAYOFF_SPEED_MULTIPLE * riskAversion,
        hiringSpeedMultiple: HIRING_ADJUSTMENT_SPEED_MULTIPLE / riskAversion,
      });

      // LABOR_CAUSES=1 — which rule the week's layoffs came from, per region (the §7.345 trace).
      if (process.env.LABOR_CAUSES === '1' && layoffs > 0) {
        const cutSpeed = LAYOFF_SPEED_MULTIPLE * riskAversion;
        const distress = cashLocal < 0 ? current * DISTRESS_LAYOFF_SPEED : 0;
        const afford = affordableCutHeads * cutSpeed;
        const cause = layoffs <= distress + 1e-9 ? 'distress' : layoffs <= afford + 1e-9 ? 'affordability' : 'growth';
        const key = `${regionId}:${cause}`;
        laborCauseTotals.set(key, (laborCauseTotals.get(key) ?? 0) + layoffs);
        laborCauseTotals.set(`${regionId}:quits`, (laborCauseTotals.get(`${regionId}:quits`) ?? 0) + quits);
        laborCauseTotals.set(`${regionId}:vacancies`, (laborCauseTotals.get(`${regionId}:vacancies`) ?? 0) + vacancies);
      }
      const mix = occupationMixFor(comp.sector);
      OCCUPATIONS.forEach((occ) => {
        const w = mix[occ] ?? 0;
        if (w <= 0) return;
        vacanciesByOcc[occ] += vacancies * w;
        separationsByOcc[occ] += (layoffs + quits) * w;
      });
      postings.push({ comp, vacancies, layoffs, quits });
    });

    // The private segments are employers too — the SME residual hires on the same logic, off
    // its own revenue and its own productivity.
    reg.smePools.forEach((seg) => {
      const current = Math.max(0, seg.employment);
      if (current <= 0) return;
      // Same growth-on-growth rule as a named firm, off the segment's own revenue history.
      // §7.249: a pool's own prices are its industry's sub-units, weighted by what it measurably
      // sold into each (the same read §7.227 uses), the category's demand where it has not yet.
      const segLines = smePoolSubUnits(seg.industry).map((su) => ({
        subUnitId: su.unitId,
        revenueShare: (seg.salesDerivedAnnualRevenueUSDBySubUnit?.[su.unitId]
          ?? reg.categoryDemand[su.unitId]?.demandLevelAnnualLocal ?? 0),
      }));
      const growthAnnual = desiredGrowthAnnualOf(
        seg.revenueHistoryLocal, seg.annualRevenueLocal, inflationAnnual, segLines, reg,
        LABOR_PRODUCTIVITY_GROWTH_ANNUAL
      );
      const desiredWeeklyChange = current * (growthAnnual / 52);
      const quits = current * quitRateWeekly;
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector);
      const vacancies = desiredWeeklyChange >= 0
        ? desiredWeeklyChange * HIRING_ADJUSTMENT_SPEED_MULTIPLE + quits
        : quits;
      let layoffs = desiredWeeklyChange < 0
        ? Math.max(0, -desiredWeeklyChange * LAYOFF_SPEED_MULTIPLE - quits)
        : 0;
      // DIST — DISTRESS LAYOFFS INTEGRATE OVER THE POOL'S STRATA, NOT OVER ITS MEAN.
      //
      // The rule above is `cash < 0 → shed`, applied PER FIRM to the named tier: each firm
      // crosses its own threshold or does not. Applied to a pool's TOTAL it says something quite
      // different — that either every firm in the pool has distress layoffs or none does — and it
      // is the same code at two resolutions with only one of them right (rule 4, §5-DIST).
      //
      // DIST already measures which strata cannot service what they owe, and the exiting weight
      // at the absorbing barrier is drawn from exactly that (§7.143). The employment side reads
      // the same integral: the share of the pool's firms in trouble sheds, and the rest does not.
      // A pool whose aggregate cash is comfortable while a third of its firms cannot cover their
      // interest now sheds that third — which the mean could not express.
      const poolCashLocal = poolCashOf(ctx.v2, regionId, seg.industry);
      const distressedShare = seg.distressedFirmShare ?? (poolCashLocal < 0 ? 1 : 0);
      if (distressedShare > 0) {
        layoffs = Math.max(layoffs, current * distressedShare * DISTRESS_LAYOFF_SPEED);
      }
      // The whole pool running out of money is still the acute case, and it is not the same
      // statement: the strata above are about firms that cannot service DEBT, this is a pool
      // that cannot make PAYROLL.
      if (poolCashLocal < 0) layoffs = Math.max(layoffs, current * DISTRESS_LAYOFF_SPEED);
      OCCUPATIONS.forEach((occ) => {
        const w = (mix as Partial<Record<OccupationType, number>>)[occ] ?? 0;
        if (w <= 0) return;
        vacanciesByOcc[occ] += vacancies * w;
        separationsByOcc[occ] += (layoffs + quits) * w;
      });
      segmentPostings.push({ seg, vacancies, layoffs, quits });
    });

    // ---- 2. The real supply side. Employment has exactly ONE representation: the sum of what
    // the real employers actually have on their books. The occupation pools are a VIEW of that
    // sum, derived at the end of this stage — never a second stock evolved beside it. (A first
    // draft did evolve them separately and they promptly disagreed: pool employment ran 0.6M
    // ABOVE the headcount the firms wanted, and the reported rate fell to 1% against a real 6%.
    // Rule 3 does not stop applying because both copies are mine.) ----
    const totalLaborForce = Math.max(1,
      laborForceCount(reg));
    const shares = reg.occupationLaborForceShare;
    const pools = reg.occupationPools;

    const employedByOccBefore: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    employers.forEach((comp) => {
      const mix = occupationMixFor(comp.sector);
      OCCUPATIONS.forEach((occ) => { employedByOccBefore[occ] += Math.max(0, comp.employeeCount) * (mix[occ] ?? 0); });
    });
    reg.smePools.forEach((seg) => {
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector);
      OCCUPATIONS.forEach((occ) => {
        employedByOccBefore[occ] += Math.max(0, seg.employment) * ((mix as Partial<Record<OccupationType, number>>)[occ] ?? 0);
      });
    });
    // Government is an employer too — its headcount is a policy quantity set in stage 02.
    Object.entries(GOVERNMENT_OCCUPATION_MIX).forEach(([occ, share]) => {
      employedByOccBefore[occ as OccupationType] += reg.governmentEmployment * (share ?? 0);
    });

    // ---- 3. Matching, per occupation. An open vacancy carries over; a seeker who does not
    // match stays a seeker. Hires are bounded by both stocks and by what a week of search can
    // actually produce, which is what makes hiring take TIME. ----
    const hiresByOcc: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    const carriedVacanciesByOcc = { ...hiresByOcc };
    const nextTenureStrataByOcc = {} as Record<OccupationType, TenureStratum[]>;
    /** §3.20-iii: each occupation's own search this week, kept for the mobility pass and the strata. */
    const own = {} as Record<OccupationType, { employedBefore: number; separations: number; openVacancies: number; seekers: number }>;

    // ---- §3.24-i: THE MATCHES CLEAR ON THE WAGE. Every posting is a BID — the employer's
    // openings in the occupation at the wage it offers relative to the going rate — and the
    // week's matches go to the highest bids first (`domain/labour-clearing.ts`). A firm paying
    // over the rate fills before one paying under; the bid that took the last match is the
    // price the occupation printed. The segments post at the going rate — they have no wage
    // policy of their own until BP gives them one. ----
    const segmentBidKey = (seg: SmePool): string => `SEG:${seg.industry}`;
    const bidsByOcc = {} as Record<OccupationType, LabourBid[]>;
    OCCUPATIONS.forEach((occ) => { bidsByOcc[occ] = []; });
    postings.forEach(({ comp, vacancies }) => {
      if (!(vacancies > 0)) return;
      const mix = occupationMixFor(comp.sector);
      OCCUPATIONS.forEach((occ) => {
        const units = vacancies * (mix[occ] ?? 0);
        if (units > 0) bidsByOcc[occ].push({ key: comp.ticker, units, bidIndex: comp.offeredWageIndex ?? 1.0 });
      });
    });
    segmentPostings.forEach(({ seg, vacancies }) => {
      if (!(vacancies > 0)) return;
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector) as Partial<Record<OccupationType, number>>;
      OCCUPATIONS.forEach((occ) => {
        const units = vacancies * (mix[occ] ?? 0);
        if (units > 0) bidsByOcc[occ].push({ key: segmentBidKey(seg), units, bidIndex: 1.0 });
      });
    });
    const filledByKeyByOcc = {} as Record<OccupationType, Map<string, number>>;
    // §3.24-ii: THE SEEKERS' RESERVATION. A matched seeker accepts nothing below its outside
    // option, which is the benefit this world already pays it — `UNEMPLOYMENT_REPLACEMENT_RATE`
    // of the going rate (a transfer-policy primitive), so a bid is refused below that share of
    // the rate it is bid against. In a slack market the print falls to this and no further; in a
    // tight one the bids set it. Whether a household searches at all is 37-SMALL's.
    const reservationIndex = UNEMPLOYMENT_REPLACEMENT_RATE;

    OCCUPATIONS.forEach((occ) => {
      const supplyForOcc = totalLaborForce * (shares[occ] ?? BASELINE_OCCUPATION_LABOR_FORCE_SHARE[occ] ?? 0.2);
      // NOT clipped to supply. Clipping it here was a measurement that lied: an occupation
      // already staffed above its own labor-force share reported itself exactly at the share,
      // which left `seekers` positive, let hiring continue, and pushed the real overshoot
      // further every week while the pools printed a tidy number (measured: 2.5% and climbing).
      // Unclipped, seekers goes to zero and hiring in that occupation STOPS — which is what a
      // labor shortage is.
      const employedBefore = Math.max(0, employedByOccBefore[occ]);
      const separations = Math.min(employedBefore, separationsByOcc[occ]);
      // The separated are searching again this week: gross flows, not the net.
      const seekers = Math.max(0, supplyForOcc - employedBefore + separations);
      const openVacancies = Math.max(0, (pools[occ]?.vacancies ?? 0) + vacanciesByOcc[occ]);

      const matches = (seekers > 0 && openVacancies > 0)
        ? MATCHING_EFFICIENCY
          * Math.pow(openVacancies, MATCHING_ELASTICITY)
          * Math.pow(seekers, 1 - MATCHING_ELASTICITY)
        : 0;
      // What a week of search produced, allocated on the bids. Matches on the carried stock that
      // no bid this week can take land nowhere: a posting is an employer's, and an anonymous
      // carried opening has none until 37-EMPLOYMENT's register gives it one.
      const float = Math.max(0, Math.min(matches, openVacancies, seekers));
      const cleared = clearLabourMatches(bidsByOcc[occ], float, reservationIndex);
      const hires = cleared.filledUnits;

      hiresByOcc[occ] = hires;
      filledByKeyByOcc[occ] = cleared.filledByKey;
      own[occ] = { employedBefore, separations, openVacancies, seekers };
      // LABOR_TRACE=1 — the two sides of the flow, per (region, occupation): which one drives
      // a monotone unemployment climb is the whole question.
      if (process.env.LABOR_TRACE === '1' && (separations > 1e4 || hires > 1e4)) {
        console.log(`  [lab] w${ctx.nextWeek} ${regionId}:${occ} emp ${(employedBefore / 1e6).toFixed(2)}M`
          + ` sep ${(separations / 1e3).toFixed(0)}k hires ${(hires / 1e3).toFixed(0)}k`
          + ` vac ${(openVacancies / 1e3).toFixed(0)}k seekers ${(seekers / 1e3).toFixed(0)}k`
          + ` matches ${(matches / 1e3).toFixed(0)}k`);
      }

    });

    // ---- 3b. §3.20-iii: MOBILITY BETWEEN OCCUPATIONS — the same search, one occupation over.
    // A seeker its own occupation could not place this week searches the vacancies the OTHER
    // occupations left unfilled, through the same matching function, and enters the new
    // occupation at tenure zero — the bottom of its experience cross-section, which is what
    // retraining costs: the entry wage, and not a coefficient. It is slower than own-occupation
    // search by construction (a second pass over what the first left) and it runs from where
    // the idle seekers are to where the open vacancies are, so a shortage in one occupation is
    // relieved by the surplus in another instead of standing for ever. The labour force's
    // occupation shares are the STATE this flow moves: they were a wage-gap drift at three
    // stated speeds in `evolution.ts`, which nothing measured and which went with this. ----
    {
      const unmatched = {} as Record<OccupationType, number>;
      const unfilled = {} as Record<OccupationType, number>;
      OCCUPATIONS.forEach((occ) => {
        unmatched[occ] = Math.max(0, own[occ].seekers - hiresByOcc[occ]);
        unfilled[occ] = Math.max(0, own[occ].openVacancies - hiresByOcc[occ]);
      });
      const moved = occupationalMobility(unmatched, unfilled);
      const nextShares = { ...shares } as Record<OccupationType, number>;
      OCCUPATIONS.forEach((occ) => {
        // §3.24-i: the movers take what the occupation's own search left, in the same bid order.
        const second = clearLabourMatches(remainingLabourBids(bidsByOcc[occ], filledByKeyByOcc[occ]), moved.into[occ], reservationIndex);
        second.filledByKey.forEach((u, k) => filledByKeyByOcc[occ].set(k, (filledByKeyByOcc[occ].get(k) ?? 0) + u));
        hiresByOcc[occ] += second.filledUnits;
        nextShares[occ] = Math.max(0, (shares[occ] ?? BASELINE_OCCUPATION_LABOR_FORCE_SHARE[occ] ?? 0.2)
          + (moved.into[occ] - moved.outOf[occ]) / totalLaborForce);
      });
      reg.occupationLaborForceShare = nextShares;
    }

    // ---- 3c. DIST 1(b) and the carried vacancies, on the flows the two passes produced. ----
    OCCUPATIONS.forEach((occ) => {
      const { employedBefore, separations, openVacancies } = own[occ];
      const hires = hiresByOcc[occ];
      // ---- DIST 1(b): THE EXPERIENCE CROSS-SECTION MOVES ON THE REAL FLOWS. ----
      //
      // Every worker in an occupation earned the same wage, so a tier split of them was
      // degenerate and `TIER_WAGE_MULTIPLIER` had to STATE the spread (§7.172-173). Workers
      // differ by EXPERIENCE, and this stage already computes what produces its distribution:
      // hires enter at tenure zero, survivors age a week, separations take weight out.
      //
      // Same machinery DIST proved on SME leverage strata (§7.140-143) — weights, an integral,
      // an absorbing barrier and reinjection — pointed at people instead of firms. Separations
      // are drawn ACROSS the cross-section (a layoff does not select on tenure here), and the
      // reinjection is the hires, at the bottom.
      {
        const priorStrata = pools[occ]?.tenureStrata;
        const strata = (priorStrata && priorStrata.length > 0)
          ? priorStrata.map((st) => ({ ...st }))
          // Cold start: one cohort per year of a working life, spread evenly — the steady state
          // of a workforce hiring and separating at a constant rate (§7.4).
          : Array.from({ length: TENURE_COHORTS }, (_, k) => ({
              weight: 1 / TENURE_COHORTS,
              tenureYears: (k + 0.5) * ((RETIREMENT_AGE_YEARS - WORKFORCE_ENTRY_AGE_YEARS) / TENURE_COHORTS),
            }));
        const afterSeparationsShare = employedBefore > 0
          ? Math.max(0, 1 - separations / employedBefore) : 1;
        const survivingHeads = employedBefore * afterSeparationsShare;
        const totalHeads = survivingHeads + hires;
        if (totalHeads > 0) {
          strata.forEach((st) => {
            // Survivors age a week and keep their share of a smaller workforce.
            st.tenureYears += 1 / 52;
            st.weight = (st.weight * survivingHeads) / totalHeads;
          });
          // The hires re-enter at the bottom, at tenure zero.
          const entrantWeight = hires / totalHeads;
          if (entrantWeight > 0) {
            const bottom = strata.reduce((lo, st) => (st.tenureYears < lo.tenureYears ? st : lo), strata[0]);
            const merged = bottom.weight + entrantWeight;
            bottom.tenureYears = merged > 0 ? (bottom.weight * bottom.tenureYears) / merged : 0;
            bottom.weight = merged;
          }
        }
        nextTenureStrataByOcc[occ] = strata;
      }
      // What is left open is carried forward LESS the postings employers withdraw — see
      // VACANCY_WITHDRAWAL_RATE_WEEKLY. Without it an occupation nobody can staff accumulates
      // vacancies without bound and its "tightness" stops meaning anything.
      carriedVacanciesByOcc[occ] = Math.max(0, openVacancies - hires) * (1 - VACANCY_WITHDRAWAL_RATE_WEEKLY);
    });

    // ---- 4. The hires land on the REAL employers: what each one's bids took, occupation by
    // occupation — so a firm that wanted twenty engineers and bid under the market for them
    // stays short of engineers and can still fill its general roles. ----
    const filledForKey = (key: string): number =>
      OCCUPATIONS.reduce((a, occ) => a + (filledByKeyByOcc[occ].get(key) ?? 0), 0);
    /** §3.24-i: the price each occupation printed this week, relative to the going rate it was
     *  bid against; an occupation nothing filled printed nothing. */
    const clearedIndexByOcc = {} as Record<OccupationType, number | undefined>;
    OCCUPATIONS.forEach((occ) => { clearedIndexByOcc[occ] = labourPrintOf(bidsByOcc[occ], filledByKeyByOcc[occ]); });

    postings.forEach(({ comp, vacancies, layoffs, quits }) => {
      const hired = filledForKey(comp.ticker);
      const next = Math.max(1, Math.round(comp.employeeCount + hired - layoffs - quits));
      const update = (ctx.companyUpdates[comp.ticker] ??= {});
      update.employeeCount = next;
      update.previousEmployeeCount = comp.employeeCount;

      // ---- §3.24-i: THIS FIRM'S BID, OFF THE PRICE THE MARKET JUST PRINTED. ----
      const unfilledShare = vacancies > 0 ? Math.max(0, Math.min(1, 1 - hired / vacancies)) : 0;
      const prevIndex = comp.offeredWageIndex ?? 1.0;
      const mixW = occupationMixFor(comp.sector);
      // What it took to fill this week, in this firm's own occupation mix: the marginal bid in
      // each occupation it hires from. An occupation nothing filled printed nothing, and the
      // going rate stands in (1.0 — every bid is relative to it).
      const clearedForMix = OCCUPATIONS.reduce((a, occ) => a + (mixW[occ] ?? 0) * (clearedIndexByOcc[occ] ?? 1.0), 0);

      // ---- RENT-SHARING: A MORE PRODUCTIVE FIRM PAYS MORE. ----
      //
      // What a firm can pay is its own SURPLUS PER WORKER — what a head produces above the
      // non-wage cost of employing it — and a share of that reaches the wage because the worker
      // can leave (`RENT_SHARE_TO_LABOUR`, the one bargaining primitive). Measured before it
      // existed, `offeredWageIndex` ran p10 0.988 to p99 1.002 across 2,512 employers (§7.172):
      // every worker in an occupation earned the same, and a stated 32.5x tier multiplier
      // carried the whole within-occupation income distribution.
      const headcount = Math.max(1, comp.employeeCount);
      const nonWageCostLocal = Math.max(0, comp.annualRevenue - comp.ebitda) - weeklyWageBillLocal(
        headcount, occupationMixFor(comp.sector), baseAnnualWageLocal, reg.occupationPools, prevIndex) * 52;
      const surplusPerHeadLocal = (comp.annualRevenue - Math.max(0, nonWageCostLocal)) / headcount;
      const goingWagePerHeadLocal = (weeklyWageBillLocal(
        headcount, occupationMixFor(comp.sector), baseAnnualWageLocal, reg.occupationPools, 1.0) * 52) / headcount;
      // The target premium is the share of the surplus that exceeds the going wage. A firm with
      // no surplus above it offers no premium; one earning twice it offers a real one — and one
      // whose surplus has fallen below the going wage is pulled under it, which is the employer's
      // side of the bargain (a firm losing money does not give raises).
      const rentTargetIndex = goingWagePerHeadLocal > 0
        ? 1 + RENT_SHARE_TO_LABOUR * ((surplusPerHeadLocal - goingWagePerHeadLocal) / goingWagePerHeadLocal)
        : 1;
      // A firm the market rationed bids what it took to fill — the price it can now see — or the
      // bargain's level, whichever is higher; a firm that filled bids the bargain's level. Either
      // way it closes the gap at its own management's horizon (domain/preferences.ts), the one
      // pace this model gives a decision: a one-month management reprices in a month, a one-year
      // one over the year. No push speed, no pull speed, no slack coefficient — those three
      // (`WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL`, `WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL`, the
      // tightness ease) were the wage moving AFTER an allocation it could not affect.
      const target = unfilledShare > 1e-3 ? Math.max(clearedForMix, rentTargetIndex) : rentTargetIndex;
      // A wage cannot be negative; nothing else bounds what a firm offers.
      const nextIndex = Math.max(0, prevIndex + (target - prevIndex) / patienceWeeksOf(comp.management));
      update.offeredWageIndex = Number(nextIndex.toFixed(5));
      update.unfilledVacancyShare = Number(unfilledShare.toFixed(4));
    });
    segmentPostings.forEach(({ seg, vacancies, layoffs, quits }: { seg: SmePool; vacancies: number; layoffs: number; quits: number }) => {
      const hired = filledForKey(segmentBidKey(seg));
      seg.employment = Math.max(0, Math.round(seg.employment + hired - layoffs - quits));
    });

    // ---- §3.24-i: THE GOING RATE IS THE AVERAGE WAGE PAID — a read of the employers' own
    // levels, not a walk toward them. Every firm's wage is `going rate × its own index`; the
    // segments and the government pay the going rate itself. So the rate an occupation IS paid
    // is the employment-weighted average of all of those, and that is what the pool publishes.
    // It moves when firms reprice (at their own horizons, above) and when hires enter at their
    // employers' levels — stickiness as a consequence of the relationships that persist and of
    // the segments' inertia, with no catch-up speed (`MARKET_WAGE_CATCHUP_SPEED_WEEKLY` closed
    // 15% of this same gap a week; the other 85% was the going rate disagreeing with what was
    // being paid). ----
    const wageNumeratorByOcc: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    const wageDenomByOcc = { ...wageNumeratorByOcc };
    employers.forEach((comp) => {
      const headcount = ctx.companyUpdates[comp.ticker]?.employeeCount ?? comp.employeeCount;
      const idx = ctx.companyUpdates[comp.ticker]?.offeredWageIndex ?? comp.offeredWageIndex ?? 1.0;
      const mix = occupationMixFor(comp.sector);
      OCCUPATIONS.forEach((occ) => {
        const w = Math.max(0, headcount) * (mix[occ] ?? 0);
        wageNumeratorByOcc[occ] += w * idx;
        wageDenomByOcc[occ] += w;
      });
    });
    reg.smePools.forEach((seg) => {
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector) as Partial<Record<OccupationType, number>>;
      OCCUPATIONS.forEach((occ) => {
        const w = Math.max(0, seg.employment) * (mix[occ] ?? 0);
        wageNumeratorByOcc[occ] += w;
        wageDenomByOcc[occ] += w;
      });
    });
    Object.entries(GOVERNMENT_OCCUPATION_MIX).forEach(([occ, share]) => {
      const w = Math.max(0, reg.governmentEmployment) * (share ?? 0);
      wageNumeratorByOcc[occ as OccupationType] += w;
      wageDenomByOcc[occ as OccupationType] += w;
    });
    const marketCatchupByOcc = {} as Record<OccupationType, number>;
    OCCUPATIONS.forEach((occ) => {
      const avgPaid = wageDenomByOcc[occ] > 0 ? wageNumeratorByOcc[occ] / wageDenomByOcc[occ] : 1;
      // §3.24-ii: no cost-of-living term. `COST_OF_LIVING_PASS_THROUGH` (0.6 of inflation, times a
      // bargaining power off tightness) raised the going rate beside the bargain the model
      // already has — a second channel from prices to wages (rule 4). The channel is the
      // firms' bids: a price rise is a nominal surplus per head, the rent share of it reaches
      // the bid at the firm's horizon, and the average paid moves because employers moved it.
      // Real wages fall while that happens, which is what a price surge does to them.
      const catchup = avgPaid - 1;
      marketCatchupByOcc[occ] = catchup;
      const prev = pools[occ]?.wageIndex ?? 1.0;
      // LAB: the going rate is a price and carries no band. It used to sit in [0.1, 20] with its
      // growth held to [-20%, +35%] — bounds that could only bind by disagreeing with what
      // employers were actually offering, which is the one thing the going rate IS.
      const next = Math.max(0, prev * (1 + catchup));
      pools[occ] = {
        ...pools[occ],
        wageIndex: Number(next.toFixed(5)),
        // The going rate's own growth, annualized — what household income is paid at.
        wageGrowthAnnual: Number((catchup * 52).toFixed(4)),
        // §3.24-i: the price the occupation printed this week, against the rate it was bid at.
        clearedWageIndex: clearedIndexByOcc[occ] === undefined ? undefined : Number(clearedIndexByOcc[occ]!.toFixed(5)),
      };
    });
    // Each firm's premium is relative to a rate that just moved, so renormalize it: the firm's
    // nominal wage is what it decided, and the rate it is expressed against is now the average.
    employers.forEach((comp) => {
      const upd = ctx.companyUpdates[comp.ticker];
      if (!upd || upd.offeredWageIndex === undefined) return;
      const mix = occupationMixFor(comp.sector);
      const catchup = OCCUPATIONS.reduce((a, occ) => a + (mix[occ] ?? 0) * marketCatchupByOcc[occ], 0);
      // A premium relative to the market, with no band: how far a firm sits from the going rate
      // is its own decision and its own cost.
      upd.offeredWageIndex = Number(Math.max(0, upd.offeredWageIndex / (1 + catchup)).toFixed(5));
    });

    // ---- 5. The pools and the rate are DERIVED from the employers' books — by the exported
    // reconciler below, which also runs at the end of the week so that a firm defaulting in
    // stage 08 (after this stage) releases its workers in the same week rather than leaving the
    // pools holding phantom employment until the next labor session. ----
    reconcileEmploymentView(reg, employers, carriedVacanciesByOcc, hiresByOcc, separationsByOcc, nextTenureStrataByOcc);
  });
  if (process.env.LABOR_CAUSES === '1') {
    const line = [...laborCauseTotals.entries()].sort().map(([k, v]) => `${k} ${(v / 1e3).toFixed(0)}k`).join(' | ');
    console.log(`  [labor-causes] w${ctx.nextWeek} ${line}`);
    laborCauseTotals.clear();
  }
}

/**
 * Employment's ONE representation, read off the real employers: named firms, the segment pools
 * and the government. Exported because it must also run at the END of the week — defaults and
 * acquisitions happen in stages 08 and 10, after the labor session, and a bankrupt firm's staff
 * are unemployed the moment the firm is gone, not a week later (measured before this: the pools
 * held 3.5% phantom employment through a default wave).
 */
export function reconcileEmploymentView(
  reg: Region,
  employers: Company[],
  carriedVacanciesByOcc?: Record<OccupationType, number>,
  hiresByOcc?: Record<OccupationType, number>,
  separationsByOcc?: Record<OccupationType, number>,
  /** DIST 1(b) — the experience cross-section this week's flows produced, when the labour
   *  session computed one. The end-of-week reconciliation (defaults, acquisitions) does not. */
  nextTenureStrataByOcc?: Record<OccupationType, TenureStratum[]>
): void {
  const pools = reg.occupationPools;
  const totalLaborForce = Math.max(1,
    laborForceCount(reg));
  const shares = reg.occupationLaborForceShare;

  const employedByOcc: Record<OccupationType, number> = {
    GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
    SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
  };
  employers.forEach((comp) => {
    const mix = occupationMixFor(comp.sector);
    OCCUPATIONS.forEach((occ) => { employedByOcc[occ] += Math.max(0, comp.employeeCount) * (mix[occ] ?? 0); });
  });
  reg.smePools.forEach((seg: SmePool) => {
    const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector) as Partial<Record<OccupationType, number>>;
    OCCUPATIONS.forEach((occ) => {
      employedByOcc[occ] += Math.max(0, seg.employment) * (mix[occ] ?? 0);
    });
  });
  Object.entries(GOVERNMENT_OCCUPATION_MIX).forEach(([occ, share]) => {
    employedByOcc[occ as OccupationType] += reg.governmentEmployment * (share ?? 0);
  });

  let totalEmployed = 0;
  let totalVacancies = 0;
  let totalSeekers = 0;
  OCCUPATIONS.forEach((occ) => {
    const supplyForOcc = totalLaborForce * (shares[occ] ?? BASELINE_OCCUPATION_LABOR_FORCE_SHARE[occ] ?? 0.2);
    const employed = Math.max(0, employedByOcc[occ]);
    const vacancies = carriedVacanciesByOcc ? carriedVacanciesByOcc[occ] : (pools[occ]?.vacancies ?? 0);
    totalEmployed += employed;
    totalVacancies += vacancies;
    totalSeekers += Math.max(0, supplyForOcc - employed);
    pools[occ] = {
      ...pools[occ],
      employed: Math.round(employed),
      vacancies: Math.round(vacancies),
      // DIST 1(b) — the experience cross-section this week's flows produced.
      ...(nextTenureStrataByOcc?.[occ] ? { tenureStrata: nextTenureStrataByOcc[occ] } : {}),
      ...(hiresByOcc ? { hiresThisWeek: Math.round(hiresByOcc[occ]) } : {}),
      ...(separationsByOcc ? { separationsThisWeek: Math.round(separationsByOcc[occ]) } : {}),
    };
  });

  // LAB: the real reading. The 50% ceiling this replaces was not a modelling choice — it was
  // hiding its own inputs: the harness printed "reported 50.00% is not the reading of its own
  // employment stock (53.19%)" for weeks while the cap held the published number still. A rate
  // cannot be negative (that would mean more employed than the labor force, which is a defect
  // worth seeing, not smoothing).
  reg.unemploymentRate = Number(
    Math.max(0, (totalLaborForce - totalEmployed) / totalLaborForce).toFixed(4)
  );
  reg.laborMarketTightness = Number((totalSeekers > 0 ? totalVacancies / totalSeekers : 1.0).toFixed(4));
  // GUARD (§4.0 Tier 1 item 15): the §7.244 world printed a vacancy rate of 2.0e9% — an
  // unguarded ratio at a limit (§7.210's shape). More open vacancies than the entire labor
  // force is not a tight market, it is a branch upstream emitting garbage; fail on the week it
  // happens, naming the inputs, instead of publishing it into every consumer.
  if (!(totalLaborForce > 0) || !isFinite(totalVacancies) || totalVacancies > totalLaborForce) {
    const byOcc = OCCUPATIONS.map((occ) => `${occ} ${Math.round(
      carriedVacanciesByOcc ? carriedVacanciesByOcc[occ] : (pools[occ]?.vacancies ?? 0))}`).join(', ');
    throw new Error(
      `ENGINE DEFECT: vacancy reading departed sanity — vacancies ${Math.round(totalVacancies)} against labor force ${Math.round(totalLaborForce)} (by occupation: ${byOcc})`);
  }
  reg.vacancyRate = Number((totalVacancies / totalLaborForce).toFixed(4));
}

/** End-of-week pass: re-read employment after defaults, acquisitions and births have landed. */
export function runLaborReconciliationStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const employers = ctx.updatedCompanies.filter((c) => c.region === regionId && isActiveCompany(c));
    reconcileEmploymentView(reg, employers);
  });
}

/**
 * §3.20-iii — THE FLOW BETWEEN OCCUPATIONS. Each occupation's idle seekers (what its own search
 * left unmatched) are spread over the other occupations' open vacancies (what their own search
 * left unfilled) in proportion, each opening facing the other occupations' idle seekers the same
 * way, and every (from, to) pair matches through the labour market's one matching function.
 * Symmetric across occupations — the model has no skill ladder to read a distance from — and
 * capped by both sides of every pair, so no seeker moves twice and no opening fills twice.
 */
export function occupationalMobility(
  unmatched: Record<OccupationType, number>, unfilled: Record<OccupationType, number>
): { into: Record<OccupationType, number>; outOf: Record<OccupationType, number> } {
  const zero = (): Record<OccupationType, number> => ({ GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0, SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0 });
  const into = zero(); const outOf = zero();
  let S = 0, V = 0;
  OCCUPATIONS.forEach((occ) => { S += Math.max(0, unmatched[occ] ?? 0); V += Math.max(0, unfilled[occ] ?? 0); });
  if (!(S > 0) || !(V > 0)) return { into, outOf };
  OCCUPATIONS.forEach((from) => {
    const seekers = Math.max(0, unmatched[from] ?? 0);
    const reachable = V - Math.max(0, unfilled[from] ?? 0);
    if (!(seekers > 0) || !(reachable > 0)) return;
    OCCUPATIONS.forEach((to) => {
      const openings = Math.max(0, unfilled[to] ?? 0);
      if (to === from || !(openings > 0)) return;
      const facing = S - Math.max(0, unmatched[to] ?? 0);
      const seekersHere = seekers * (openings / reachable);
      const vacanciesHere = facing > 0 ? openings * (seekers / facing) : 0;
      if (!(seekersHere > 0) || !(vacanciesHere > 0)) return;
      const matches = MATCHING_EFFICIENCY * Math.pow(vacanciesHere, MATCHING_ELASTICITY) * Math.pow(seekersHere, 1 - MATCHING_ELASTICITY);
      const moved = Math.max(0, Math.min(matches, seekersHere, vacanciesHere));
      into[to] += moved; outOf[from] += moved;
    });
  });
  return { into, outOf };
}
