/**
 * A FIRM'S CREDIT STANDING FOR ONE WEEK.
 *
 * The second object out of the ~1,900-line company kernel: the two ratios a rating is struck on,
 * how much of a committed line a lender would still extend, and when the firm is actually in
 * default. All three were inline, and all three are decisions a lender makes rather than
 * bookkeeping a stage does.
 *
 * WHY THESE THREE TOGETHER: they are one question asked from three sides. finding was that
 * the public tier defaulted at ~10%/yr against ~1–2% in reality while the private tier with real
 * ladders showed ZERO — because **nothing at all stood between a bad week and a default.** A real
 * firm draws its revolver first, and it defaults when the line is exhausted, which is a different
 * event and a far rarer one. Leverage, coverage, headroom and the trigger have to agree, and they
 * agree here or nowhere.
 *
 * Pure functions over flat inputs, per the columnar constraint.
 */

/**
 * LEVERAGE AND COVERAGE, UNBOUNDED — and that is deliberate.
 *
 * These carried `[0, 100]` and `[-50, 50]` clamps because EBITDA passes through zero and the ratio
 * explodes. The denominators are floored, so the numbers are finite without the clamps, and what
 * the clamps destroyed was the information that the firm has no earnings at all — a firm at -200x
 * coverage is telling you something a firm at -50x is not.
 */
export function creditMetrics(i: {
  isBank: boolean;
  totalDebtLocal: number;
  revenueLocal: number;
  ebitdaLocal: number;
  ebitLocal: number;
  annualInterestLocal: number;
  bankCapitalRatio: number;
  /** A bank's own equity and the annual loss rate its own book is running. */
  bankEquityLocal: number;
  bankLossRateAnnual: number;
}): { leverage: number; coverage: number } {
  // A BANK IS RATED ON ITS OWN SHEET, AND ON A CONTINUUM. Its leverage denominator was
  // `revenue x 0.4` — a stated 40% margin, the very constant the profile modules deleted — and
  // its coverage took exactly TWO VALUES, 0.4 below a 5% capital ratio and 3.0 above it. A
  // coverage that is a step cannot rate a bank on itself: every bank above the step shared one
  // number, every bank below it shared another, and a hair's movement in the ratio jumped the
  // whole rating several buckets at once. Both are now measurements.
  //
  // Leverage is debt against the equity behind it. Coverage is what coverage means for a bank:
  // how many years of its own expected losses its capital absorbs. Both climb and fall with the
  // sheet, the way a corporate's do, and they share the rating ladder with corporates — which is
  // why coverage is measured against the WHOLE capital base rather than the buffer above the
  // regulatory floor. That buffer is the right measure of distance to default and is what the
  // default probability uses; on a rating ladder it turns negative for any bank under the floor,
  // rating a thin but solvent bank below a corporate with no earnings at all.
  const rawLeverage = i.isBank
    ? i.totalDebtLocal / Math.max(1, i.bankEquityLocal)
    : i.totalDebtLocal / Math.max(1, i.ebitdaLocal);
  const rawCoverage = i.isBank
    ? Math.max(0, i.bankCapitalRatio) / Math.max(1e-4, i.bankLossRateAnnual)
    : i.ebitLocal / Math.max(0.5, i.annualInterestLocal);
  return {
    leverage: isFinite(rawLeverage) ? Number(Math.max(0, rawLeverage).toFixed(2)) : 5.0,
    coverage: isFinite(rawCoverage) ? Number(rawCoverage.toFixed(2)) : 1.5,
  };
}

/**
 * WHAT THE COMMITTED LINE WILL ACTUALLY BEAR THIS WEEK.
 *
 * Sized by what the firm can service inside its own coverage covenant, less what it has already
 * drawn — so the line closes exactly when a lender really would stop lending, and a firm whose
 * earnings cannot carry another dollar of interest gets nothing. **That last case is what the
 * default trigger is FOR**, and it is the reason this is a function rather than a constant: a
 * fixed line would either never bind or always bind, and neither is a credit market.
 */
export function revolverDrawLocal(i: {
  cashShortfallLocal: number;
  headroomLocal: number;
  alreadyDrawnLocal: number;
}): number {
  const remaining = Math.max(0, i.headroomLocal - i.alreadyDrawnLocal);
  return Math.max(0, Math.min(Math.max(0, i.cashShortfallLocal), remaining));
}

/**
 * DEFAULT: cash exhausted AND coverage below the floor — and only AFTER the committed line has
 * been drawn to whatever it will bear. A firm already in default stays there unless it was
 * acquired, which is a different exit.
 *
 * The floor is the single definition of this trigger, shared with the credit market's own hazard
 * model, so priced risk and realised risk are one model rather than two that drift.
 */
export function isInDefault(i: {
  wasDefaulted: boolean;
  mergerAcquired: boolean;
  cashLocal: number;
  coverage: number;
  coverageFloor: number;
}): boolean {
  if (i.mergerAcquired) return false;
  return i.wasDefaulted || (i.cashLocal < 0 && i.coverage < i.coverageFloor);
}

/** The share of a firm's ladder falling due inside a year — the refinancing wall a rating reads. */
export function maturityWallShare(
  tranches: { principalLocal: number; maturityWeek?: number }[],
  week: number
): number {
  const wallLocal = tranches
    .filter((t) => (t.maturityWeek ?? Infinity) - week <= 52)
    .reduce((a, t) => a + t.principalLocal, 0);
  const ladderLocal = Math.max(1, tranches.reduce((a, t) => a + t.principalLocal, 0));
  return wallLocal / ladderLocal;
}
