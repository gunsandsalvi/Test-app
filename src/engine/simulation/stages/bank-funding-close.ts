/**
 * THE FUNDING CLOSE: a bank whose reserve account ends the week below its operating
 * buffer raises wholesale money overnight to cover it, at its own cleared spread, from the same
 * lenders the morning roll repays (bank-lending.ts's `unrenewedWholesaleLocal`, in 02b).
 *
 * Why at the close and not in 02b beside the roll: the shortfall is made by the books that clear
 * AFTER 02b — the desks buy inventory sized by capital, not by cash, and the settlement of a
 * week's customer flows can take 50B of reserves out of one bank (measured MIUJ at −25B
 * by week 3). A repo session or a raise struck in the morning cannot see any of it. A real
 * treasury funds its day at the end of the day; this is that.
 *
 * The liability is written by bank-lending.ts (its owner); the cash arrives as a payment from
 * the unmodeled wholesale lender and settles in its own pass, so the week closes with every
 * reserve account at or above its buffer and the central bank counts real balances.
 */

import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { currencyOf } from '../../../domain/geography';
import { GameState } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { raiseCentralBankLoanLocal } from './bank-lending';
import { bankCashBufferRatioOf } from '../../macro/banking';
import { WeeklyStepContext } from './context';
import { pay, runSettlementStage } from './settlement';

/** A round can leave another bank short (the borrower's settlement drains it); the rounds
 *  converge geometrically and eight is far past the dollar. */
const MAX_ROUNDS = 8;

export function runBankFundingCloseStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let raisedAny = false;
    ctx.updatedCompanies.forEach((bank) => {
      if (!bank.isBankEntity || !bank.bankBalanceSheet || !isActiveCompany(bank)) return;
      const sheet = bank.bankBalanceSheet;
      const reservesLocal = bankReservesOf(ctx.v2, bank.ticker);
      const raisedLocal = raiseCentralBankLoanLocal(sheet, householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)), reservesLocal, bankCashBufferRatioOf(bank));
      if (raisedLocal <= 0) return;
      raisedAny = true;
      // The lender of last resort. The central bank pays with reserves it creates and
      // books the loan as its asset, so the money it made has a purchase behind it.
      const cb = ctx.updatedRegions[bank.region]?.centralBankSheet;
      if (cb) cb.loansToBanksLocal = (cb.loansToBanksLocal ?? 0) + raisedLocal;
      pay(ctx, {
        payer: { kind: 'CENTRAL_BANK', region: bank.region },
        payee: { kind: 'BANK_SECURITIES', ticker: bank.ticker },
        amount: raisedLocal,
        currency: currencyOf(bank.region),
        reason: 'central bank loan drawn',
      });
      if (process.env.FUNDING_TRACE === '1') {
        console.log(`  [funding-close] w${ctx.nextWeek} r${round} ${bank.region}:${bank.ticker} raised ${(raisedLocal / 1e6).toFixed(0)}M (cash was ${(reservesLocal / 1e6).toFixed(0)}M)`);
      }
    });
    if (!raisedAny) return;
    runSettlementStage(ctx);
  }
}
