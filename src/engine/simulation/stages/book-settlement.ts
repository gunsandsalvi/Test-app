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
 * named banks by market share, cash and equity together. The rest funds the inventory it was
 * left holding — and that inventory sits on the REGION's dealer book, not on any named bank's
 * balance sheet, so its funder is `UNMODELED` under its own reason line. That is the §7.19 gap
 * every dealer-inventory acquisition has had since the desks existed; naming it here gives it a
 * size to watch, and G3 (one dealer system) is what closes it by putting the book on a bank.
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
export function settleClearedBook(
  ctx: WeeklyStepContext,
  regionId: RegionId,
  book: string,
  netCashByParticipantId: Map<string, number>,
  partyOf: (participantId: string) => PartyRef | undefined,
  dealer: { netCashUSD: number; feeUSD: number },
  feeDesks: FeeDesk[],
  primaryTakeUSD = 0
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

  // What is left after the fees is the dealer's own trading. Split so the boundary can be
  // watched down line by line: new paper the desk DISTRIBUTED is a primary flow whose other
  // half is the issuer's proceeds (stage 08 posts those, also against the boundary — WS8
  // closes the pair); the rest is the inventory it was left holding, which is G3's.
  const boundary: PartyRef = { kind: 'UNMODELED', region: regionId };
  const tradingUSD = dealer.netCashUSD - dealer.feeUSD;
  const primaryUSD = Math.max(0, Math.min(primaryTakeUSD, Math.max(0, tradingUSD)));
  const legs: [number, string][] = [
    [primaryUSD, `${book} primary distribution`],
    [tradingUSD - primaryUSD, `${book} dealer inventory`],
  ];
  legs.forEach(([amountUSD, reason]) => {
    if (amountUSD > 0) pay(ctx, { payer: ccp, payee: boundary, amountUSD, reason });
    else if (amountUSD < 0) pay(ctx, { payer: boundary, payee: ccp, amountUSD: -amountUSD, reason });
  });
}

/** The desks that share a region's clearing fees: its named banks, weighted by market share. */
export function feeDesksForRegion(ctx: WeeklyStepContext, regionId: RegionId): FeeDesk[] {
  const banks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
  return banks.map((b) => ({ ticker: b.ticker, share: b.bankMarketShare ?? 1 / Math.max(1, banks.length) }));
}

/** How much NEW paper this book's participants took off the desks this week (WS8). */
export function primaryTakeUSD(result: ClearingResult): number {
  let takeUSD = 0;
  result.primaryOutcomeById.forEach((o) => { if (!o.withdrawn) takeUSD += o.marketTakeUSD; });
  return takeUSD;
}
