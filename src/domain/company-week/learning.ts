/**
 * §5-PROD — PRODUCTIVITY IS LEARNED, NOT STATED: Wright's law at the firm.
 *
 * `LABOR_PRODUCTIVITY_GROWTH_ANNUAL = 0.012` was a stated, uniform, exogenous drift every firm
 * received identically — the §1.19 shape parameter standing in for the missing mechanism. The
 * mechanism is the oldest measured regularity in production economics: unit labour requirements
 * fall by a fixed share PER DOUBLING OF CUMULATIVE OUTPUT (Wright 1936, and every learning-curve
 * study since). That exponent is TECHNOLOGY — what a process physically yields to experience —
 * which is exactly the class of number rule 19 admits as a primitive.
 *
 * What this buys over the constant, and why it is §5-PROD's growth engine:
 *  - DISPERSION: a fast-growing firm doubles sooner and learns faster; a shrinking one stops
 *    learning. Firm-level productivity spreads out instead of marching in step.
 *  - REALLOCATION: IND6's price competition then hands share to the productive — aggregate
 *    growth decomposes into within-firm learning and between-firm reallocation, which is what
 *    aggregate productivity growth mostly IS.
 *  - CYCLES REACH THE TREND: a depression that halves output halves experience accumulation —
 *    "cutting all R&D flattens growth over years" holds with production experience as the R&D.
 *
 * THE SEED ANCHOR (§7.4: open in the shape the engine produces): a seeded firm has produced for
 * years and sits far along its own curve. Its position is DERIVED, not guessed — cumulative
 * experience such that its opening learning rate equals the very drift the constant asserted, so
 * the world opens growing exactly as it used to and DIVERGES from there by experience alone. The
 * 0.012 survives only inside that anchor (the §7.204 pattern: the constant is the seed and
 * nothing else) and as the SME pools' convention until DIST gives pools their own experience.
 */

/** Wright's law exponent: proportional unit-labour saving per doubling of cumulative output.
 *  A real-world TECHNOLOGY primitive (rule 4 admits it; measured range ~0.1–0.3 across
 *  manufacturing studies; 0.2 is the canonical middle). Replaces the stated aggregate drift on
 *  the §5-DIST-P scoreboard — one primitive out, one in. */
export const LEARNING_ELASTICITY = 0.2;

/** The drift the constant asserted, kept ONLY as the seed anchor and the pools' convention. */
export const LEGACY_PRODUCTIVITY_DRIFT_ANNUAL = 0.012;

/** Where a firm opens on its own curve: the cumulative output at which Wright's law reproduces
 *  the legacy drift for its current run-rate. Derived from the two primitives, per firm. */
export function seedCumulativeUnits(annualOutputUnits: number): number {
  if (!(annualOutputUnits > 0)) return 0;
  return (LEARNING_ELASTICITY * annualOutputUnits) / LEGACY_PRODUCTIVITY_DRIFT_ANNUAL;
}

export interface LearningInputs {
  priorCumulativeUnits: number;
  producedUnitsThisWeek: number;
  priorMultiplier: number;
}
export interface LearningUpdate {
  cumulativeUnits: number;
  /** Unit-labour productivity relative to the firm's baseline: heads-per-unit ÷ multiplier. */
  multiplier: number;
  /** This week's learning, annualized — what the firm's OWN labour demand nets out. */
  growthAnnual: number;
}

export function learningUpdate(i: LearningInputs): LearningUpdate {
  const prior = Math.max(0, i.priorCumulativeUnits);
  const added = Math.max(0, i.producedUnitsThisWeek);
  const cumulativeUnits = prior + added;
  if (!(prior > 0) || !(added > 0)) {
    return { cumulativeUnits, multiplier: Math.max(1e-6, i.priorMultiplier), growthAnnual: 0 };
  }
  const growthWeekly = LEARNING_ELASTICITY * Math.log(cumulativeUnits / prior);
  const multiplier = Math.max(1e-6, i.priorMultiplier) * Math.exp(growthWeekly);
  return { cumulativeUnits, multiplier, growthAnnual: growthWeekly * 52 };
}
