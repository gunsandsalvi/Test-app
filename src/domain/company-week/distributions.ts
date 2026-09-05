/**
 * §5-STRUCT step 2 — WHAT A BOARD PAYS OUT.
 *
 * Sixth object out of the company kernel. Two rules, both of which cost this project a measured
 * defect before they were written down.
 *
 * WHAT A DIVIDEND IS SIZED BY. Not yield × market cap. The equity level is a known-inflated
 * formula, and paying a real 2–3% yield on a fake 30B capitalisation **bled ten times a real
 * dividend out of every profitable company** — measured in the cash ledger's first week of
 * existence at 15–25M/wk against 20M/wk of sales. A board pays out a share of what the company
 * EARNS; the declared yield stands only when earnings cover it.
 *
 * AND WHEN IT IS PAID. A board declares quarterly and pays on a date. Thirteen weeks of dividend
 * leave in one week and nothing in the other twelve, which is what a shareholder's cash actually
 * looks like and what a fund reinvesting it feels — the same accrual-versus-cash distinction CAL
 * makes for coupons. A weekly dividend is a smoothing artefact, not a payment.
 */

interface DividendDecision {
  /** What the board declares each week, as an accrual. */
  accrualWeeklyLocal: number;
  /** What actually leaves this week — everything, or nothing. */
  cashThisWeekLocal: number;
  /** Which constraint bound: the declared yield, or the earnings that have to cover it. */
  boundBy: 'declared-yield' | 'earnings';
}

/**
 * The dividend, accrued weekly and paid on the quarter. `weekOfQuarter === weeksInQuarter` is the
 * payment date; every other week the accrual is real and the cash is zero.
 */
export function dividendDecision(i: {
  declaredYield: number;
  marketCapLocal: number;
  netIncomeLocal: number;
  maxPayoutRatio: number;
  weekOfQuarter: number;
  weeksInQuarter: number;
}): DividendDecision {
  const declaredWeekly = Math.max(0, i.declaredYield * i.marketCapLocal) / 52;
  const sustainableWeekly = Math.max(0, i.netIncomeLocal) * i.maxPayoutRatio / 52;
  const accrualWeeklyLocal = Math.min(declaredWeekly, sustainableWeekly);
  return {
    accrualWeeklyLocal,
    cashThisWeekLocal: i.weekOfQuarter === i.weeksInQuarter
      ? accrualWeeklyLocal * i.weeksInQuarter
      : 0,
    boundBy: sustainableWeekly < declaredWeekly ? 'earnings' : 'declared-yield',
  };
}

/**
 * A LOSS-MAKING COMPANY PAYS NOTHING, and this is the assertion that keeps it that way: with net
 * income at or below zero the sustainable figure is zero, so the minimum is zero however generous
 * the declared yield. No clamp is needed and none is used (§1.6) — it falls out of sizing the
 * payout on earnings rather than on capitalisation.
 */
export function sustainableDividendWeeklyLocal(netIncomeLocal: number, maxPayoutRatio: number): number {
  return Math.max(0, netIncomeLocal) * maxPayoutRatio / 52;
}
