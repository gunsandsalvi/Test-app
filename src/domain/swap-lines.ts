/**
 * §3.17b-v — THE CENTRAL BANKS' SWAP LINES: the backstop to the FX funding market
 * (`derivative-markets/xcs.ts`). A central bank lends its own money to another central bank
 * against that bank's own, and the borrowing central bank on-lends it to its banks at the
 * foreign overnight rate plus a stated spread — the line's PRICE, a policy primitive (rule 2)
 * of the same kind as the corridor; the standing dollar lines charge overnight plus 25 bps. It
 * is drawn when the funding basis clears PAST that spread: a bank that would pay more in the
 * market than at the line takes the line, so no basis can clear above it while the line stands
 * — the cap is the line's price, not a bracket (rule 6). Every draw is a real event.
 *
 * The books (`central-bank.ts`, `banking.ts`): the lending central bank creates its money and
 * pays it to the borrowing region's bank; that bank owes the borrowing central bank the foreign
 * money (`BankingSector.swapLineDrawnByRegion`, an asset of the central bank,
 * `CentralBank.swapLineLentByRegion`); the borrowing central bank owes the lending one the home
 * money it gave for it (`swapLineDepositsLocal`), which the lending one holds as FX reserves.
 * The official claim the settlement writes for the reserves that crossed the border is the
 * borrowing central bank's deposit at the lending one. Unwound at term at the original rate.
 */
import type { RegionId } from './geography';
import type { EntityId } from './ids';

/** The line's price over the foreign overnight rate, bps a year. */
export const SWAP_LINE_SPREAD_BPS = 25;
/** The term of a draw: one quarter, the standing lines' longest operation. */
export const SWAP_LINE_TERM_WEEKS = 13;

export interface SwapLineDraw {
  /** The region whose money was borrowed — the lending central bank's. */
  counterpartyRegion: RegionId;
  /** The bank the money was on-lent to. */
  bankId: EntityId;
  /** In the foreign money. */
  foreignLocal: number;
  /** The home money given for it, at the draw's rate — what the unwind returns. */
  homeLocal: number;
  /** The same, in the numéraire, as the lending central bank booked it in its FX reserves. */
  homeUSD: number;
  drawnWeek: number;
  maturityWeek: number;
}

/** What the line lends: the funding the market left unfilled, once the basis has cleared past
 *  the line's price (or nobody lent at all). Nothing while the market is cheaper than the line. */
export function swapLineDrawLocal(args: { unfilledLocal: number; clearedBasisBps: number | undefined }): number {
  if (!(args.unfilledLocal > 0)) return 0;
  if (args.clearedBasisBps !== undefined && args.clearedBasisBps <= SWAP_LINE_SPREAD_BPS) return 0;
  return args.unfilledLocal;
}

/** The basis the region publishes while the line stands: no higher than the line's price. */
export function cappedBasisBps(clearedBasisBps: number | undefined): number {
  return clearedBasisBps === undefined ? SWAP_LINE_SPREAD_BPS : Math.min(clearedBasisBps, SWAP_LINE_SPREAD_BPS);
}

/** A week's interest on a draw, in the foreign money: overnight plus the spread. */
export function swapLineInterestLocal(foreignLocal: number, foreignOvernightAnnual: number): number {
  return foreignLocal * (Math.max(0, foreignOvernightAnnual) + SWAP_LINE_SPREAD_BPS / 10000) / 52;
}
