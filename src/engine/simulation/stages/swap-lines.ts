/**
 * §3.17b-v — THE SWAP LINES, drawn and serviced. `drawSwapLine`: the lending central bank creates
 * its money and pays it to the borrowing region's bank (one instruction, across the border — the
 * settlement's official-claim write records the borrowing central bank's deposit at the lending
 * one for the reserves that crossed); the borrowing central bank books the on-lending as its
 * asset and the home money it gave as its liability; the lending central bank books that home
 * money as FX reserves; the bank books what it owes. `serviceSwapLines`: every week each draw
 * pays its interest — the foreign overnight plus the line's spread, paid to the borrowing central
 * bank in its own money and remitted with its other income — and a draw at term unwinds at the
 * original rate: the bank repays the foreign money to the lending central bank, which
 * extinguishes it, and the books reverse. Called by the FX funding market (`xcs.ts`), whose
 * backstop this is.
 */

import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import { currencyOf, RegionId, NUMERAIRE } from '../../../domain/geography';
import { convert } from '../../../domain/currency';
import { bankParty } from '../../../domain/party';
import { Company } from '../../../domain/company';
import { SWAP_LINE_TERM_WEEKS, swapLineInterestLocal, SwapLineDraw } from '../../../domain/swap-lines';
import type { DerivativeMarketView } from '../../../domain/derivatives/profile';

const addTo = (rec: Record<string, number> | undefined, key: string, delta: number): Record<string, number> => {
  const out = { ...(rec ?? {}) };
  const next = (out[key] ?? 0) + delta;
  if (Math.abs(next) < 1e-6) delete out[key]; else out[key] = next;
  return out;
};

export function drawSwapLine(ctx: WeeklyStepContext, home: RegionId, foreign: RegionId, bank: Company, foreignLocal: number, week: number): SwapLineDraw | undefined {
  const cbHome = ctx.updatedRegions[home]?.centralBankSheet;
  const cbForeign = ctx.updatedRegions[foreign]?.centralBankSheet;
  if (!cbHome || !cbForeign || !bank.bankBalanceSheet || !(foreignLocal > 0)) return undefined;
  const foreignMoney = currencyOf(foreign), homeMoney = currencyOf(home);
  const homeLocal = convert(foreignLocal, foreignMoney, homeMoney, ctx.fx);
  const homeUSD = convert(homeLocal, homeMoney, NUMERAIRE, ctx.fx);
  // The lending central bank creates its money and it lands on the borrowing region's bank.
  pay(ctx, { payer: { kind: 'CENTRAL_BANK', region: foreign }, payee: bankParty(bank), amount: foreignLocal, currency: foreignMoney, reason: 'swap line drawn' });
  bank.bankBalanceSheet = { ...bank.bankBalanceSheet, swapLineDrawnByRegion: addTo(bank.bankBalanceSheet.swapLineDrawnByRegion, foreign, foreignLocal) };
  cbHome.swapLineLentByRegion = addTo(cbHome.swapLineLentByRegion, foreign, foreignLocal);
  cbHome.swapLineDepositsLocal = (cbHome.swapLineDepositsLocal ?? 0) + homeLocal;
  cbForeign.fxReservesByRegion = addTo(cbForeign.fxReservesByRegion, home, homeUSD);
  const draw: SwapLineDraw = { counterpartyRegion: foreign, bankId: bank.id, foreignLocal, homeLocal, homeUSD, drawnWeek: week, maturityWeek: week + SWAP_LINE_TERM_WEEKS };
  cbHome.swapLines = [...(cbHome.swapLines ?? []), draw];
  return draw;
}

export function serviceSwapLines(ctx: WeeklyStepContext, week: number, view: Pick<DerivativeMarketView, 'overnightRateAnnual'>): void {
  const bankById = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((home) => {
    const cbHome = ctx.updatedRegions[home]?.centralBankSheet;
    if (!cbHome?.swapLines?.length) return;
    const homeMoney = currencyOf(home);
    const kept: SwapLineDraw[] = [];
    cbHome.swapLines.forEach((d) => {
      const bank = bankById.get(d.bankId);
      const foreign = d.counterpartyRegion;
      const foreignMoney = currencyOf(foreign);
      const cbForeign = ctx.updatedRegions[foreign]?.centralBankSheet;
      // A bank that has left the world leaves its draw to the resolution that took its book; the
      // central bank's record is kept until that book repays (a resolved bank's sheet carries it).
      if (!bank?.bankBalanceSheet) { kept.push(d); return; }
      if (d.drawnWeek < week) {
        // Interest, in the borrowing central bank's own money, remitted with its other income.
        const interestLocal = convert(swapLineInterestLocal(d.foreignLocal, view.overnightRateAnnual(foreign)), foreignMoney, homeMoney, ctx.fx);
        if (interestLocal > 1) {
          pay(ctx, { payer: bankParty(bank), payee: { kind: 'CENTRAL_BANK', region: home }, amount: interestLocal, currency: homeMoney, reason: 'swap line interest' });
          cbHome.lastLoanInterestLocal = (cbHome.lastLoanInterestLocal ?? 0) + interestLocal;
        }
      }
      if (d.maturityWeek > week) { kept.push(d); return; }
      // The unwind, at the original rate: the bank returns the foreign money to the central bank
      // that created it, and the books reverse.
      pay(ctx, { payer: bankParty(bank), payee: { kind: 'CENTRAL_BANK', region: foreign }, amount: d.foreignLocal, currency: foreignMoney, reason: 'swap line repaid' });
      bank.bankBalanceSheet = { ...bank.bankBalanceSheet, swapLineDrawnByRegion: addTo(bank.bankBalanceSheet.swapLineDrawnByRegion, foreign, -d.foreignLocal) };
      cbHome.swapLineLentByRegion = addTo(cbHome.swapLineLentByRegion, foreign, -d.foreignLocal);
      cbHome.swapLineDepositsLocal = (cbHome.swapLineDepositsLocal ?? 0) - d.homeLocal;
      if (cbForeign) cbForeign.fxReservesByRegion = addTo(cbForeign.fxReservesByRegion, home, -d.homeUSD);
    });
    cbHome.swapLines = kept;
  });
}
