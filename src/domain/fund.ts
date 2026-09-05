/**
 * §5-STRUCT step 3 — A FUND, AND WHAT IT CAN ACTUALLY PAY.
 *
 * §6.1's overdraft row and §7.226: `distributeToLps` paid recap and exit proceeds against drawn
 * capital alone, never against the sponsor's balance, so PEF1 wired 0.495B out of a 0.000B account
 * at week 12 and carried the same -0.50B for forty weeks. Ten lines above it, `callCapitalLocal`
 * already bounded a CALL by the LPs' real cash — "a call that comes up short is a deal that does
 * not close". One side of one rule, written twice, in one file, and only one of them was right.
 *
 * The rule is here now, once, and both directions read it: **a fund moves what it has.**
 */

/** What a fund can pay out right now, and why it is not more. */
interface Distributable {
  /** What it may actually wire. */
  payableLocal: number;
  /** What was asked for. */
  requestedLocal: number;
  /** Which constraint bound: the commitment, or the balance. */
  boundBy: 'nothing' | 'drawn-capital' | 'cash';
}

/**
 * A distribution is bounded by BOTH the recallable commitment and the cash in the account. Naming
 * which one bound is not decoration: a fund short of cash is a liquidity event and a fund at its
 * drawn capital is simply finished returning it, and those are different facts about the world.
 */
export function distributable(
  requestedLocal: number,
  totalDrawnLocal: number,
  cashLocal: number
): Distributable {
  const byDrawn = Math.min(requestedLocal, Math.max(0, totalDrawnLocal));
  const payableLocal = Math.max(0, Math.min(byDrawn, Math.max(0, cashLocal)));
  const boundBy: Distributable['boundBy'] =
    payableLocal >= requestedLocal ? 'nothing'
      : payableLocal < byDrawn ? 'cash'
        : 'drawn-capital';
  return { payableLocal, requestedLocal, boundBy };
}

/**
 * What a fund can honour in redemptions this week. Same rule from the other side, and the reason
 * it is here: the corporate sweep book bounded redemptions by the fund's cash while the PE book did
 * not, and nothing made that inconsistency visible.
 */
export function redeemable(requestedLocal: number, cashLocal: number): number {
  return Math.max(0, Math.min(Math.max(0, requestedLocal), Math.max(0, cashLocal)));
}
