/**
 * UNIT BRANDS (§7.241) — zero-cost compile-time families for the units this codebase has paid
 * for confusing: dollars in four price levels all named `USD` (`currency.ts` declares every
 * stored figure region-local; the suffix lies), shares carried in `…USD` fields (§7.165, twice),
 * percents wearing fractions' clothes (`MAX_WEEKLY_FX_MOVE_PCT = 8` vs `…_SPREAD_MOVE_PCT =
 * 0.25`), and weekly flows multiplied into annual ones (the credit-file cure ran 52× fast).
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
export type Brand<B extends string> = number & { readonly [unit]: B };

/** Money in one region's own price level. `Money<'USA'>` is genuine USD; the rest are not. */
export type Money<C extends RegionId = RegionId> = Brand<`money-${C}`>;
/** A flow per week / per year of whatever family B names. */
export type PerWeek<B extends string = 'money'> = Brand<`${B}/wk`>;
export type PerYear<B extends string = 'money'> = Brand<`${B}/yr`>;
/** A pure fraction (0.05 = 5%). */
export type Frac = Brand<'frac'>;
/** Basis points (500 = 5%). */
export type Bps = Brand<'bps'>;
/** A share count — never dollars (§7.165). */
export type Shares = Brand<'shares'>;
/** A physical unit count from the goods registry. */
export type Units = Brand<'units'>;

/** Assert a raw literal or measured number into a brand — the ONE deliberate cast, greppable. */
export const asBrand = <B extends string>(v: number): Brand<B> => v as Brand<B>;

export const bpsToFrac = (v: Bps): Frac => (v / 10000) as Frac;
export const fracToBps = (v: Frac): Bps => (v * 10000) as Bps;
export const annualize = <B extends string>(v: PerWeek<B>): PerYear<B> => (v * 52) as PerYear<B>;
export const weekly = <B extends string>(v: PerYear<B>): PerWeek<B> => (v / 52) as PerWeek<B>;
export const sharesToValue = <C extends RegionId>(s: Shares, pricePerShare: Money<C>): Money<C> =>
  (s * pricePerShare) as Money<C>;
