/**
 * PUB2a — the central bank's week, and the TGA's effect on bank reserves.
 *
 * Runs at the end of the week, after every flow that touches the treasury has posted (coupons in
 * stage 11, issuance settlement in 07c/07f).
 *
 * The mechanism worth having: the Treasury General Account is a LIABILITY of the central bank,
 * so a dollar moving into it leaves the banking system. Tax and issuance weeks drain reserves;
 * spending weeks return them. Banks short of their buffer then go to the repo market or the SRF,
 * which WS6 already built — so a fiscal event reaches the money market through the mechanism that
 * exists rather than through a coefficient.
 */

import { GameState, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import {
  centralBankAssetsUSD, remittanceUSD,
} from '../../../domain/central-bank';
import { sovereignCouponByBucket } from '../../../domain/government';
import { sovBucketKey } from './shared-helpers';
import { isActiveCompany } from '../../../domain/company';

export function runCentralBankStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const cb = reg?.centralBankSheet;
    if (!reg || !cb) return;

    const banks = ctx.updatedCompanies.filter(
      (c) => c.region === regionId && c.isBankEntity && isActiveCompany(c) && c.bankBalanceSheet
    );

    // ---- 1. The CB earns its own coupons and pays interest on reserves; the difference is
    // remitted to the treasury. Negative when policy exceeds the portfolio yield — a central bank
    // remitting nothing after a hiking cycle, reproduced rather than modelled separately. ----
    const couponByBucket = sovereignCouponByBucket(reg.govDebtTranches, sovBucketKey);
    const couponIncomeUSD = Object.entries(cb.sovereignHoldingsByTenor || {})
      .reduce((a, [k, v]) => a + ((Number(v) || 0) * (couponByBucket[k] ?? 0)) / 52, 0);
    const interestOnReservesPaidUSD = banks.reduce((a, c) => a + (c.bankBalanceSheet!.reservesInterestWeeklyUSD ?? 0), 0);
    // §5-CLOSE C5: the treasury PAYS the central bank its coupon — the calendar names every other
    // holder and this is the one holder whose date does not matter (it can never be short of
    // cash), so it is paid on the accrual, weekly. Without this leg the remittance below handed
    // the treasury coupon income it had never paid out: money from nobody, one coupon a week.
    if (couponIncomeUSD > 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'CENTRAL_BANK', region: regionId }, amountUSD: couponIncomeUSD, reason: 'sovereign coupon to the central bank' });
    }
    // The bill book's accretion is the central bank's income too (a discount bill pays no coupon;
    // its return is the pull to par, which the treasury pays at maturity), and it is remitted
    // with the coupons: a central bank keeps no retained earnings in this model, so its assets
    // are exactly its liabilities.
    const remitUSD = remittanceUSD(couponIncomeUSD + (cb.lastBillAccretionUSD ?? 0), interestOnReservesPaidUSD + (cb.lastReverseRepoInterestUSD ?? 0));

    // ---- 2. §5-CLOSE C5: THE TREASURY'S ACCOUNT MOVES BY PAYMENTS AND NOTHING ELSE. Every tax
    // is remitted by its payer, every outlay is paid to its payee, every coupon and redemption
    // goes to a holder, the auction pays for what it places — all through settlement, which
    // credits and debits the account with the reserve leg. The statement that used to be posted
    // here (revenue by formula, outlays by accrual, the settled legs subtracted back out) was
    // the last writer of the account that was not a payment, and its unpaid slices — a tax base
    // nobody paid, interest to holders that do not exist — were exactly M1's quarterly spikes.
    // The remittance is a payment too: the central bank's net income to the treasury (or, in a
    // loss week, the treasury's top-up of the central bank). ----
    if (remitUSD > 0) {
      pay(ctx, { payer: { kind: 'CENTRAL_BANK', region: regionId }, payee: { kind: 'GOVERNMENT', region: regionId }, amountUSD: remitUSD, reason: 'central bank remittance' });
    } else if (remitUSD < 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'CENTRAL_BANK', region: regionId }, amountUSD: -remitUSD, reason: 'treasury covers the central bank\'s loss' });
    }
    cb.lastRemittanceUSD = Math.round(remitUSD);

    // ---- 3. The reserve leg is the settlement pass's, and posting it here as well is the trap
    // §7.62 recorded: it broke the per-bank balance-sheet identity by exactly the coupon, on every
    // bank. Under CAL the coupon is a real payment from the treasury to a named holder, so its
    // reserve leg is struck where every other payment's is, and what is reported here is what the
    // treasury's account did — which is what a reserve drain means. ----
    cb.lastReserveDrainUSD = Math.round((-(reg.sovereignCouponPaidUSD ?? 0)));

    // ---- 4. §5-CLOSE: nothing closes the balance sheet here. Currency is a stored liability
    // the central bank issues on purpose; the identity holds when every reserve was bought, and
    // the audit's M1 prints the residual until it does. ----

    // Statistic, not a driver: the old `centralBankBalanceSheet` scalar's replacement.
    reg.centralBankBalanceSheet = Math.round(centralBankAssetsUSD(cb));
  });
}
