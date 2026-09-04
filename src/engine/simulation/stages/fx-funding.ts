/**
 * §3.13c-FX — A PARTY THAT MUST PAY IN A MONEY IT DOES NOT HOLD BUYS IT.
 *
 * A payment moves ONE currency (see `applySettledRow`): the payer pays euros and the payee
 * receives euros and holds them. That is the only version of a multi-currency ledger in which a
 * foreign-currency account is anything but dead weight — and it leaves one thing to answer, which
 * is where the euros come from.
 *
 * **They are bought.** A firm owing a foreign invoice does not have its bank silently restate the
 * payment; it buys the currency, from a desk, at a price, and pays a spread for it. That is what
 * this pass does, and it is the missing step the first cut of §9.13c mistook for a reason to
 * convert at the ledger: landing the raw amount on both books without buying it first left every
 * US bank short 23B of euros, 8B of sterling and 22B of yen after ONE WEEK, which is not a funding
 * position but a purchase nobody made.
 *
 * **The desk carries the other side.** A bank selling euros to its client is short euros, and that
 * short is a real inventory position on a real balance sheet — the one `fx-clearing.ts` already
 * describes as "dealers flattening the FX inventory their client forwards left them". It is not
 * netted away here and it revalues like any other open position.
 *
 * **The reverse leg: a firm does not keep money it has no use for.** Any foreign balance beyond
 * what the party is about to pay out in that currency is SOLD back — which is the whole of why a
 * desk's book does not grow without bound: it sold euros to buyers and buys them back from the
 * receivers. What is left over after both sides is the genuine net imbalance, which is the number
 * that should reach the FX auction, and it is orders of magnitude smaller than the gross.
 *
 * This is also what keeps a foreign-currency account MEANINGFUL rather than either dead (nobody
 * ever holds one) or unbounded (everybody hoards): a party with a real ongoing obligation in a
 * money keeps enough to meet it and sells the rest, which is what a treasury actually does.
 *
 * Runs at the head of every settlement pass, off the persistent balances (what the party actually
 * holds coming in) and the pass's own due rows (what it is about to owe), so the purchase settles
 * in the same pass as the payment that forced it — rule 5, both legs one pass.
 */

import { CurrencyCode, CURRENCY_CODES, RegionId, currencyOf } from '../../../domain/geography';
import { convert } from '../../../domain/currency';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { Company, banksOf } from '../../../domain/company';
import { balanceOf, homeCurrencyOf } from '../../ledger/accounts';
import { PartyRef, partyOf } from '../../ledger/party';
import { WeeklyStepContext } from './context';
import { PaymentJournal, pay, rowDue } from './settlement';
import type { Ticker } from '../../../domain/ids';

/** One quote, shared with every other FX charge in the model (`domain/dealer-desk.ts`). */
const FX_SPREAD_BPS = DESK_SPREAD_BPS_BY_BOOK.fx;
/** Below this a shortfall is float dust on a netted position, not a trade (rule 7). */
const MIN_TRADE = 1e-6;

/** The desks a region's conversions go through: its banks, pro rata by market share. */
function deskSharesOf(firms: readonly Company[], region: RegionId): { ticker: Ticker; share: number }[] {
  const banks = banksOf(firms, region);
  const total = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
  if (banks.length === 0) return [];
  return banks.map((b) => ({
    ticker: b.ticker,
    share: total > 0 ? (b.bankMarketShare ?? 0) / total : 1 / banks.length,
  }));
}

/**
 * WHO BUYS CURRENCY, AND WHO IS THE MARKET.
 *
 * A client buys; a bank IS the other side. Every kind excluded here is one whose foreign position
 * is a position rather than a shortfall: a desk's is its inventory, a bank's own account is its
 * nostro — and a nostro can run overdrawn, which is what an unsquared spot book looks like on a
 * balance sheet. The clearing house is flat by construction and a central bank is never short of
 * its own money.
 *
 * Measured when a bank was treated as a client: it bought back the very currency its resolution
 * was paying away, and the pip it paid on that round trip was the 0.539M the shell was left
 * holding after QYTV's resolution in week 12.
 */
function convertsForItself(ref: PartyRef): boolean {
  return ref.kind !== 'BANK' && ref.kind !== 'BANK_SECURITIES' && ref.kind !== 'BANK_CREDIT'
    && ref.kind !== 'CLEARING_HOUSE' && ref.kind !== 'CENTRAL_BANK';
}

/** What each party owes and is owed this pass, per currency. */
function netByPartyAndCurrency(journal: PaymentJournal, week: number): Map<number, Map<number, number>> {
  const net = new Map<number, Map<number, number>>();
  const add = (party: number, cur: number, delta: number) => {
    let byCur = net.get(party);
    if (!byCur) { byCur = new Map(); net.set(party, byCur); }
    byCur.set(cur, (byCur.get(cur) ?? 0) + delta);
  };
  for (let n = 0; n < journal.n; n++) {
    if (!rowDue(journal, n, week)) continue;
    add(journal.payerId[n], journal.currencyId[n], -journal.amount[n]);
    add(journal.payeeId[n], journal.currencyId[n], journal.amount[n]);
  }
  return net;
}

export function fundForeignCurrencyShortfalls(
  ctx: WeeklyStepContext,
  journal: PaymentJournal,
  week: number,
  regionOf: (ref: PartyRef) => RegionId | undefined,
): void {
  const net = netByPartyAndCurrency(journal, week);
  if (net.size === 0) return;
  const desksByRegion = new Map<RegionId, { ticker: Ticker; share: number }[]>();
  const desksFor = (region: RegionId) => {
    let d = desksByRegion.get(region);
    if (!d) { d = deskSharesOf(ctx.updatedCompanies, region); desksByRegion.set(region, d); }
    return d;
  };

  /** The client buys `amount` of `cur` and pays for it in `home`, plus the desk's spread. */
  const buy = (client: PartyRef, desks: { ticker: Ticker; share: number }[], cur: CurrencyCode, home: CurrencyCode, amount: number) => {
    const costHome = convert(amount, cur, home, ctx.fx) * (1 + FX_SPREAD_BPS / 10000);
    desks.forEach(({ ticker, share }) => {
      if (share <= 0) return;
      const desk: PartyRef = { kind: 'BANK_SECURITIES', ticker };
      pay(ctx, { payer: client, payee: desk, amount: costHome * share, currency: home, reason: 'fx conversion: currency bought' });
      pay(ctx, { payer: desk, payee: client, amount: amount * share, currency: cur, reason: 'fx conversion: currency delivered' });
    });
  };

  net.forEach((byCur, partyIdx) => {
    const ref = partyOf(partyIdx);
    if (!ref || !convertsForItself(ref)) return;
    const region = regionOf(ref);
    if (!region) return;
    const home = homeCurrencyOf(ctx.v2, ref) ?? currencyOf(region);
    const desks = desksFor(region);
    if (desks.length === 0) return;

    // 1. Every foreign money it must pay out beyond what it holds: bought, at the cleared rate
    //    plus the pip, from its own region's desks.
    CURRENCY_CODES.forEach((cur) => {
      if (cur === home) return;
      const held = balanceOf(ctx.v2, ref, cur);
      const owed = byCur.get(CURRENCY_CODES.indexOf(cur)) ?? 0;
      const short = -(held + owed);
      if (!(short > MIN_TRADE)) return;
      buy(ref, desks, cur, home, short);
    });

    // 2. Every foreign money it holds beyond what it is about to pay out in that money: SOLD.
    //    A firm keeps its books in one currency and does not sit on somebody else's without a use
    //    for it. This is the leg that closes the circle — the desks buy back from the receivers
    //    what they sold to the buyers — and without it the desks' book grew without bound
    //    (measured: −537.7B across the banks by week 3, against +88.3B held by everyone else).
    CURRENCY_CODES.forEach((cur) => {
      if (cur === home) return;
      const surplus = balanceOf(ctx.v2, ref, cur) + (byCur.get(CURRENCY_CODES.indexOf(cur)) ?? 0);
      if (!(surplus > MIN_TRADE)) return;
      const proceeds = convert(surplus, cur, home, ctx.fx) * (1 - FX_SPREAD_BPS / 10000);
      desks.forEach(({ ticker, share }) => {
        if (share <= 0) return;
        const desk: PartyRef = { kind: 'BANK_SECURITIES', ticker };
        pay(ctx, { payer: ref, payee: desk, amount: surplus * share, currency: cur, reason: 'fx conversion: currency sold' });
        pay(ctx, { payer: desk, payee: ref, amount: proceeds * share, currency: home, reason: 'fx conversion: proceeds delivered' });
      });
    });
  });
}
