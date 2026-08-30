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
