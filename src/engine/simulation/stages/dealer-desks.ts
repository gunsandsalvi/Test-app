/**
 * G3a — the per-bank dealer desks, as participants in the books they make markets in.
 *
 * The shape of the desk (why a market maker's schedule is what it is, why its size is its own
 * leverage headroom, and what this replaces) is documented once in domain/dealer-desk.ts. This
 * is the engine-side half: turning each named bank's desk into a `ClearingParticipant` the same
 * auction already knows how to price, and writing the fills back onto the bank that carried them.
 */

import { Company, RegionId } from '../../../types';
import {
  DealerDeskInventory, DealerDeskPosition, dealerDeskCapacityUSD, dealerDeskParticipantId,
  dealerDeskTicker, regionalDeskView,
} from '../../../domain/dealer-desk';
import { LeadBankCandidate } from '../../../domain/primary-market';
import { leverageHeadroomUSD, MIN_CASH_BUFFER_RATIO, BASEL_MIN_LEVERAGE_RATIO } from '../../macro/banking';
import { ClearingInstrument, ClearingParticipant, ClearingResult, ParticipantDemand } from './financial-clearing-engine';
import { WeeklyStepContext } from './context';
import { pendingSettlementUSD } from './settlement';
import { PartyRef } from './settlement';

/** The bank's own working sheet this week — a stage before this one may already have moved it. */
function sheetOf(ctx: WeeklyStepContext, bank: Company) {
  return ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
}

function priorPositions(inv: DealerDeskInventory | undefined, book: string): Map<string, number> {
  const byId = new Map<string, number>();
  (inv?.[book] ?? []).forEach((p) => byId.set(p.instrumentId, p.inventoryUSD));
  return byId;
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
  const liveFloatUSD = instruments.map((i, idx) => Math.max(0, i.tradableFloatUSD + (i.primaryOfferingUSD ?? 0)) * (args.unitPriceOf ? unitPrice(idx) : 1));
  const totalFloatUSD = liveFloatUSD.reduce((a, b) => a + b, 0);
  if (totalFloatUSD <= 0) return [];

  const participants: ClearingParticipant[] = [];
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    const prior = priorPositions(sheet.dealerDeskInventory, book);
    const capacityUSD = dealerDeskCapacityUSD({
      balanceSheetCapacityUSD: sheet.bankEquityUSD / BASEL_MIN_LEVERAGE_RATIO,
      leverageHeadroomUSD: leverageHeadroomUSD(sheet),
      inventory: sheet.dealerDeskInventory,
      book,
    });
    let priorTotalUSD = 0;
    prior.forEach((v) => { priorTotalUSD += Math.abs(v); });
    if (capacityUSD <= 0 && priorTotalUSD <= 0) return;

    // A desk pays for inventory with the bank's own reserves, above the buffer it must keep —
    // the same real constraint the bank's investment book faces in 07c, and the reason a desk
    // with capital ratio to spare can still be unable to bid.
    const settledCashUSD = sheet.cashReservesUSD
      + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
    const fundableUSD = Math.max(0, settledCashUSD - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO);

    const currentHoldingsByInstrumentId = new Map<string, number>();
    const demandByIndex: (ParticipantDemand | undefined)[] = new Array(instruments.length);
    instruments.forEach((inst, i) => {
      if (liveFloatUSD[i] <= 0) return;
      const floatShare = liveFloatUSD[i] / totalFloatUSD;
      const priorUSD = Math.max(0, prior.get(inst.id) ?? 0);
      const px = unitPrice(i);
      if (priorUSD > 0) currentHoldingsByInstrumentId.set(inst.id, priorUSD / px);
      const roomUSD = capacityUSD * floatShare;
      const maxHoldingUSD = priorUSD + roomUSD;
      if (maxHoldingUSD <= 0) return;
      // Where the desk is neutral: the level at which its schedule asks for exactly what it
      // already holds. Everything else about the quote follows from that anchor.
      const neutralFraction = Math.max(0, Math.min(1, priorUSD / maxHoldingUSD));
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
        maxHoldingUSD: maxHoldingUSD / px,
        maxNetPurchaseUSD: (fundableUSD * floatShare) / px,
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
 * equity does not, because the securities are the other side (rule 14). What DOES hit equity is
 * the spread the desk paid the book on its own flow, exactly as the bank's investment book books
 * it in 07c: cash left beyond what the paper cost, and the identity drifts by the fee if the P&L
 * does not say so.
 */
export function applyDealerDeskFills(args: {
  ctx: WeeklyStepContext;
  banks: Company[];
  book: string;
  result: ClearingResult;
  /** The unit price, for a book that clears in units — the inventory a bank carries is money. */
  unitPriceOf?: (instrumentId: string) => number;
  /** The desk's money leg, for a book whose engine cash legs are unit-denominated (07e). */
  cashDeltaOf?: (deskParticipantId: string) => number;
}): Map<string, number> {
  const { ctx, banks, book, result } = args;
  const unitPrice = (id: string) => Math.max(1e-9, args.unitPriceOf ? args.unitPriceOf(id) : 1);
  const inventories: (DealerDeskInventory | undefined)[] = [];
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    const deskId = dealerDeskParticipantId(bank.ticker);
    const fills = result.newParticipantHoldings.get(deskId);
    if (!fills) { inventories.push(sheet.dealerDeskInventory); return; }

    const prior = priorPositions(sheet.dealerDeskInventory, book);
    let prevUSD = 0;
    prior.forEach((v) => { prevUSD += v; });
    const positions: DealerDeskPosition[] = [];
    let newUSD = 0;
    fills.forEach((units, instrumentId) => {
      const inventoryUSD = units * unitPrice(instrumentId);
      if (Math.abs(inventoryUSD) <= 1) return;
      positions.push({ instrumentId, inventoryUSD });
      newUSD += inventoryUSD;
    });
    const cashDeltaUSD = args.cashDeltaOf
      ? args.cashDeltaOf(deskId)
      : (result.netCashDeltaByParticipantId.get(deskId) ?? 0);
    const feeUSD = Math.max(0, -(cashDeltaUSD + (newUSD - prevUSD)));

    const inventory: DealerDeskInventory = { ...(sheet.dealerDeskInventory ?? {}) };
    if (positions.length > 0) inventory[book] = positions;
    else delete inventory[book];
    if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
    ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
      ...sheet,
      dealerDeskInventory: inventory,
      bankEquityUSD: sheet.bankEquityUSD - feeUSD,
    };
    inventories.push(inventory);
  });
  return regionalDeskView(inventories, book);
}

/** The dealer capacity live in one book across a region's banks — what a new deal can be
 *  placed into without anyone taking price risk, and therefore what an underwriter's fee is
 *  quoted against (G3c). */
export function totalDeskCapacityUSD(ctx: WeeklyStepContext, banks: Company[], book: string): number {
  let capacityUSD = 0;
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    capacityUSD += dealerDeskCapacityUSD({
      balanceSheetCapacityUSD: sheet.bankEquityUSD / BASEL_MIN_LEVERAGE_RATIO,
      leverageHeadroomUSD: leverageHeadroomUSD(sheet),
      inventory: sheet.dealerDeskInventory,
      book,
    });
  });
  return capacityUSD;
}

/**
 * G3c — the mandate allocator for one pass: who each issuer's lead bank is, and what winning a
 * mandate costs the winner. The relationship comes off the banks' own itemized loan books, so it
 * is measured every time and a bank that lets a facility run off loses the call; free capacity
 * comes off the same desk capacity that underwrites the deal, and `award` decrements it, so a
 * bank that has taken deals on this week stops winning them.
 */
export function leadBankAllocator(ctx: WeeklyStepContext, banks: Company[], book: string) {
  const freeUSD = new Map<string, number>();
  const lentByBankByBorrower = new Map<string, Map<string, number>>();
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    freeUSD.set(bank.ticker, dealerDeskCapacityUSD({
      balanceSheetCapacityUSD: sheet.bankEquityUSD / BASEL_MIN_LEVERAGE_RATIO,
      leverageHeadroomUSD: leverageHeadroomUSD(sheet),
      inventory: sheet.dealerDeskInventory,
      book,
    }));
    const byBorrower = new Map<string, number>();
    (sheet.businessLoans || []).forEach((l) => {
      if (l.status !== 'PERFORMING') return;
      byBorrower.set(l.borrowerId, (byBorrower.get(l.borrowerId) ?? 0) + l.principalUSD);
    });
    lentByBankByBorrower.set(bank.ticker, byBorrower);
  });
  return {
    candidatesFor: (issuerId: string): LeadBankCandidate[] => banks.map((bank) => ({
      ticker: bank.ticker,
      bankMarketShare: bank.bankMarketShare,
      relationshipUSD: lentByBankByBorrower.get(bank.ticker)?.get(issuerId) ?? 0,
      freeCapacityUSD: freeUSD.get(bank.ticker) ?? 0,
    })),
    /** The winner's desk is that much less able to win the next one. */
    award: (ticker: string, sizeUSD: number) => {
      freeUSD.set(ticker, Math.max(0, (freeUSD.get(ticker) ?? 0) - Math.max(0, sizeUSD)));
    },
  };
}

/** Route a desk's participant id to the bank whose reserves fund it. */
export function dealerDeskPartyOf(participantId: string, deskTickers: Set<string>): PartyRef | undefined {
  const ticker = dealerDeskTicker(participantId);
  if (ticker === undefined || !deskTickers.has(ticker)) return undefined;
  return { kind: 'BANK_SECURITIES', ticker };
}

/** The tickers whose desks were built, for the settle pass's routing. */
export function deskTickersOf(participants: ClearingParticipant[]): Set<string> {
  const out = new Set<string>();
  participants.forEach((p) => {
    const t = dealerDeskTicker(p.id);
    if (t !== undefined) out.add(t);
  });
  return out;
}

export type { RegionId };
