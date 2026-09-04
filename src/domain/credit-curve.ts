/**
 * AN ISSUER'S CREDIT CURVE — what a borrower pays at each maturity, and nothing else.
 *
 * §3.13 (user, 2026-09-04): *"there shouldn't be any spread per issuer. The spread is per asset,
 * assets with different maturities should have different risk levels and so different spreads."*
 *
 * A borrower does not have A spread. Each piece of its paper trades at its own price, and the
 * spread that price implies over the paper's own life is that PAPER's. Line those up by maturity
 * and you have the only issuer-level object that is real: a curve. Everything that used to read
 * `Company.oasSpreadBps` was asking this curve a question at some tenor — a five-year deal's
 * coupon, a call's fair rate today, the cash leg of a five-year CDS basis — and answering all of
 * them with one number is what deleted the term structure from the model.
 *
 * The read is LINEAR BETWEEN THE POINTS THAT TRADED and FLAT OUTSIDE THEM, exactly as the
 * sovereign curve's `zeroRateAt` is, and for the same reason: an issuer's paper says nothing
 * about a maturity beyond its longest bond, and inventing a slope there would be a number with no
 * market behind it. The read reports whether the tenor asked for was one a bond actually traded
 * at — §3.25's rule ("a curve point says whether it was traded or interpolated"), one level down,
 * so a mechanism that must not price off an invented point can say so.
 *
 * Nothing here reads the world: it takes points and a tenor, which is what makes it testable.
 */

export interface CreditCurvePoint {
  /** The paper's own remaining life, in years. */
  tenorYears: number;
  /** The spread its own cleared price implies over the region's curve. */
  spreadBps: number;
  /** Its face — the weight, for a caller that wants the curve summarised rather than read. */
  faceLocal: number;
}

export interface CreditCurveRead {
  spreadBps: number;
  /** A bond of (very nearly) this maturity printed; false means the point sits between two that
   *  did, or beyond the longest one. */
  traded: boolean;
}

/** How close a point must sit to the tenor asked for to count as the market's own answer: one
 *  coupon period, because inside that the two are the same bond's next payment. */
const TRADED_TOLERANCE_YEARS = 0.5;

/**
 * The spread this issuer's own paper says it pays at `tenorYears`. Undefined when it has printed
 * nothing — a debut borrower has no credit curve, and the caller must say what it does about that
 * rather than be handed an invented level.
 */
export function spreadAtTenor(points: CreditCurvePoint[], tenorYears: number): CreditCurveRead | undefined {
  if (points.length === 0) return undefined;
  const t = Math.max(0, tenorYears);
  const sorted = [...points].sort((a, b) => a.tenorYears - b.tenorYears);
  const nearest = sorted.reduce((best, p) =>
    Math.abs(p.tenorYears - t) < Math.abs(best.tenorYears - t) ? p : best, sorted[0]);
  const traded = Math.abs(nearest.tenorYears - t) <= TRADED_TOLERANCE_YEARS;
  if (t <= sorted[0].tenorYears) return { spreadBps: sorted[0].spreadBps, traded };
  const last = sorted[sorted.length - 1];
  if (t >= last.tenorYears) return { spreadBps: last.spreadBps, traded };
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i], lo = sorted[i - 1];
    if (t > hi.tenorYears) continue;
    const span = hi.tenorYears - lo.tenorYears;
    const w = span > 0 ? (t - lo.tenorYears) / span : 0;
    return { spreadBps: lo.spreadBps + w * (hi.spreadBps - lo.spreadBps), traded };
  }
  return { spreadBps: last.spreadBps, traded };
}

/**
 * The curve as ONE number, face-weighted — for the index levels and the audit correlations that
 * are measuring a market rather than pricing an instrument. It is a STATISTIC over paper, never
 * an input to a price: anything that prices reads `spreadAtTenor` at the maturity it means.
 */
export function faceWeightedSpreadBps(points: CreditCurvePoint[]): number | undefined {
  let face = 0, weighted = 0;
  for (const p of points) {
    if (!(p.faceLocal > 0)) continue;
    face += p.faceLocal;
    weighted += p.faceLocal * p.spreadBps;
  }
  return face > 0 ? weighted / face : undefined;
}
