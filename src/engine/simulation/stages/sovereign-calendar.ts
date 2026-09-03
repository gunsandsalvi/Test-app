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
 * on either book — the bank's `sovereignAccruedCouponUSD` and the treasury's
 * `sovereignCouponPayableUSD` are the same balance seen from two sides. That is what makes them
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
import { WeeklyStepContext } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { PartyRef, pay, partyKey, partyFromKey } from './settlement';
import { sovereignCouponByBond, sovereignCouponDueShare } from '../../../domain/government';
import { isActiveCompany } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { bookHeadOf } from '../../../engine2/holdings';
import { internString } from '../../../engine2/world';
import { materializeGovLadder } from '../../../engine2/tranches';

/** `<region>|<bondId>|<partyKey>` — the receivable one holder has against one bond. */
const accrualKey = (regionId: RegionId, bondId: string, party: PartyRef) =>
  `${regionId}|${bondId}|${partyKey(party)}`;


/**
 * Accrue this week's sovereign interest to every holder of record, then pay out the bonds whose
 * coupon falls due. Runs after every book that trades sovereigns has cleared and before the
 * fiscal stage, so the register it walks is the one the week ended with and the treasury's own
 * interest line is struck against the same holdings.
 */
export function runSovereignCalendarStage(ctx: WeeklyStepContext): void {
  const accrued = ctx.sovereignAccruedInterestUSD;
  /** What each BANK earned this week — its equity leg, posted once at the end. */
  const bankEarnedUSD = new Map<string, number>();

  REGION_IDS.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    // §3.13-SOV row 2: the sovereign ladder comes from the ONE store.
    const ladder = materializeGovLadder(ctx.v2, regionId);
    const couponByBond = sovereignCouponByBond(ladder);

    /** One holder's week of interest on one bond, at that bond's own coupon. */
    const accrue = (bondId: string, party: PartyRef, notionalUSD: number): number => {
      const coupon = couponByBond[bondId] ?? 0;
      if (!(coupon > 0) || !(notionalUSD > 0)) return 0;
      const weeklyUSD = (notionalUSD * coupon) / 52;
      if (!(weeklyUSD > 0)) return 0;
      const k = accrualKey(regionId, bondId, party);
      accrued.set(k, (accrued.get(k) ?? 0) + weeklyUSD);
      return weeklyUSD;
    };

    // ---- 1. The institutions, off the register. Their cash arrives on the date; the income
    // statement is struck in institutional-balance-sheet.ts, where it stays smooth. ----
    // §7.307 holdings flip: row walk — a non-GOV_BOND or foreign row costs two int compares.
    const H = ctx.v2.holdings;
    const govBondRef = internString(ctx.v2, 'GOV_BOND');
    const regionRef = internString(ctx.v2, regionId);
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      if (entity.isDefaulted) return;
      for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== govBondRef || H.regionRef[r] !== regionRef) continue;
        // §3.13-SOV row 3: the coupon accrues to the BOND the row names.
        const bondId = ctx.v2.internedStrings[H.instrRef[r]];
        accrue(bondId, { kind: 'INSTITUTION', id: entity.id }, H.qtyUSD[r]);
      }
    });

    // ---- 2. The banks, off their own per-tenor books. This is the leg that could not be keyed
    // by institution id, and the reason the ledger is party-keyed at all. ----
    ctx.updatedCompanies.forEach((c) => {
      if (!c.isBankEntity || !c.bankBalanceSheet || c.region !== regionId || !isActiveCompany(c)) return;
      let earnedUSD = 0;
      Object.entries(c.bankBalanceSheet.sovereignBondHoldingsByBond || {}).forEach(([bondId, usd]) => {
        earnedUSD += accrue(bondId, { kind: 'BANK_SECURITIES', ticker: c.ticker }, Number(usd) || 0);
      });
      if (earnedUSD > 0) bankEarnedUSD.set(c.ticker, (bankEarnedUSD.get(c.ticker) ?? 0) + earnedUSD);
    });

    // ---- 3. THE COUPON DATES. A bond whose date falls this week turns every holder's accrued
    // balance into cash — including a holder that has since sold out, because it earned it while
    // it held the paper. The treasury pays exactly the sum, so neither side can drift. ----
    const dueBonds = new Set(
      ladder.filter((b) => couponByBond[b.id] > 0 && sovereignCouponDueShare(b, ctx.nextWeek) > 0)
        .map((b) => b.id)
    );
    let paidUSD = 0;
    if (dueBonds.size > 0) {
      const cleared: string[] = [];
      accrued.forEach((amountUSD, k) => {
        const firstBar = k.indexOf('|');
        if (k.slice(0, firstBar) !== regionId) return;
        const secondBar = k.indexOf('|', firstBar + 1);
        if (!dueBonds.has(k.slice(firstBar + 1, secondBar)) || !(amountUSD > 0)) return;
        const payee = partyFromKey(k.slice(secondBar + 1));
        if (!payee) return;
        // A BANK is paid as BANK_SECURITIES rather than BANK: the coupon is not income arriving
        // now — the equity leg was posted the week it was EARNED — so this is one of the bank's
        // assets becoming another, the receivable turning into reserves. Routing it as BANK would
        // credit equity a second time, which is exactly the shape §7.62 caught in the CB stage.
        pay(ctx, {
          payer: { kind: 'GOVERNMENT', region: regionId },
          payee,
          amount: amountUSD,
          currency: currencyOf(regionId),
          reason: 'sovereign coupon',
        });
        paidUSD += amountUSD;
        cleared.push(k);
      });
      cleared.forEach((k) => accrued.delete(k));
    }

    // ---- 4. The treasury's own side of the same balance, so its expense can stay smooth while
    // its account moves on the dates (stages/central-bank.ts reads the change in this level). ----
    reg.sovereignCouponPayableUSD = Math.round(sovereignAccruedPayableUSD(accrued, regionId));
    reg.sovereignCouponPaidUSD = Math.round(paidUSD);
  });

  // ---- 5. The banks' books. The receivable is SET to the ledger — one writer, so the holder's
  // asset is the issuer's payable by construction — and equity takes what was earned. Assets move
  // by (accrued - paid) + paid = accrued, equity by accrued: the identity holds either week. ----
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return;
    const earnedUSD = bankEarnedUSD.get(c.ticker) ?? 0;
    const key = `|${partyKey({ kind: 'BANK_SECURITIES', ticker: c.ticker })}`;
    let heldUSD = 0;
    accrued.forEach((usd, k) => { if (k.endsWith(key)) heldUSD += usd; });
    if (earnedUSD === 0 && heldUSD === (c.bankBalanceSheet.sovereignAccruedCouponUSD ?? 0)) return;
    c.bankBalanceSheet = {
      ...bookPnL(c.bankBalanceSheet, earnedUSD, 'sovereign coupon accrual', c.ticker),
      sovereignAccruedCouponUSD: heldUSD,
    };
  });
}

/**
 * What the treasury has ACCRUED but not yet paid on its bond stack — its own side of the same
 * receivable, so the reported interest line stays smooth while the cash is lumpy.
 */
export function sovereignAccruedPayableUSD(
  accrued: Map<string, number>, regionId: RegionId
): number {
  let total = 0;
  accrued.forEach((usd, k) => { if (k.startsWith(`${regionId}|`)) total += usd; });
  return total;
}
