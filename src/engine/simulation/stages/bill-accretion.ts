/**
 * PUB3d / §9.13-BILL — a discount bill's return, WHICH IS THE PULL TO PAR THE MARKET PRINTED.
 *
 * A bill has no coupon. Its holder buys below par and is made whole at redemption, so the return
 * arrives as the position rising toward face over the bill's life. That rise is income: the asset
 * grows and equity grows with it, and no cash moves until the bill matures — which is exactly why
 * a bill's cash flow profile differs from a bond's.
 *
 * The conservation this preserves: the government receives discounted proceeds at issue and repays
 * FACE at redemption. The difference is its whole cost, and it equals what its holders accumulated
 * over the same period. Remove one leg without the other and the model either mints money or
 * destroys it — which is why bills stopped paying coupons and started accreting in the same change.
 *
 * **WHAT §9.13-BILL CHANGED, AND WHY IT IS THE SAME FINDING TWICE.** The rise was COMPUTED, at
 * `calculateNelsonSiegelZeroRate(yearsRemaining, yieldCurveParams)` — this week's FITTED curve, at
 * a tenor nobody had traded, and not the yield the holder bought at. That is
 * `short-term-debt.md` E2 in one line ("a discount computed from a curve nobody traded"), and it
 * broke the conservation above: the treasury pays `face/(1+y₀·t)` and repays `face` while the
 * holders accumulate at `yₜ`, and the two agree only if `y₀ = yₜ`. Nothing measured the gap.
 *
 * It is now READ: a bill's own auction prints a price every week (`07f` deposits it since
 * §9.13-EQUITY), and the week's return is what that price did. Both legs are then the same number
 * by construction, because the price the treasury sold at and the price the holder marks at are
 * the same print.
 *
 * **AND THE INSTITUTIONS' ROWS ARE NOT TOUCHED HERE.** An institution's bills are rows with a
 * quantity, so `register-marking` marks them `units × price` at the close like every other row —
 * one owner. The central bank's bills are rows too since §3.13-BOOK d3a; its accretion is the
 * same `units × price` mark, taken here so the remittance can read it the same week, and the
 * close's re-mark is then a no-op on those rows. What is left is the one book that is NOT in the
 * register: a bank's `sovereignBondHoldingsByBond`, which stores a VALUE per bill and no
 * quantity, so the only thing that can be applied to it is the price's own RATIO. That it holds a
 * value where its own auctions write a face is §3.13-BOOK d3b's finding — it cannot be fixed
 * here, because it needs the book in the register.
 */


import { RegionId } from '../../../types';
import { InstrumentId } from '../../../domain/ids';
import { WeeklyStepContext } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { isActiveCompany } from '../../../domain/company';
import { isDiscountBill } from '../../../domain/government';
import { materializeGovLadder } from '../../../engine2/tranches';
import { clearedPriceOf, priorClearedPriceOf } from '../../../engine2/prices';
import { markHolding, centralBankBookId } from '../../ledger/holdings-ledger';
import { centralBankPositions } from '../../sovereign-register';

/**
 * THE WEEK'S RETURN ON ONE UNIT OF THIS BILL'S FACE, as a fraction of what it was worth — what its
 * own price did between the last two sessions that printed it.
 *
 * Undefined until a bill has printed twice, which is a fact about its first week and not a zero:
 * a bill bought in the primary and marked in the same week's secondary has no prior print to have
 * moved from. `weeklyPriceMoveOf` is not this — it is the ABSOLUTE move, for a haircut, and a
 * return has a sign.
 */
function printedWeeklyReturn(ctx: WeeklyStepContext, billId: InstrumentId): number | undefined {
  const now = clearedPriceOf(ctx.v2, billId);
  const before = priorClearedPriceOf(ctx.v2, billId);
  if (now === undefined || before === undefined || !(before > 0)) return undefined;
  return now / before - 1;
}

export function runBillAccretionStage(ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const returnByBill = new Map<string, number>();
    materializeGovLadder(ctx.v2, regionId)
      .filter((t) => t.maturityWeek > ctx.nextWeek && isDiscountBill(t.tenorAtIssuanceYears))
      .forEach((t) => {
        const r = printedWeeklyReturn(ctx, t.id);
        if (r !== undefined && r !== 0) returnByBill.set(t.id, r);
      });
    if (returnByBill.size === 0) return;

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
      const byBill = { ...(existing.sovereignBondHoldingsByBond || {}) };
      let gainLocal = 0;
      returnByBill.forEach((weekReturn, billId) => {
        const heldLocal = Number(byBill[billId]) || 0;
        if (heldLocal <= 0) return;
        const gain = heldLocal * weekReturn;
        byBill[billId] = heldLocal + gain;
        gainLocal += gain;
      });
      if (gainLocal === 0 && !(existing.lastBillAccretionWeeklyLocal ?? 0)) return c;
      return {
        ...c,
        bankBalanceSheet: {
          ...bookPnL(existing, gainLocal, 'bill accretion', c.ticker),
          sovereignBondHoldingsByBond: byBill,
          sovereignBondHoldingsLocal: Math.round(Object.values(byBill).reduce((a: number, v) => a + (Number(v) || 0), 0)),
          // §7.254: recorded so next week's NIM income measure counts the return this book
          // actually earned; the equity leg above is the booking, this line is the reading.
          lastBillAccretionWeeklyLocal: Math.round(gainLocal),
        },
      };
    });

    // The central bank's bill book moves too — its income is remitted to the treasury, which is
    // the loop PUB2a built. §3.13-BOOK d3a: its bills are REGISTER ROWS with a face, so the
    // accretion is OBSERVED here the way `register-marking` observes it for every row —
    // `units × price`, at the bill's own print — and the remittance reads the number the same
    // week. The close's re-mark then finds the row already there (the same formula, no move).
    const cb = reg.centralBankSheet;
    if (cb) {
      let gainLocal = 0;
      centralBankPositions(ctx.v2, regionId).forEach((p) => {
        if (!returnByBill.has(p.bondId)) return;
        const price = clearedPriceOf(ctx.v2, p.bondId);
        if (price === undefined || !(p.faceLocal > 0)) return;
        const markedLocal = p.faceLocal * price;
        gainLocal += markedLocal - p.valueLocal;
        markHolding(ctx.v2, centralBankBookId(regionId), p.row, markedLocal);
      });
      cb.lastBillAccretionLocal = gainLocal !== 0 ? Math.round(gainLocal) : 0;
    }
  });
}
