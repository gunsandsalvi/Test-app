/**
 * §7.275 — ONE API FOR A BANK'S P&L WRITE (Tier-2 ledger enforcement, §5-STRUCT).
 *
 * Eight stage files wrote `bankEquityLocal` with their own spread rebuilds — a fee here, a mark
 * there, a write-down somewhere else — and nothing could enumerate a bank's P&L by reason or
 * catch a NaN before it poisoned the sheet. Every stage-side earnings/loss write goes through
 * here now: the amount is validated the way a payment is (a NaN or infinite P&L is a defect at
 * the caller, thrown where it happens), and PNL_TRACE=1 prints every material write by reason —
 * the instrument the §7.259 dig had to rebuild by hand.
 *
 * This is a P&L write, not a transfer: equity moves and the matching leg is the caller's own
 * (cash it already moved, an asset it marked, a loss it recognised). Stock transfers between
 * banks (a merger absorbing a book) are not P&L and do not belong here.
 */

import { BankingSector } from '../../domain/banking';

export function bookPnL(
  sheet: BankingSector,
  deltaLocal: number,
  reason: string,
  ticker?: string
): BankingSector {
  if (!isFinite(deltaLocal)) {
    throw new Error(`ENGINE DEFECT: bookPnL('${reason}') carries deltaLocal=${deltaLocal} — `
      + 'a NaN/infinite P&L is an arithmetic error at the caller, not earnings');
  }
  if (deltaLocal === 0) return sheet;
  if (process.env.PNL_TRACE === '1' && Math.abs(deltaLocal) > 10e6) {
    console.log(`  [pnl] ${ticker ?? '?'} ${reason} ${(deltaLocal / 1e6).toFixed(1)}M`);
  }
  return { ...sheet, bankEquityLocal: sheet.bankEquityLocal + deltaLocal };
}
