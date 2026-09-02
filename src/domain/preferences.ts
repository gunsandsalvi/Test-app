/**
 * §5-BRAINS — THE TWO PREFERENCE PRIMITIVES, AND NOTHING ELSE.
 *
 * Every deciding entity followed the same rules with the same constants, so every entity hit
 * the same threshold in the same week: the same cut, the same capex freeze, the same bid rung,
 * all at once. Aggregates that should be averages over a population were cliffs (§7.344). What
 * a population of managements really differs in — under rule 19 — is only the two PREFERENCE
 * primitives: how far ahead it looks (time preference) and how much a bad outcome weighs
 * against a good one (risk aversion). Everything else about a decision is the entity's own
 * measured circumstances, read off its own books.
 *
 * So a management is a pair of numbers, drawn ONCE from the entity's own random stream, kept
 * until it is replaced. No style tables, no "aggressive"/"conservative" labels, no rule
 * branches by kind, no noise injected into decisions: two numbers, and every threshold that was
 * a constant is now a function of measured state and these two.
 *
 * THE MEDIAN BRAIN IS YESTERDAY'S RULE. Risk aversion is dimensionless around 1, and patience
 * is a horizon in weeks whose median is a quarter — the model's own structural clock. So a
 * population drawn here has the SAME centre the uniform rules had, and what changes is the
 * DISPERSION around it: the thing that was missing.
 *
 * The two ranges below are the only stated shapes this adds (§5-DIST-P carries them). They are
 * bounded by the model's own clocks — a month and a year — and are log-uniform because a
 * horizon or a weight is a ratio quantity: twice as patient means the same thing at 6 weeks as
 * at 26.
 */

import { beginEntityScope, endEntityScope, random } from '../engine/rng';
import { PREFERENCE_PATIENCE_WEEKS_MIN, PREFERENCE_PATIENCE_WEEKS_MAX, PREFERENCE_RISK_AVERSION_MIN, PREFERENCE_RISK_AVERSION_MAX } from './stated';

export interface Preferences {
  /** Time preference as a horizon: the weeks over which this management measures an outcome
   *  before acting on it, and the memory of its expectations. A month to a year. */
  patienceWeeks: number;
  /** Risk aversion, relative: 1 is the population median; 2 weighs a shortfall twice as hard. */
  riskAversion: number;
  /** When this management took office — the record turnover writes against. */
  appointedWeek: number;
}

/** A month and a year — the UI calendar's month and §7.138's measured year. */
export const PATIENCE_WEEKS_MIN = PREFERENCE_PATIENCE_WEEKS_MIN;
export const PATIENCE_WEEKS_MAX = PREFERENCE_PATIENCE_WEEKS_MAX;
/** The log-uniform median: ~14.4 weeks — a quarter, the structural clock every event runs on. */
export const PATIENCE_MEDIAN_WEEKS = Math.sqrt(PATIENCE_WEEKS_MIN * PATIENCE_WEEKS_MAX);
// R: the four endpoints are declared in the registry (domain/stated.ts), the two PREFERENCE ranges.
export const RISK_AVERSION_MIN = PREFERENCE_RISK_AVERSION_MIN;
export const RISK_AVERSION_MAX = PREFERENCE_RISK_AVERSION_MAX;

function logUniform(u: number, lo: number, hi: number): number {
  return lo * Math.pow(hi / lo, u);
}

/**
 * Draw a management from the entity's OWN stream (keyed by identity and a salt — the week of
 * appointment), so the number of draws it makes cannot shift any other entity's world, and the
 * same entity appointed in the same week gets the same management on every replay.
 */
export function drawPreferences(entityKey: string, appointedWeek: number): Preferences {
  const saved = beginEntityScope(`mgmt:${entityKey}`, appointedWeek + 1);
  const patienceWeeks = logUniform(random(), PATIENCE_WEEKS_MIN, PATIENCE_WEEKS_MAX);
  const riskAversion = logUniform(random(), RISK_AVERSION_MIN, RISK_AVERSION_MAX);
  endEntityScope(saved);
  return {
    patienceWeeks: Number(patienceWeeks.toFixed(2)),
    riskAversion: Number(riskAversion.toFixed(3)),
    appointedWeek,
  };
}

/** The median management — what an entity with no draw yet decides like (yesterday's rule). */
export const MEDIAN_PREFERENCES: Readonly<Preferences> = Object.freeze({
  patienceWeeks: PATIENCE_MEDIAN_WEEKS,
  riskAversion: 1,
  appointedWeek: 0,
});

export function patienceWeeksOf(p: Preferences | undefined): number {
  const v = p?.patienceWeeks;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : PATIENCE_MEDIAN_WEEKS;
}

export function riskAversionOf(p: Preferences | undefined): number {
  const v = p?.riskAversion;
  return Number.isFinite(v) && (v as number) > 0 ? (v as number) : 1;
}

/**
 * ADAPTIVE EXPECTATION WITH THE MANAGEMENT'S OWN HORIZON. The expectation moves toward what was
 * observed by 1/patience each week — a one-month management has nearly forgotten last quarter,
 * a one-year management has not. This is the WHOLE of "outlook": no forecasting engine, no
 * shared view. `prev` NaN/undefined means no expectation yet, and the observation is adopted.
 */
export function adaptiveExpectation(prev: number | undefined, observed: number, patienceWeeks: number): number {
  if (!Number.isFinite(prev as number)) return observed;
  const w = 1 / Math.max(1, patienceWeeks);
  return (prev as number) + (observed - (prev as number)) * w;
}

/** The same expectation read off a history the world already keeps: the mean of the last
 *  `patience` observations (or all of them, when the memory is shorter than the horizon). */
export function expectationFromHistory(history: readonly number[] | undefined, latest: number, patienceWeeks: number): number {
  if (!history || history.length === 0) return latest;
  const n = Math.max(1, Math.min(history.length, Math.round(patienceWeeks)));
  let sum = 0;
  let count = 0;
  for (let i = history.length - n; i < history.length; i++) {
    const v = history[i];
    if (!(v > 0)) continue;
    sum += v;
    count++;
  }
  return count > 0 ? sum / count : latest;
}
