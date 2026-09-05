/**
 * UNIT BRANDS (§7.241) — zero-cost compile-time families for the units this codebase has paid
 * for confusing: dollars in four price levels all named `USD` (`currency.ts` declares every
 * stored figure region-local; the suffix lies), shares carried in `…USD` fields (§7.165, twice),
 * percents wearing fractions' clothes (a `…_PCT = 8` beside a `…_PCT = 0.25`), and weekly flows multiplied into annual ones (the credit-file cure ran 52× fast).
 *
 * A brand erases to `number` — it stores raw in typed arrays and costs nothing at runtime, which
 * is what §7.228's columnar constraint requires. Arithmetic demotes to `number`; that is fine,
 * because every recorded incident crossed at a FIELD or PARAMETER boundary, and those are what
 * get typed. The ONLY producers of a branded value are the named constructors and converters
 * below: a caller that cannot produce the brand its parameter demands has found a unit bug at
 * compile time.
 *
 * Introduced seam by seam (§5-STRUCT Tier 4): the pay() boundary while step 1 touches its call
 * sites, the clearing engine's stat/size inputs, periodicity on region-macro flows, physical
 * units with the instrument-union migration. Do not brand a field ahead of its seam — a brand
 * with unbranded producers is theater.
 */

import { RegionId } from './geography';

declare const unit: unique symbol;
type Brand<B extends string> = number & { readonly [unit]: B };

/** Money in one region's own price level. `Money<'USA'>` is genuine USD; the rest are not. */
export type Money<C extends RegionId = RegionId> = Brand<`money-${C}`>;
/** A flow per week / per year of whatever family B names. */
type PerWeek<B extends string = 'money'> = Brand<`${B}/wk`>;
type PerYear<B extends string = 'money'> = Brand<`${B}/yr`>;
/** A share count — never dollars (§7.165). */
export type Shares = Brand<'shares'>;
/** A physical unit count from the goods registry. */
export type Units = Brand<'units'>;

export const annualize = <B extends string>(v: PerWeek<B>): PerYear<B> => (v * WEEKS_PER_YEAR) as PerYear<B>;
export const weekly = <B extends string>(v: PerYear<B>): PerWeek<B> => (v / WEEKS_PER_YEAR) as PerWeek<B>;

// ---- §3.28b-i — THE PERIOD FORMULAS, ONE OWNER (rule 8) ----
//
// Every rate, flow and index a region stores carries a period, and the identifier names it
// (`…Annual`, `…Weekly`). The arithmetic that moves a figure between periods lived as bare
// `* 52`, `/ 52` and `x / xYearAgo - 1` at each writer; it is here once, so a test can pin what
// each name means and a reader can find the convention instead of re-deriving it.

/** The model's year. Weeks are the clock (`calendar.ts`); a year is 52 of them, exactly. */
export const WEEKS_PER_YEAR = 52;

/**
 * A week's figure at a year's run-rate: x52, linear. This is the model's ONE annualisation, for
 * flows (a week of exports, a week of procurement) and for rates of change alike (a going rate
 * that moved x this week is growing at 52x a year). A compounded `(1 + x)^52` is deliberately not
 * offered: it turned a cold-start level transient into ~110% headline growth and amplifies any
 * weekly noise by construction (`11-fiscal-and-sovereign-debt.ts`).
 */
export const runRateAnnual = (weekly: number): number => weekly * WEEKS_PER_YEAR;
/** The inverse: an annual rate or flow over one week of it, linear. */
export const weeklyOfAnnual = (annual: number): number => annual / WEEKS_PER_YEAR;

/**
 * The levels a year-over-year read needs: this week's and the 52 before it, so that index 0 is
 * the level EXACTLY a year back. Fifty-three, not fifty-two — a window of 52 compared against its
 * oldest entry is a year-over-year taken a week short of a year, which is what the CPI and GDP
 * windows did before §3.15.
 */
export const YEAR_OVER_YEAR_LEVELS = WEEKS_PER_YEAR + 1;
/** The trailing-year window after this week's level joins it. */
export const trailingYear = (history: readonly number[], level: number): number[] =>
  [...history.slice(-WEEKS_PER_YEAR), level];
/** The level a year before the newest one, or nothing until a full year of real levels exists. */
export const yearAgoLevel = (window: readonly number[]): number | undefined =>
  window.length >= YEAR_OVER_YEAR_LEVELS ? window[0] : undefined;
/** The change of an index over its trailing year, as a decimal: 1.03 against 1.00 reads 0.03. */
export const yearOverYear = (level: number, levelYearAgo: number): number => level / levelYearAgo - 1;

/**
 * Real growth over a year, from nominal growth and inflation measured over the SAME year: the
 * ratio of the two gross rates, not their difference. `nominal - inflation` is the first-order
 * approximation and was the model's until §3.28b-i; at 5% and 2% it overstates real growth by
 * six basis points, and the error grows with both rates.
 */
export const realGrowthAnnual = (nominalGrowthAnnual: number, inflationAnnual: number): number =>
  (1 + nominalGrowthAnnual) / (1 + inflationAnnual) - 1;
