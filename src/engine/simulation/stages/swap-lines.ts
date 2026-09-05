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
import { SWAP_LINE_TERM_WEEKS, swapLineInterestLocal, SwapLineDraw, swapLineDrawId, swapLineDrawnByRegionOf, swapLineLentByRegionOf, swapLineDepositsOf } from '../../../domain/swap-lines';
import { swapLineBookOf, publishSwapLineBook } from '../../ledger/contract-ledger';
import type { EntityId } from '../../../domain/ids';
import type { DerivativeMarketView } from '../../../domain/derivatives/profile';

const addTo = (rec: Record<string, number> | undefined, key: string, delta: number): Record<string, number> => {
  const out = { ...(rec ?? {}) };
  const next = (out[key] ?? 0) + delta;
  if (Math.abs(next) < 1e-6) delete out[key]; else out[key] = next;
  return out;
};

/** §3.20-LLR-b — the three lines that stood for the draws are READS of the book, written here and
 *  nowhere else: each home bank's draws per lending region, the home central bank's on-lending per
 *  lending region, and the home money it gave for them. */
export function syncSwapLineSheets(ctx: WeeklyStepContext, home: RegionId): void {
  const book = swapLineBookOf(ctx.v2, home);
  const cbHome = ctx.updatedRegions[home].centralBankSheet;
  if (cbHome) {
    cbHome.swapLineLentByRegion = swapLineLentByRegionOf(book);
    cbHome.swapLineDepositsLocal = Math.round(swapLineDepositsOf(book));
  }
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || c.region !== home) return;
    c.bankBalanceSheet.swapLineDrawnByRegion = swapLineDrawnByRegionOf(book, c.id);
  });
}

export function drawSwapLine(ctx: WeeklyStepContext, home: RegionId, foreign: RegionId, bank: Company, foreignLocal: number, week: number): SwapLineDraw | undefined {
  const cbHome = ctx.updatedRegions[home].centralBankSheet;
  const cbForeign = ctx.updatedRegions[foreign].centralBankSheet;
  if (!cbHome || !cbForeign || !bank.bankBalanceSheet || !(foreignLocal > 0)) return undefined;
  const foreignMoney = currencyOf(foreign), homeMoney = currencyOf(home);
  const homeLocal = convert(foreignLocal, foreignMoney, homeMoney, ctx.fx);
  const homeUSD = convert(homeLocal, homeMoney, NUMERAIRE, ctx.fx);
  pay(ctx, { payer: { kind: 'CENTRAL_BANK', region: foreign }, payee: bankParty(bank), amount: foreignLocal, currency: foreignMoney, reason: 'swap line drawn' });
  // The lending central bank's FX reserves are its own line, moved by the FX book as well.
  cbForeign.fxReservesByRegion = addTo(cbForeign.fxReservesByRegion, home, homeUSD);
  const draw: SwapLineDraw = { id: swapLineDrawId(home, foreign, bank.id, week), homeRegion: home, counterpartyRegion: foreign, bankId: bank.id, foreignLocal, homeLocal, homeUSD, drawnWeek: week, maturityWeek: week + SWAP_LINE_TERM_WEEKS };
  const book = swapLineBookOf(ctx.v2, home);
  const same = book.find((d) => d.id === draw.id);
  // A second draw by the same bank on the same line in the same week adds to the same row.
  publishSwapLineBook(ctx.v2, home, same
    ? book.map((d) => (d.id === draw.id ? { ...d, foreignLocal: d.foreignLocal + foreignLocal, homeLocal: d.homeLocal + homeLocal, homeUSD: d.homeUSD + homeUSD } : d))
    : [...book, draw]);
  syncSwapLineSheets(ctx, home);
  return draw;
}

export function serviceSwapLines(ctx: WeeklyStepContext, week: number, view: Pick<DerivativeMarketView, 'overnightRateAnnual'>): void {
  const bankById = new Map(ctx.updatedCompanies.map((c) => [c.id, c]));
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((home) => {
    const cbHome = ctx.updatedRegions[home].centralBankSheet;
    const book = swapLineBookOf(ctx.v2, home);
    if (!cbHome || book.length === 0) return;
    const homeMoney = currencyOf(home);
    const kept: SwapLineDraw[] = [];
    book.forEach((d) => {
      const bank = bankById.get(d.bankId);
      const foreign = d.counterpartyRegion;
      const foreignMoney = currencyOf(foreign);
      const cbForeign = ctx.updatedRegions[foreign].centralBankSheet;
      if (!bank?.bankBalanceSheet) { kept.push(d); return; }
      if (d.drawnWeek < week) {
        const interestLocal = convert(swapLineInterestLocal(d.foreignLocal, view.overnightRateAnnual(foreign)), foreignMoney, homeMoney, ctx.fx);
        if (interestLocal > 1) {
          pay(ctx, { payer: bankParty(bank), payee: { kind: 'CENTRAL_BANK', region: home }, amount: interestLocal, currency: homeMoney, reason: 'swap line interest' });
          cbHome.lastLoanInterestLocal = (cbHome.lastLoanInterestLocal ?? 0) + interestLocal;
        }
      }
      if (d.maturityWeek > week) { kept.push(d); return; }
      pay(ctx, { payer: bankParty(bank), payee: { kind: 'CENTRAL_BANK', region: foreign }, amount: d.foreignLocal, currency: foreignMoney, reason: 'swap line repaid' });
      if (cbForeign) cbForeign.fxReservesByRegion = addTo(cbForeign.fxReservesByRegion, home, -d.homeUSD);
    });
    publishSwapLineBook(ctx.v2, home, kept);
    syncSwapLineSheets(ctx, home);
  });
}

/** A resolved bank's draws are assumed by the bank that takes its book: the rows re-seat. */
export function reseatSwapLines(ctx: WeeklyStepContext, home: RegionId, fromBankId: EntityId, toBankId: EntityId): void {
  const book = swapLineBookOf(ctx.v2, home);
  if (!book.some((d) => d.bankId === fromBankId)) return;
  publishSwapLineBook(ctx.v2, home, book.map((d) => (d.bankId === fromBankId ? { ...d, bankId: toBankId } : d)));
  syncSwapLineSheets(ctx, home);
}
