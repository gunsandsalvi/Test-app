/**
 * DER — ONE realised-volatility estimator, because there was more than one and one of them was a
 * constant.
 *
 * Volatility is measured in three places in this model for three different purposes — the market
 * vol component stage 05 computes off the composite index, the pair sigma the FX book's
 * speculators scale into, and the vol an option is repriced at — and the third was not measured
 * at all: `pos.impliedVol || 0.3` put a stated 30% on any option whose position row did not carry
 * one. A price computed from a stated vol is a stated price (rule 1), and a fallback that never
 * changes cannot say that this name is riskier than that one.
 *
 * This is the estimator, with NO fallback baked in: too little history returns `undefined`, and
 * each caller says what it does about that in its own terms rather than inheriting somebody
 * else's guess.
 */

/**
 * Annualised standard deviation of a series' log returns over the last `window` observations.
 * Returns `undefined` when there is not enough history to estimate one.
 */
/**
 * §5-CLOSE — THE ONE-WEEK MOVE A LENDER MUST ASSUME, MEASURED. With a history of eight prints
 * or more, the realised weekly volatility of the series; with two or more, the last move; with
 * one, nothing (undefined) — a caller takes the book's median over the names that have one. There
 * is no posted cap to read it off any more.
 */
export function measuredWeeklyMove(series: number[] | undefined): number | undefined {
  if (!series) return undefined;
  const s = series.filter((v) => Number.isFinite(v) && v > 0);
  if (s.length >= 8) { const v = realizedAnnualVol(s, Math.min(26, s.length)); if (v !== undefined) return v / Math.sqrt(52); }
  if (s.length >= 2) return Math.abs(s[s.length - 1] - s[s.length - 2]) / s[s.length - 2];
  return undefined;
}

/** §5-CLOSE — a spread's weekly move in BPS, measured: σ of the weekly changes (three prints or
 *  more), the last change (two), nothing (one). */
export function measuredWeeklyBpsMove(series: number[] | undefined): number | undefined {
  if (!series) return undefined;
  const s = series.filter((v) => Number.isFinite(v));
  if (s.length < 2) return undefined;
  const d: number[] = []; for (let i = 1; i < s.length; i++) d.push(s[i] - s[i - 1]);
  if (d.length < 2) return Math.abs(d[0]);
  const m = d.reduce((a, x) => a + x, 0) / d.length;
  return Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / (d.length - 1));
}

export function medianOf(values: number[]): number | undefined {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return undefined;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

export function realizedAnnualVol(series: number[] | undefined, window: number): number | undefined {
  const recent = (series ?? []).slice(-window);
  if (recent.length < 3) return undefined;
  const returns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0 && recent[i] > 0) returns.push(Math.log(recent[i] / recent[i - 1]));
  }
  if (returns.length < 2) return undefined;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(52);
}
