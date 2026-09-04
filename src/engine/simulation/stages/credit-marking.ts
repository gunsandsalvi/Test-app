/**
 * CREDIT IS WORTH PRICE x FACE.
 *
 * Every notional instrument was carried at its face, because `priceOf` returned 1.00 for anything
 * that was not shares. A bond whose issuer's spread had doubled was still worth 100, which is the
 * "credit always trades at par" defect in one line. `P5` sizes what that costs: ~1,000B of face
 * carried at par is worth ~140B less at the spreads the books themselves cleared.
 *
 * This is the mark, and §9.13-CREDIT row 5 WIRED IT IN. It runs at the CLOSE — after every stage
 * that can write a register row, and after `register-consolidation` folds a week of fills into one
 * row per position — because a mark that is not the last word leaves the book part marked and part
 * not, and every held-versus-issued identity then compares a mark to a face. That is the second of
 * the two blockers the first attempt hit (§9.13 part 3); the first was the face leaks, closed in
 * row 5a.
 *
 * It does two things to each credit row:
 *
 *   1. FIXES THE FACE, for a row that somehow arrived without one: a book writes its fills in par
 *      space, so the value it was written with IS the face. From then on the two are separate
 *      numbers and only the value moves.
 *   2. MARKS THE VALUE to `units × price`, where the price is what that piece of paper's own book
 *      last printed (`engine2/prices.ts`) — not a re-derivation of one (`bond.md` N7.b).
 *
 * The books keep trading FACE — they claim `units`, never the marked value — so a mark never looks
 * like a trade and a trade never looks like a mark. That separation is the whole reason face is
 * stored rather than inferred, and it is the same one that makes equity store shares.
 */
import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';
import { markCreditBook } from '../../ledger/holdings-ledger';
import { trancheClearedPricePerFace } from '../../credit-price';

export function markCreditToMarket(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const priceById = new Map<string, number | undefined>();
  const priceOf = (instrumentId: string): number | undefined => {
    if (priceById.has(instrumentId)) return priceById.get(instrumentId);
    const p = trancheClearedPricePerFace(ctx.v2, instrumentId);
    priceById.set(instrumentId, p);
    return p;
  };
  let markedLocal = 0, rows = 0;
  ctx.updatedInstitutionalEntities.forEach((e) => {
    const r = markCreditBook(ctx.v2, e.id, priceOf);
    rows += r.rows; markedLocal += r.deltaLocal;
  });
  if (process.env.CREDIT_MARK_TRACE === '1') {
    console.log(`  [credit-mark] w${week} ${rows} rows re-marked, ${(markedLocal / 1e9).toFixed(2)}B of value moved`);
  }
}
