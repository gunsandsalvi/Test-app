/**
 * §3.20b — THE INTERBANK UNSECURED MARKET, at the funding close. The last boundary line's named
 * successor: a bank that ends the week below its operating buffer borrows from the banks that
 * ended above theirs, on its NAME — no collateral, at policy plus what the market charges that
 * name — and only what no bank will lend reaches the central bank's window.
 *
 * WHY HERE. The need is knowable only after the day's flows (`money-market.md` A3): the session
 * runs inside the funding close, on settled reserves plus the legs already posted, before the
 * window is asked for anything.
 *
 * ONE BOOK PER BORROWER. Unsecured money is not fungible across names the way general
 * collateral is: a lender's schedule for a name starts at the market's own price of that name —
 * the front of the borrower's cleared credit curve, the same spread its own bonds print
 * (`issuerSpreadAtOnCurve`; the posted constant only for a bank nothing has priced) — and
 * commits its whole surplus by the top of the corridor, past which the borrower funds at the
 * window instead. The borrowers clear in order of that spread: the strongest name takes the
 * lenders' cash first, the doubted one bids for what is left and pays more, or finds no bid.
 * That is B2 and B2.a of `money-market.md`, and B2.b — the strong-to-weak spread as a stress
 * measure — is what the struck rates now let step 38 read.
 *
 * THE CONTRACT is a row of the contract store (`domain/interbank.ts`), principal moved between
 * the two banks' reserve accounts at the close and repaid with interest at the next open —
 * interest as the banks' own-account legs, so the settlement tallies book it to both equities.
 */

import { WeeklyStepContext } from './context';
import { RegionId, Region } from '../../../types';
import type { EntityId, Ticker } from '../../../domain/ids';
import { BankingSector, WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { InterbankLoan, interbankLoanId, interbankInterestToMaturityLocal, interbankBorrowedLocal, interbankLentLocal } from '../../../domain/interbank';
import { interbankBookOf, publishInterbankBook } from '../../ledger/contract-ledger';
import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { bankParty, bankSecuritiesParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { pay, pendingSettlementLocal } from './settlement';
import { bankCashBufferRatioOf, SRF_SPREAD_BPS, ON_RRP_SPREAD_BPS } from '../../macro/banking';
import { issuerSpreadAtOnCurve } from '../../credit-price';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant } from './financial-clearing-engine';
import { interbankInstrumentId } from '../../../domain/instrument-keys';
import { registerBook } from '../../ledger/instrument-ledger';
import { bankParticipantId, bankTickerOfParticipant } from '../../../domain/participant-keys';

type Bank = { id: EntityId; ticker: Ticker; region: RegionId; management?: import('../../../domain/preferences').Preferences; bankBalanceSheet?: BankingSector };

/** The bank's position against its own buffer, on settled reserves plus the legs already posted. */
function positionLocal(ctx: WeeklyStepContext, bank: Bank): number {
  const cashLocal = bankReservesOf(ctx.v2, bank.id) + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
  const bufferLocal = Math.max(0, householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region))) * bankCashBufferRatioOf(bank);
  return cashLocal - bufferLocal;
}

/** The sheets' derived lines, from the book — the one writer of both. */
function syncSheets(ctx: WeeklyStepContext, regionId: RegionId, banks: readonly Bank[]): void {
  const book = interbankBookOf(ctx.v2, regionId);
  banks.forEach((b) => {
    if (!b.bankBalanceSheet) return;
    b.bankBalanceSheet.interbankLentLocal = Math.round(interbankLentLocal(book, b.id));
    b.bankBalanceSheet.interbankBorrowedLocal = Math.round(interbankBorrowedLocal(book, b.id));
  });
}

/**
 * The close session for one region. Returns what each borrower still needs after the market,
 * keyed by bank id, and what the session struck.
 */
export function runInterbankSession(ctx: WeeklyStepContext, regionId: RegionId, reg: Region, banks: readonly Bank[]): { unfunded: Map<EntityId, number>; struckLocal: number } {
  const week = ctx.nextWeek;
  const unfunded = new Map<EntityId, number>();
  const surplusByLender = new Map<EntityId, number>();
  const borrowers: { bank: Bank; needLocal: number; spreadBps: number }[] = [];
  banks.forEach((bank) => {
    if (!bank.bankBalanceSheet) return;
    const posLocal = positionLocal(ctx, bank);
    if (posLocal > 1e6) surplusByLender.set(bank.id, posLocal);
    else if (posLocal < -1e6) {
      const spreadBps = issuerSpreadAtOnCurve(ctx.v2, reg, bank.id, week, 1 / 52)?.spreadBps ?? WHOLESALE_FUNDING_SPREAD_BPS;
      borrowers.push({ bank, needLocal: -posLocal, spreadBps: Math.max(0, spreadBps) });
    }
  });
  borrowers.forEach((b) => unfunded.set(b.bank.id, b.needLocal));
  if (borrowers.length === 0 || surplusByLender.size === 0) return { unfunded, struckLocal: 0 };
  const policyBps = reg.policyRate * 10000;
  const corridorWidthBps = Math.max(1, SRF_SPREAD_BPS + ON_RRP_SPREAD_BPS);
  const bankById = new Map(banks.map((b) => [b.id, b]));
  const book = [...interbankBookOf(ctx.v2, regionId)];
  let struckLocal = 0, struckRateWeighted = 0;
  // The strongest name first: the market's order, not the borrowers'.
  borrowers.sort((a, b) => a.spreadBps - b.spreadBps || (a.bank.id < b.bank.id ? -1 : 1));
  borrowers.forEach(({ bank, needLocal, spreadBps }) => {
    const instrumentId = interbankInstrumentId(regionId, bank.id);
    registerBook(ctx.v2, instrumentId, 'INTERBANK', currencyOf(regionId));
    const instrument: ClearingInstrument = {
      id: instrumentId, outstandingLocal: needLocal, tradableFloatLocal: needLocal,
      currentStat: spreadBps, statKind: 'YIELD_LIKE', durationYears: 1 / 52,
    };
    const participants: ClearingParticipant[] = [];
    surplusByLender.forEach((surplusLocal, lenderId) => {
      if (surplusLocal <= 1e6 || lenderId === bank.id) return;
      const lender = bankById.get(lenderId);
      if (!lender) return;
      participants.push({
        id: bankParticipantId(lender.ticker),
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[instrumentId, {
          // Indifferent at the market's own price of the name; fully committed by the top of
          // the corridor, past which the borrower funds at the window instead.
          reservationStat: spreadBps, maxHoldingLocal: surplusLocal, fullSizeStatRange: corridorWidthBps,
        }]]),
      });
    });
    if (participants.length === 0) return;
    // The need is an inelastic order from outside the lender set: what it leaves unfilled is the
    // measurement the window reads, so the residual is not handed back to a holder.
    const result = clearFinancialAsset([instrument], participants, { dealerSpreadBps: 0 });
    const clearedBps = result.newStatById.get(instrumentId);
    if (clearedBps === undefined || !Number.isFinite(clearedBps)) return;
    const rateAnnual = Number(((policyBps + Math.max(0, clearedBps)) / 10000).toFixed(6));
    let fundedLocal = 0;
    participants.forEach((p) => {
      const lentLocal = result.newParticipantHoldings.get(p.id)?.get(instrumentId) ?? 0;
      if (!(lentLocal > 1)) return;
      const lenderTicker = bankTickerOfParticipant(p.id);
      const lender = banks.find((b) => b.ticker === lenderTicker);
      if (!lender) return;
      const loan: InterbankLoan = {
        id: interbankLoanId(regionId, lender.id, bank.id, week), regionId, lenderId: lender.id, borrowerId: bank.id,
        principalLocal: Math.round(lentLocal), rateAnnual, struckWeek: week, maturityWeek: week + 1,
      };
      book.push(loan);
      surplusByLender.set(lender.id, (surplusByLender.get(lender.id) ?? 0) - lentLocal);
      pay(ctx, {
        payer: bankSecuritiesParty(lender), payee: bankSecuritiesParty(bank),
        amount: loan.principalLocal, currency: currencyOf(regionId), reason: 'interbank loan lent',
      });
      fundedLocal += loan.principalLocal;
      struckLocal += loan.principalLocal; struckRateWeighted += loan.principalLocal * rateAnnual;
    });
    unfunded.set(bank.id, Math.max(0, needLocal - fundedLocal));
  });
  publishInterbankBook(ctx.v2, regionId, book);
  syncSheets(ctx, regionId, banks);
  if (struckLocal > 0) reg.interbankRateAnnual = Number((struckRateWeighted / struckLocal).toFixed(6));
  return { unfunded, struckLocal };
}

/** The open: every loan due this week repays, principal between the reserve accounts and
 *  interest between the banks' own accounts, and leaves the book. */
export function matureInterbankLoans(ctx: WeeklyStepContext, regionId: RegionId, banks: readonly Bank[]): void {
  const week = ctx.nextWeek;
  const book = interbankBookOf(ctx.v2, regionId);
  const due = book.filter((c) => c.maturityWeek <= week);
  if (due.length === 0) return;
  const bankById = new Map(banks.map((b) => [b.id, b]));
  due.forEach((c) => {
    const lender = bankById.get(c.lenderId), borrower = bankById.get(c.borrowerId);
    if (!lender || !borrower) return;
    pay(ctx, { payer: bankSecuritiesParty(borrower), payee: bankSecuritiesParty(lender), amount: c.principalLocal, currency: currencyOf(regionId), reason: 'interbank loan repaid' });
    const interestLocal = interbankInterestToMaturityLocal(c);
    if (interestLocal > 0) pay(ctx, { payer: bankParty(borrower), payee: bankParty(lender), amount: interestLocal, currency: currencyOf(regionId), reason: 'interbank loan interest' });
  });
  publishInterbankBook(ctx.v2, regionId, book.filter((c) => c.maturityWeek > week));
  syncSheets(ctx, regionId, banks);
}
