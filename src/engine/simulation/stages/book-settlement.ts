/**
 * SETL6 — the cash half of a cleared book, shared by the five clearing adapters
 * (07b bonds, 07c sovereigns, 07d loans, 07e equity, 07f bills).
 *
 * Until this existed each book moved its participants' money itself: `entity.cashUSD +=`,
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
import { WeeklyStepContext } from './context';
import { pay, PartyRef } from './settlement';
import { ClearingResult } from './financial-clearing-engine';

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
export interface PrimaryTake { party: PartyRef; amountUSD: number }

export function settleClearedBook(
  ctx: WeeklyStepContext,
  regionId: RegionId,
  book: string,
  netCashByParticipantId: Map<string, number>,
  partyOf: (participantId: string) => PartyRef | undefined,
  dealer: { netCashUSD: number; feeUSD: number },
  feeDesks: FeeDesk[],
  primaryTakes: PrimaryTake[] = []
): void {
  const ccp: PartyRef = { kind: 'CLEARING_HOUSE', region: regionId };
  const reason = `${book} clearing`;

  netCashByParticipantId.forEach((deltaUSD, participantId) => {
    if (!deltaUSD) return;
    const named = partyOf(participantId);
    const party: PartyRef = named ?? { kind: 'UNMODELED', region: regionId };
    const legReason = named ? reason : `${book} clearing (unrouted participant)`;
    if (deltaUSD > 0) pay(ctx, { payer: ccp, payee: party, amountUSD: deltaUSD, reason: legReason });
    else pay(ctx, { payer: party, payee: ccp, amountUSD: -deltaUSD, reason: legReason });
  });

  // The desks' fee income: cash and equity together, because nothing else arrived against it.
  // Shares are normalised — the clients paid the whole fee, so the whole fee reaches the desks
  // that earned it however their market shares happen to sum.
  const totalShare = feeDesks.reduce((a, d) => a + d.share, 0);
  if (dealer.feeUSD > 0 && totalShare > 0) {
    feeDesks.forEach((desk) => {
      pay(ctx, {
        payer: ccp,
        payee: { kind: 'BANK', ticker: desk.ticker },
        amountUSD: dealer.feeUSD * (desk.share / totalShare),
        reason: `${book} dealer fee`,
      });
    });
  }

  // What is left after the fees is what the week's PRIMARY placed, and it belongs to the issuers
  // who brought the paper. Paid to each by name, pro rata to what its own deal placed — the
  // `${book} primary distribution` line that used to carry the whole of it to the boundary was
  // one half of a pair whose other half (stage 08's proceeds line) went to the boundary too.
  const tradingUSD = dealer.netCashUSD - dealer.feeUSD;
  const takeTotalUSD = primaryTakes.reduce((a, t) => a + Math.max(0, t.amountUSD), 0);
  const primaryUSD = Math.max(0, Math.min(takeTotalUSD, Math.max(0, tradingUSD)));
  if (primaryUSD > 0 && takeTotalUSD > 0) {
    primaryTakes.forEach((t) => {
      const amountUSD = Math.max(0, t.amountUSD) * (primaryUSD / takeTotalUSD);
      if (amountUSD > 0) pay(ctx, { payer: ccp, payee: t.party, amountUSD, reason: `${book} primary proceeds` });
    });
  }

  // GUARD, not a mechanism: with OWN7's two-sided rationing a stock book leaves nothing over, so
  // this is zero. If one ever does again, it prints under its own reason rather than vanishing.
  const boundary: PartyRef = { kind: 'UNMODELED', region: regionId };
  const leftoverUSD = tradingUSD - primaryUSD;
  if (leftoverUSD > 0) pay(ctx, { payer: ccp, payee: boundary, amountUSD: leftoverUSD, reason: `${book} dealer inventory` });
  else if (leftoverUSD < 0) pay(ctx, { payer: boundary, payee: ccp, amountUSD: -leftoverUSD, reason: `${book} dealer inventory` });
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
  valueOf: (marketTakeUSD: number, clearedStat: number) => number = (take) => take
): PrimaryTake[] {
  const takes: PrimaryTake[] = [];
  result.primaryOutcomeById.forEach((o, issuerId) => {
    if (o.withdrawn) return;
    const amountUSD = valueOf(o.marketTakeUSD, o.clearedStat);
    const party = partyOfIssuerId(issuerId);
    if (party && amountUSD > 0) takes.push({ party, amountUSD });
  });
  return takes;
}
