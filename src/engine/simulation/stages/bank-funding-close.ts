/**
 * THE FUNDING CLOSE: the money market, where the week's flows have made every bank's need
 * knowable (§3.20-LLR-i). Per region, per round: the repo books, with the standing facility as
 * the posted-rate seat at the top of the corridor — collateral-bounded, priced, and a bank out
 * of eligible paper simply is not a borrower in it; then the unsecured book on the name
 * (§3.20b); then the overnight window taking what was left unlent; then settlement, until
 * nothing moves.
 *
 * §3.20-LLR-ii — THERE IS NO LOAN BEHIND THE MARKET. The unbounded, unsecured, unrefusable
 * central-bank loan that stood here is gone: the seat is the lender of last resort, and a bank
 * that still ends the week below its buffer — or overdrawn at the central bank — ends it so.
 * That is a real state, recorded per bank on the region (`recordFundingShortfalls`) for the
 * news, the resolution and the audit to read; what it costs the bank, and whether the seat
 * lends to a bank the supervisor would close, are §3 step 20-LLR-iii's.
 */

import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { bankSecuritiesParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { GameState } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { centralBankShortfallLocal } from './bank-lending';
import { bankCashBufferRatioOf } from '../../macro/banking';
import { WeeklyStepContext } from './context';
import { pendingSettlementLocal, runSettlementStage } from './settlement';
import { runInterbankSession } from './interbank';
import { runRegionalRepoSession, drawReverseRepoAtTheClose } from './repo-clearing';
import { refreshMmfQuotes } from './money-market-fund';
import { banksOf } from '../../../domain/company';
import { RegionId } from '../../../types';

/** A round can leave another bank short (the borrower's settlement drains it, the window takes
 *  a depositor's cash); the rounds converge geometrically and eight is far past the dollar. */
const MAX_ROUNDS = 8;

export function runBankFundingCloseStage(state: GameState, ctx: WeeklyStepContext): void {
  void state;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let raisedAny = false;
    // §3.20-LLR-i: THE MONEY MARKET CLEARS HERE, where the week's flows have made the need
    // knowable. Secured first — the repo session, with the standing facility as the posted-rate
    // seat at the top of the corridor — then unsecured on the name (§3.20b) for what collateral
    // could not cover; a bank's need is read on settled reserves plus the legs already posted,
    // this round's fills included.
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (!reg) return;
      const banks = banksOf(ctx.updatedCompanies, regionId).filter((b) => isActiveCompany(b));
      if (banks.length === 0) return;
      const session = runRegionalRepoSession(regionId, reg, banks, ctx);
      reg.repoRateAnnual = Number(session.repoRateAnnual.toFixed(6));
      // GUARD: what the session had to fund and what it actually lent, so the harness can tell
      // a quiet week from a dead market — the distinction the corridor assertion cannot make.
      reg.repoFundableNeedLocal = Math.round(session.fundableNeedLocal);
      reg.repoClearedVolumeLocal = Math.round(session.clearedVolumeLocal);
      if (session.clearedVolumeLocal > 0) raisedAny = true;
      const unsecured = runInterbankSession(ctx, regionId, reg, banks);
      if (unsecured.struckLocal > 0) raisedAny = true;
      // The money fund's quote for next week's yield-gap decision, off its post-session book.
      refreshMmfQuotes(regionId, reg, ctx);
    });
    // THE OVERNIGHT WINDOW takes what the session left unlent of the non-banks' idle cash: the
    // deposits leave the banks that held them, and the next round is where a bank short because
    // of that borrows — at the market first, then at the window's seat.
    if (drawReverseRepoAtTheClose(ctx) > 0) raisedAny = true;
    if (!raisedAny) break;
    runSettlementStage(ctx);
  }
  recordFundingShortfalls(ctx);
}

/**
 * §3.20-LLR-ii — A BANK THAT COULD NOT FUND ENDS THE WEEK SHORT, AND THE WEEK SAYS SO. What each
 * bank is still short of its buffer after the market and the window, on settled reserves plus
 * the legs already posted, written fresh on the region every close (a clean close leaves the
 * record empty). Nothing lends against it: this is the constraint the funding channel had lost.
 */
export function recordFundingShortfalls(ctx: WeeklyStepContext): void {
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;
    const short: Record<string, number> = {};
    const streak: Record<string, number> = {};
    banksOf(ctx.updatedCompanies, regionId).forEach((bank) => {
      if (!isActiveCompany(bank)) return;
      const reservesLocal = bankReservesOf(ctx.v2, bank.id) + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
      const shortLocal = centralBankShortfallLocal(householdDepositsAt(ctx.v2, bank.ticker, currencyOf(regionId)), reservesLocal, bankCashBufferRatioOf(bank));
      if (shortLocal > 0) {
        short[bank.id] = Math.round(shortLocal);
        // §3.20-LLR-iii: the run of it — what its uninsured depositors read against their horizons.
        streak[bank.id] = (reg.bankFundingShortStreakWeeks?.[bank.id] ?? 0) + 1;
      }
    });
    reg.bankFundingShortfallsLocal = short;
    reg.bankFundingShortStreakWeeks = streak;
  });
}
