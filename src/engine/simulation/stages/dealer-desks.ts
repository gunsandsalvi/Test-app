/**
 * The per-bank dealer desks, as participants in the books they make markets in.
 *
 * The shape of the desk (why a market maker's schedule is what it is, why its size is its own
 * leverage headroom, and what this replaces) is documented once in domain/dealer-desk.ts. This
 * is the engine-side half: turning each named bank's desk into a `ClearingParticipant` the same
 * auction already knows how to price, and writing the fills back onto the bank that carried them.
 */

import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import type { EntityId } from '../../../domain/ids';
import { bankSecuritiesParty, bankSecuritiesPartyOf } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { bankCashBufferRatioOf } from '../../macro/banking';
import { Company, RegionId } from '../../../types';
import {
  dealerDeskCapacityLocal, dealerDeskParticipantId, dealerDeskTicker, DESK_BOOK_KIND,
} from '../../../domain/dealer-desk';
import { deskRowsOf, deskGrossLocal, bankBookAssetsLocal, type DeskRow } from '../../desk-register';
import { LeadBankCandidate } from '../../../domain/primary-market';
import { leverageHeadroomLocal, BASEL_MIN_LEVERAGE_RATIO } from '../../macro/banking';
import { ClearingInstrument, ClearingParticipant, ClearingResult, ParticipantDemand } from './financial-clearing-engine';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { pendingSettlementLocal } from './settlement';
import { PartyRef } from './settlement';
import { transferHolding, markHolding, deskBookId } from '../../ledger/holdings-ledger';
import { defect } from '../../../domain/defect';
import { facilityBookOf, facilityRowsOf } from '../../../engine2/tranches';
import type { InstrumentId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';

/** The bank's own working sheet this week — a stage before this one may already have moved it. */
function sheetOf(ctx: WeeklyStepContext, bank: Company) {
  return ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
}

/**
 * ONE THING, ONE KEY — and after §9.13-CREDIT row 4 there is only one key: a desk's row is stored
 * under the paper it holds, and every book it makes a market in PRICES that same paper, so the
 * register's key and the auction's key are one string and this is a plain lookup.
 *
 * §3.13-BOOK d3d: the positions are the desk's REGISTER ROWS of this book's kind. The two
 * sovereign books share the kind, so a session narrows to the names it clears (`only`) — a bill
 * session does not see the bond desk's rows as its own, and vice versa.
 */
function priorPositions(v2: WeeklyStepContext['v2'], bankId: string, book: string, only?: ReadonlySet<InstrumentId>): Map<InstrumentId, DeskRow> {
  const kind = DESK_BOOK_KIND[book] ?? defect(`desk book '${book}' names no register kind`);
  const byId = new Map<InstrumentId, DeskRow>();
  deskRowsOf(v2, bankId, kind).forEach((p) => { if (only === undefined || only.has(p.instrumentId)) byId.set(p.instrumentId, p); });
  return byId;
}

/** The desk's capacity in one book: the bank's commitment less its other desks, bounded by the
 *  leverage floor — both off the register's gross (§3.13-BOOK d3d). */
function deskCapacityLocal(ctx: WeeklyStepContext, bank: Company, sheet: NonNullable<Company['bankBalanceSheet']>, book: string, only?: ReadonlySet<InstrumentId>): number {
  const kind = DESK_BOOK_KIND[book];
  let thisBookGrossLocal = 0;
  if (kind !== undefined) deskRowsOf(ctx.v2, bank.id, kind).forEach((p) => { if (only === undefined || only.has(p.instrumentId)) thisBookGrossLocal += Math.abs(p.inventoryLocal); });
  return dealerDeskCapacityLocal({
    balanceSheetCapacityLocal: sheet.bankEquityLocal / BASEL_MIN_LEVERAGE_RATIO,
    leverageHeadroomLocal: leverageHeadroomLocal(sheet, bankReservesOf(ctx.v2, bank.id), facilityBookOf(ctx.v2, bank.id), bankBookAssetsLocal(ctx.v2, bank.id)),
    grossLocal: deskGrossLocal(ctx.v2, bank.id),
    thisBookGrossLocal,
  });
}

/**
 * One desk participant per named bank that still has capacity or inventory in this book.
 *
 * `spreadBps` is the desk's own quoted spread — the same number the book charges on gross flow.
 * It sets the WIDTH of the schedule, not its level: the desk wants exactly its current inventory
 * at this week's printed level, goes to full capacity a spread away in its favour, and to flat a
 * spread away against it.
 */
export function buildDealerDeskParticipants(args: {
  ctx: WeeklyStepContext;
  banks: Company[];
  book: string;
  instruments: ClearingInstrument[];
  spreadBps: number;
  /** For a book that clears in UNITS rather than money (07e's shares): what one unit costs, so
   *  the desk's capital constraint — which is in dollars — can be posted as a size the auction
   *  understands. Omitted for the credit books, whose quantities already are dollars. */
  unitPriceOf?: (index: number) => number;
}): ClearingParticipant[] {
  const { ctx, banks, book, instruments, spreadBps } = args;
  const unitPrice = (i: number) => Math.max(1e-9, args.unitPriceOf ? args.unitPriceOf(i) : 1);
  const liveFloatLocal = instruments.map((i, idx) => Math.max(0, i.tradableFloatLocal + (i.primaryOfferingLocal ?? 0)) * (args.unitPriceOf ? unitPrice(idx) : 1));
  const totalFloatLocal = liveFloatLocal.reduce((a, b) => a + b, 0);
  if (totalFloatLocal <= 0) return [];

  const participants: ClearingParticipant[] = [];
  const sessionIds = new Set(instruments.map((i) => i.id));
  const narrow = DESK_BOOK_KIND[book] === 'GOV_BOND' ? sessionIds : undefined;
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    const prior = priorPositions(ctx.v2, bank.id, book, narrow);
    const capacityLocal = deskCapacityLocal(ctx, bank, sheet, book, narrow);
    let priorTotalLocal = 0;
    prior.forEach((p) => { priorTotalLocal += Math.abs(p.inventoryLocal); });
    if (capacityLocal <= 0 && priorTotalLocal <= 0) return;

    // A desk pays for inventory with the bank's own reserves, above the buffer it must keep —
    // the same real constraint the bank's investment book faces in 07c, and the reason a desk
    // with capital ratio to spare can still be unable to bid.
    const settledCashLocal = bankReservesOf(ctx.v2, bank.id)
      + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
    const fundableLocal = Math.max(0, settledCashLocal - householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)) * bankCashBufferRatioOf(bank));

    const currentHoldingsByInstrumentId = new Map<InstrumentId, number>();
    const demandByIndex: (ParticipantDemand | undefined)[] = new Array(instruments.length);
    instruments.forEach((inst, i) => {
      const priorPos = prior.get(inst.id);
      const px = unitPrice(i);
      // Carried at market: the position is the UNITS it holds, valued at this week's level.
      const priorUnits = Math.max(0, priorPos?.units ?? 0);
      const priorLocal = priorUnits * px;
      // A DESK'S EXISTING POSITION IS A FACT, not a function of this week's float, and it is
      // declared before any float test. It used to sit BELOW the `liveFloatLocal[i] <= 0` guard, so
      // a name whose float came out zero left the desk reporting no holding — and
      // `applyDealerDeskFills`, which rebuilds the book from the fills for every name it cleared,
      // then deleted the position with no cash leg. That is the WS5 bug this file's own comment
      // warns about, and OWN7 walked straight into it: once the float became "what the
      // participants hold", a book whose float is set AFTER the desks are built hands them zero.
      // Measured in the CP book on its first run: the desks' 2.34B position entering the week as
      // 0.02B, and 2.3B of paper left held by nobody.
      if (priorUnits > 0) currentHoldingsByInstrumentId.set(inst.id, priorUnits);
      if (liveFloatLocal[i] <= 0) return;
      const floatShare = liveFloatLocal[i] / totalFloatLocal;
      const roomLocal = capacityLocal * floatShare;
      const maxHoldingLocal = priorLocal + roomLocal;
      if (maxHoldingLocal <= 0) return;
      // Where the desk is neutral: the level at which its schedule asks for exactly what it
      // already holds. Everything else about the quote follows from that anchor.
      const neutralFraction = Math.max(0, Math.min(1, priorLocal / maxHoldingLocal));
      const isYieldLike = inst.statKind === 'YIELD_LIKE';
      const range = isYieldLike
        ? Math.max(1, spreadBps)
        : Math.max(1e-9, inst.currentStat * (spreadBps / 10000));
      const reservationStat = isYieldLike
        ? inst.currentStat - neutralFraction * range
        : inst.currentStat + neutralFraction * range;
      demandByIndex[i] = {
        reservationStat,
        fullSizeStatRange: range,
        maxHoldingLocal: maxHoldingLocal / px,
        maxNetPurchaseLocal: (fundableLocal * floatShare) / px,
      };
    });

    participants.push({
      id: dealerDeskParticipantId(bank.ticker),
      currentHoldingsByInstrumentId,
      demandByInstrumentId: new Map(),
      demandByIndex,
    });
  });
  return participants;
}

/**
 * Write each desk's fills back onto the bank that carried them, and return the regional view of
 * the book's inventory (derived, for the readers that still want one aggregate).
 *
 * The cash leg itself settles in `settleClearedBook` against `BANK_SECURITIES` — reserves move,
 * equity does not, because the securities are the other side (rule 5). What DOES hit equity is
 * the spread the desk paid the book on its own flow, exactly as the bank's investment book books
 * it in 07c: cash left beyond what the paper cost, and the identity drifts by the fee if the P&L
 * does not say so.
 */
export function applyDealerDeskFills(args: {
  ctx: WeeklyStepContext;
  banks: Company[];
  book: string;
  /** The names this session actually priced. A stage may only rewrite the instruments it
   *  cleared: a desk position in a name that carried no float this week is untouched,
   *  not deleted — rebuilding the book from the fills alone made those positions vanish with no
   *  cash leg, which is the exact WS5 bug, caught by the per-bank identity in its first probe. */
  instruments: ClearingInstrument[];
  result: ClearingResult;
  /** The unit price, for a book that clears in units — the inventory a bank carries is money. */
  unitPriceOf?: (instrumentId: InstrumentId) => number;
  /** The desk's money leg, for a book whose engine cash legs are unit-denominated (07e). */
  cashDeltaOf?: (deskParticipantId: string) => number;
  /** int flip — participant index by id; when present the desk fills read the dense
   *  holdings matrix and the lazy map is never materialized for this book. */
  piById?: Map<string, number>;
}): void {
  const { ctx, banks, book, result } = args;
  const unitPrice = (id: InstrumentId) => Math.max(1e-9, args.unitPriceOf ? args.unitPriceOf(id) : 1);
  const kind = DESK_BOOK_KIND[book] ?? defect(`desk book '${book}' names no register kind — its fills cannot be wired`);
  const inUnits = args.unitPriceOf !== undefined;
  const clearedIds = new Set(args.instruments.map((i) => i.id));
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    const deskId = dealerDeskParticipantId(bank.ticker);
    const dpi = args.piById?.get(deskId);
    if (args.piById !== undefined && dpi === undefined) return;
    const fills = args.piById !== undefined ? undefined : result.newParticipantHoldings.get(deskId);
    if (args.piById === undefined && !fills) return;

    // §3.13-BOOK d3d: the desk's positions in the names this session priced are its register
    // rows of the book's kind (narrowed to the session's names — the two sovereign books share
    // a kind). A stage may only rewrite the instruments it cleared: a position in a name that
    // carried no float this week is a row this pass never touches.
    const desk = bankSecuritiesParty(bank);
    const house = { kind: 'CLEARING_HOUSE' as const, region: bank.region };
    const prior = priorPositions(ctx.v2, bank.id, book, clearedIds);
    // The book is carried at MARKET: what it held, valued at this week's level. The change from
    // last week's carrying value is real trading P&L and hits equity, and the row is re-marked
    // here before the fills land on it. Without the mark, the difference between the cost the
    // position was booked at and the price this week's cash leg used showed up as a phantom fee.
    let prevMarkedLocal = 0;
    let markToMarketLocal = 0;
    prior.forEach((p, instrumentId) => {
      const markedLocal = p.units * unitPrice(instrumentId);
      prevMarkedLocal += markedLocal;
      markToMarketLocal += markedLocal - p.inventoryLocal;
      if (markedLocal !== p.inventoryLocal) markHolding(ctx.v2, deskBookId(bank.id), p.row, markedLocal);
    });
    let newLocal = 0;
    const filledIds = new Set<InstrumentId>();
    // W2: THE DESK'S FILLS ARE WIRES, and since d3d the wire IS the row's move: its position
    // after the session against the one before, per cleared name, transferred against the
    // clearing house — bought or sold, one signed row each. A unit book (equity) moves shares at
    // the cleared price; a par book moves face.
    const settle = (afterUnits: number, instrumentId: InstrumentId): void => {
      const px = unitPrice(instrumentId);
      const priorUnits = prior.get(instrumentId)?.units ?? 0;
      const dUnits = afterUnits - priorUnits;
      if (!(Math.abs(dUnits * px) > 1)) return;
      const spec = { instrumentType: kind, instrumentId, issuerRegion: bank.region, valueLocal: Math.abs(dUnits) * px, ...(inUnits ? { shares: Math.abs(dUnits) } : { units: Math.abs(dUnits) }) };
      if (dUnits > 0) transferHolding(ctx.v2, house, desk, spec, `${book} desk fill`);
      else transferHolding(ctx.v2, desk, house, spec, `${book} desk fill`);
    };
    const applyFill = (units: number, instrumentId: InstrumentId): void => {
      if (!clearedIds.has(instrumentId)) return;
      filledIds.add(instrumentId);
      const inventoryLocal = units * unitPrice(instrumentId);
      const afterUnits = Math.abs(inventoryLocal) > 1 ? units : 0;
      if (afterUnits !== 0) newLocal += inventoryLocal;
      settle(afterUnits, instrumentId);
    };
    if (dpi !== undefined) {
      const nI = result.nInstruments;
      const base = dpi * nI;
      for (let i = 0; i < nI; i++) {
        const units = result.holdingsMatrix[base + i];
        if (units !== 0) applyFill(units, args.instruments[i].id);
      }
    } else {
      fills!.forEach(applyFill);
    }
    // A cleared name the engine reports no holding in: the desk is out of it — sold to the house,
    // exactly as the before/after wire recorded it when the book was rebuilt from the fills.
    prior.forEach((_p, instrumentId) => { if (!filledIds.has(instrumentId)) settle(0, instrumentId); });
    const cashDeltaLocal = args.cashDeltaOf
      ? args.cashDeltaOf(deskId)
      : (result.netCashDeltaByParticipantId.get(deskId) ?? 0);
    // WHAT THE SESSION LEFT OVER, SIGNED. Cash out plus inventory in is the desk's own trading
    // result: negative it is a cost, positive it is a gain, and both are the bank's. Floored at
    // zero, a negative residual was charged to equity as a "fee" and a positive one was silently
    // discarded — cash arriving on the securities account with no entry against it, and the
    // per-bank identity drifting by exactly that.
    const residualLocal = cashDeltaLocal + (newLocal - prevMarkedLocal);
    // DESK_TRACE=1 instrument: the desk's whole leg for one book in one line — the fee formula
    // charges equity with any cash that left without inventory arriving, so a books-vs-cash
    // disagreement in the clearing engine lands HERE as a phantom fee. Print it where it books.
    if (process.env.DESK_TRACE === '1' && (Math.abs(residualLocal) > 50e6 || Math.abs(markToMarketLocal) > 50e6)) {
      const dbgFills = fills ?? result.newParticipantHoldings.get(deskId) ?? new Map<InstrumentId, number>();
      const fillsStr = Array.from(dbgFills.entries())
        .filter(([id, units]) => Math.abs(units * unitPrice(id)) > 10e6)
        .map(([id, units]) => `${id.slice(0, 12)} u${(units / 1e6).toFixed(1)}M@${unitPrice(id).toFixed(3)}`)
        .slice(0, 6).join(' ');
      console.log(`  [desk] w${ctx.nextWeek} ${bank.ticker} ${book}: prevMarked ${(prevMarkedLocal / 1e6).toFixed(1)}M`
        + ` new ${(newLocal / 1e6).toFixed(1)}M cash ${(cashDeltaLocal / 1e6).toFixed(1)}M`
        + ` residual ${(residualLocal / 1e6).toFixed(1)}M mtm ${(markToMarketLocal / 1e6).toFixed(1)}M :: ${fillsStr}`);
      const floatById = new Map(args.instruments.map((i2) => [i2.id, i2.tradableFloatLocal]));
      prior.forEach((p, instrumentId) => {
        if (Math.abs(p.inventoryLocal) < 25e6) return;
        console.log(`    [desk-prior] ${bank.ticker} ${instrumentId} held ${(p.inventoryLocal / 1e6).toFixed(1)}M`
          + ` -> fill ${dbgFills.has(instrumentId) ? (((dbgFills.get(instrumentId) ?? 0) * unitPrice(instrumentId)) / 1e6).toFixed(1) + 'M' : 'NONE'}`
          + ` float ${((floatById.get(instrumentId) ?? 0) / 1e6).toFixed(1)}M`);
      });
    }
    updateBankSheet(ctx, bank.ticker, {
      ...bookPnL(bookPnL(sheet, residualLocal, `desk trading result: ${book}`, bank.ticker),
        markToMarketLocal, `desk mark-to-market: ${book}`, bank.ticker),
    });
  });
}

/** The dealer capacity live in one book across a region's banks — what a new deal can be
 *  placed into without anyone taking price risk, and therefore what an underwriter's fee is
 *  quoted against (G3c). */
export function totalDeskCapacityLocal(ctx: WeeklyStepContext, banks: Company[], book: string): number {
  let capacityLocal = 0;
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    capacityLocal += deskCapacityLocal(ctx, bank, sheet, book);
  });
  return capacityLocal;
}

/**
 * The mandate allocator for one pass: who each issuer's lead bank is, and what winning a
 * mandate costs the winner. The relationship comes off the banks' own itemized loan books, so it
 * is measured every time and a bank that lets a facility run off loses the call; free capacity
 * comes off the same desk capacity that underwrites the deal, and `award` decrements it, so a
 * bank that has taken deals on this week stops winning them.
 */
export function leadBankAllocator(ctx: WeeklyStepContext, banks: Company[], book: string) {
  const freeLocal = new Map<string, number>();
  const lentByBankByBorrower = new Map<Ticker, Map<string, number>>();
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    freeLocal.set(bank.ticker, deskCapacityLocal(ctx, bank, sheet, book));
    const byBorrower = new Map<string, number>();
    // The relationship is the facilities this bank has lent — its rows on the ladders.
    facilityRowsOf(ctx.v2, bank.id).forEach((l) => {
      byBorrower.set(l.borrowerId, (byBorrower.get(l.borrowerId) ?? 0) + l.principalLocal);
    });
    lentByBankByBorrower.set(bank.ticker, byBorrower);
  });
  const tickerOfBankId = new Map(banks.map((b) => [b.id, b.ticker]));
  return {
    // §3.13-BOOK (c-then-3b): a candidate names the bank by its ENTITY id — `leadBankId` is what
    // the offering stores, and the ranking never reads a name at all.
    candidatesFor: (issuerId: string): LeadBankCandidate[] => banks.map((bank) => ({
      id: bank.id,
      bankMarketShare: bank.bankMarketShare,
      relationshipLocal: lentByBankByBorrower.get(bank.ticker)?.get(issuerId) ?? 0,
      freeCapacityLocal: freeLocal.get(bank.ticker) ?? 0,
    })),
    /** The winner's desk is that much less able to win the next one. */
    award: (bankId: EntityId, sizeLocal: number) => {
      const ticker = tickerOfBankId.get(bankId);
      if (ticker) freeLocal.set(ticker, Math.max(0, (freeLocal.get(ticker) ?? 0) - Math.max(0, sizeLocal)));
    },
  };
}

/** Route a desk's participant id to the bank whose reserves fund it. */
export function dealerDeskPartyOf(
  participantId: string, deskTickers: ReadonlySet<Ticker>,
  bankIdOfTicker: (ticker: Ticker) => EntityId | undefined,
): PartyRef | undefined {
  const ticker = dealerDeskTicker(participantId);
  if (ticker === undefined || !deskTickers.has(ticker)) return undefined;
  // §3.13-BOOK (c-then-3b): a desk seat embeds its bank's TICKER; a party names it by entity id.
  const bankId = bankIdOfTicker(ticker);
  return bankId === undefined ? undefined : bankSecuritiesPartyOf(bankId);
}

/** The tickers whose desks were built, for the settle pass's routing. */
export function deskTickersOf(participants: ClearingParticipant[]): Set<Ticker> {
  const out = new Set<Ticker>();
  participants.forEach((p) => {
    const t = dealerDeskTicker(p.id);
    if (t !== undefined) out.add(t);
  });
  return out;
}

export type { RegionId };
