/**
 * §5-STRUCT step 2 — AN EMPLOYER'S LABOR DECISION FOR ONE WEEK.
 *
 * Extracted from `stages/labor-market.ts`, where these rules lived inline for the stage's whole
 * life and three of them were found broken only by measurement: the hiring branch that never
 * fired (§7.149 — one direction nominal, one real), the linear quit rate contradicting the
 * matching function two hundred lines below it (§7.210 — every worker in JPN quit in week one),
 * and the self-referential level target that could not see the demand its own shedding left
 * unserved (§7.247). Each is now a pure function a test can pin without running a world.
 *
 * PURE over FLAT inputs (§7.228's columnar constraint): the stage gathers rows off the object
 * graph in its own iteration order; nothing here holds a reference. The accumulation order inside
 * each function is exactly the inline order it replaced — an extraction that reorders float
 * arithmetic is not a refactor (§7.238).
 */

import {
  MATCHING_ELASTICITY, NEUTRAL_LABOR_TIGHTNESS, BASELINE_QUIT_RATE_WEEKLY,
  HIRING_ADJUSTMENT_SPEED_MULTIPLE, LAYOFF_SPEED_MULTIPLE, DISTRESS_LAYOFF_SPEED,
  QUIT_ELASTICITY_TO_RELATIVE_WAGE, QUIT_ELASTICITY_TO_EXECUTION,
} from '../region-macro';

/** One product line's contribution to a revenue-weighted price read. */
export interface PriceGrowthRow { weight: number; p0: number; p1: number }
export interface PriceLevelRow { weight: number; base: number; now: number }
export interface FillRow { weight: number; demanded: number; supplied: number }

/**
 * §7.249 — the price of what THIS employer sells, annualized over the SAME window as the nominal
 * growth it deflates. Own-price over own-window has neither of the region-CPI form's seams (a
 * different population and a different period — rule 9 twice over).
 */
export function ownPriceGrowthAnnual(
  rows: PriceGrowthRow[], windowWeeks: number, fallbackInflationAnnual: number
): number {
  let weight = 0;
  let growth = 0;
  rows.forEach((r) => {
    if (!(r.p0 > 0 && r.p1 > 0)) return;
    const lw = Math.max(0, r.weight);
    weight += lw;
    growth += lw * ((r.p1 / r.p0 - 1) * (52 / windowWeeks));
  });
  return weight > 0 ? growth / weight : fallbackInflationAnnual;
}

/** §7.149 — each good's own cleared price against the price it was seeded at, revenue-weighted.
 *  A firm whose own product has halved in price is not overstaffed. */
export function outputPriceVsBaseline(rows: PriceLevelRow[]): number {
  let weight = 0;
  let weighted = 0;
  rows.forEach((r) => {
    if (!(r.base > 0) || !(r.now > 0)) return;
    const w = Math.max(0, r.weight);
    weight += w;
    weighted += w * (r.now / r.base);
  });
  return weight > 0 ? weighted / weight : 1;
}

/**
 * §7.247 — the definitional pull of what the firm's markets asked for over what they received.
 * Honestly Infinity when a market received nothing; affordability and the matching friction bound
 * hiring, never a cap on the signal.
 */
export function demandPullFromFill(rows: FillRow[]): number {
  let fillWeight = 0;
  let fillSum = 0;
  rows.forEach((r) => {
    if (!(r.demanded > 0)) return;
    const lw = Math.max(0, r.weight);
    fillWeight += lw;
    fillSum += lw * Math.min(1, r.supplied / r.demanded);
  });
  return fillWeight > 0 ? (fillSum > 0 ? fillWeight / fillSum : Infinity) : 1;
}

/** The revenue window a growth signal is measured over: up to 12 weeks of the firm's own history.
 *  Null when there is no usable history — no signal, not a zero signal. */
export function revenueGrowthWindow(
  history: number[] | undefined, currentRevenueUSD: number
): { windowWeeks: number; nominalGrowthAnnual: number } | null {
  if (!history || history.length < 2) return null;
  const windowWeeks = Math.min(12, history.length - 1);
  const past = history[history.length - 1 - windowWeeks];
  if (!(past > 0) || !(currentRevenueUSD > 0)) return null;
  return { windowWeeks, nominalGrowthAnnual: (currentRevenueUSD / past - 1) * (52 / windowWeeks) };
}

/** Labor demand grows with real output net of what productivity delivers for free — and the
 *  productivity term is the employer's OWN measured learning (§5-PROD, Wright's law), not a
 *  uniform stated drift: a firm learning fast needs fewer of the workers its growth would
 *  otherwise demand. UNBOUNDED on purpose (§7.249): affordability limits hiring, not a clamp. */
export function realEmploymentGrowthAnnual(
  nominalGrowthAnnual: number, priceGrowthAnnual: number, ownProductivityGrowthAnnual: number
): number {
  return nominalGrowthAnnual - priceGrowthAnnual - ownProductivityGrowthAnnual;
}

/**
 * §7.210 — HOW EASILY A JOB IS FOUND HAS ONE REPRESENTATION: the matching function's. A quit is a
 * bet on finding another job, so the quit rate moves with the concave job-finding rate
 * `(θ/θ*)^elasticity` — linear-in-tightness was the same claim with an elasticity of 1, it
 * contradicted the matching function in its own file, and at the seed's tightness of 215 it made
 * every worker in the country quit in week one. A rate cannot exceed 1 — arithmetic, not a clamp.
 */
export function quitRateWeeklyAt(priorTightness: number): number {
  const relativeJobFindingRate = Math.pow(
    Math.max(0, priorTightness) / NEUTRAL_LABOR_TIGHTNESS, MATCHING_ELASTICITY);
  return Math.min(1, BASELINE_QUIT_RATE_WEEKLY * relativeJobFindingRate);
}

/** HH6 — a firm's OWN quit rate: paying below the going rate loses people faster; a well-run firm
 *  loses fewer. Bounded where a quit rate is really bounded — nobody can quit twice, and a firm
 *  paying far above the market simply loses nobody. */
export function firmQuitMultiplier(wageIndex: number, executionQuality: number): number {
  return Math.max(0,
    1 - (wageIndex - 1) * QUIT_ELASTICITY_TO_RELATIVE_WAGE
      - (executionQuality - 1) * QUIT_ELASTICITY_TO_EXECUTION
  );
}

export interface EmployerPostingInputs {
  /** The books today. */
  currentHeads: number;
  /** The growth signal, in heads this week (current × growthAnnual / 52). */
  desiredWeeklyChangeHeads: number;
  /** This week's quits, in heads (already firm-adjusted). */
  quitsHeads: number;
  /** §7.269 — the PLANT's full-staffing ceiling: a hire beyond it adds zero output. */
  productiveHeadsCap: number;
  /** §7.247 — the level target: what output needs, capped by the plant (Infinity-safe). */
  outputNeedHeads: number;
  /** LAB — what the earnings headroom can pay for, in heads. */
  affordableHireHeads: number;
  /** LAB — what the earnings shortfall demands be cut, in heads. */
  affordableCutHeads: number;
  /** The acute rule: a firm genuinely out of cash sheds regardless of friction. */
  cashIsNegative: boolean;
}

/**
 * THE POSTING: gross vacancies and layoffs out of the week's signals, with the precedence the
 * records paid for — growth hiring bounded by the plant, never by the stock-headroom gate
 * (gating it throttled recovery economy-wide, §7.249); a firm whose market left demand unserved
 * and whose earnings carry more staff does NOT shed on the growth signal its own staffing
 * produced (§7.247); the affordability cut and cash distress outrank everything.
 */
export function employerWeekPosting(i: EmployerPostingInputs): { vacancies: number; layoffs: number } {
  let vacancies = 0;
  let layoffs = 0;
  if (i.desiredWeeklyChangeHeads >= 0) {
    const hireableHeads = Math.min(
      i.desiredWeeklyChangeHeads, Math.max(0, i.productiveHeadsCap - i.currentHeads));
    vacancies = hireableHeads * HIRING_ADJUSTMENT_SPEED_MULTIPLE + i.quitsHeads;
  } else {
    layoffs = Math.max(0, -i.desiredWeeklyChangeHeads * LAYOFF_SPEED_MULTIPLE - i.quitsHeads);
  }
  const understaffedHeads = Math.max(0, i.outputNeedHeads - i.currentHeads);
  if (i.affordableHireHeads > 0 && understaffedHeads > 0) {
    layoffs = 0;
    vacancies = Math.max(vacancies,
      Math.min(understaffedHeads, i.affordableHireHeads) * HIRING_ADJUSTMENT_SPEED_MULTIPLE + i.quitsHeads);
  }
  if (i.affordableCutHeads > 0) layoffs = Math.max(layoffs, i.affordableCutHeads * LAYOFF_SPEED_MULTIPLE);
  if (i.cashIsNegative) layoffs = Math.max(layoffs, i.currentHeads * DISTRESS_LAYOFF_SPEED);
  return { vacancies, layoffs };
}
