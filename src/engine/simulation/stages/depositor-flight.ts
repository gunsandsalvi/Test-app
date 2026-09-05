/**
 * §3.20-LLR-iii — THE RUN. A bank that ended the week short of its buffer — the market and the
 * window would not fund it (`bank-funding-close.ts:recordFundingShortfalls`) — is a bank its
 * depositors can see is weak: the shortfall is on the region's record and in the news. Its
 * UNINSURED depositors — the firms and the institutions that bank there; the household line is
 * insured (`banks-funding-and-liquidity.md` E4) and stays — leave for the soundest bank in the
 * region, each on its own horizon: a depositor moves when the bank has been short for as many
 * closes as its management's patience (`preferences.ts`), so the impatient leave first and a run
 * builds over weeks rather than in one. Leaving takes the deposit AND the reserves behind it,
 * which is what makes a run self-reinforcing: the bank is shorter at the next close.
 *
 * Wholesale first, by construction (E4.a). What one bank's run says about the others (E5) is
 * not read yet.
 */

import { WeeklyStepContext } from './context';
import { RegionId, Region, Company } from '../../../types';
import type { EntityId } from '../../../domain/ids';
import { banksOf, isActiveCompany } from '../../../domain/company';
import { cashOf, entityCashOf, adjustBankReserves } from '../../ledger/accounts';
import { patienceWeeksOf } from '../../../domain/preferences';

/** The soundest bank a depositor can move to: not short this week, the highest capital ratio. */
function soundestBank(banks: readonly Company[], streak: Readonly<Record<string, number>>): Company | undefined {
  let best: Company | undefined;
  banks.forEach((b) => {
    if (!isActiveCompany(b) || !b.bankBalanceSheet || (streak[b.id] ?? 0) > 0) return;
    if (!best || b.bankBalanceSheet.bankCapitalRatio > best.bankBalanceSheet!.bankCapitalRatio) best = b;
  });
  return best;
}

export function runDepositorFlight(ctx: WeeklyStepContext, regionId: RegionId, reg: Region): void {
  const streak = reg.bankFundingShortStreakWeeks ?? {};
  const fled: Record<string, number> = {};
  const shortBankIds = new Set(Object.keys(streak).filter((id) => (streak[id] ?? 0) > 0));
  if (shortBankIds.size === 0) { reg.depositorFlightLocal = fled; return; }
  const banks = banksOf(ctx.updatedCompanies, regionId);
  const to = soundestBank(banks, streak);
  if (!to) { reg.depositorFlightLocal = fled; return; }
  const move = (fromBankId: EntityId, balanceLocal: number): void => {
    if (!(balanceLocal > 0)) return;
    // The deposit leaves with the reserves behind it: the weak bank settles at the central bank.
    adjustBankReserves(ctx.v2, fromBankId, -balanceLocal);
    adjustBankReserves(ctx.v2, to.id, balanceLocal);
    fled[fromBankId] = (fled[fromBankId] ?? 0) + balanceLocal;
  };
  ctx.updatedCompanies.forEach((c) => {
    if (!c.homeBankId || !shortBankIds.has(c.homeBankId) || c.region !== regionId || c.isBankEntity || c.mergerAcquired) return;
    if ((streak[c.homeBankId] ?? 0) < patienceWeeksOf(c.management)) return;
    const from = c.homeBankId;
    c.homeBankId = to.id;
    move(from, cashOf(ctx.v2, c));
  });
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (!e.homeBankId || !shortBankIds.has(e.homeBankId) || e.region !== regionId || e.isDefaulted) return;
    if ((streak[e.homeBankId] ?? 0) < patienceWeeksOf(e.management)) return;
    const from = e.homeBankId;
    e.homeBankId = to.id;
    move(from, entityCashOf(ctx.v2, e));
  });
  reg.depositorFlightLocal = fled;
}
