/**
 * CAL, second half — THE SOVEREIGN CALENDAR. Interest on government paper accrues to whoever
 * holds it that week, and the bond's own coupon date turns each holder's accrued balance into cash.
 *
 * **Why this is one pass and not three.** The corporate half (§7.194) put holders on the coupon
 * dates and the issuer on the same dates in the same change, because interest earned continuously
 * and paid discretely is a RECEIVABLE in between and both sides have to see it. The sovereign
 * half was deferred on the grounds that half of it measured worse than none — which is true, and
 * which rule 11 already answers: build the whole thing before measuring. The whole thing is three
 * legs that must move together:
 *
 *   - the **treasury's expense**, which was smooth while the holders were about to become lumpy;
 *   - the **institutions'** credit, which the register already knows how to accrue;
 *   - the **banks'** credit — and this is the piece that made it awkward, because **a bank is not
 *     on the institutional register.** It holds sovereigns directly, bond by bond, on its own
 *     balance sheet. So the accrual cannot be keyed by institution id; it is keyed by PARTY.
 *
 * §3.13-BOOK f4b: the receivable is a COLUMN OF THE REGISTER ROW it accrues on
 * (`holdings.ts:accruedLocal`), on whichever book holds the bond — an institution's, a bank's
 * own, a desk's — and this stage is its only writer on the sovereign side. The bank's
 * `sovereignAccruedCouponLocal` and the treasury's `sovereignCouponPayableLocal` are reads of the
 * same rows from two sides. That is what makes them incapable of drifting: the treasury pays
 * exactly the sum of what its holders accrued.
 *
 * **The P&L stays smooth on both sides and only CASH is lumpy** — the same result the corporate
 * half reached (rule 8: an expense and a payment are different numbers with different periods).
 *
 * **Who is deliberately NOT on the calendar, and why.**
 *   - **Bills.** A discount bill pays no coupon at all; its whole return is accretion to par at
 *     redemption, which PUB3d already settles in the redemption leg. `sovereignCouponByBond`
 *     excludes them, so a bill simply never accrues here. This is also why the corporate
 *     treasuries are absent: short paper is all they hold.
 *   - Nobody else. §3.13e-ii: the **central bank** used to be — paid `face × coupon / 52` weekly
 *     by `central-bank.ts`, straight from the treasury, on the argument that a holder that can
 *     never be short of cash has no date. That was a second convention for one thing. Its book
 *     accrues on its rows like every holder's, the date pays it like every holder's, its income
 *     is what accrued (`lastCouponIncomeLocal`, which the remittance nets), and its receivable is
 *     a read of its book (`sovereign-register.ts:centralBankSovereignAssetsLocal`).
 *   - There are no holders this model does not name (§5-CLOSE): every tranche is held, and a
 *     coupon reaches a holder of record on its date or is not paid.
 */

import { RegionId } from '../../../types';
import { bankSovereignPositions, centralBankPositions } from '../../sovereign-register';
import { WeeklyStepContext } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { accrueInterestOnRow, settleAccruedOnRow, closeEmptyPositions, registerBooks, bookIdOfParty, deskBookId } from '../../ledger/holdings-ledger';
import { deskRowsOf } from '../../desk-register';
import { bookAccruedLocal, rowUnits } from '../../../engine2/holdings';
import { typeRefOf, instrumentRefOf } from '../../../engine2/world';
import { defect } from '../../../domain/defect';
import { PartyRef, pay, partyKey } from './settlement';
import { sovereignCouponByBond, sovereignCouponDueShare } from '../../../domain/government';
import { isActiveCompany } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { bookHeadOf, instrumentIdAt } from '../../../engine2/holdings';
import { internType, internRegion } from '../../../engine2/world';
import { materializeGovLadder } from '../../../engine2/tranches';


/**
 * THE HOLDER WALK, shared by the week and the seed. Every holder of record of a region's
 * sovereigns accrues `notional × coupon × weeks / 52` on the bond it actually holds: the
 * institutions off the register, the banks off their own books (the leg that could not be keyed
 * by institution id, and the reason this ledger is party-keyed at all), the central bank off its
 * own book (§3.13e-ii) — and the corporate treasuries hold only short paper.
 *
 * `weeksOf` is what separates the two callers: the weekly stage passes 1, and the seed passes the
 * weeks each bond has run since its own last coupon date, so an aged ladder opens at what it has
 * genuinely accrued rather than at zero (§3.37-SEED / atlas the-seed D2).
 *
 * Returns what each BANK earned, for the caller to post as its equity leg, and what the CENTRAL
 * BANK earned, which is its coupon income for the remittance.
 */
export function accrueSovereignHolders(
  ctx: {
    v2: WeeklyStepContext['v2'];
    updatedInstitutionalEntities: WeeklyStepContext['updatedInstitutionalEntities'];
    updatedCompanies: WeeklyStepContext['updatedCompanies'];
  },
  regionId: RegionId,
  couponByBond: Record<string, number>,
  weeksOf: (bondId: string) => number,
): { bankEarnedLocal: Map<string, number>; centralBankEarnedLocal: number } {
  const bankEarnedLocal = new Map<string, number>();
  // §3.13-BOOK f4b: onto the ROW that holds the bond.
  const accrue = (bondId: string, row: number, notional: number): number => {
    const coupon = couponByBond[bondId] ?? 0;
    const weeks = weeksOf(bondId);
    if (!(coupon > 0) || !(notional > 0) || !(weeks > 0)) return 0;
    const usd = (notional * coupon * weeks) / 52;
    if (!(usd > 0)) return 0;
    accrueInterestOnRow(ctx.v2, row, usd);
    return usd;
  };
  // §7.307 holdings flip: row walk — a non-GOV_BOND or foreign row costs two int compares.
  const H = ctx.v2.holdings;
  const govBondRef = internType(ctx.v2, 'GOV_BOND');
  const regionRef = internRegion(ctx.v2, regionId);
  ctx.updatedInstitutionalEntities.forEach((entity) => {
    if (entity.isDefaulted) return;
    for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = H.next[r]) {
      if (H.typeRef[r] !== govBondRef || H.regionRef[r] !== regionRef) continue;
      // §3.13-SOV row 3: the coupon accrues to the BOND the row names — on its FACE (§3.13-BOOK
      // f4b: this read the row's marked VALUE while the banks below accrued on face, so the same
      // bond paid a discounted holder less of the same coupon; a coupon follows face).
      accrue(instrumentIdAt(ctx.v2, r), r, rowUnits(H, r));
    }
  });
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || c.region !== regionId || !isActiveCompany(c)) return;
    let earnedLocal = 0;
    // §3.13-BOOK d3b: the bank's own book is its register rows, held by the BANK party (its
    // reserves buy it and its coupons land there) — the accrual is on FACE.
    bankSovereignPositions(ctx.v2, c.id).forEach((p) => {
      earnedLocal += accrue(p.bondId, p.row, p.faceLocal);
    });
    // §3.13e-i — THE DESK IS A HOLDER OF RECORD TOO. Its govvie inventory sits on its own book
    // (the bills and the bonds share one kind; a bill has no coupon and accrues nothing here) and
    // earns the coupon on what it is LONG, the bank's income the week it is earned like its own
    // book's; a short accrues nothing — the paper it sold is on a holder that does.
    deskRowsOf(ctx.v2, c.id, 'GOV_BOND').forEach((p) => {
      earnedLocal += accrue(p.instrumentId, p.row, Math.max(0, p.units));
    });
    if (earnedLocal > 0) bankEarnedLocal.set(c.ticker, earnedLocal);
  });
  // §3.13e-ii — THE CENTRAL BANK IS A HOLDER OF RECORD. Its book accrues on FACE like a bank's
  // own; its income is what accrued, and it keeps none of it (the remittance nets it the same
  // week, `central-bank.ts`), so what it is owed sits on its rows as a receivable until the date.
  let centralBankEarnedLocal = 0;
  centralBankPositions(ctx.v2, regionId).forEach((p) => {
    centralBankEarnedLocal += accrue(p.bondId, p.row, p.faceLocal);
  });
  return { bankEarnedLocal, centralBankEarnedLocal };
}

/**
 * §3.13b / `../../../../docs/instruments/bond.md` N9.b — THE ACCRUED RE-KEYS WHEN THE PAPER MOVES.
 *
 * A quoted bond price is a CLEAN price: the interest that has accrued since the last coupon date
 * is paid by the buyer to the seller on top of it. The cash leg settles through the book's own
 * clearing house (`book-settlement.ts`); this is the other half — the BALANCE moving with the
 * face, so that the coupon date pays the accrued to whoever bought it rather than to whoever
 * happened to earn it. Without it the seller financed the issuer interest-free until the date.
 *
 * A balance that reaches zero leaves the ledger, exactly as the payout path leaves it.
 */
export function moveSovereignAccrued(
  ctx: { pendingAccruedMoves: { bookId: string; instrumentType: string; instrumentId: string; usd: number }[] },
  regionId: RegionId, bondId: string, party: PartyRef, deltaLocal: number
): void {
  void regionId;
  if (!Number.isFinite(deltaLocal) || deltaLocal === 0) return;
  // §3.13-BOOK f4b: onto the holder's row of the bond, once the write-back has made it
  // (`finalizeHoldingsStore`). A company's treasury book is its own id (`holderIdOf`).
  const bookId = bookIdOfParty(party) ?? (party.kind === 'COMPANY' ? party.id : undefined);
  if (bookId === undefined) return defect(`sovereign accrued moved to ${partyKey(party)}, which holds on no register book`);
  ctx.pendingAccruedMoves.push({ bookId, instrumentType: 'GOV_BOND', instrumentId: bondId, usd: deltaLocal });
}

/**
 * Accrue this week's sovereign interest to every holder of record, then pay out the bonds whose
 * coupon falls due. Runs after every book that trades sovereigns has cleared and before the
 * fiscal stage, so the register it walks is the one the week ended with and the treasury's own
 * interest line is struck against the same holdings.
 */
export function runSovereignCalendarStage(ctx: WeeklyStepContext): void {
  const H = ctx.v2.holdings;
  const govBondRef = typeRefOf(ctx.v2, 'GOV_BOND');
  const books = registerBooks(ctx.updatedInstitutionalEntities.map((e) => e.id), ctx.updatedCompanies);
  /** What each BANK earned this week — its equity leg, posted once at the end. */
  const bankEarnedLocal = new Map<string, number>();

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    // §3.13-SOV row 2: the sovereign ladder comes from the ONE store.
    const ladder = materializeGovLadder(ctx.v2, regionId);
    const couponByBond = sovereignCouponByBond(ladder);
    // ---- 1 and 2. The holders of record — institutions on the register, banks on their own
    // books and their desks, the central bank on its — accrue this week. One week each; the seed
    // calls the same walk with the weeks each bond has actually run since its last coupon date. ----
    const earned = accrueSovereignHolders(ctx, regionId, couponByBond, () => 1);
    earned.bankEarnedLocal.forEach((usd, ticker) => bankEarnedLocal.set(ticker, (bankEarnedLocal.get(ticker) ?? 0) + usd));
    // §3.13e-ii: the central bank's coupon income IS its accrual — recorded here the way 02b
    // records the interest on reserves it paid, and read by the remittance at the week's end.
    const cb = reg.centralBankSheet;
    if (cb) cb.lastCouponIncomeLocal = Math.round(earned.centralBankEarnedLocal);

    // ---- 3. THE COUPON DATES. A bond whose date falls this week turns every holder's accrued
    // balance into cash — including a holder that has since sold out, because it earned it while
    // it held the paper. The treasury pays exactly the sum, so neither side can drift. ----
    const dueBonds = new Set(
      ladder.filter((b) => couponByBond[b.id] > 0 && sovereignCouponDueShare(b, ctx.nextWeek) > 0)
        .map((b) => b.id)
    );
    let paidLocal = 0;
    /** §3.13e-ii: the part of it paid to the central bank — a TGA flow with no reserve leg. */
    let centralBankPaidLocal = 0;
    if (dueBonds.size > 0 && govBondRef >= 0) {
      // §3.13-BOOK f4b: every register book's rows of a due bond are paid what they are owed, to
      // the book's own party, and cleared. A BANK's own book is paid as BANK: the coupon is not
      // income arriving now — the equity leg was posted the week it was EARNED — so this is one
      // of the bank's assets becoming another, the receivable turning into reserves.
      const dueRefs = new Set<number>();
      dueBonds.forEach((id) => { const ref = instrumentRefOf(ctx.v2, id); if (ref >= 0) dueRefs.add(ref); });
      const regionRef = internRegion(ctx.v2, regionId);
      const touched = new Set<string>();
      books.forEach((book) => {
        for (let r = bookHeadOf(ctx.v2, book.id); r >= 0; r = H.next[r]) {
          if (H.typeRef[r] !== govBondRef || H.regionRef[r] !== regionRef || !dueRefs.has(H.instrRef[r])) continue;
          const amountLocal = H.accruedLocal[r];
          if (!(amountLocal > 0)) { if (amountLocal !== 0) settleAccruedOnRow(ctx.v2, r, amountLocal); continue; }
          pay(ctx, {
            payer: { kind: 'GOVERNMENT', region: regionId },
            payee: book.payee,
            amount: amountLocal,
            currency: currencyOf(regionId),
            reason: 'sovereign coupon',
          });
          paidLocal += amountLocal;
          if (book.payee.kind === 'CENTRAL_BANK') centralBankPaidLocal += amountLocal;
          settleAccruedOnRow(ctx.v2, r, amountLocal);
          touched.add(book.id);
        }
      });
      touched.forEach((bookId) => closeEmptyPositions(ctx.v2, bookId));
    }

    // ---- 4. The treasury's own side of the same balance, so its expense can stay smooth while
    // its account moves on the dates (stages/central-bank.ts reads the change in this level). ----
    reg.sovereignCouponPayableLocal = Math.round(sovereignAccruedPayableLocal(ctx.v2, regionId));
    reg.sovereignCouponPaidLocal = Math.round(paidLocal);
    if (cb) cb.lastCouponPaidLocal = Math.round(centralBankPaidLocal);
  });

  // ---- 5. The banks' books. The receivable is SET to the ledger — one writer, so the holder's
  // asset is the issuer's payable by construction — and equity takes what was earned. Assets move
  // by (accrued - paid) + paid = accrued, equity by accrued: the identity holds either week. ----
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const earnedLocal = bankEarnedLocal.get(c.ticker) ?? 0;
    // §3.13-BOOK f4b: what the bank is owed — its own book's rows and its desk's (13e-i), read.
    const heldLocal = bookAccruedLocal(ctx.v2, c.id) + bookAccruedLocal(ctx.v2, deskBookId(c.id));
    if (earnedLocal === 0 && heldLocal === (c.bankBalanceSheet.sovereignAccruedCouponLocal ?? 0)) return;
    c.bankBalanceSheet = {
      ...bookPnL(c.bankBalanceSheet, earnedLocal, 'sovereign coupon accrual', c.ticker),
      sovereignAccruedCouponLocal: heldLocal,
    };
  });
}

/**
 * What the treasury has ACCRUED but not yet paid on its bond stack — its own side of the same
 * receivable, so the reported interest line stays smooth while the cash is lumpy.
 */
export function sovereignAccruedPayableLocal(v2: WeeklyStepContext['v2'], regionId: RegionId): number {
  // §3.13-BOOK f4b: every GOV_BOND row of this region's paper, whoever holds it.
  const H = v2.holdings;
  const govBondRef = typeRefOf(v2, 'GOV_BOND');
  if (govBondRef < 0) return 0;
  const regionRef = internRegion(v2, regionId);
  let total = 0;
  for (let r = 0; r < H.used; r++) {
    if (H.typeRef[r] === govBondRef && H.regionRef[r] === regionRef) total += H.accruedLocal[r];
  }
  return total;
}
