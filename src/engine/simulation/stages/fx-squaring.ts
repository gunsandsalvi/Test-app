/**
 * §3.13c-FX-2 — THE DESKS SQUARE WITH EACH OTHER.
 *
 * A US desk that sells euros to a client is short euros, and those euros land on a euro-area
 * payee as ordinary euros — its HOME money, so no sweep ever sends them back (`fx-funding`'s
 * sell leg only reaches money a holder has no use for). The desk's short is therefore real,
 * unfunded, and one-directional: measured before this pass, the banks ran to −390.6B in week 1
 * and −601.4B by week 4, growing every week, while everybody else held nothing.
 *
 * **But the shorts are symmetric, and that is the whole mechanism.** US clients buying euros
 * leave US desks short euros; euro-area clients buying dollars leave euro-area desks short
 * dollars. A US desk short euros holds dollars; a euro desk short dollars holds euros. They swap,
 * and BOTH books go flat — no third party, no warehoused residual, no unowned leftover. This is
 * what an interbank FX market is: the dealers offsetting each other's client flow, and only the
 * NET imbalance ever reaching anyone else.
 *
 * **What is left after this pass is that net imbalance.** It is the honest order flow for the FX
 * auction, and it is orders of magnitude smaller than the gross it replaces. Feeding it to
 * `fx-clearing` — and deleting `ctx.bilateralTradeWeeklyLocal`, a derived aggregate standing in for
 * orders nobody places — is the next slice; the positions this leaves are what it will read.
 *
 * The pair is squared at the rate in force, so neither side books a gain on the swap itself.
 */

import { CurrencyCode, RegionId, REGION_IDS, currencyOf } from '../../../domain/geography';
import { bankParty, bankSecuritiesParty } from '../../../domain/party';
import { convert } from '../../../domain/currency';
import { Company } from '../../../domain/company';
import { heldCurrenciesOf } from '../../ledger/accounts';
import { PartyRef } from '../../ledger/party';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';

/** Below this the position is float dust on a netted book, not a trade (rule 7). */
const MIN_TRADE = 1e-6;

/** A bank's short of one money, as a positive number; zero when it is long or flat. */
const shortOf = (positions: { currency: CurrencyCode; balance: number }[], currency: CurrencyCode): number => {
  const row = positions.find((p) => p.currency === currency);
  return row && row.balance < -MIN_TRADE ? -row.balance : 0;
};

export function squareInterbankFxPositions(ctx: WeeklyStepContext): void {
  const banksByRegion = new Map<RegionId, Company[]>();
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted) return;
    const list = banksByRegion.get(c.region) ?? [];
    list.push(c);
    banksByRegion.set(c.region, list);
  });
  if (banksByRegion.size < 2) return;

  const positionsOf = new Map<string, { currency: CurrencyCode; balance: number }[]>();
  ctx.updatedCompanies.forEach((c) => {
    if (!c.isBankEntity || !c.bankBalanceSheet || c.isDefaulted) return;
    positionsOf.set(c.ticker, heldCurrenciesOf(ctx.v2, bankParty(c)));
  });

  // Ordered pairs, each visited once: `here` holds `there`'s money and needs its own back.
  REGION_IDS.forEach((here, i) => {
    REGION_IDS.forEach((there, j) => {
      if (j <= i) return;
      const hereMoney = currencyOf(here), thereMoney = currencyOf(there);
      const hereBanks = banksByRegion.get(here) ?? [];
      const thereBanks = banksByRegion.get(there) ?? [];
      if (hereBanks.length === 0 || thereBanks.length === 0) return;

      // What each side is short of the other's money, in that money's own units.
      const hereShort = hereBanks.map((b) => ({ b, size: shortOf(positionsOf.get(b.ticker) ?? [], thereMoney) }))
        .filter((x) => x.size > MIN_TRADE);
      const thereShort = thereBanks.map((b) => ({ b, size: shortOf(positionsOf.get(b.ticker) ?? [], hereMoney) }))
        .filter((x) => x.size > MIN_TRADE);
      if (hereShort.length === 0 || thereShort.length === 0) return;

      const hereTotal = hereShort.reduce((a, x) => a + x.size, 0);          // in `thereMoney`
      const thereTotal = thereShort.reduce((a, x) => a + x.size, 0);        // in `hereMoney`
      // The swap is the smaller of the two, measured once, in `thereMoney`.
      const thereTotalInThere = convert(thereTotal, hereMoney, thereMoney, ctx.fx);
      const swapThere = Math.min(hereTotal, thereTotalInThere);
      if (!(swapThere > MIN_TRADE)) return;
      const swapHere = convert(swapThere, thereMoney, hereMoney, ctx.fx);

      // Split pro rata by each desk's own need on its own side, so a desk that is short nothing
      // trades nothing and a desk twice as short does twice as much.
      hereShort.forEach(({ b: hb, size: hSize }) => {
        const hShare = hSize / hereTotal;
        thereShort.forEach(({ b: tb, size: tSize }) => {
          const tShare = tSize / thereTotal;
          const legThere = swapThere * hShare * tShare;
          const legHere = swapHere * hShare * tShare;
          if (!(legThere > MIN_TRADE) || !(legHere > MIN_TRADE)) return;
          const hereDesk: PartyRef = bankSecuritiesParty(hb);
          const thereDesk: PartyRef = bankSecuritiesParty(tb);
          // Both legs, both directions, at the rate in force: `here` gets the money it is short
          // and pays its own, and `there` the mirror. Neither books a gain on the swap.
          pay(ctx, { payer: thereDesk, payee: hereDesk, amount: legThere, currency: thereMoney, reason: 'fx interbank: currency delivered' });
          pay(ctx, { payer: hereDesk, payee: thereDesk, amount: legHere, currency: hereMoney, reason: 'fx interbank: currency delivered' });
        });
      });
    });
  });
}
