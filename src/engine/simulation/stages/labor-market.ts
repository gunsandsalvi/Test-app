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

import { GameState, Region, RegionId, Company, OccupationType } from '../../../types';
import {
  SECTOR_OCCUPATION_MIX,
  MATCHING_EFFICIENCY, MATCHING_ELASTICITY, NEUTRAL_LABOR_TIGHTNESS,
  BASELINE_QUIT_RATE_WEEKLY, LABOR_PRODUCTIVITY_GROWTH_ANNUAL,
  HIRING_ADJUSTMENT_SPEED_MULTIPLE, LAYOFF_SPEED_MULTIPLE, DISTRESS_LAYOFF_SPEED,
  VACANCY_WITHDRAWAL_RATE_WEEKLY,
  WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL, WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL,
  COST_OF_LIVING_PASS_THROUGH,
  MARKET_WAGE_CATCHUP_SPEED_WEEKLY,
  QUIT_ELASTICITY_TO_RELATIVE_WAGE, QUIT_ELASTICITY_TO_EXECUTION, GOVERNMENT_OCCUPATION_MIX } from '../../../domain/region-macro';
import { BASELINE_OCCUPATION_LABOR_FORCE_SHARE } from '../../bootstrap/labor-and-wages';
import { isActiveCompany } from '../../../domain/company';
import { WeeklyStepContext } from './context';
import { INDUSTRY_REGISTRY } from '../../../domain/industry-registry';
import { weeklyWageBillUSD, getBaseAnnualWageUSD } from '../../bootstrap/labor-and-wages';
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import { RETIREMENT_AGE_YEARS, WORKFORCE_ENTRY_AGE_YEARS } from '../../bootstrap/population';
import {
  RENT_SHARE_TO_LABOUR, RETURN_TO_EXPERIENCE_ANNUAL, TenureStratum, TENURE_COHORTS,
} from '../../../domain/region-macro';

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
 * against the price it was seeded at (`unitPriceUSD / baseUnitPriceUSD`), revenue-weighted
 * across the firm's lines. A firm whose own product has halved in price is not overstaffed.
 */
function outputPriceVsBaseline(comp: Company, reg: Region): number {
  let weight = 0;
  let weighted = 0;
  (comp.productLines ?? []).forEach((line) => {
    const cd = reg.categoryDemand[line.subUnitId as any] as any;
    const base = cd?.baseUnitPriceUSD;
    const now = cd?.unitPriceUSD;
    if (!(base > 0) || !(now > 0)) return;
    const w = Math.max(0, line.revenueShare ?? 0);
    weight += w;
    weighted += w * (now / base);
  });
  return weight > 0 ? weighted / weight : 1;
}

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
  // Labor demand grows with real output net of what productivity delivers for free. UNBOUNDED:
  // the +/-25% clamp that stood here was doing the work an affordability constraint should do —
  // it stopped a wild revenue print ordering a hiring spree, but it equally stopped a collapsing
  // one ordering the layoffs. What limits hiring now is whether the firm can pay for it (below).
  return realGrowthAnnual - LABOR_PRODUCTIVITY_GROWTH_ANNUAL;
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
    // LAB: the occupation wage table this region's employers pay against.
    const baseAnnualWageUSD = getBaseAnnualWageUSD(regionId);

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
    // own file (rule 3). It was not normalised to the rest point either, so a neutral market quit
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
    const relativeJobFindingRate = Math.pow(
      Math.max(0, priorTightness) / NEUTRAL_LABOR_TIGHTNESS, MATCHING_ELASTICITY);
    const quitRateWeekly = Math.min(1, BASELINE_QUIT_RATE_WEEKLY * relativeJobFindingRate);

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
      const firmQuitMultiplier = Math.max(0,
        1 - (wageIndex - 1) * QUIT_ELASTICITY_TO_RELATIVE_WAGE
          - ((comp.executionQuality ?? 1.0) - 1) * QUIT_ELASTICITY_TO_EXECUTION
      );
      // Bounded where a quit rate is really bounded: nobody can quit twice, and a firm paying
      // far above the market simply loses nobody.
      const quits = current * Math.min(1, quitRateWeekly * firmQuitMultiplier);

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
      const netPpeUSD = Math.max(0, (comp.grossPPEUSD ?? 0) - (comp.accumulatedDepreciationUSD ?? 0));
      const costOfCapital = Math.max(0, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + (comp.beta ?? 1) * EQUITY_RISK_PREMIUM);
      const capitalChargeUSD = netPpeUSD * costOfCapital;
      const earningsShortfallUSD = capitalChargeUSD - comp.ebitda;
      const annualWagePerWorkerUSD = current > 0
        ? (weeklyWageBillUSD(current, occupationMixFor(comp.sector), baseAnnualWageUSD, reg.occupationPools,
          comp.offeredWageIndex ?? 1.0) * 52) / current
        : 0;
      const affordableCutHeads = (earningsShortfallUSD > 0 && annualWagePerWorkerUSD > 0)
        ? earningsShortfallUSD / annualWagePerWorkerUSD
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
      const baselineRevPerHeadUSD = (comp.baselineEmployeeCount ?? 0) > 0
        ? (comp.baselineAnnualRevenue || comp.annualRevenue) / comp.baselineEmployeeCount!
        : 0;
      // Both sides of this ratio in the SAME dollars: this week's revenue deflated back to the
      // price level the baseline was struck at (see `outputPriceVsBaseline`).
      const realRevenueUSD = comp.annualRevenue / Math.max(0.05, outputPriceVsBaseline(comp, reg));
      const outputNeedHeads = baselineRevPerHeadUSD > 0
        ? realRevenueUSD / baselineRevPerHeadUSD
        : current;
      const earningsHeadroomUSD = comp.ebitda - capitalChargeUSD;
      const affordableHireHeads = (earningsHeadroomUSD > 0 && annualWagePerWorkerUSD > 0)
        ? earningsHeadroomUSD / annualWagePerWorkerUSD
        : 0;

      let vacancies = 0;
      let layoffs = 0;
      if (desiredWeeklyChange >= 0) {
        // Growing: hire the increment PLUS replace the churn — real gross flows, not the net.
        vacancies = desiredWeeklyChange * HIRING_ADJUSTMENT_SPEED_MULTIPLE + quits;
      } else {
        // Shrinking: attrition does the work first (it is free), layoffs only for the rest.
        layoffs = Math.max(0, -desiredWeeklyChange * LAYOFF_SPEED_MULTIPLE - quits);
      }
      // LAB: and it sheds toward what it can afford — the gap between its earnings and its cost
      // of capital, in workers, at the speed layoffs actually happen. This is the ordinary
      // response; the cash rule below is the acute one.
      if (affordableCutHeads > 0) layoffs = Math.max(layoffs, affordableCutHeads * LAYOFF_SPEED_MULTIPLE);
      // ...and it staffs toward what it can afford, when it is short of what its output needs.
      const understaffedHeads = Math.max(0, outputNeedHeads - current);
      if (affordableHireHeads > 0 && understaffedHeads > 0) {
        vacancies = Math.max(vacancies,
          Math.min(understaffedHeads, affordableHireHeads) * HIRING_ADJUSTMENT_SPEED_MULTIPLE + quits);
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
    (reg.smePools || []).forEach((seg) => {
      const current = Math.max(0, seg.employment);
      if (current <= 0) return;
      // Same growth-on-growth rule as a named firm, off the segment's own revenue history.
      const growthAnnual = desiredEmploymentGrowthAnnual(
        seg.revenueHistoryUSD, seg.annualRevenueUSD, inflationAnnual
      );
      const desiredWeeklyChange = current * (growthAnnual / 52);
      const quits = current * quitRateWeekly;
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector as any);
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
      // is the same code at two resolutions with only one of them right (rule 3, §5-DIST).
      //
      // DIST already measures which strata cannot service what they owe, and the exiting weight
      // at the absorbing barrier is drawn from exactly that (§7.143). The employment side reads
      // the same integral: the share of the pool's firms in trouble sheds, and the rest does not.
      // A pool whose aggregate cash is comfortable while a third of its firms cannot cover their
      // interest now sheds that third — which the mean could not express.
      const distressedShare = seg.distressedFirmShare ?? ((seg.cashUSD ?? 0) < 0 ? 1 : 0);
      if (distressedShare > 0) {
        layoffs = Math.max(layoffs, current * distressedShare * DISTRESS_LAYOFF_SPEED);
      }
      // The whole pool running out of money is still the acute case, and it is not the same
      // statement: the strata above are about firms that cannot service DEBT, this is a pool
      // that cannot make PAYROLL.
      if ((seg.cashUSD ?? 0) < 0) layoffs = Math.max(layoffs, current * DISTRESS_LAYOFF_SPEED);
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
    (reg.smePools || []).forEach((seg) => {
      const mix = occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector as any);
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
      // EMP (§7.110): AND THE SAME MEASURE, THE OTHER WAY UP.
      //
      // `unfilledShare` runs [0, 1]: it can say a firm found hiring hard, never that it found it
      // easy. So the wage was a price on the way UP and administered on the way DOWN, and the
      // going rate — which moves by `(avgOffer − 1) × speed + cola` — had nothing to pull it
      // below the level the seed happened to solve for. **Measured: at 33.6% unemployment with
      // tightness at 0.000, the employment-weighted average offer was RISING (1.0000 → 1.0181)
      // and the going rate had fallen 1.9% in twenty weeks, all of it composition.** A wage that
      // cannot fall under a third of the workforce out of work is not a price (rule 1).
      //
      // The mirror of "could not fill" is "could fill at will": how slack the market it is
      // hiring into actually is, which this stage already measures as tightness. At tightness 1
      // and above nothing changes — difficulty is the whole signal, exactly as before. Below it,
      // a firm that filled what it posted is paying more than it needs to, by the margin the
      // market is slack. One coefficient, used in both directions; no new parameter.
      const slackEase = Math.max(0, 1 - (reg.laborMarketTightness ?? 1));
      const hiringPressure = unfilledShare - slackEase;
      // LAB: unbounded. The +25%/-15% band this replaces was the mechanism's substitute — with
      // labor demand now responding to affordability, a firm that offers more than it can fund
      // is cutting its own headcount next week, which is the discipline the band was standing in
      // for. Its own push and pull are the whole decision.
      const targetChangeAnnual = hiringPressure * WAGE_PUSH_PER_UNFILLED_SHARE_ANNUAL
        - marginShortfall * WAGE_PULL_PER_MARGIN_SHORTFALL_ANNUAL;
      const prevIndex = comp.offeredWageIndex ?? 1.0;

      // ---- RENT-SHARING: A MORE PRODUCTIVE FIRM PAYS MORE. ----
      //
      // The two terms above are the only firm-specific ones in the wage decision and BOTH
      // MEAN-REVERT, so nothing accumulates: measured across 2,512 employers, `offeredWageIndex`
      // ran p10 0.988 to p99 1.002 — a **1.01x** spread (§7.172). Every worker in an occupation
      // earned the same, which is why `TIER_WAGE_MULTIPLIER` had to state a 32.5x one and why
      // that stated number carried over half the top tier's income.
      //
      // What a firm can pay is its own SURPLUS PER WORKER — what a head produces above the
      // non-wage cost of employing it — and a share of that reaches the wage because the worker
      // can leave. The pull is toward the level that share implies, not a jump to it: a wage is
      // sticky, and the existing push/pull already carry the cyclical half.
      const headcount = Math.max(1, comp.employeeCount);
      const nonWageCostUSD = Math.max(0, comp.annualRevenue - comp.ebitda) - weeklyWageBillUSD(
        headcount, occupationMixFor(comp.sector), baseAnnualWageUSD, reg.occupationPools, prevIndex) * 52;
      const surplusPerHeadUSD = (comp.annualRevenue - Math.max(0, nonWageCostUSD)) / headcount;
      const goingWagePerHeadUSD = (weeklyWageBillUSD(
        headcount, occupationMixFor(comp.sector), baseAnnualWageUSD, reg.occupationPools, 1.0) * 52) / headcount;
      // The target premium is the share of the surplus that exceeds the going wage. A firm with
      // no surplus above it offers no premium; one earning twice it offers a real one.
      const rentTargetIndex = goingWagePerHeadUSD > 0
        ? 1 + RENT_SHARE_TO_LABOUR * ((surplusPerHeadUSD - goingWagePerHeadUSD) / goingWagePerHeadUSD)
        : 1;
      // Closed over about a YEAR — the gap expressed directly as an annual rate, so no speed
      // constant is invented. A firm reprices to its own productivity roughly annually; borrowing
      // the cyclical push's 0.10 would have taken a decade, which is not a wage decision.
      const rentPullAnnual = (rentTargetIndex - prevIndex) / Math.max(0.01, prevIndex);
      // The change applies DIRECTLY. An earlier form blended the level against itself
      // (`prev*inertia + prev*(1+t/52)*(1-inertia)`), which algebraically delivers t x 0.06 —
      // six percent of the intended move, so no firm's wage ever went anywhere. Stickiness
      // belongs in the size of the target and in the market's catch-up speed below, not in a
      // blend of a level with a scaled copy of itself.
      // A wage cannot be negative; nothing else bounds what a firm offers.
      const nextIndex = Math.max(0, prevIndex * (1 + (targetChangeAnnual + rentPullAnnual) / 52));
      ctx.companyUpdates[comp.ticker].offeredWageIndex = Number(nextIndex.toFixed(5));
      ctx.companyUpdates[comp.ticker].unfilledVacancyShare = Number(unfilledShare.toFixed(4));
    });
    segmentPostings.forEach(({ seg, vacancies, layoffs, quits }) => {
      const mix = (occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector as any)) as Partial<Record<OccupationType, number>>;
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
      // LAB: the going rate is a price and carries no band. It used to sit in [0.1, 20] with its
      // growth held to [-20%, +35%] — bounds that could only bind by disagreeing with what
      // employers were actually offering, which is the one thing the going rate IS.
      const next = Math.max(0, prev * (1 + catchup));
      pools[occ] = {
        ...pools[occ],
        wageIndex: Number(next.toFixed(5)),
        // The going rate's own growth, annualized — what household income is paid at.
        wageGrowthAnnual: Number((catchup * 52).toFixed(4)),
      };
    });
    // Each firm's premium is relative to a rate that just moved, so renormalize it: a firm that
    // stops pushing drifts back to parity as the market catches up to where it already was.
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
  separationsByOcc?: Record<OccupationType, number>,
  /** DIST 1(b) — the experience cross-section this week's flows produced, when the labour
   *  session computed one. The end-of-week reconciliation (defaults, acquisitions) does not. */
  nextTenureStrataByOcc?: Record<OccupationType, TenureStratum[]>
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
  (reg.smePools || []).forEach((seg: any) => {
    const mix = (occupationMixFor(INDUSTRY_REGISTRY[seg.industry].sector as any)) as Partial<Record<OccupationType, number>>;
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
