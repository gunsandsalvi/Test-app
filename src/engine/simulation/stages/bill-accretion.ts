/**
 * PUB3d — a discount bill's return, paid the way a discount bill actually pays it.
 *
 * A bill has no coupon. Its holder buys below par and is made whole at redemption, so the return
 * arrives as the position ACCRETING toward face over the bill's life. That accretion is income:
 * the asset grows and equity grows with it, and no cash moves until the bill matures — which is
 * exactly why a bill's cash flow profile differs from a bond's.
 *
 * The conservation this preserves: the government receives discounted proceeds at issue and repays
 * FACE at redemption. The difference is its whole cost, and it equals the accretion its holders
 * accumulated over the same period. Remove one leg without the other and the model either mints
 * money or destroys it — which is why bills stopped paying coupons and started accreting in the
 * same change.
 */


import { RegionId, GameState } from '../../../types';
import { Region } from '../../../domain/region-macro';
import { WeeklyStepContext } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { isActiveCompany } from '../../../domain/company';
import { isDiscountBill } from '../../../domain/government';
import { materializeGovLadder } from '../../../engine2/tranches';
import { calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { bookHeadOf } from '../../../engine2/holdings';
import { markHolding } from '../../ledger/holdings-ledger';
import { internString } from '../../../engine2/world';

/**
 * §3.13-SOV row 3 — THE ACCRETION IS THE BILL'S, AT THE BILL'S OWN REMAINING LIFE.
  *
 * A bill pulls to par at the yield the auction cleared for IT. That yield is read off the same
 * fitted curve 07f priced it on (`billCurrentYieldBps`), at the same remaining tenor, so the
 * paper accretes at the rate it was sold at. It used to be read off a table of three bucket
 * labels — and once the books were keyed by bill id, `byTenor['b13']` matched nothing and every
 * holder's accretion silently became zero.
 */
function weeklyAccretionRate(reg: Region, yearsRemaining: number): number {
  return calculateNelsonSiegelZeroRate(yearsRemaining, reg.yieldCurveParams) / 52;
}

export function runBillAccretionStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const rateByBill = new Map<string, number>(
      materializeGovLadder(ctx.v2, regionId)
        .filter((t) => t.maturityWeek > ctx.nextWeek && isDiscountBill(t.tenorAtIssuanceYears))
        .map((t) => [t.id, weeklyAccretionRate(reg, Math.max(1 / 52, (t.maturityWeek - state.currentWeek) / 52))])
    );
    if (rateByBill.size === 0) return;

    // Banks: the position grows and the gain is earnings. Both sides move, so the per-bank
    // balance-sheet identity holds without a cash leg.
    // §7.250 — THE LIVE SHEET, both sides. This stage runs AFTER stage 08, and only stage 08
    // ever applies `companyUpdates.bankBalanceSheet` — so writing the channel here wrote to
    // NOWHERE (the context dies with the week), and reading it first read the PRE-08 sheet,
    // erasing settlement's intraday deltas from the basis besides. Measured: the accreted bill
    // book was written as 1,218.45M and the week ended at 1,217.28M — the banks' bills have never
    // accreted, silently, because both legs dropped together and no identity could break
    // (§7.103's trap, on the write side).
    ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
      if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return c;
      const existing = c.bankBalanceSheet;
      const byTenor = { ...(existing.sovereignBondHoldingsByBond || {}) };
      let gainUSD = 0;
      rateByBill.forEach((rate, key) => {
        const heldUSD = Number(byTenor[key]) || 0;
        if (heldUSD <= 0 || rate === 0) return;
        const accretedUSD = heldUSD * rate;
        byTenor[key] = heldUSD + accretedUSD;
        gainUSD += accretedUSD;
      });
      if (gainUSD === 0 && !(existing.lastBillAccretionWeeklyUSD ?? 0)) return c;
      return {
        ...c,
        bankBalanceSheet: {
          ...bookPnL(existing, gainUSD, 'bill accretion', c.ticker),
          sovereignBondHoldingsByBond: byTenor,
          sovereignBondHoldingsUSD: Math.round(Object.values(byTenor).reduce((a: number, v) => a + (Number(v) || 0), 0)),
          // §7.254: recorded so next week's NIM income measure counts the return this book
          // actually earned; the equity leg above is the booking, this line is the reading.
          lastBillAccretionWeeklyUSD: Math.round(gainUSD),
        },
      };
    });

    // Institutions: the holding grows; the book's own marking treats it as the income it is.
    // §7.313 flip — the accretion lands on the rows in place; the view refreshes at week end.
    const H = ctx.v2.holdings;
    const govBondRef = internString(ctx.v2, 'GOV_BOND');
    const regionRef = internString(ctx.v2, regionId);
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.region !== regionId) return;
      let touched = false;
      for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== govBondRef || H.regionRef[r] !== regionRef) continue;
        // §3.13-SOV row 3: the accretion is the BILL's own.
        const rate = rateByBill.get(ctx.v2.internedStrings[H.instrRef[r]]);
        if (!rate) continue;
        markHolding(ctx.v2, e.id, r, H.qtyUSD[r] * (1 + rate));
        touched = true;
      }
      void touched;
    });

    // The central bank's bill book accretes too — its income is remitted to the treasury, which
    // is the loop PUB2a built.
    const cb = reg.centralBankSheet;
    if (cb) {
      const book = { ...cb.sovereignHoldingsByBond };
      let gainUSD = 0;
      rateByBill.forEach((rate, key) => {
        const heldUSD = Number(book[key]) || 0;
        if (heldUSD <= 0 || rate === 0) return;
        book[key] = heldUSD * (1 + rate);
        gainUSD += heldUSD * rate;
      });
      if (gainUSD > 0) {
        cb.sovereignHoldingsByBond = book;
        cb.lastBillAccretionUSD = Math.round(gainUSD);
      } else {
        cb.lastBillAccretionUSD = 0;
      }
    }
  });
}
