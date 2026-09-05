/**
 * The central bank's week, and the TGA's effect on bank reserves.
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

import { waysAndMeansOf } from '../../ledger/accounts';
import { centralBankSovereignAssetsLocal } from '../../sovereign-register';
import { currencyOf } from '../../../domain/geography';
import { GameState, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import {
  centralBankAssetsLocal, remittanceLocal,
} from '../../../domain/central-bank';

export function runCentralBankStage(state: GameState, ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const cb = reg.centralBankSheet;
    if (!cb) return;

    // ---- 1. The CB earns its own coupons and pays interest on reserves; the difference is
    // remitted to the treasury. Negative when policy exceeds the portfolio yield — a central bank
    // remitting nothing after a hiking cycle, reproduced rather than modelled separately. ----
    // §3.13e-ii: its coupon income is what ACCRUED on its book this week, recorded by the
    // sovereign calendar the way 02b records the interest on reserves it paid. It used to be
    // paid here, `face × coupon / 52` weekly and straight from the treasury, on the argument that
    // the one holder that can never be short of cash has no date — a second convention for one
    // thing. Now its rows accrue like every holder's and the date pays them like every holder's;
    // between the two the accrual sits on its rows as a receivable, on its sheet's asset side
    // (`centralBankSovereignAssetsLocal`), and the treasury's payable already counts it.
    const couponIncomeLocal = cb.lastCouponIncomeLocal ?? 0;
    // What 02b actually PAID, recorded by 02b at the moment it paid it. Re-summing the banks'
    // own fields here read a set resolution had already changed, so a bank that was paid its
    // interest and then resolved dropped out of the expense the remittance is meant to net.
    const interestOnReservesPaidLocal = cb.lastInterestOnReservesLocal ?? 0;
    // The ways-and-means advance costs the policy rate, paid like any interest.
    const waysAndMeansInterestLocal = (waysAndMeansOf(ctx.v2, regionId) * reg.policyRateAnnual) / 52;
    if (waysAndMeansInterestLocal > 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'CENTRAL_BANK', region: regionId }, amount: waysAndMeansInterestLocal, currency: currencyOf(regionId), reason: 'ways and means interest' });
    }
    // The bill book's accretion is the central bank's income too (a discount bill pays no coupon;
    // its return is the pull to par, which the treasury pays at maturity), and it is remitted
    // with the coupons: a central bank keeps no retained earnings in this model, so its assets
    // are exactly its liabilities.
    //...and the interest on its loans to the banks and its standing-facility repo book: income
    // it received as payments this week, remitted the same week — no retained earnings.
    const remitLocal = remittanceLocal(
      couponIncomeLocal + (cb.lastBillAccretionLocal ?? 0) + waysAndMeansInterestLocal
        + (cb.lastLoanInterestLocal ?? 0) + (cb.lastStandingFacilityInterestLocal ?? 0),
      interestOnReservesPaidLocal + (cb.lastReverseRepoInterestLocal ?? 0)
    );

    // ---- 2. THE TREASURY'S ACCOUNT MOVES BY PAYMENTS AND NOTHING ELSE. Every tax
    // is remitted by its payer, every outlay is paid to its payee, every coupon and redemption
    // goes to a holder, the auction pays for what it places — all through settlement, which
    // credits and debits the account with the reserve leg. The statement that used to be posted
    // here (revenue by formula, outlays by accrual, the settled legs subtracted back out) was
    // the last writer of the account that was not a payment, and its unpaid slices — a tax base
    // nobody paid, interest to holders that do not exist — were exactly M1's quarterly spikes.
    // The remittance is a payment too: the central bank's net income to the treasury (or, in a
    // loss week, the treasury's top-up of the central bank). ----
    if (remitLocal > 0) {
      pay(ctx, { payer: { kind: 'CENTRAL_BANK', region: regionId }, payee: { kind: 'GOVERNMENT', region: regionId }, amount: remitLocal, currency: currencyOf(regionId), reason: 'central bank remittance' });
    } else if (remitLocal < 0) {
      pay(ctx, { payer: { kind: 'GOVERNMENT', region: regionId }, payee: { kind: 'CENTRAL_BANK', region: regionId }, amount: -remitLocal, currency: currencyOf(regionId), reason: 'treasury covers the central bank\'s loss' });
    }
    cb.lastRemittanceLocal = Math.round(remitLocal);

    // ---- 3. The reserve leg is the settlement pass's, and posting it here as well is the trap
    // recorded: it broke the per-bank balance-sheet identity by exactly the coupon, on every
    // bank. Under CAL the coupon is a real payment from the treasury to a named holder, so its
    // reserve leg is struck where every other payment's is, and what is reported here is what the
    // treasury's account did — which is what a reserve drain means. §3.13e-ii: less the coupon the
    // date paid the central bank itself, the one leg of it that moves no bank's reserves. ----
    cb.lastReserveDrainLocal = Math.round((-((reg.sovereignCouponPaidLocal ?? 0) - (cb.lastCouponPaidLocal ?? 0))));

    // ---- 4.: nothing closes the balance sheet here. Currency is a stored liability
    // the central bank issues on purpose; the identity holds when every reserve was bought, and
    // the audit's M1 prints the residual until it does. ----

    // Statistic, not a driver: the old `centralBankBalanceSheet` scalar's replacement.
    reg.centralBankBalanceSheetLocal = Math.round(centralBankAssetsLocal(centralBankSovereignAssetsLocal(ctx.v2, regionId), cb, waysAndMeansOf(ctx.v2, regionId), currencyOf(regionId), ctx.fx));
  });
}
