/**
 * §5-STRUCT step 2 — A FIRM'S CREDIT STANDING FOR ONE WEEK.
 *
 * The second object out of the ~1,900-line company kernel: the two ratios a rating is struck on,
 * how much of a committed line a lender would still extend, and when the firm is actually in
 * default. All three were inline, and all three are decisions a lender makes rather than
 * bookkeeping a stage does.
 *
 * WHY THESE THREE TOGETHER: they are one question asked from three sides. §5-G5's finding was that
 * the public tier defaulted at ~10%/yr against ~1–2% in reality while the private tier with real
 * ladders showed ZERO — because **nothing at all stood between a bad week and a default.** A real
 * firm draws its revolver first, and it defaults when the line is exhausted, which is a different
 * event and a far rarer one. Leverage, coverage, headroom and the trigger have to agree, and they
 * agree here or nowhere.
 *
 * Pure functions over flat inputs, per the columnar constraint (§7.228).
 */

/**
 * LEVERAGE AND COVERAGE, UNBOUNDED — and that is deliberate (§1.15: a bound is not a measurement).
 *
 * These carried `[0, 100]` and `[-50, 50]` clamps because EBITDA passes through zero and the ratio
 * explodes. The denominators are floored, so the numbers are finite without the clamps, and what
 * the clamps destroyed was the information that the firm has no earnings at all — a firm at -200x
 * coverage is telling you something a firm at -50x is not.
 */
export function creditMetrics(i: {
  isBank: boolean;
  totalDebtUSD: number;
  revenueUSD: number;
  ebitdaUSD: number;
  ebitUSD: number;
  annualInterestUSD: number;
  bankCapitalRatio: number;
}): { leverage: number; coverage: number } {
  const rawLeverage = i.isBank
    ? i.totalDebtUSD / Math.max(1, i.revenueUSD * 0.4)
    : i.totalDebtUSD / Math.max(1, i.ebitdaUSD);
  const rawCoverage = i.isBank
    ? (i.bankCapitalRatio < 0.05 ? 0.4 : 3.0)
    : i.ebitUSD / Math.max(0.5, i.annualInterestUSD);
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
export function revolverDrawUSD(i: {
  cashShortfallUSD: number;
  headroomUSD: number;
  alreadyDrawnUSD: number;
}): number {
  const remaining = Math.max(0, i.headroomUSD - i.alreadyDrawnUSD);
  return Math.max(0, Math.min(Math.max(0, i.cashShortfallUSD), remaining));
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
  cashUSD: number;
  coverage: number;
  coverageFloor: number;
}): boolean {
  if (i.mergerAcquired) return false;
  return i.wasDefaulted || (i.cashUSD < 0 && i.coverage < i.coverageFloor);
}

/** The share of a firm's ladder falling due inside a year — the refinancing wall a rating reads. */
export function maturityWallShare(
  tranches: { principalUSD: number; maturityWeek?: number }[],
  week: number
): number {
  const wallUSD = tranches
    .filter((t) => (t.maturityWeek ?? Infinity) - week <= 52)
    .reduce((a, t) => a + t.principalUSD, 0);
  const ladderUSD = Math.max(1, tranches.reduce((a, t) => a + t.principalUSD, 0));
  return wallUSD / ladderUSD;
}
