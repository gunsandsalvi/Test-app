/**
 * A POSITION IS WORTH ITS QUANTITY AT THIS WEEK'S PRICE.
 *
 * Every notional instrument was carried at its face, because `priceOf` returned 1.00 for anything
 * that was not shares. A bond whose issuer's spread had doubled was still worth 100, which is the
 * "credit always trades at par" defect in one line. `P5` sizes what that cost: ~1,000B of face
 * carried at par is worth ~140B less at the spreads the books themselves cleared.
 *
 * This is the mark. §9.13-CREDIT row 5 wired it in for credit; §9.13-EQUITY gave it the SHARE
 * books too, which had the opposite half of the same defect: an equity row stores its shares and
 * its value, and only a session that TOUCHED the row rewrote the value — so a holder that did not
 * trade this week carried its position at a stale print, and its NAV, its capital ratio and every
 * allocation sized off them were struck on last week's market.
 *
 * It runs at the CLOSE — after every stage that can write a register row, and after
 * `register-consolidation` folds a week of fills into one row per position — because a mark that
 * is not the last word leaves the book part marked and part not, and every held-versus-issued
 * identity then compares a mark to a quantity. That is the second of the two blockers the first
 * attempt hit (§9.13 part 3); the first was the face leaks, closed in row 5a.
 *
 * It does two things to each row:
 *
 *   1. FIXES THE QUANTITY, for a row that somehow arrived without one: a book writes its fills in
 *      par space, so the value it was written with IS the face. From then on the two are separate
 *      numbers and only the value moves.
 *   2. MARKS THE VALUE to `units × price`, where the price is what that instrument's own market
 *      last printed — the price store for a tranche or a government bond (`engine2/prices.ts`),
 *      the issuer's own cleared print for a share. Neither is re-derived here (`bond.md` N7.b).
 *
 * §9.13-EQUITY also made the SOVEREIGN books deposit their prints. `07c` and `07f`'s bill session
 * had each struck a price per bond and kept nothing but the yield it implied, so a government
 * holding sat at PAR for ever while the corporate books marked at what they printed — step 13's
 * item 3 ("the auction already computes the price it needs and discards it"), in the one class
 * that had already priced its way out of the defect. §9.13-BILL then brought the discount BILLS
 * in: a bill's return is the pull to par it actually printed, which is this mark and not a
 * separate accretion computed off a fitted curve.
 *
 * The books go on trading QUANTITY — they claim `units`, never the marked value — so a mark never
 * looks like a trade and a trade never looks like a mark. That separation is the whole reason the
 * quantity is stored rather than inferred.
 */
import { GameState } from '../../../types';
import { buildEntityIndex } from '../../ledger/entity-index';
import { WeeklyStepContext } from './context';
import { markBookToMarket, registerBooks } from '../../ledger/holdings-ledger';
import { trancheClearedPricePerFace } from '../../credit-price';
import { isTrancheKind, holdingClassOf } from '../../../domain/assets';
import { isActiveCompany } from '../../../domain/company';
import type { InstrumentId } from '../../../domain/ids';
import { equityIssuerId } from '../../../domain/instrument-keys';

export function markRegisterToMarket(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const priceById = new Map<string, number | undefined>();
  // A share's price is its issuer's own cleared print. It is read off THIS week's companies —
  // `updatedCompanies` is what 07e wrote and stage 08 rebuilt — never off the week-start array.
  const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const priceOfRow = (instrumentType: string, instrumentId: InstrumentId): number | undefined => {
    const key = `${instrumentType}|${instrumentId}`;
    if (priceById.has(key)) return priceById.get(key);
    let p: number | undefined;
    // A tranche's price is in the price store, and a SOVEREIGN holding names a tranche too
    // (§9.13-SOV row 3) — 07c and 07f's bill session deposit their prints there, so a government
    // bond and a bill mark like any other fixed-income holding.
    //
    // §9.13-BILL: DISCOUNT BILLS ARE IN. They were held out for one week because `bill-accretion`
    // also wrote a bill row's value, and two writers of one number leave the income booked against
    // whichever wrote last. That stage no longer touches the register: a bill's pull to par IS
    // this mark, at the price its own auction printed, so there is one owner and the accretion is
    // observed rather than computed.
    if (isTrancheKind(instrumentType) || holdingClassOf(instrumentType) === 'SOVEREIGN') {
      p = trancheClearedPricePerFace(ctx.v2, instrumentId);
    } else if (instrumentType === 'EQUITY') {
      const c = companyById.get(equityIssuerId(instrumentId)); // §3.13-BOOK (c2a): the crossing
      // A company that has left the market has no price to mark at, and a delisted or defaulted
      // name's shares are the estate's business — the row is left alone rather than zeroed here.
      p = c && isActiveCompany(c) && c.stockPrice > 0 ? c.stockPrice : undefined;
    }
    priceById.set(key, p);
    return p;
  };
  let markedLocal = 0, rows = 0;
  // §9.13-EQUITY: every book the register holds — the household sector's shares are marked like
  // any other holder's, which is what makes household net worth a read of real rows.
  registerBooks(ctx.updatedInstitutionalEntities.map((e) => e.id), ctx.updatedCompanies.filter((c) => c.isBankEntity && c.bankBalanceSheet !== undefined).map((c) => c.id)).forEach((b) => {
    const r = markBookToMarket(ctx.v2, b.id, priceOfRow);
    rows += r.rows; markedLocal += r.deltaLocal;
  });
  if (process.env.REGISTER_MARK_TRACE === '1') {
    console.log(`  [register-mark] w${week} ${rows} rows re-marked, ${(markedLocal / 1e9).toFixed(2)}B of value moved`);
  }
}
