/**
 * §3.13c-REVAL — THE WEEK OPENS ON A NEW RATE, AND EVERY FOREIGN BALANCE IS WORTH SOMETHING ELSE.
 *
 * A balance held in a money that is not yours changes value when the rate moves. Nobody paid
 * anybody, so it is not a payment and it cannot go through `pay()`; it is a MARK, and the holder
 * takes it as an unrealised gain or loss. That is what a translation gain is, and until this
 * stage existed the model had nowhere to put one — `trade-settlement.ts`'s invoice gap was the
 * only instance of it anybody had written.
 *
 * **Most of it needs no booking at all.** A ledger read already revalues: `cashOf`,
 * `entityCashOf` and `bankReservesOf` convert every row at the rate in force, so a firm's cash is
 * worth what it is worth the moment the rate changes. What breaks is the STORED numbers beside
 * those reads — a bank's equity, a central bank's sheet — written in a week whose rate is gone.
 * Those are what this stage moves, and it moves each by exactly what the read moved by.
 *
 * **The method is the honest one:** value the book at the OLD rate, promote the rate, value it
 * again, book the difference. No formula and no assumed exposure — the difference between two
 * reads of the same balances IS the exposure.
 *
 * Runs first in the week, before any stage has read a rate, so nothing sees the old rate after
 * the promotion or the new one before it.
 */

import { GameState, RegionId } from '../../../types';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { openFxWeek } from '../../../engine2/world';
import { centralBankAssetsLocal, centralBankLiabilitiesLocal } from '../../../domain/central-bank';
import { centralBankBookLocal } from '../../sovereign-register';
import { bankReservesOf, treasuryAccountOf, waysAndMeansOf, stateDepositLines } from '../../ledger/accounts';
import { depositsOf } from '../../../domain/banking';
import { banksOf } from '../../../domain/company';
import type { Ticker } from '../../../domain/ids';

/** Below this the move is float dust on a sum of billions, not a revaluation (rule 7). */
const MIN_MARK = 1e-6;

/**
 * A bank's FX-exposed net worth: the only asset it holds in other people's money is its reserves,
 * and the only liability is what its depositors hold there. Every other line on the sheet is a
 * stored local-money number and does not move with a rate.
 */
const bankNetOf = (state: GameState, ticker: Ticker): number => {
  const bank = state.companies.find((c) => c.ticker === ticker);
  if (!bank?.bankBalanceSheet) return 0;
  return bankReservesOf(state.v2!, bank.id) - depositsOf(bank.bankBalanceSheet, stateDepositLines(state, bank));
};

/** A central bank's book, both sides, in its own money. */
const centralBankNetOf = (state: GameState, region: RegionId): number => {
  const cb = state.regions[region]?.centralBankSheet;
  if (!cb) return 0;
  const v2 = state.v2!;
  const reserves = state.companies
    .filter((c) => c.region === region && c.isBankEntity && c.bankBalanceSheet)
    .reduce((a, c) => a + bankReservesOf(v2, c.id), 0);
  return centralBankAssetsLocal(centralBankBookLocal(v2, region), cb, waysAndMeansOf(v2, region), currencyOf(region), v2.fx)
    - centralBankLiabilitiesLocal(cb, reserves, treasuryAccountOf(v2, region));
};

export function runFxRevaluationStage(state: GameState): void {
  const banks = banksOf(state.companies);
  const bankBefore = new Map(banks.map((b) => [b.ticker, bankNetOf(state, b.ticker)]));
  const cbBefore = new Map(REGION_IDS.map((r) => [r, centralBankNetOf(state, r)]));
  // §3.37-ZEROSUM: what this stage BOOKS, recorded so the audit can compare it against the rate
  // move applied to the world's actual open position. The two are computed from different things
  // — this from the entities it walks, the audit from every account row that exists — so a
  // position revalued twice, or by nobody, is the difference between them.
  const fxBefore: Record<string, number> = { ...(state.v2!.fx as unknown as Record<string, number>) };

  // The rate the last auction cleared becomes the rate in force. Nothing else in the week may
  // move it: two reads of one balance at two rates is a revaluation reported as a leak.
  let bankGainLocal = 0, cbGainLocal = 0;
  openFxWeek(state.v2!);

  banks.forEach((b) => {
    // The bank's own money is worth more or less than it was; its equity is the residual claim,
    // so it takes the whole of the move. A depositor's foreign balance revalues on the
    // depositor's book (a ledger read) and against the bank as a liability, and the two net.
    const gain = bankNetOf(state, b.ticker) - (bankBefore.get(b.ticker) ?? 0);
    if (Math.abs(gain) > MIN_MARK) b.bankBalanceSheet!.bankEquityLocal += gain;
    bankGainLocal += gain;
  });

  REGION_IDS.forEach((r) => {
    const cb = state.regions[r]?.centralBankSheet;
    if (!cb) return;
    // A central bank's revaluation account, which is what the account is FOR: the gain is
    // unrealised and is not remitted (the sheet's "no retained earnings" note is about income).
    const gain = centralBankNetOf(state, r) - (cbBefore.get(r) ?? 0);
    if (Math.abs(gain) > MIN_MARK) cb.fxRevaluationLocal = (cb.fxRevaluationLocal ?? 0) + gain;
    cbGainLocal += gain;
  });
  state.lastFxRevaluation = {
    bookedLocal: bankGainLocal + cbGainLocal,
    fxBefore,
    fxAfter: { ...(state.v2!.fx as unknown as Record<string, number>) },
  };
}
