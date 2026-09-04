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
 * One ledger, keyed `<region>|<bondId>|<partyKey>`, and it is the ONLY writer of the receivable
 * on either book — the bank's `sovereignAccruedCouponLocal` and the treasury's
 * `sovereignCouponPayableLocal` are the same balance seen from two sides. That is what makes them
 * incapable of drifting: the treasury pays exactly the sum of what its holders accrued.
 *
 * **The P&L stays smooth on both sides and only CASH is lumpy** — the same result the corporate
 * half reached (rule 8: an expense and a payment are different numbers with different periods).
 *
 * **Who is deliberately NOT on the calendar, and why.**
 *   - **Bills.** A discount bill pays no coupon at all; its whole return is accretion to par at
 *     redemption, which PUB3d already settles in the redemption leg. `sovereignCouponByBond`
 *     excludes them, so a bill simply never accrues here. This is also why the corporate
 *     treasuries are absent: short paper is all they hold.
 *   - **The central bank.** It earns its coupons and remits the profit to the treasury in the
 *     same week, on the same two accounts (the TGA and its own liability). Putting that round
 *     trip on a date moves a number out of one side of the central bank's sheet and back into it
 *     — no participant's behaviour depends on the timing, because the one holder in this model
 *     that can never be short of cash is the issuer of the cash.
 *   - There are no holders this model does not name (§5-CLOSE): every tranche is held, and a
 *     coupon reaches a holder of record on its date or is not paid.
 */

import { RegionId } from '../../../types';
import { bankPartyOf } from '../../../domain/party';
import { bankSovereignPositions } from '../../sovereign-register';
import { WeeklyStepContext } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { PartyRef, pay, partyKey, partyFromKey } from './settlement';
import { sovereignCouponByBond, sovereignCouponDueShare } from '../../../domain/government';
import { isActiveCompany } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { bookHeadOf, instrumentIdAt } from '../../../engine2/holdings';
import { internType, internRegion } from '../../../engine2/world';
import { materializeGovLadder } from '../../../engine2/tranches';
import { asInstrumentId } from '../../../domain/ids';

/** `<region>|<bondId>|<partyKey>` — the receivable one holder has against one bond. */

/**
 * THE HOLDER WALK, shared by the week and the seed. Every holder of record of a region's
 * sovereigns accrues `notional × coupon × weeks / 52` on the bond it actually holds: the
 * institutions off the register, the banks off their own books (the leg that could not be keyed
 * by institution id, and the reason this ledger is party-keyed at all). The central bank is
 * deliberately absent — see the header — and the corporate treasuries hold only short paper.
 *
 * `weeksOf` is what separates the two callers: the weekly stage passes 1, and the seed passes the
 * weeks each bond has run since its own last coupon date, so an aged ladder opens at what it has
 * genuinely accrued rather than at zero (§3.37-SEED / atlas the-seed D2).
 *
 * Returns what each BANK earned, for the caller to post as its equity leg.
 */
export function accrueSovereignHolders(
  ctx: {
    v2: WeeklyStepContext['v2'];
    updatedInstitutionalEntities: WeeklyStepContext['updatedInstitutionalEntities'];
    updatedCompanies: WeeklyStepContext['updatedCompanies'];
    sovereignAccruedInterestLocal: Map<string, number>;
  },
  regionId: RegionId,
  couponByBond: Record<string, number>,
  weeksOf: (bondId: string) => number,
): Map<string, number> {
  const accrued = ctx.sovereignAccruedInterestLocal;
  const bankEarnedLocal = new Map<string, number>();
  const accrue = (bondId: string, party: PartyRef, notional: number): number => {
    const coupon = couponByBond[bondId] ?? 0;
    const weeks = weeksOf(bondId);
    if (!(coupon > 0) || !(notional > 0) || !(weeks > 0)) return 0;
    const usd = (notional * coupon * weeks) / 52;
    if (!(usd > 0)) return 0;
    const k = accrualKey(regionId, bondId, party);
    accrued.set(k, (accrued.get(k) ?? 0) + usd);
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
      // §3.13-SOV row 3: the coupon accrues to the BOND the row names.
      accrue(instrumentIdAt(ctx.v2, r), { kind: 'INSTITUTION', id: entity.id }, H.qtyLocal[r]);
    }
  });
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || c.region !== regionId || !isActiveCompany(c)) return;
    let earnedLocal = 0;
    // §3.13-BOOK d3b: the bank's own book is its register rows, held by the BANK party (its
    // reserves buy it and its coupons land there) — the accrual is on FACE.
    bankSovereignPositions(ctx.v2, c.id).forEach((p) => {
      earnedLocal += accrue(p.bondId, bankPartyOf(c.id), p.faceLocal);
    });
    if (earnedLocal > 0) bankEarnedLocal.set(c.ticker, earnedLocal);
  });
  return bankEarnedLocal;
}

const accrualKey = (regionId: RegionId, bondId: string, party: PartyRef) =>
  `${regionId}|${bondId}|${partyKey(party)}`;

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
  accrued: Map<string, number>, regionId: RegionId, bondId: string, party: PartyRef, deltaLocal: number
): void {
  if (!Number.isFinite(deltaLocal) || deltaLocal === 0) return;
  const k = accrualKey(regionId, bondId, party);
  const next = (accrued.get(k) ?? 0) + deltaLocal;
  if (next === 0) accrued.delete(k); else accrued.set(k, next);
}

/**
 * Accrue this week's sovereign interest to every holder of record, then pay out the bonds whose
 * coupon falls due. Runs after every book that trades sovereigns has cleared and before the
 * fiscal stage, so the register it walks is the one the week ended with and the treasury's own
 * interest line is struck against the same holdings.
 */
export function runSovereignCalendarStage(ctx: WeeklyStepContext): void {
  const accrued = ctx.sovereignAccruedInterestLocal;
  /** What each BANK earned this week — its equity leg, posted once at the end. */
  const bankEarnedLocal = new Map<string, number>();

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    // §3.13-SOV row 2: the sovereign ladder comes from the ONE store.
    const ladder = materializeGovLadder(ctx.v2, regionId);
    const couponByBond = sovereignCouponByBond(ladder);
    // ---- 1 and 2. The holders of record — institutions on the register, banks on their own
    // books — accrue this week. One week each; the seed calls the same walk with the weeks each
    // bond has actually run since its last coupon date. ----
    accrueSovereignHolders(ctx, regionId, couponByBond, () => 1)
      .forEach((usd, ticker) => bankEarnedLocal.set(ticker, (bankEarnedLocal.get(ticker) ?? 0) + usd));

    // ---- 3. THE COUPON DATES. A bond whose date falls this week turns every holder's accrued
    // balance into cash — including a holder that has since sold out, because it earned it while
    // it held the paper. The treasury pays exactly the sum, so neither side can drift. ----
    const dueBonds = new Set(
      ladder.filter((b) => couponByBond[b.id] > 0 && sovereignCouponDueShare(b, ctx.nextWeek) > 0)
        .map((b) => b.id)
    );
    let paidLocal = 0;
    if (dueBonds.size > 0) {
      const cleared: string[] = [];
      accrued.forEach((amountLocal, k) => {
        const firstBar = k.indexOf('|');
        if (k.slice(0, firstBar) !== regionId) return;
        const secondBar = k.indexOf('|', firstBar + 1);
        // The accrual ledger keys `region|instrument|party` in one string; the middle field is
        // an instrument id and this is where it is read back as one (§3.13-BOOK slice (a)).
        if (!dueBonds.has(asInstrumentId(k.slice(firstBar + 1, secondBar))) || !(amountLocal > 0)) return;
        const payee = partyFromKey(k.slice(secondBar + 1));
        if (!payee) return;
        // A BANK is paid as BANK_SECURITIES rather than BANK: the coupon is not income arriving
        // now — the equity leg was posted the week it was EARNED — so this is one of the bank's
        // assets becoming another, the receivable turning into reserves. Routing it as BANK would
        // credit equity a second time, which is exactly the shape §7.62 caught in the CB stage.
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee,
          amount: amountLocal,
          currency: currencyOf(regionId),
          reason: 'sovereign coupon',
        });
        paidLocal += amountLocal;
        cleared.push(k);
      });
      cleared.forEach((k) => accrued.delete(k));
    }

    // ---- 4. The treasury's own side of the same balance, so its expense can stay smooth while
    // its account moves on the dates (stages/central-bank.ts reads the change in this level). ----
    reg.sovereignCouponPayableLocal = Math.round(sovereignAccruedPayableLocal(accrued, regionId));
    reg.sovereignCouponPaidLocal = Math.round(paidLocal);
  });

  // ---- 5. The banks' books. The receivable is SET to the ledger — one writer, so the holder's
  // asset is the issuer's payable by construction — and equity takes what was earned. Assets move
  // by (accrued - paid) + paid = accrued, equity by accrued: the identity holds either week. ----
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const earnedLocal = bankEarnedLocal.get(c.ticker) ?? 0;
    const key = `|${partyKey(bankPartyOf(c.id))}`;
    let heldLocal = 0;
    accrued.forEach((usd, k) => { if (k.endsWith(key)) heldLocal += usd; });
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
export function sovereignAccruedPayableLocal(
  accrued: Map<string, number>, regionId: RegionId
): number {
  let total = 0;
  accrued.forEach((usd, k) => { if (k.startsWith(`${regionId}|`)) total += usd; });
  return total;
}
