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

import { GameState, RegionId, Company, OccupationType } from '../../../types';
import {
  SECTOR_OCCUPATION_MIX, PRIVATE_SEGMENT_OCCUPATION_MIX,
  MATCHING_EFFICIENCY, MATCHING_ELASTICITY, BASELINE_QUIT_RATE_WEEKLY, LABOR_PRODUCTIVITY_GROWTH_ANNUAL,
  HIRING_ADJUSTMENT_SPEED_MULTIPLE, LAYOFF_SPEED_MULTIPLE, DISTRESS_LAYOFF_SPEED,
  VACANCY_WITHDRAWAL_RATE_WEEKLY,
  WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL, WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL,
  COST_OF_LIVING_PASS_THROUGH,
  MARKET_WAGE_CATCHUP_SPEED_WEEKLY, MAX_FIRM_WAGE_CHANGE_ANNUAL, MIN_FIRM_WAGE_CHANGE_ANNUAL,
  MIN_FIRM_WAGE_INDEX, MAX_FIRM_WAGE_INDEX,
  QUIT_ELASTICITY_TO_RELATIVE_WAGE, QUIT_ELASTICITY_TO_EXECUTION,
} from '../../../domain/region-macro';
import { BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../../bootstrap/labor-and-wages';
import { isActiveCompany } from '../../../domain/company';
import { WeeklyStepContext } from './context';

const OCCUPATIONS: OccupationType[] = [
  'GENERAL', 'SKILLED_TRADES', 'TECHNICAL_ENGINEERING', 'SPECIALIZED_PROFESSIONAL', 'MANAGERIAL_FINANCIAL',
];

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
function desiredEmploymentGrowthAnnual(
  history: number[] | undefined,
  currentRevenueUSD: number,
  inflationAnnual: number
): number {
  if (!history || history.length < 2) return 0;
  const window = Math.min(12, history.length - 1);
  const past = history[history.length - 1 - window];
  if (!(past > 0) || !(currentRevenueUSD > 0)) return 0;
  const nominalGrowthAnnual = (currentRevenueUSD / past - 1) * (52 / window);
  const realGrowthAnnual = nominalGrowthAnnual - inflationAnnual;
  // Labor demand grows with real output net of what productivity delivers for free, bounded so
  // one wild revenue print cannot order a hiring spree.
  return Math.max(-0.25, Math.min(0.25, realGrowthAnnual - LABOR_PRODUCTIVITY_GROWTH_ANNUAL));
}

export function runLaborMarketStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;

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

    // Last week's tightness sets this week's quit rate: a worker with options uses them.
    const priorTightness = reg.laborMarketTightness ?? 1.0;
    const quitRateWeekly = BASELINE_QUIT_RATE_WEEKLY * Math.max(0.3, Math.min(2.5, priorTightness));

    interface Posting { comp: Company; vacancies: number; layoffs: number; quits: number }
    const postings: Posting[] = [];
    const segmentPostings: { seg: any; vacancies: number; layoffs: number; quits: number }[] = [];

    employers.forEach((comp) => {
      const current = Math.max(0, comp.employeeCount);
      if (current <= 0) return;
      const growthAnnual = desiredEmploymentGrowthAnnual(comp.revenueHistory, comp.annualRevenue, inflationAnnual);
      const desiredWeeklyChange = current * (growthAnnual / 52);

      // HH6: a firm's OWN quit rate. Paying below the going rate loses people faster; paying
      // above keeps them, which is what makes a raise do something rather than just cost money.
      // Execution quality retains too — a well-run firm loses fewer of them.
      const wageIndex = comp.offeredWageIndex ?? 1.0;
      const firmQuitMultiplier = Math.max(0.25, Math.min(3.0,
        1 - (wageIndex - 1) * QUIT_ELASTICITY_TO_RELATIVE_WAGE
          - ((comp.executionQuality ?? 1.0) - 1) * QUIT_ELASTICITY_TO_EXECUTION
      ));
      const quits = current * quitRateWeekly * firmQuitMultiplier;
      let vacancies = 0;
      let layoffs = 0;
      if (desiredWeeklyChange >= 0) {
        // Growing: hire the increment PLUS replace the churn — real gross flows, not the net.
        vacancies = desiredWeeklyChange * HIRING_ADJUSTMENT_SPEED_MULTIPLE + quits;
      } else {
        // Shrinking: attrition does the work first (it is free), layoffs only for the rest.
        layoffs = Math.max(0, -desiredWeeklyChange * LAYOFF_SPEED_MULTIPLE - quits);
      }
      // A firm genuinely out of cash sheds staff regardless of the friction above.
      if (comp.cash < 0) layoffs = Math.max(layoffs, current * DISTRESS_LAYOFF_SPEED);

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
    (reg.privateSectorSegments || []).forEach((seg) => {
      const current = Math.max(0, seg.employment);
      if (current <= 0) return;
      // Same growth-on-growth rule as a named firm, off the segment's own revenue history.
      const growthAnnual = desiredEmploymentGrowthAnnual(
        seg.revenueHistoryUSD, seg.annualRevenueUSD, inflationAnnual
      );
      const desiredWeeklyChange = current * (growthAnnual / 52);
      const quits = current * quitRateWeekly;
      const mix = PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType] ?? { GENERAL: 1.0 };
      const vacancies = desiredWeeklyChange >= 0
        ? desiredWeeklyChange * HIRING_ADJUSTMENT_SPEED_MULTIPLE + quits
        : quits;
      const layoffs = desiredWeeklyChange < 0
        ? Math.max(0, -desiredWeeklyChange * LAYOFF_SPEED_MULTIPLE - quits)
        : 0;
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
      reg.totalPopulation * (1 - (reg.nonEmployablePct ?? 0.35)) * reg.laborForceParticipation);
    const shares = reg.occupationLaborForceShare || BASELINE_OCCUPATION_LABOR_FORCE_SHARE;
    const pools = reg.occupationPools;

    const employedByOccBefore: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    employers.forEach((comp) => {
      const mix = occupationMixFor(comp.sector);
      OCCUPATIONS.forEach((occ) => { employedByOccBefore[occ] += Math.max(0, comp.employeeCount) * (mix[occ] ?? 0); });
    });
    (reg.privateSectorSegments || []).forEach((seg) => {
      const mix = PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType] ?? { GENERAL: 1.0 };
      OCCUPATIONS.forEach((occ) => {
        employedByOccBefore[occ] += Math.max(0, seg.employment) * ((mix as Partial<Record<OccupationType, number>>)[occ] ?? 0);
      });
    });
    // Government is an employer too — its headcount is a policy quantity set in stage 02.
    employedByOccBefore.GENERAL += reg.governmentEmployment * 0.6;
    employedByOccBefore.MANAGERIAL_FINANCIAL += reg.governmentEmployment * 0.4;

    // ---- 3. Matching, per occupation. An open vacancy carries over; a seeker who does not
    // match stays a seeker. Hires are bounded by both stocks and by what a week of search can
    // actually produce, which is what makes hiring take TIME. ----
    const hiresByOcc: Record<OccupationType, number> = {
      GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
      SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
    };
    const carriedVacanciesByOcc = { ...hiresByOcc };

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
      const hires = Math.max(0, Math.min(matches, openVacancies, seekers));

      hiresByOcc[occ] = hires;
      // What is left open is carried forward LESS the postings employers withdraw — see
      // VACANCY_WITHDRAWAL_RATE_WEEKLY. Without it an occupation nobody can staff accumulates
      // vacancies without bound and its "tightness" stops meaning anything.
      carriedVacanciesByOcc[occ] = Math.max(0, openVacancies - hires) * (1 - VACANCY_WITHDRAWAL_RATE_WEEKLY);
    });

    // ---- 4. The hires land on the REAL employers, pro-rata to what each posted IN EACH
    // OCCUPATION — so a firm that wanted twenty engineers in a market that could fill twelve
    // stays eight short, which is the constraint HH6 lets it answer by paying more.
    //
    // The fill ratio has to be per-occupation, not one number for the region: a global ratio
    // let a firm hire past the supply of the occupation it was actually short of (measured:
    // employers' books ran 3.2% above what the occupations could staff, and the pools clipped
    // at the supply cap to hide it). A firm short of engineers can still fill its general
    // roles, and that is exactly what a per-occupation ratio says. ----
    const fillRatioByOcc = {} as Record<OccupationType, number>;
    OCCUPATIONS.forEach((occ) => {
      fillRatioByOcc[occ] = vacanciesByOcc[occ] > 0
        ? Math.min(1, hiresByOcc[occ] / vacanciesByOcc[occ])
        : 0;
    });
    /** What one employer's posted vacancies actually filled, at its own occupation mix. */
    const filledFor = (vacancies: number, mix: Partial<Record<OccupationType, number>>): number =>
      OCCUPATIONS.reduce((a, occ) => a + vacancies * (mix[occ] ?? 0) * fillRatioByOcc[occ], 0);

    postings.forEach(({ comp, vacancies, layoffs, quits }) => {
      const hired = filledFor(vacancies, occupationMixFor(comp.sector));
      const next = Math.max(1, Math.round(comp.employeeCount + hired - layoffs - quits));
      if (!ctx.companyUpdates[comp.ticker]) ctx.companyUpdates[comp.ticker] = {};
      ctx.companyUpdates[comp.ticker].employeeCount = next;
      ctx.companyUpdates[comp.ticker].previousEmployeeCount = comp.employeeCount;

      // ---- HH6: this firm's wage decision, off its OWN measured hiring difficulty. ----
      const unfilledShare = vacancies > 0 ? Math.max(0, Math.min(1, 1 - hired / vacancies)) : 0;
      // Wage PUSH: postings it could not fill. Wage PULL: a margin below its own baseline —
      // a firm losing money does not give raises, which is the employer side of the bargain.
      const currentMargin = comp.annualRevenue > 0 ? comp.ebitda / comp.annualRevenue : 0;
      const marginShortfall = Math.max(0, (comp.baselineEbitdaMargin ?? currentMargin) - currentMargin);
      const targetChangeAnnual = Math.max(MIN_FIRM_WAGE_CHANGE_ANNUAL, Math.min(MAX_FIRM_WAGE_CHANGE_ANNUAL,
        unfilledShare * WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL
        - marginShortfall * WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL));
      const prevIndex = comp.offeredWageIndex ?? 1.0;
      // The change applies DIRECTLY. An earlier form blended the level against itself
      // (`prev*inertia + prev*(1+t/52)*(1-inertia)`), which algebraically delivers t x 0.06 —
      // six percent of the intended move, so no firm's wage ever went anywhere. Stickiness
      // belongs in the size of the target and in the market's catch-up speed below, not in a
      // blend of a level with a scaled copy of itself.
      const nextIndex = Math.max(MIN_FIRM_WAGE_INDEX, Math.min(MAX_FIRM_WAGE_INDEX,
        prevIndex * (1 + targetChangeAnnual / 52)
      ));
      ctx.companyUpdates[comp.ticker].offeredWageIndex = Number(nextIndex.toFixed(5));
      ctx.companyUpdates[comp.ticker].unfilledVacancyShare = Number(unfilledShare.toFixed(4));
    });
    segmentPostings.forEach(({ seg, vacancies, layoffs, quits }) => {
      const mix = (PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType] ?? { GENERAL: 1.0 }) as Partial<Record<OccupationType, number>>;
      const hired = filledFor(vacancies, mix);
      seg.employment = Math.max(0, Math.round(seg.employment + hired - layoffs - quits));
    });

    // ---- HH6: the going rate per occupation is the employment-weighted average of what the
    // firms in it actually offer. It used to be a region-level tightness formula walking an
    // index that no employer's payroll referred to — two representations of one wage, and
    // neither of them anybody's decision. Now a firm that cannot fill raises its offer, that
    // raises the occupation's going rate, and that is wage-push arriving through a decision
    // instead of through a coefficient. ----
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
    // Segment pools and the government pay the going rate — they have no wage policy of their
    // own until BP/PUB give them one — so they are deliberately NOT in this average, which is
    // an average of the firms that actually make a wage decision.
    // The going rate closes part of the gap to what firms are collectively offering, and the
    // firms' relative premium decays by the same factor — otherwise the same premium would be
    // counted again every week. What is left is a real wage level that moved because employers
    // decided to move it.
    const marketCatchupByOcc = {} as Record<OccupationType, number>;
    OCCUPATIONS.forEach((occ) => {
      if (!(wageDenomByOcc[occ] > 0)) { marketCatchupByOcc[occ] = 0; return; }
      const avgOffer = wageNumeratorByOcc[occ] / wageDenomByOcc[occ];
      // Two forces move the going rate: what firms are collectively bidding over it (tightness,
      // through their own decisions) and the cost of living the workforce bargains to recover.
      // A market with no cost-of-living channel lets real wages fall one-for-one with inflation
      // forever, which is not a labor market anybody works in.
      const colaWeekly = (reg.inflation ?? 0) * COST_OF_LIVING_PASS_THROUGH / 52;
      const catchup = (avgOffer - 1) * MARKET_WAGE_CATCHUP_SPEED_WEEKLY + colaWeekly;
      marketCatchupByOcc[occ] = catchup;
      const prev = pools[occ]?.wageIndex ?? 1.0;
      const next = Math.max(0.1, Math.min(20, prev * (1 + catchup)));
      pools[occ] = {
        ...pools[occ],
        wageIndex: Number(next.toFixed(5)),
        // The going rate's own growth, annualized — what household income is paid at.
        wageGrowthAnnual: Number(Math.max(-0.20, Math.min(0.35, catchup * 52)).toFixed(4)),
      };
    });
    // Each firm's premium is relative to a rate that just moved, so renormalize it: a firm that
    // stops pushing drifts back to parity as the market catches up to where it already was.
    employers.forEach((comp) => {
      const upd = ctx.companyUpdates[comp.ticker];
      if (!upd || upd.offeredWageIndex === undefined) return;
      const mix = occupationMixFor(comp.sector);
      const catchup = OCCUPATIONS.reduce((a, occ) => a + (mix[occ] ?? 0) * marketCatchupByOcc[occ], 0);
      upd.offeredWageIndex = Number(Math.max(MIN_FIRM_WAGE_INDEX, Math.min(MAX_FIRM_WAGE_INDEX,
        upd.offeredWageIndex / (1 + catchup)
      )).toFixed(5));
    });

    // ---- 5. The pools and the rate are DERIVED from the employers' books — by the exported
    // reconciler below, which also runs at the end of the week so that a firm defaulting in
    // stage 08 (after this stage) releases its workers in the same week rather than leaving the
    // pools holding phantom employment until the next labor session. ----
    reconcileEmploymentView(reg, employers, carriedVacanciesByOcc, hiresByOcc, separationsByOcc);
  });
}

/**
 * Employment's ONE representation, read off the real employers: named firms, the segment pools
 * and the government. Exported because it must also run at the END of the week — defaults and
 * acquisitions happen in stages 08 and 10, after the labor session, and a bankrupt firm's staff
 * are unemployed the moment the firm is gone, not a week later (measured before this: the pools
 * held 3.5% phantom employment through a default wave).
 */
export function reconcileEmploymentView(
  reg: any,
  employers: Company[],
  carriedVacanciesByOcc?: Record<OccupationType, number>,
  hiresByOcc?: Record<OccupationType, number>,
  separationsByOcc?: Record<OccupationType, number>
): void {
  const pools = reg.occupationPools;
  if (!pools) return;
  const totalLaborForce = Math.max(1,
    reg.totalPopulation * (1 - (reg.nonEmployablePct ?? 0.35)) * reg.laborForceParticipation);
  const shares = reg.occupationLaborForceShare || BASELINE_OCCUPATION_LABOR_FORCE_SHARE;

  const employedByOcc: Record<OccupationType, number> = {
    GENERAL: 0, SKILLED_TRADES: 0, TECHNICAL_ENGINEERING: 0,
    SPECIALIZED_PROFESSIONAL: 0, MANAGERIAL_FINANCIAL: 0,
  };
  employers.forEach((comp) => {
    const mix = occupationMixFor(comp.sector);
    OCCUPATIONS.forEach((occ) => { employedByOcc[occ] += Math.max(0, comp.employeeCount) * (mix[occ] ?? 0); });
  });
  (reg.privateSectorSegments || []).forEach((seg: any) => {
    const mix = (PRIVATE_SEGMENT_OCCUPATION_MIX[seg.segmentType as keyof typeof PRIVATE_SEGMENT_OCCUPATION_MIX]
      ?? { GENERAL: 1.0 }) as Partial<Record<OccupationType, number>>;
    OCCUPATIONS.forEach((occ) => {
      employedByOcc[occ] += Math.max(0, seg.employment) * (mix[occ] ?? 0);
    });
  });
  employedByOcc.GENERAL += reg.governmentEmployment * 0.6;
  employedByOcc.MANAGERIAL_FINANCIAL += reg.governmentEmployment * 0.4;

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
      ...(hiresByOcc ? { hiresThisWeek: Math.round(hiresByOcc[occ]) } : {}),
      ...(separationsByOcc ? { separationsThisWeek: Math.round(separationsByOcc[occ]) } : {}),
    };
  });

  reg.unemploymentRate = Number(
    Math.max(0, Math.min(0.5, (totalLaborForce - totalEmployed) / totalLaborForce)).toFixed(4)
  );
  reg.laborMarketTightness = Number((totalSeekers > 0 ? totalVacancies / totalSeekers : 1.0).toFixed(4));
  reg.vacancyRate = Number((totalVacancies / totalLaborForce).toFixed(4));
}

/** End-of-week pass: re-read employment after defaults, acquisitions and births have landed. */
export function runLaborReconciliationStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const employers = ctx.updatedCompanies.filter((c) => c.region === regionId && isActiveCompany(c));
    reconcileEmploymentView(reg, employers);
  });
}
