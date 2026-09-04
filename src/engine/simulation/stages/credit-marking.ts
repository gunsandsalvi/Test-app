/**
 * CREDIT IS WORTH PRICE x FACE.
 *
 * Every notional instrument was carried at its face, because `priceOf` returned 1.00 for anything
 * that was not shares. A bond whose issuer's spread had doubled was still worth 100, which is the
 * "credit always trades at par" defect in one line. `P5` sizes what that costs: ~1,000B of face
 * carried at par is worth ~140B less at the spreads the books themselves cleared.
 *
 * This is the mark. It runs after the credit books have written their fills back and before
 * anything reads a value, and it does two things to each credit row:
 *
 *   1. FIXES THE FACE. A book writes its fills in par space — the amount IS the face — so a row
 *      arriving without one has its face taken from the value it was written with. From then on
 *      the two are separate numbers and only the value moves.
 *   2. MARKS THE VALUE to `face x price`, where the price comes from the paper's own cash flows
 *      discounted at the region's cleared curve plus the spread that paper's own book cleared.
 *
 * The books keep trading FACE — they read `faceLocal`, not the marked value — so a mark never looks
 * like a trade and a trade never looks like a mark. That separation is the whole reason face is
 * stored rather than inferred, and it is the same one that makes equity store shares.
 */
import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';
import { markCreditBook } from '../../ledger/holdings-ledger';
import { trancheClearedPricePerFace } from '../../credit-price';
import { RegionId } from '../../../types';

export function markCreditToMarket(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const priceById = new Map<string, number | undefined>();
  // The FRESHEST view of the world: this week's companies and regions, not last week's state.
  const byId = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  state.companies.forEach((c) => { if (!byId.has(c.id)) byId.set(c.id, c); });
  const world = {
    issuerById: (id: string) => byId.get(id),
    regionById: (r: string) => ctx.updatedRegions[r as RegionId] ?? state.regions[r as RegionId],
  };
  const priceOf = (instrumentId: string): number | undefined => {
    if (priceById.has(instrumentId)) return priceById.get(instrumentId);
    const p = trancheClearedPricePerFace(world, ctx.v2, instrumentId, week);
    priceById.set(instrumentId, p);
    return p;
  };
  let markedUSD = 0, rows = 0;
  ctx.updatedInstitutionalEntities.forEach((e) => {
    const r = markCreditBook(ctx.v2, e.id, priceOf);
    rows += r.rows; markedUSD += r.deltaLocal;
  });
  if (process.env.CREDIT_MARK_TRACE === '1') {
    console.log(`  [credit-mark] w${week} ${rows} rows re-marked, ${(markedUSD / 1e9).toFixed(2)}B of value moved`);
  }
}
