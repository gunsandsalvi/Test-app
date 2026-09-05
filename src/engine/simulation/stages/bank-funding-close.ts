/**
 * THE FUNDING CLOSE: a bank whose reserve account ends the week below its operating
 * buffer raises money overnight to cover it — §3.20b: FIRST from the banks that ended above
 * theirs, unsecured, on its name and at the market's price of it (`interbank.ts`), and only for
 * what no bank will lend from the central bank.
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
import { bankSecuritiesParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { GameState } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { centralBankShortfallLocal } from './bank-lending';
import { strikeCentralBankLoan, syncCentralBankLoanSheets } from './central-bank-loans';
import { bankCashBufferRatioOf } from '../../macro/banking';
import { WeeklyStepContext } from './context';
import { pendingSettlementLocal, runSettlementStage } from './settlement';
import { runInterbankSession } from './interbank';
import { banksOf } from '../../../domain/company';
import { RegionId } from '../../../types';

/** A round can leave another bank short (the borrower's settlement drains it); the rounds
 *  converge geometrically and eight is far past the dollar. */
const MAX_ROUNDS = 8;

export function runBankFundingCloseStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let raisedAny = false;
    // §3.20b: the market clears per region before the window is asked; a bank's need is read on
    // settled reserves plus the legs already posted, this round's interbank fills included.
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (!reg) return;
      const banks = banksOf(ctx.updatedCompanies, regionId).filter((b) => isActiveCompany(b));
      if (banks.length === 0) return;
      const unfunded = runInterbankSession(ctx, regionId, reg, banks);
      if ([...unfunded.values()].some((v) => v > 0)) raisedAny = true;
    });
    const touchedRegions = new Set<RegionId>();
    ctx.updatedCompanies.forEach((bank) => {
      if (!bank.isBankEntity || !bank.bankBalanceSheet || !isActiveCompany(bank)) return;
      const reg = ctx.updatedRegions[bank.region];
      if (!reg) return;
      const reservesLocal = bankReservesOf(ctx.v2, bank.id) + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
      const raisedLocal = centralBankShortfallLocal(householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)), reservesLocal, bankCashBufferRatioOf(bank));
      if (raisedLocal <= 0) return;
      raisedAny = true;
      // §3.20-LLR-a: the lender of last resort's loan is a ROW — the central bank pays with
      // reserves it creates, and the row is the asset the money it made has behind it.
      strikeCentralBankLoan(ctx, bank.region, reg, bank, raisedLocal);
      touchedRegions.add(bank.region);
      if (process.env.FUNDING_TRACE === '1') {
        console.log(`  [funding-close] w${ctx.nextWeek} r${round} ${bank.region}:${bank.ticker} raised ${(raisedLocal / 1e6).toFixed(0)}M (cash was ${(reservesLocal / 1e6).toFixed(0)}M)`);
      }
    });
    touchedRegions.forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (reg) syncCentralBankLoanSheets(ctx, regionId, reg, banksOf(ctx.updatedCompanies, regionId));
    });
    if (!raisedAny) return;
    runSettlementStage(ctx);
  }
}
