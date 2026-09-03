/**
 * The per-bank dealer desks, as participants in the books they make markets in.
 *
 * The shape of the desk (why a market maker's schedule is what it is, why its size is its own
 * leverage headroom, and what this replaces) is documented once in domain/dealer-desk.ts. This
 * is the engine-side half: turning each named bank's desk into a `ClearingParticipant` the same
 * auction already knows how to price, and writing the fills back onto the bank that carried them.
 */

import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { bankCashBufferRatioOf } from '../../macro/banking';
import { Company, RegionId } from '../../../types';
import {
  DealerDeskInventory, DealerDeskPosition, dealerDeskCapacityUSD, dealerDeskParticipantId,
  dealerDeskTicker, regionalDeskView,
} from '../../../domain/dealer-desk';
import { LeadBankCandidate } from '../../../domain/primary-market';
import { leverageHeadroomUSD, BASEL_MIN_LEVERAGE_RATIO } from '../../macro/banking';
import { ClearingInstrument, ClearingParticipant, ClearingResult, ParticipantDemand } from './financial-clearing-engine';
import { WeeklyStepContext, updateBankSheet } from './context';
import { bookPnL } from '../../ledger/bank-book';
import { pendingSettlementUSD } from './settlement';
import { PartyRef } from './settlement';
import { clearedBookDelta, HoldingKind } from '../../ledger/holdings-ledger';
import { defect } from '../../../domain/defect';
import { facilityBookOf, facilityRowsOf, isTrancheId, issuerIdOf } from '../../../engine2/tranches';
import { isTrancheKind } from '../../../domain/assets';
import { splitAcrossTranches, CreditKind } from './register-split';
import type { V2World } from '../../../engine2/world';

/** W2: the register kind each desk book carries — the wire's asset kind. */
const DESK_BOOK_KIND: Record<string, HoldingKind> = {
  'corporate bond': 'CORP_BOND', 'sovereign bond': 'GOV_BOND', bill: 'GOV_BOND',
  'leveraged loan': 'LEVERAGED_LOAN', equity: 'EQUITY', 'commercial paper': 'COMMERCIAL_PAPER',
};

/** The bank's own working sheet this week — a stage before this one may already have moved it. */
function sheetOf(ctx: WeeklyStepContext, bank: Company) {
  return ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
}

function priorPositions(inv: DealerDeskInventory | undefined, book: string): Map<string, DealerDeskPosition> {
  const byId = new Map<string, DealerDeskPosition>();
  (inv?.[book] ?? []).forEach((p) => byId.set(p.instrumentId, p));
  return byId;
}

/**
 * ONE THING, ONE KEY. A desk's credit inventory is stored under the TRANCHE it holds — the same
 * key the register uses — while a credit book still CLEARS one instrument per issuer. This maps a
 * stored position back to the instrument the auction prices, so the two can be told apart: the
 * store keeps the paper's name, the clearing reads the issuer's.
 *
 * Before this the desks kept the issuer's id and the register kept the tranche's, so every move
 * between them wired a sale of one name against a purchase of another for the same asset. They
 * netted in dollars within a kind, which is why only the residue ever printed (W2) — and the
 * residue is real. `O8` counted 12,043 desk positions worth 365.5B on the wrong key at the peak.
 */
const clearingKeyOf = (v2: V2World, instrumentId: string): string =>
  isTrancheId(v2, instrumentId) ? issuerIdOf(v2, instrumentId) : instrumentId;

/** The prior book as the AUCTION sees it: tranche rows summed back under their issuer. */
function priorByClearingKey(v2: V2World, inv: DealerDeskInventory | undefined, book: string): Map<string, DealerDeskPosition> {
  const byKey = new Map<string, DealerDeskPosition>();
  (inv?.[book] ?? []).forEach((p) => {
    const key = clearingKeyOf(v2, p.instrumentId);
    const cur = byKey.get(key);
    if (!cur) { byKey.set(key, { instrumentId: key, inventoryUSD: p.inventoryUSD, ...(p.units !== undefined ? { units: p.units } : {}) }); return; }
    cur.inventoryUSD += p.inventoryUSD;
    if (p.units !== undefined) cur.units = (cur.units ?? 0) + p.units;
  });
  return byKey;
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
    const prior = priorByClearingKey(ctx.v2, sheet.dealerDeskInventory, book);
    const capacityUSD = dealerDeskCapacityUSD({
      balanceSheetCapacityUSD: sheet.bankEquityUSD / BASEL_MIN_LEVERAGE_RATIO,
      leverageHeadroomUSD: leverageHeadroomUSD(sheet, bankReservesOf(ctx.v2, bank.ticker), facilityBookOf(ctx.v2, bank.ticker)),
      inventory: sheet.dealerDeskInventory,
      book,
    });
    let priorTotalUSD = 0;
    prior.forEach((p) => { priorTotalUSD += Math.abs(p.inventoryUSD); });
    if (capacityUSD <= 0 && priorTotalUSD <= 0) return;

    // A desk pays for inventory with the bank's own reserves, above the buffer it must keep —
    // the same real constraint the bank's investment book faces in 07c, and the reason a desk
    // with capital ratio to spare can still be unable to bid.
    const settledCashUSD = bankReservesOf(ctx.v2, bank.ticker)
      + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
    const fundableUSD = Math.max(0, settledCashUSD - householdDepositsAt(ctx.v2, bank.ticker) * bankCashBufferRatioOf(bank));

    const currentHoldingsByInstrumentId = new Map<string, number>();
    const demandByIndex: (ParticipantDemand | undefined)[] = new Array(instruments.length);
    instruments.forEach((inst, i) => {
      const priorPos = prior.get(inst.id);
      const px = unitPrice(i);
      // Carried at market: the position is the UNITS it holds, valued at this week's level.
      const priorUnits = Math.max(0, priorPos?.units ?? (priorPos ? priorPos.inventoryUSD / px : 0));
      const priorUSD = priorUnits * px;
      // A DESK'S EXISTING POSITION IS A FACT, not a function of this week's float, and it is
      // declared before any float test. It used to sit BELOW the `liveFloatUSD[i] <= 0` guard, so
      // a name whose float came out zero left the desk reporting no holding — and
      // `applyDealerDeskFills`, which rebuilds the book from the fills for every name it cleared,
      // then deleted the position with no cash leg. That is the WS5 bug this file's own comment
      // warns about, and OWN7 walked straight into it: once the float became "what the
      // participants hold", a book whose float is set AFTER the desks are built hands them zero.
      // Measured in the CP book on its first run: the desks' 2.34B position entering the week as
      // 0.02B, and 2.3B of paper left held by nobody.
      if (priorUnits > 0) currentHoldingsByInstrumentId.set(inst.id, priorUnits);
      if (liveFloatUSD[i] <= 0) return;
      const floatShare = liveFloatUSD[i] / totalFloatUSD;
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
  /** The names this session actually priced. A stage may only rewrite the instruments it
   *  cleared: a desk position in a name that carried no float this week is untouched,
   *  not deleted — rebuilding the book from the fills alone made those positions vanish with no
   *  cash leg, which is the exact WS5 bug, caught by the per-bank identity in its first probe. */
  instruments: ClearingInstrument[];
  result: ClearingResult;
  /** The unit price, for a book that clears in units — the inventory a bank carries is money. */
  unitPriceOf?: (instrumentId: string) => number;
  /** The desk's money leg, for a book whose engine cash legs are unit-denominated (07e). */
  cashDeltaOf?: (deskParticipantId: string) => number;
  /** int flip — participant index by id; when present the desk fills read the dense
   *  holdings matrix and the lazy map is never materialized for this book. */
  piById?: Map<string, number>;
}): Map<string, number> {
  const { ctx, banks, book, result } = args;
  const unitPrice = (id: string) => Math.max(1e-9, args.unitPriceOf ? args.unitPriceOf(id) : 1);
  const inventories: (DealerDeskInventory | undefined)[] = [];
  banks.forEach((bank) => {
    const sheet = sheetOf(ctx, bank);
    if (!sheet) return;
    const deskId = dealerDeskParticipantId(bank.ticker);
    const dpi = args.piById?.get(deskId);
    if (args.piById !== undefined && dpi === undefined) { inventories.push(sheet.dealerDeskInventory); return; }
    const fills = args.piById !== undefined ? undefined : result.newParticipantHoldings.get(deskId);
    if (args.piById === undefined && !fills) { inventories.push(sheet.dealerDeskInventory); return; }

    const clearedIds = new Set(args.instruments.map((i) => i.id));
    const prior = priorPositions(sheet.dealerDeskInventory, book);
    // The book is carried at MARKET: what it held, valued at this week's level. The change from
    // last week's carrying value is real trading P&L and hits equity. Without the mark, the
    // difference between the cost the position was booked at and the price this week's cash leg
    // used showed up as a phantom fee, and the per-bank identity drifted by exactly it.
    let prevMarkedUSD = 0;
    let markToMarketUSD = 0;
    const positions: DealerDeskPosition[] = [];
    prior.forEach((p, instrumentId) => {
      // Carried forward VERBATIM, on the key it is stored under; only the test of whether this
      // session priced it resolves to the auction's instrument.
      const ck = clearingKeyOf(ctx.v2, instrumentId);
      if (!clearedIds.has(ck)) { positions.push(p); return; }
      const units = p.units ?? p.inventoryUSD;
      const markedUSD = units * unitPrice(ck);
      prevMarkedUSD += markedUSD;
      markToMarketUSD += markedUSD - p.inventoryUSD;
    });
    let newUSD = 0;
    const bookKind = DESK_BOOK_KIND[book];
    const applyFill = (units: number, instrumentId: string): void => {
      if (!clearedIds.has(instrumentId)) return;
      const inventoryUSD = units * unitPrice(instrumentId);
      if (Math.abs(inventoryUSD) <= 1) return;
      // A credit fill is priced per ISSUER and STORED per tranche, split by face the same way
      // the register splits a holder's position — so the desk and the register name the same
      // paper. A short position splits by the same weights with the sign put back.
      if (isTrancheKind(bookKind) && !isTrancheId(ctx.v2, instrumentId)) {
        const sign = inventoryUSD < 0 ? -1 : 1;
        const parts = splitAcrossTranches(ctx.v2, instrumentId, bookKind as CreditKind, Math.abs(inventoryUSD));
        parts.forEach((t) => {
          const usd = sign * t.usd;
          if (Math.abs(usd) <= 1) return;
          positions.push({ instrumentId: t.instrumentId, inventoryUSD: usd, units: usd });
          newUSD += usd;
        });
        return;
      }
      positions.push({ instrumentId, inventoryUSD, units });
      newUSD += inventoryUSD;
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
    const cashDeltaUSD = args.cashDeltaOf
      ? args.cashDeltaOf(deskId)
      : (result.netCashDeltaByParticipantId.get(deskId) ?? 0);
    // WHAT THE SESSION LEFT OVER, SIGNED. Cash out plus inventory in is the desk's own trading
    // result: negative it is a cost, positive it is a gain, and both are the bank's. Floored at
    // zero, a negative residual was charged to equity as a "fee" and a positive one was silently
    // discarded — cash arriving on the securities account with no entry against it, and the
    // per-bank identity drifting by exactly that.
    const residualUSD = cashDeltaUSD + (newUSD - prevMarkedUSD);

    // W2: THE DESK'S FILLS ARE WIRES. Its position after the session against the one
    // before, per cleared name, against the clearing house — bought or sold, one number each.
    // A unit book (equity) wires shares at the cleared price; a par book wires face at 1.
    {
      const kind = DESK_BOOK_KIND[book] ?? defect(`desk book '${book}' names no register kind — its fills cannot be wired`);
      const inUnits = args.unitPriceOf !== undefined;
      const toEntry = (units: number, instrumentId: string) =>
        inUnits ? { valueUSD: units * unitPrice(instrumentId), shares: units } : { valueUSD: units };
      const before = new Map<string, { valueUSD: number; shares?: number }>();
      prior.forEach((p, instrumentId) => {
        if (clearedIds.has(instrumentId)) before.set(instrumentId, toEntry(p.units ?? p.inventoryUSD, instrumentId));
      });
      const after = new Map<string, { valueUSD: number; shares?: number }>();
      positions.forEach((p) => {
        if (clearedIds.has(p.instrumentId)) after.set(p.instrumentId, toEntry(p.units ?? p.inventoryUSD, p.instrumentId));
      });
      clearedBookDelta({ kind: 'BANK_SECURITIES', ticker: bank.ticker }, bank.region, kind, before, after,
        (id) => unitPrice(id), `${book} desk fill`);
    }

    const inventory: DealerDeskInventory = { ...(sheet.dealerDeskInventory ?? {}) };
    if (positions.length > 0) inventory[book] = positions;
    else delete inventory[book];
    // DESK_TRACE=1 instrument: the desk's whole leg for one book in one line — the fee formula
    // charges equity with any cash that left without inventory arriving, so a books-vs-cash
    // disagreement in the clearing engine lands HERE as a phantom fee. Print it where it books.
    if (process.env.DESK_TRACE === '1' && (Math.abs(residualUSD) > 50e6 || Math.abs(markToMarketUSD) > 50e6)) {
      const dbgFills = fills ?? result.newParticipantHoldings.get(deskId) ?? new Map<string, number>();
      const fillsStr = Array.from(dbgFills.entries())
        .filter(([id, units]) => Math.abs(units * unitPrice(id)) > 10e6)
        .map(([id, units]) => `${id.slice(0, 12)} u${(units / 1e6).toFixed(1)}M@${unitPrice(id).toFixed(3)}`)
        .slice(0, 6).join(' ');
      console.log(`  [desk] w${ctx.nextWeek} ${bank.ticker} ${book}: prevMarked ${(prevMarkedUSD / 1e6).toFixed(1)}M`
        + ` new ${(newUSD / 1e6).toFixed(1)}M cash ${(cashDeltaUSD / 1e6).toFixed(1)}M`
        + ` residual ${(residualUSD / 1e6).toFixed(1)}M mtm ${(markToMarketUSD / 1e6).toFixed(1)}M :: ${fillsStr}`);
      // The wiped-name decomposition: each cleared prior position, whether the fills map came
      // back with the name, and the name's float in this clearing — the three facts that decide
      // whether its removal had a cash leg.
      const floatById = new Map(args.instruments.map((i2) => [i2.id, i2.tradableFloatUSD]));
      prior.forEach((p, instrumentId) => {
        if (!clearedIds.has(instrumentId) || Math.abs(p.inventoryUSD) < 25e6) return;
        console.log(`    [desk-prior] ${bank.ticker} ${instrumentId} held ${(p.inventoryUSD / 1e6).toFixed(1)}M`
          + ` -> fill ${dbgFills.has(instrumentId) ? (((dbgFills.get(instrumentId) ?? 0) * unitPrice(instrumentId)) / 1e6).toFixed(1) + 'M' : 'NONE'}`
          + ` float ${((floatById.get(instrumentId) ?? 0) / 1e6).toFixed(1)}M`);
      });
    }
    updateBankSheet(ctx, bank.ticker, {
      ...bookPnL(bookPnL(sheet, residualUSD, `desk trading result: ${book}`, bank.ticker),
        markToMarketUSD, `desk mark-to-market: ${book}`, bank.ticker),
      dealerDeskInventory: inventory,
    });
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
      leverageHeadroomUSD: leverageHeadroomUSD(sheet, bankReservesOf(ctx.v2, bank.ticker), facilityBookOf(ctx.v2, bank.ticker)),
      inventory: sheet.dealerDeskInventory,
      book,
    });
  });
  return capacityUSD;
}

/**
 * The mandate allocator for one pass: who each issuer's lead bank is, and what winning a
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
      leverageHeadroomUSD: leverageHeadroomUSD(sheet, bankReservesOf(ctx.v2, bank.ticker), facilityBookOf(ctx.v2, bank.ticker)),
      inventory: sheet.dealerDeskInventory,
      book,
    }));
    const byBorrower = new Map<string, number>();
    // The relationship is the facilities this bank has lent — its rows on the ladders.
    facilityRowsOf(ctx.v2, bank.ticker).forEach((l) => {
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
