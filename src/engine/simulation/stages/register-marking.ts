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
 * that had already priced its way out of the defect. Government BONDS mark here; discount BILLS
 * do not, because `bill-accretion` already owns their value — see the note below.
 *
 * The books go on trading QUANTITY — they claim `units`, never the marked value — so a mark never
 * looks like a trade and a trade never looks like a mark. That separation is the whole reason the
 * quantity is stored rather than inferred.
 */
import { GameState } from '../../../types';
import { WeeklyStepContext } from './context';
import { markBookToMarket, registerBooks } from '../../ledger/holdings-ledger';
import { trancheClearedPricePerFace } from '../../credit-price';
import { isTrancheKind, holdingClassOf } from '../../../domain/assets';
import { isActiveCompany } from '../../../domain/company';
import { isDiscountBill } from '../../../domain/government';
import { trancheRowOf } from '../../../engine2/tranches';

export function markRegisterToMarket(state: GameState, ctx: WeeklyStepContext): void {
  const week = ctx.nextWeek;
  const priceById = new Map<string, number | undefined>();
  /** A bill is a tranche whose whole life is under the discount-bill tenor — read off the row it
   *  names, so the test is the government's own (`domain/government.ts`) and not a shape. */
  const isDiscountBillRow = (instrumentId: string): boolean => {
    const r = trancheRowOf(ctx.v2, instrumentId);
    if (r === undefined) return false;
    const S = ctx.v2.tranches;
    return isDiscountBill((S.maturityWeek[r] - S.originationWeek[r]) / 52);
  };
  // A share's price is its issuer's own cleared print. It is read off THIS week's companies —
  // `updatedCompanies` is what 07e wrote and stage 08 rebuilt — never off the week-start array.
  const companyById = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  const priceOfRow = (instrumentType: string, instrumentId: string): number | undefined => {
    const key = `${instrumentType}|${instrumentId}`;
    if (priceById.has(key)) return priceById.get(key);
    let p: number | undefined;
    // A tranche's price is in the price store, and a SOVEREIGN holding names a tranche too
    // (§9.13-SOV row 3) — 07c deposits its print there since §9.13-EQUITY, so a government BOND
    // marks like any other fixed-income holding.
    //
    // A DISCOUNT BILL IS EXCLUDED, AND THE REASON IS RULE 4. `bill-accretion` already owns a
    // bill holding's value: it accretes the position toward face week by week and books the
    // accretion as INCOME. Marking here as well would make two writers of one number and leave
    // the income booked against a value somebody else set — the identity drifting by exactly the
    // difference. The right end state is that the MARK owns the value and the income is the
    // mark's own delta, which also closes `short-term-debt.md` E2 (a bill accretes at a curve
    // nobody traded); that is a bill mechanism and it is §3's, inserted there rather than taken
    // here. 07f deposits the bill prints regardless, so the day it lands the price is waiting.
    if (isTrancheKind(instrumentType)
      || (holdingClassOf(instrumentType) === 'SOVEREIGN' && !isDiscountBillRow(instrumentId))) {
      p = trancheClearedPricePerFace(ctx.v2, instrumentId);
    } else if (instrumentType === 'EQUITY') {
      const c = companyById.get(instrumentId);
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
  registerBooks(ctx.updatedInstitutionalEntities.map((e) => e.id)).forEach((b) => {
    const r = markBookToMarket(ctx.v2, b.id, priceOfRow);
    rows += r.rows; markedLocal += r.deltaLocal;
  });
  if (process.env.REGISTER_MARK_TRACE === '1') {
    console.log(`  [register-mark] w${week} ${rows} rows re-marked, ${(markedLocal / 1e9).toFixed(2)}B of value moved`);
  }
}
