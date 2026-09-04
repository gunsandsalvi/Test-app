/**
 * SETL6 — the cash half of a cleared book, shared by the five clearing adapters
 * (07b bonds, 07c sovereigns, 07d loans, 07e equity, 07f bills).
 *
 * Until this existed each book moved its participants' money itself: `entity.cashLocal +=`,
 * `cashReservesUSD +=`. A balance changed and no bank's book knew — the same shape as the
 * corporate-cash leak §7.86 was found by, and the reason institutional cash volatility could
 * not be seen for what it was (§7.91): the clearing legs ARE the volatility, and they were
 * invisible to the layer that watches money move.
 *
 * **The real mechanism.** A cleared market settles through a CENTRAL COUNTERPARTY. Every
 * participant faces the clearing house rather than each other, pays or receives its net for the
 * session, and the clearing house is flat by construction — it is on both sides of every trade.
 * That is exactly the invariant this buys: the dealer's leg, the desks' fees and every
 * participant's net all settle against one party, so a book that forgets a leg leaves the
 * clearing house holding money and `clearingHouseResidualUSD` says so instead of the dollars
 * quietly vanishing.
 *
 * **The dealer.** It is the counterparty to every fill, so it receives exactly what the
 * participants paid (`dealerNetCashUSD`). The fee half is the desks' revenue and goes to the
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

/** A desk that earns a share of the book's fees: a named bank, and how much of the flow it sees. */
export interface FeeDesk { ticker: string; share: number }

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
  dealer: { netCashUSD: number; feeLocal: number },
  feeDesks: FeeDesk[],
  primaryTakes: PrimaryTake[] = []
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

  // What is left after the fees is what the week's PRIMARY placed, and it belongs to the issuers
  // who brought the paper. Paid to each by name, pro rata to what its own deal placed.
  const tradingUSD = dealer.netCashUSD - dealer.feeLocal;
  const takeTotalUSD = primaryTakes.reduce((a, t) => a + Math.max(0, t.amountLocal), 0);
  const primaryUSD = Math.max(0, Math.min(takeTotalUSD, Math.max(0, tradingUSD)));
  if (primaryUSD > 0 && takeTotalUSD > 0) {
    primaryTakes.forEach((t) => {
      const amountLocal = Math.max(0, t.amountLocal) * (primaryUSD / takeTotalUSD);
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
  const leftoverUSD = tradingUSD - primaryUSD;
  const roundingToleranceUSD = Math.max(1e4, Math.abs(dealer.netCashUSD) * 1e-6);
  if (process.env.LEFTOVER_TRACE === '1' && Math.abs(leftoverUSD) > 1) {
    console.log(`  [leftover] ${regionId} ${book}: leftover ${(leftoverUSD / 1e6).toFixed(3)}M`
      + ` (dealerNet ${(dealer.netCashUSD / 1e6).toFixed(3)}M fee ${(dealer.feeLocal / 1e6).toFixed(3)}M primary ${(primaryUSD / 1e6).toFixed(3)}M)`);
  }
  if (Math.abs(leftoverUSD) > roundingToleranceUSD) defect(`${regionId} ${book} clearing left ${(leftoverUSD / 1e6).toFixed(3)}M with no owner (dealer net ${(dealer.netCashUSD / 1e6).toFixed(3)}M, fee ${(dealer.feeLocal / 1e6).toFixed(3)}M, primary ${(primaryUSD / 1e6).toFixed(3)}M)`);

  // The desks' fee income (plus the rounding dust): cash and equity together, because nothing
  // else arrived against it. Shares are normalised — the clients paid the whole fee, so the whole
  // fee reaches the desks that earned it however their market shares happen to sum.
  const totalShare = feeDesks.reduce((a, d) => a + d.share, 0);
  const deskTotalUSD = dealer.feeLocal + leftoverUSD;
  if (deskTotalUSD !== 0 && totalShare > 0) {
    feeDesks.forEach((desk) => {
      const amountLocal = deskTotalUSD * (desk.share / totalShare);
      if (amountLocal > 0) pay(ctx, { payer: ccp, payee: { kind: 'BANK', ticker: desk.ticker }, amount: amountLocal, currency: quoteCurrency, reason: `${book} dealer fee` });
      else if (amountLocal < 0) pay(ctx, { payer: { kind: 'BANK', ticker: desk.ticker }, payee: ccp, amount: -amountLocal, currency: quoteCurrency, reason: `${book} dealer fee` });
    });
  }
}

/** The desks that share a region's clearing fees: its named banks, weighted by market share. */
export function feeDesksForRegion(ctx: WeeklyStepContext, regionId: RegionId): FeeDesk[] {
  const banks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
  return banks.map((b) => ({ ticker: b.ticker, share: b.bankMarketShare ?? 1 / Math.max(1, banks.length) }));
}

/**
 * What each issuer's deal placed with this book's participants this week (WS8), and who to pay.
 * `valueOf` turns the engine's take into money — par for the credit books, shares x the cleared
 * price for equity.
 */
export function primaryTakes(
  result: ClearingResult,
  partyOfIssuerId: (issuerId: string) => PartyRef | undefined,
  valueOf: (marketTakeUSD: number, clearedStat: number) => number = (take) => take,
  /** §5-WIRES W2: the paper behind the take — see `primaryAssetOf`. */
  assetOf?: (issuerId: string, marketTake: number, clearedStat: number) => HoldingSpec | undefined
): PrimaryTake[] {
  const takes: PrimaryTake[] = [];
  result.primaryOutcomeById.forEach((o, issuerId) => {
    if (o.withdrawn) return;
    const amountLocal = valueOf(o.marketTakeUSD, o.clearedStat);
    const party = partyOfIssuerId(issuerId);
    if (party && amountLocal > 0) takes.push({ party, amountLocal, asset: assetOf?.(issuerId, o.marketTakeUSD, o.clearedStat) });
  });
  return takes;
}

/**
 * The asset leg of a primary take for a book of one kind in one region: par for the credit
 * books (the engine's take is money), shares at the cleared price for equity (the take is
 * shares). The instrument id is the issuer's — what the register keys the paper by.
 */
export function primaryAssetOf(instrumentType: HoldingKind, region: RegionId) {
  return (issuerId: string, marketTake: number, clearedStat: number): HoldingSpec | undefined => {
    if (!(marketTake > 0)) return undefined;
    return heldInShares(instrumentType)
      ? { instrumentType, instrumentId: issuerId, issuerRegion: region, valueLocal: marketTake * clearedStat, shares: marketTake }
      : { instrumentType, instrumentId: issuerId, issuerRegion: region, valueLocal: marketTake };
  };
}
