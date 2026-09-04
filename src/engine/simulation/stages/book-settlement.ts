/**
 * SETL6 — the cash half of a cleared book, shared by the five clearing adapters
 * (07b bonds, 07c sovereigns, 07d loans, 07e equity, 07f bills).
 *
 * Until this existed each book moved its participants' money itself: `entity.cashLocal +=`,
 * `cashReservesLocal +=`. A balance changed and no bank's book knew — the same shape as the
 * corporate-cash leak §7.86 was found by, and the reason institutional cash volatility could
 * not be seen for what it was (§7.91): the clearing legs ARE the volatility, and they were
 * invisible to the layer that watches money move.
 *
 * **The real mechanism.** A cleared market settles through a CENTRAL COUNTERPARTY. Every
 * participant faces the clearing house rather than each other, pays or receives its net for the
 * session, and the clearing house is flat by construction — it is on both sides of every trade.
 * That is exactly the invariant this buys: the dealer's leg, the desks' fees and every
 * participant's net all settle against one party, so a book that forgets a leg leaves the
 * clearing house holding money and `clearingHouseResidualLocal` says so instead of the dollars
 * quietly vanishing.
 *
 * **The dealer.** It is the counterparty to every fill, so it receives exactly what the
 * participants paid (`dealerNetCashLocal`). The fee half is the desks' revenue and goes to the
 * named banks by market share, cash and equity together. What is left is the week's PRIMARY
 * placement, and it goes to the ISSUERS who brought the paper, by name and in proportion to
 * what each one's deal actually placed — stage 08 reports the same proceeds on the issuer's cash
 * walk and settles none of them.
 *
 * There is no third leg any more. The `<book> dealer inventory` line that used to stand here —
 * an UNMODELED funder for a residual sitting on a region rather than on any balance sheet — is
 * gone, because the residual is gone: OWN7's two-sided rationing means an unsold holding stays
 * with its holder (financial-clearing-engine.ts, `unsoldStaysWithHolder`). What reaches this
 * function now is participants, fees and the primary, and all three have names. The leg stays in
 * the code as a GUARD: if a book ever leaves money over again, it prints under its own reason
 * instead of vanishing.
 */

import { RegionId } from '../../../types';
import { CurrencyCode } from '../../../domain/geography';
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { defect } from '../../../domain/defect';
import { ClearingResult } from './financial-clearing-engine';
import { transferHolding, HoldingSpec, HoldingKind } from '../../ledger/holdings-ledger';
import { heldInShares } from '../../../domain/assets';
import type { InstrumentId } from '../../../domain/ids';
import { banksOf } from '../../../domain/company';
import { bankTickerOfParticipant, treasuryTickerOfParticipant, householdRegionOfParticipant } from '../../../domain/participant-keys';
import { dealerDeskPartyOf } from './dealer-desks';
import { CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import type { ItemizedHolding } from '../../../domain/banking';
import { isKnownEntity } from '../../../domain/ids';
import type { EntityId, Ticker } from '../../../domain/ids';
import { asTicker } from '../../../domain/ids';

/** A desk that earns a share of the book's fees: a named bank, and how much of the flow it sees. */
export interface FeeDesk { ticker: Ticker; share: number }

/**
 * Settle one region's session of one book.
 *
 * `netCashByParticipantId` is the engine's cash leg per participant (07e computes its own, in
 * money, from a share-unit book). `partyOf` maps a participant id to who actually holds the
 * money; a participant it cannot name settles against the boundary under its own reason, so an
 * unrouted book is a visible line rather than a silent loss.
 */
/** What one issuer's deal placed with this book's participants, and who to pay for it. */
export interface PrimaryTake {
  party: PartyRef;
  amountLocal: number;
  /** §5-WIRES W2: the paper the issuer delivers to the clearing house against that money —
   *  the participants' fills draw it down (holdings-store, `clearedBookDelta`). */
  asset?: HoldingSpec;
}

/**
 * §3.13b / `../../../../docs/instruments/bond.md` N9.b — THE ACCRUED THE PAPER CARRIES.
 *
 * A quoted bond price is a CLEAN price. The interest that has accrued since the paper's last
 * coupon date belongs to whoever held it while it accrued, so the buyer pays it to the seller on
 * top of the price — and then collects the whole coupon on the date. Without the leg the seller
 * financed the issuer interest-free until that date.
 *
 * `byParticipantId` is what each participant owes (positive) or is owed (negative) for the face it
 * took or gave up. It does NOT net to zero: the participants' face deltas sum to what the week's
 * PRIMARY placed, and seasoned paper the issuer places carries accrued the issuer has never paid
 * anyone for. So the net is the ISSUER's, and its receivable to the holders rises by exactly the
 * cash it just took for it.
 *
 * §3.13 row 2: the net is per INSTRUMENT, because a book of many borrowers has many issuers to owe
 * it. A sovereign book has one and hands back the same treasury for every bond; the corporate book
 * hands back the borrower whose paper it is, and a deal struck this week carries no accrued at all
 * so its issuer is owed nothing.
 */
export interface AccruedLeg {
  byParticipantId: Map<string, number>;
  netByInstrumentId: Map<InstrumentId, number>;
  issuerOf: (instrumentId: InstrumentId) => PartyRef | undefined;
}

/**
 * What each participant owes for the accrued on the face it bought — and is owed on the face it
 * sold. One unit of face carries one accrued, whoever holds it, so a participant's leg is its own
 * face delta times that; `onMove` re-keys the same amount on the accrual ledger, which is the
 * other half of the same trade (rule 5).
 */
export function accruedOnFills(
  participants: readonly { id: string; currentHoldingsByInstrumentId: ReadonlyMap<InstrumentId, number> }[],
  newHoldingsByParticipantId: ReadonlyMap<string, ReadonlyMap<InstrumentId, number>>,
  accruedPerFaceOf: (instrumentId: InstrumentId) => number,
  onMove: (instrumentId: InstrumentId, participantId: string, deltaLocal: number) => void
): { byParticipantId: Map<string, number>; netByInstrumentId: Map<InstrumentId, number> } {
  const byParticipantId = new Map<string, number>();
  const netByInstrumentId = new Map<InstrumentId, number>();
  participants.forEach((p) => {
    const after = newHoldingsByParticipantId.get(p.id);
    let owedLocal = 0;
    new Set([...p.currentHoldingsByInstrumentId.keys(), ...(after?.keys() ?? [])]).forEach((id) => {
      const perFace = accruedPerFaceOf(id);
      if (!(perFace > 0)) return;
      const usd = ((after?.get(id) ?? 0) - (p.currentHoldingsByInstrumentId.get(id) ?? 0)) * perFace;
      if (usd === 0) return;
      owedLocal += usd;
      netByInstrumentId.set(id, (netByInstrumentId.get(id) ?? 0) + usd);
      onMove(id, p.id, usd);
    });
    if (owedLocal !== 0) byParticipantId.set(p.id, owedLocal);
  });
  return { byParticipantId, netByInstrumentId };
}

/**
 * §3.13-READ D1 — WHO A PARTICIPANT IS, for both halves of its settlement: the money and the
 * accrual ledger's key. One reading, for every book.
 *
 * Six books wrote this themselves and drifted on the bank arm three ways (see
 * `domain/participant-keys.ts`). Every arm is offered to every caller here, unconditionally,
 * because the id grammars are DISJOINT: a book whose auction never admits a company treasury
 * simply never sees a `TREASURY-` id, and the arm is inert rather than wrong. The two things a
 * caller must still name are the ones that are not grammar — which entity ids it admitted, and
 * which banks' desks it built — plus 07c's own convention, where a bank bids under its PLAIN
 * ticker rather than a prefixed id.
 *
 * The accrual walks name their holders the same way (`shared-helpers:applyHolderInterestAccruals`,
 * `sovereign-calendar:accrueSovereignHolders`), so a balance moved here is a balance they find.
 */
/**
 * §3.13-READ D3 — A FILL ROW, IN PAR SPACE. Six named copies and two inline ones wrote this
 * object literal, and every one of them said the same thing: the row carries the FACE it holds,
 * and the cash leg beside it paid the cleared price for that face. What the register is WORTH is
 * `face × price`, which `P5` measures until the mark lands (§3.13's item 4, which cannot land one
 * book at a time). Written once, it stays that way when the mark does land.
 */
export function parHoldingRow(
  instrumentType: ItemizedHolding['instrumentType'],
  issuerRegion: RegionId
): (instrumentId: InstrumentId, faceLocal: number) => ItemizedHolding {
  return (instrumentId, faceLocal) =>
    ({ instrumentId, instrumentType, issuerRegion, quantityOrNotionalLocal: faceLocal, units: faceLocal });
}

/**
 * §3.13-READ D2 — WRITE THIS SESSION'S FILLS BACK, AND ONLY WHAT IT CLEARED (§7.34, the WS5 bug).
 *
 * Three books wrote this loop verbatim — the largest duplicated block in the set. Two kinds of
 * CLAIMED row survive a session untouched, and both would otherwise vanish with no cash leg:
 *
 *   · **Paper this book did not price** — a claim on a tranche that has retired, standing at
 *     whatever the borrower's cash could not reach this week and claimed again next week.
 *   · **Every row of an entity that got no seat in the auction at all** (an index fund with
 *     nothing investable): it sold nothing, so it must keep everything.
 *
 * A claimed row the book DID price is the one case the fill replaces, because the fill is the
 * whole truth about that position now. Rebuilding a book from fills alone is what deleted 26.6B
 * of bank bills in week 1 the last time a stage did it.
 */
export function writeBackClearedFills(args: {
  store: { append: (entityId: string, rows: ItemizedHolding[]) => void };
  entities: readonly { id: string }[];
  /** Each entity's row in the clearing result, absent if it had no seat. */
  piById: ReadonlyMap<string, number>;
  /** What each entity held coming in, by instrument. */
  claimedByEntity: ReadonlyMap<string, ReadonlyMap<InstrumentId, number>>;
  result: { nInstruments: number; holdingsMatrix: ArrayLike<number> };
  /** The instrument this session priced in each column of the matrix. */
  instrumentIdOfColumn: (column: number) => InstrumentId;
  /** Whether this session priced an instrument — a claimed row it priced is replaced by the fill. */
  priced: { has: (instrumentId: InstrumentId) => boolean };
  row: (instrumentId: InstrumentId, faceLocal: number) => ItemizedHolding;
}): void {
  const { store, entities, piById, claimedByEntity, result, instrumentIdOfColumn, priced, row } = args;
  entities.forEach((entity) => {
    const pi = piById.get(entity.id);
    const claimed = claimedByEntity.get(entity.id);
    const rows: ItemizedHolding[] = [];
    if (pi !== undefined) {
      const base = pi * result.nInstruments;
      for (let i = 0; i < result.nInstruments; i++) {
        const faceLocal = result.holdingsMatrix[base + i];
        if (faceLocal > 1) rows.push(row(instrumentIdOfColumn(i), faceLocal));
      }
    }
    if (claimed) claimed.forEach((faceLocal, instrumentId) => {
      if (!(faceLocal > 1)) return;
      if (pi !== undefined && priced.has(instrumentId)) return;
      rows.push(row(instrumentId, faceLocal));
    });
    store.append(entity.id, rows);
  });
}

export function participantPartyOf(args: {
  regionId: RegionId;
  /** The institutions this book admitted, by their own entity ids. */
  entityIds: ReadonlySet<EntityId>;
  /** The banks whose market-making desks this book built. */
  deskTickers: ReadonlySet<Ticker>;
  /** 07c only: banks that bid under their plain ticker rather than `bankParticipantId`. */
  bankTickers?: ReadonlySet<Ticker>;
}): (participantId: string) => PartyRef | undefined {
  const { regionId, entityIds, deskTickers, bankTickers } = args;
  return (id: string): PartyRef | undefined => {
    // §3.13-BOOK (c2b): membership of the admitted set is what PROVES this string is an entity
    // id — `isKnownEntity` is that proof written as a narrowing, from slice (a).
    if (isKnownEntity(entityIds, id)) return { kind: 'INSTITUTION', id };
    if (id === CENTRAL_BANK_PARTICIPANT_ID) return { kind: 'CENTRAL_BANK', region: regionId };
    if (householdRegionOfParticipant(id) !== undefined) return { kind: 'HOUSEHOLD', region: regionId };
    const bank = bankTickerOfParticipant(id);
    if (bank !== undefined) return { kind: 'BANK_SECURITIES', ticker: bank };
    const treasury = treasuryTickerOfParticipant(id);
    if (treasury !== undefined) return { kind: 'COMPANY', ticker: treasury };
    // 07c seats a bank under its bare ticker; membership of that set is the proof.
    if (bankTickers?.has(asTicker(id))) return { kind: 'BANK_SECURITIES', ticker: asTicker(id) };
    return dealerDeskPartyOf(id, deskTickers);
  };
}

export function settleClearedBook(
  ctx: WeeklyStepContext,
  regionId: RegionId,
  /**
   * §3.13c — THE MONEY THIS BOOK CLEARS IN, named once by the caller. Every one of the five cash
   * legs below used to re-derive it as `currencyOf(regionId)`: five derivations of one fact, from
   * a proxy, in one function. A domestic auction clears in its region's money and that is what
   * every caller passes — the point is that it is now the BOOK that says so, so the day an
   * instrument is cross-listed there is one place to say something else rather than five.
   */
  quoteCurrency: CurrencyCode,
  book: string,
  netCashByParticipantId: Map<string, number>,
  partyOf: (participantId: string) => PartyRef | undefined,
  dealer: { netCashLocal: number; feeLocal: number },
  feeDesks: FeeDesk[],
  primaryTakes: PrimaryTake[] = [],
  /** §3.13b: the accrued the paper carried into this session, settled through the same house. */
  accrued?: AccruedLeg
): void {
  const ccp: PartyRef = { kind: 'CLEARING_HOUSE', region: regionId };
  const reason = `${book} clearing`;

  netCashByParticipantId.forEach((deltaLocal, participantId) => {
    if (!deltaLocal) return;
    const party = partyOf(participantId) ?? defect(`${book} clearing: participant '${participantId}' names no party this model can pay`);
    const legReason = reason;
    if (deltaLocal > 0) pay(ctx, { payer: ccp, payee: party, amount: deltaLocal, currency: quoteCurrency, reason: legReason });
    else pay(ctx, { payer: party, payee: ccp, amount: -deltaLocal, currency: quoteCurrency, reason: legReason });
  });

  // §3.13b: the accrued, on the same clean price the legs above settled. Every participant faces
  // the house here too, and the house passes each instrument's net to the borrower whose paper it
  // is — whose receivable to the holders rose by the same amount when the accrual ledger re-keyed.
  if (accrued) {
    const legReason = `${book} accrued interest`;
    accrued.byParticipantId.forEach((owedLocal, participantId) => {
      if (!owedLocal) return;
      const party = partyOf(participantId) ?? defect(`${book} accrued: participant '${participantId}' names no party this model can pay`);
      if (owedLocal > 0) pay(ctx, { payer: party, payee: ccp, amount: owedLocal, currency: quoteCurrency, reason: legReason });
      else pay(ctx, { payer: ccp, payee: party, amount: -owedLocal, currency: quoteCurrency, reason: legReason });
    });
    // And the house passes each instrument's net to ITS OWN issuer, whose receivable to the
    // holders rose by the same amount when the accrual ledger re-keyed. A book with one issuer
    // names the same party every time; one with many names the borrower whose paper moved.
    accrued.netByInstrumentId.forEach((netLocal, instrumentId) => {
      if (!netLocal) return;
      const issuer = accrued.issuerOf(instrumentId)
        ?? defect(`${book} accrued: '${instrumentId}' names no issuer to owe ${(netLocal / 1e6).toFixed(3)}M of accrued`);
      if (netLocal > 0) pay(ctx, { payer: ccp, payee: issuer, amount: netLocal, currency: quoteCurrency, reason: legReason });
      else pay(ctx, { payer: issuer, payee: ccp, amount: -netLocal, currency: quoteCurrency, reason: legReason });
    });
  }

  // What is left after the fees is what the week's PRIMARY placed, and it belongs to the issuers
  // who brought the paper. Paid to each by name, pro rata to what its own deal placed.
  const tradingLocal = dealer.netCashLocal - dealer.feeLocal;
  const takeTotalLocal = primaryTakes.reduce((a, t) => a + Math.max(0, t.amountLocal), 0);
  const primaryLocal = Math.max(0, Math.min(takeTotalLocal, Math.max(0, tradingLocal)));
  if (primaryLocal > 0 && takeTotalLocal > 0) {
    primaryTakes.forEach((t) => {
      const amountLocal = Math.max(0, t.amountLocal) * (primaryLocal / takeTotalLocal);
      if (amountLocal > 0) pay(ctx, { payer: ccp, payee: t.party, amount: amountLocal, currency: quoteCurrency, reason: `${book} primary proceeds` });
    });
  }
  // §5-WIRES W2: the asset half of the primary — the issuer's paper to the clearing house, the
  // whole take (the money above is what the CCP could pay; the paper placed is what the book
  // took). A take with no asset leg is a book whose kind is not wired yet, not a silent move.
  primaryTakes.forEach((t) => {
    if (t.asset) transferHolding(ctx.v2, t.party, ccp, t.asset, `${book} primary placement`);
  });

  // §5-CLOSE: with two-sided rationing a stock book leaves nothing over beyond the rounding of
  // its legs. Rounding dust has an owner too — the desks that earned the fees absorb it — and a
  // leftover past rounding is a defect here, never a line paid to nobody.
  const leftoverLocal = tradingLocal - primaryLocal;
  const roundingToleranceLocal = Math.max(1e4, Math.abs(dealer.netCashLocal) * 1e-6);
  if (process.env.LEFTOVER_TRACE === '1' && Math.abs(leftoverLocal) > 1) {
    console.log(`  [leftover] ${regionId} ${book}: leftover ${(leftoverLocal / 1e6).toFixed(3)}M`
      + ` (dealerNet ${(dealer.netCashLocal / 1e6).toFixed(3)}M fee ${(dealer.feeLocal / 1e6).toFixed(3)}M primary ${(primaryLocal / 1e6).toFixed(3)}M)`);
  }
  if (Math.abs(leftoverLocal) > roundingToleranceLocal) defect(`${regionId} ${book} clearing left ${(leftoverLocal / 1e6).toFixed(3)}M with no owner (dealer net ${(dealer.netCashLocal / 1e6).toFixed(3)}M, fee ${(dealer.feeLocal / 1e6).toFixed(3)}M, primary ${(primaryLocal / 1e6).toFixed(3)}M)`);

  // The desks' fee income (plus the rounding dust): cash and equity together, because nothing
  // else arrived against it. Shares are normalised — the clients paid the whole fee, so the whole
  // fee reaches the desks that earned it however their market shares happen to sum.
  const totalShare = feeDesks.reduce((a, d) => a + d.share, 0);
  const deskTotalLocal = dealer.feeLocal + leftoverLocal;
  if (deskTotalLocal !== 0 && totalShare > 0) {
    feeDesks.forEach((desk) => {
      const amountLocal = deskTotalLocal * (desk.share / totalShare);
      if (amountLocal > 0) pay(ctx, { payer: ccp, payee: { kind: 'BANK', ticker: desk.ticker }, amount: amountLocal, currency: quoteCurrency, reason: `${book} dealer fee` });
      else if (amountLocal < 0) pay(ctx, { payer: { kind: 'BANK', ticker: desk.ticker }, payee: ccp, amount: -amountLocal, currency: quoteCurrency, reason: `${book} dealer fee` });
    });
  }
}

/** The desks that share a region's clearing fees: its named banks, weighted by market share. */
export function feeDesksForRegion(ctx: WeeklyStepContext, regionId: RegionId): FeeDesk[] {
  const banks = banksOf(ctx.prevActiveFirms, regionId);
  return banks.map((b) => ({ ticker: b.ticker, share: b.bankMarketShare ?? 1 / Math.max(1, banks.length) }));
}

/**
 * What each issuer's deal placed with this book's participants this week (WS8), and who to pay.
 * `valueOf` turns the engine's take into money — par for the credit books, shares x the cleared
 * price for equity.
 */
export function primaryTakes(
  result: ClearingResult,
  /** §3.13-BOOK slice (a): the outcome map is keyed by the INSTRUMENT the deal listed under, and
   *  these two callbacks were named `issuerId` because for equity the two are the same string
   *  (`equityInstrumentId`). For a credit book they never were — the deal lists as its own
   *  tranche — and the names now say which space the caller is handed. */
  partyOfInstrumentId: (instrumentId: InstrumentId) => PartyRef | undefined,
  valueOf: (marketTakeLocal: number, clearedStat: number) => number = (take) => take,
  /** §5-WIRES W2: the paper behind the take — see `primaryAssetOf`. */
  assetOf?: (instrumentId: InstrumentId, marketTake: number, clearedStat: number) => HoldingSpec | undefined
): PrimaryTake[] {
  const takes: PrimaryTake[] = [];
  result.primaryOutcomeById.forEach((o, instrumentId) => {
    if (o.withdrawn) return;
    const amountLocal = valueOf(o.marketTakeLocal, o.clearedStat);
    const party = partyOfInstrumentId(instrumentId);
    if (party && amountLocal > 0) takes.push({ party, amountLocal, asset: assetOf?.(instrumentId, o.marketTakeLocal, o.clearedStat) });
  });
  return takes;
}

/**
 * The asset leg of a primary take for a book of one kind in one region: par for the credit
 * books (the engine's take is money), shares at the cleared price for equity (the take is
 * shares). The instrument id is the issuer's — what the register keys the paper by.
 */
export function primaryAssetOf(instrumentType: HoldingKind, region: RegionId) {
  return (instrumentId: InstrumentId, marketTake: number, clearedStat: number): HoldingSpec | undefined => {
    if (!(marketTake > 0)) return undefined;
    return heldInShares(instrumentType)
      ? { instrumentType, instrumentId, issuerRegion: region, valueLocal: marketTake * clearedStat, shares: marketTake }
      : { instrumentType, instrumentId, issuerRegion: region, valueLocal: marketTake };
  };
}
