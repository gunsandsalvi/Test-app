/**
 * WS9/XB2d/XB6 — the week's FX market: every participant's demand, one cleared rate per PAIR.
 *
 * Runs after the hedging stage, so the desks' delta-hedge flow is a real order in this book
 * rather than a coefficient applied to a drift. Six participant classes, all of which exist as
 * real balance sheets in this model:
 *
 *   INELASTIC (they need the currency and take the price)
 *     - dealers flattening the FX inventory their client forwards left them
 *     - institutions settling cross-border securities purchases
 *     - exporters and importers converting trade receipts
 *   ELASTIC (they set the price by being willing to take the other side)
 *     - hedge funds, who take the position because it moved far enough to pay them
 *     - central banks, leaning against a disorderly move, bounded by real FX reserves (XB5)
 *     - triangular arbitrageurs, which is what actually holds the cross rates together
 *
 * **XB6: every pair clears on its own flow.** Until now each currency cleared against the USD and
 * the cross rates were derived by triangulation. That guaranteed triangular consistency by
 * construction, and the price of the guarantee only became visible once something depended on it:
 * a EUR/JPY hedge was structurally two USD legs, so the USD was the cheapest vehicle currency BY
 * CONSTRUCTION and the model could never say anything about currency dominance. Rule 4's defect,
 * in the plumbing rather than in a table. Depth now differs by pair because each pair has its own
 * book and its own flow.
 *
 * Triangular consistency becomes what it is in reality: an OUTCOME of somebody arbitraging it.
 * The arbitrageur is a real participant with a real balance sheet — the bank FX desks, bounded by
 * the same capacity XB2b already charges their derivative books — whose reservation on any pair
 * is the rate the other two legs imply. Below it they buy the base, above it they sell. Nothing
 * enforces the identity; desks do, out of their own capital, and being finite they can fail to.
 */

import { RegionId, GameState } from '../../../types';
import { WeeklyStepContext } from './context';
import {
  SPECULATOR_RESERVATION_MOVE_PCT, SPECULATOR_FULL_SIZE_RANGE_PCT, SPECULATOR_FX_RISK_BUDGET,
  CENTRAL_BANK_RESERVATION_MOVE_PCT, CENTRAL_BANK_FULL_SIZE_RANGE_PCT,
  CENTRAL_BANK_FX_INTERVENTION_SHARE, MAX_WEEKLY_FX_MOVE_PCT,
} from '../../../domain/fx-market';
import {
  clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand,
} from './financial-clearing-engine';
import { centralBankFxReservesUSD } from '../../../domain/central-bank';
import { fxDeskCapacityUSD, MAX_CROSS_CURRENCY_BASIS_BPS } from '../../../domain/dealer-derivatives';
import { leverageHeadroomUSD } from '../../macro/banking';

const REGIONS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

const pairKey = (base: RegionId, quote: RegionId) => `${base}/${quote}`;

/** Net demand for a pair's BASE currency, in USD, from everyone who is not choosing a price. */
type PairFlow = Map<string, number>;

/** Register a bilateral flow on whichever way round that pair's book is actually quoted. */
function addPairFlow(flows: PairFlow, base: RegionId, quote: RegionId, baseDemandUSD: number) {
  if (base === quote || !isFinite(baseDemandUSD) || baseDemandUSD === 0) return;
  const forward = pairKey(base, quote);
  if (flows.has(forward)) { flows.set(forward, (flows.get(forward) ?? 0) + baseDemandUSD); return; }
  const reverse = pairKey(quote, base);
  if (flows.has(reverse)) { flows.set(reverse, (flows.get(reverse) ?? 0) - baseDemandUSD); return; }
  flows.set(forward, baseDemandUSD);
}

export function runFxClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const pairs = ctx.updatedFxPairs;
  const rateOf = (base: RegionId, quote: RegionId): number | undefined => {
    const direct = pairs.find(p => p.base === base && p.quote === quote);
    if (direct && direct.rate > 0 && isFinite(direct.rate)) return direct.rate;
    const inverse = pairs.find(p => p.base === quote && p.quote === base);
    if (inverse && inverse.rate > 0 && isFinite(inverse.rate)) return 1 / inverse.rate;
    return undefined;
  };

  // Seed every live pair at zero so a pair with no flow still prints its own last level.
  const flows: PairFlow = new Map();
  pairs.forEach(p => flows.set(pairKey(p.base, p.quote), 0));

  // ---- Every cross-border payment has TWO legs, and building them one currency at a time is how
  // a leg goes missing. A JPN insurer buying EUR paper BUYS euro and SELLS yen — which under XB6
  // is a trade in the EUR/JPY book, not two dollar legs that happen to net. ----
  ctx.updatedInstitutionalEntities.forEach((e: any) => {
    const heldNow: Record<string, number> = {};
    (e.itemizedHoldings || []).forEach((h: any) => {
      if (!h.issuerRegion || h.issuerRegion === e.region) return;
      heldNow[h.issuerRegion] = (heldNow[h.issuerRegion] ?? 0) + (h.quantityOrNotionalUSD ?? 0);
    });
    const prior = e.priorForeignHoldingsByRegion ?? {};
    const touched = new Set([...Object.keys(heldNow), ...Object.keys(prior)]);
    touched.forEach((issuer) => {
      const deltaUSD = (heldNow[issuer] ?? 0) - (prior[issuer] ?? 0);
      if (Math.abs(deltaUSD) < 1e5) return;
      addPairFlow(flows, issuer as RegionId, e.region as RegionId, deltaUSD);
    });
  });

  // ---- Trade receipts, bilateral because the goods market already knows who bought from whom
  // (XB3a). An importer sells its own money to pay an exporter in the exporter's. ----
  REGIONS.forEach(exporter => {
    REGIONS.forEach(importer => {
      if (exporter === importer) return;
      const weeklyUSD = ctx.bilateralTradeWeeklyUSD?.[exporter]?.[importer] ?? 0;
      if (!(Math.abs(weeklyUSD) > 0)) return;
      addPairFlow(flows, exporter, importer, weeklyUSD);
    });
  });

  // ---- XB6: a desk's own position is NOT an inelastic flow, and it used to be one. The whole
  // book was dumped into the float — offered at any price, every week, in one direction — which
  // is the largest systematically one-way flow §6.1's FX row asks to find. A real desk quotes
  // around its inventory instead: it is a PARTICIPANT below, willing to take the other side up to
  // its own capacity, and pricing that willingness by how full it already is. ----

  // ---- What the bank FX desks can still commit, which is what bounds the arbitrage — and,
  // per desk, the share of the market-making residual each one warehouses below. ----
  let arbitrageCapacityUSD = 0;
  const deskCapacityByTicker = new Map<string, number>();
  ctx.updatedCompanies.forEach((c: any) => {
    const sheet = c.bankBalanceSheet;
    if (!sheet) return;
    const capUSD = fxDeskCapacityUSD(leverageHeadroomUSD(sheet), sheet.fxDealerBook);
    if (capUSD > 0) deskCapacityByTicker.set(c.ticker, capUSD);
    arbitrageCapacityUSD += capUSD;
  });

  // A central bank has ONE reserve pot, not one per pair. XB6 put it in every pair it is a side
  // of — three instead of one — and a per-pair intervention allowance let it spend the same
  // reserves three times in a week. Measured: reserves went from 3.5-8.5 months of import cover
  // to 0.0-0.3 in sixty weeks, and once the asset side no longer covered the liabilities the
  // balance-sheet identity broke in 231 of 273 harness violations. The budget is a weekly one,
  // drawn down as the pairs clear.
  const reserveBudgetRemaining = new Map<RegionId, number>();
  REGIONS.forEach(r => {
    const cb = ctx.updatedRegions[r]?.centralBankSheet;
    const reservesUSD = cb ? centralBankFxReservesUSD(cb) : 0;
    reserveBudgetRemaining.set(r, Math.max(0, reservesUSD) * CENTRAL_BANK_FX_INTERVENTION_SHARE);
  });

  const clearedRateByPair = new Map<string, number>();
  const residualByPair = new Map<string, number>();
  const grossByPair = new Map<string, number>();
  /** The market-maker's position after the week: what the desks bought of the base that nobody
   * else would (clients net sellers), or sold that nobody else offered (clients net buyers). */
  const dealerLongBaseByPair = new Map<string, number>();
  /** XB6: what each desk took on this week, by currency, out of its own posted schedule. */
  const deskFillByTicker = new Map<string, Partial<Record<RegionId, number>>>();

  pairs.forEach((fx) => {
    const key = pairKey(fx.base, fx.quote);
    const currentRate = fx.rate;
    if (!(currentRate > 0) || !isFinite(currentRate)) return;

    const netBaseDemandUSD = flows.get(key) ?? 0;
    grossByPair.set(key, Math.abs(netBaseDemandUSD));
    if (!(Math.abs(netBaseDemandUSD) > 0)) {
      clearedRateByPair.set(key, currentRate);
      residualByPair.set(key, 0);
      return;
    }

    // XB6 — THE AUCTION RUNS ON THE CURRENCY BEING SOLD, and this is the FX leg of the damper
    // defect (§6.1).
    //
    // The engine auctions a float to BUYERS: total demand falls as the stat rises, so a bigger
    // float always clears at a LOWER stat. That is exactly right when the float is the currency
    // being supplied — more of it on offer, cheaper it gets. This adapter always made the stat
    // `quote per base`, so when clients were net BUYERS of the base the geometry inverted: the
    // more the base was demanded, the lower its own rate had to go to clear. Shifting the
    // speculators' reservation by `1 + sign x pct` reflected the LEVEL but could not fix the
    // SLOPE, and the level shift left the elastic side needing a 1.2% move before it would take
    // anything at all — so every week with a net flow the rate had to move, in the direction the
    // geometry chose, until the damper stopped it. That is the −8.01% print, `MAX_WEEKLY_FX_MOVE_PCT`
    // to the second decimal, 38 weeks in 40 (§7.77); and when the flow flipped, EUR escaping
    // upward instead (§7.82). One defect, both directions.
    //
    // So: whichever currency is being SOLD is the one auctioned, priced in the other. Net supply
    // of the base runs the book as it stands; net demand for the base means the QUOTE currency is
    // what is on offer, so the book runs upside-down and the print is inverted back at the end.
    // The elastic side's schedule is then the same in both cases — a buyer that needs the thing
    // on offer to get cheaper by its required move before it will take any — which is what it
    // always was for one direction and never was for the other.
    const sign = netBaseDemandUSD >= 0 ? 1 : -1;
    const soldIsBase = sign < 0;
    const toBook = (rate: number) => (soldIsBase ? rate : 1 / rate);
    const fromBook = (stat: number) => (soldIsBase ? stat : 1 / stat);
    const bookRate = toBook(currentRate);

    const instrument: ClearingInstrument = {
      id: `FX-${key}`,
      outstandingUSD: Math.abs(netBaseDemandUSD),
      tradableFloatUSD: Math.abs(netBaseDemandUSD),
      currentStat: bookRate,
      statKind: 'PRICE_LIKE',
      durationYears: 0,
    };

    const participants: ClearingParticipant[] = [];

    ctx.updatedInstitutionalEntities.forEach((e: any) => {
      if (e.entityType !== 'HEDGE_FUND') return;
      const capUSD = Math.max(0, e.totalAssetsUSD) * SPECULATOR_FX_RISK_BUDGET;
      if (capUSD <= 0) return;
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: bookRate * (1 - SPECULATOR_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: capUSD,
        fullSizeStatRange: bookRate * (SPECULATOR_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: Math.max(0, e.cashUSD ?? 0),
      });
      participants.push({ id: `${e.id}-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    });

    // The central bank DEFENDS its own money, and only when the move against it has already
    // exhausted the private elastic side (the reservation is derived from the speculators' own
    // full-deployment point — see fx-market.ts). Only the falling side's bank acts, in the one
    // direction its balance sheet can honestly express (XB5):
    //   base falling  -> the base bank BUYS its own currency, spending reserves;
    //   quote falling -> the quote bank SELLS the base currency out of its reserve holdings.
    // The first version put a reservation on the WRONG side of the market — `1 - sign * pct`
    // against the speculators' `1 + sign * pct` — which left the bank fully in the money the
    // moment its currency slipped at all: every week, at full size, ahead of every private
    // buyer. That was the trigger-happiness, and no threshold constant could gate it from the
    // wrong side of the price. There is no automatic accumulation branch: buying foreign
    // currency to hold your own DOWN is a policy regime, not a market reflex.
    // XB6: with the book always run on the currency being sold, the two defences are ONE
    // schedule — the falling currency's own bank stepping in once the move has passed the point
    // where the speculators are fully deployed. Only the sizes differ, because a bank buying its
    // OWN money spends foreign reserves while a bank buying a FOREIGN currency it already holds
    // is bounded by that specific reserve line. (The mirror-image 'holder that sells into
    // strength' this replaces was the same inversion the instrument itself carried: expressed on
    // a book quoted the other way up, it made the defending bank a seller of the thing it was
    // defending.)
    const defender = soldIsBase ? fx.base : fx.quote;
    const cbDefend = ctx.updatedRegions[defender]?.centralBankSheet;
    const defenceBudgetUSD = soldIsBase
      ? (reserveBudgetRemaining.get(fx.base) ?? 0)
      : Math.min(reserveBudgetRemaining.get(fx.quote) ?? 0,
                 Math.max(0, Number(ctx.updatedRegions[fx.quote]?.centralBankSheet?.fxReservesByRegion?.[fx.base]) || 0));
    if (cbDefend && defenceBudgetUSD > 0) {
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: bookRate * (1 - CENTRAL_BANK_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: defenceBudgetUSD,
        fullSizeStatRange: bookRate * (CENTRAL_BANK_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: defenceBudgetUSD,
      });
      participants.push({ id: `CB-${defender}-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    }

    // The triangular arbitrageur. Its reservation is not a preference or a coefficient — it is
    // the rate the OTHER TWO legs imply for this pair. Below it the desks buy the base, above it
    // they sell, and the size they can do is the capacity XB2b already charges a derivative book.
    // This is the whole of what holds the cross rates together now.
    const bridge = REGIONS.find(r =>
      r !== fx.base && r !== fx.quote &&
      rateOf(fx.base, r) !== undefined && rateOf(r, fx.quote) !== undefined);
    const impliedRate = bridge !== undefined ? rateOf(fx.base, bridge)! * rateOf(bridge, fx.quote)! : undefined;
    if (impliedRate !== undefined && impliedRate > 0 && arbitrageCapacityUSD > 0) {
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: toBook(impliedRate),
        maxHoldingUSD: arbitrageCapacityUSD,
        // Scales in over the gap between the print and the implied rate: a wider dislocation
        // pulls more capital, which is what makes the identity tighten rather than merely hold.
        fullSizeStatRange: Math.max(1e-9, Math.abs(toBook(impliedRate) - bookRate)),
        maxNetPurchaseUSD: arbitrageCapacityUSD,
      });
      participants.push({ id: `ARB-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    }

    // XB6 — the bank FX desks, as market makers with a real balance sheet. Every other book in
    // this model gained owned desks in G3; here the desks still only picked up the residual AFTER
    // the auction, split pro rata by capacity whether or not the capacity was there. So the
    // largest potential absorber posted no schedule and its capital bounded nothing, which is
    // most of what "the elastic side cannot absorb it" means. A desk now bids: at the market when
    // it is empty, and further away the fuller it is, because its balance sheet is what it is
    // selling and the price of that is the basis (XB2b's own number; DER makes it clear).
    const basisFrac = MAX_CROSS_CURRENCY_BASIS_BPS / 10000;
    deskCapacityByTicker.forEach((capUSD, ticker) => {
      const bank: any = ctx.updatedCompanies.find((c: any) => c.ticker === ticker);
      const book = bank?.bankBalanceSheet?.fxDealerBook;
      const grossUSD = Math.max(0, Number(book?.grossNotionalUSD) || 0);
      const utilization = Math.min(1, grossUSD / Math.max(1, grossUSD + capUSD));
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: bookRate * (1 - basisFrac * utilization),
        maxHoldingUSD: capUSD,
        fullSizeStatRange: bookRate * basisFrac,
        maxNetPurchaseUSD: capUSD,
      });
      participants.push({ id: `FXDESK-${ticker}-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    });

    if (participants.length === 0) {
      clearedRateByPair.set(key, currentRate);
      residualByPair.set(key, netBaseDemandUSD);
      dealerLongBaseByPair.set(key, -netBaseDemandUSD);
      return;
    }

    const result = clearFinancialAsset([instrument], participants, new Map(), {
      dealerSpreadBps: 0,
      maxWeeklyStatMovePct: MAX_WEEKLY_FX_MOVE_PCT / 100,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

    const clearedBookStat = result.newStatById.get(instrument.id);
    clearedRateByPair.set(key, clearedBookStat !== undefined && clearedBookStat > 0 ? fromBook(clearedBookStat) : currentRate);
    const residualUSD = result.newDealerInventoryById.get(instrument.id) ?? 0;
    residualByPair.set(key, residualUSD);
    // The engine's residual is a magnitude on a one-sided float; the DIRECTION is the adapter's
    // (the float was oriented by `sign`). A desk making the market takes the other side of the
    // unmet flow: clients net sellers of the base leave it LONG, net buyers leave it SHORT.
    dealerLongBaseByPair.set(key, -sign * Math.abs(residualUSD));
    // What each desk actually took, as a position: absorbing base DEMAND leaves it short the
    // base, absorbing base SUPPLY leaves it long. Its own schedule decided the size, and its own
    // capacity bounded it — no pro-rata split of a leftover.
    deskCapacityByTicker.forEach((_capUSD, ticker) => {
      const filledUSD = result.newParticipantHoldings.get(`FXDESK-${ticker}-${key}`)?.get(instrument.id) ?? 0;
      if (!(filledUSD > 1)) return;
      let byRegion = deskFillByTicker.get(ticker);
      if (!byRegion) { byRegion = {}; deskFillByTicker.set(ticker, byRegion); }
      if (fx.base !== 'USA') byRegion[fx.base] = (byRegion[fx.base] ?? 0) - sign * filledUSD;
      if (fx.quote !== 'USA') byRegion[fx.quote] = (byRegion[fx.quote] ?? 0) + sign * filledUSD;
    });

    // XB5: what a central bank actually took MOVES its reserves. Its fill is a purchase of the
    // currency on offer, and which reserve line pays depends only on whose money that is: a bank
    // buying its OWN currency spends foreign reserves pro rata across whatever it holds (its own
    // money is not an asset to it, so the proceeds are extinguished); a bank buying a FOREIGN
    // currency it already holds draws down that specific line, which also bounded its size above.
    // A bank at zero stops being able to act.
    const cbBoughtUSD = -(result.netCashDeltaByParticipantId.get(`CB-${defender}-${key}`) ?? 0);
    if (cbDefend && cbBoughtUSD > 0) {
      reserveBudgetRemaining.set(defender, Math.max(0, (reserveBudgetRemaining.get(defender) ?? 0) - cbBoughtUSD));
      const book = { ...(cbDefend.fxReservesByRegion ?? {}) };
      if (soldIsBase) {
        const held = Object.keys(book).reduce((a, k) => a + Math.max(0, Number(book[k]) || 0), 0);
        if (held > 0) {
          Object.keys(book).forEach(k => {
            const share = Math.max(0, Number(book[k]) || 0) / held;
            book[k] = Math.max(0, (Number(book[k]) || 0) - cbBoughtUSD * share);
          });
          cbDefend.fxReservesByRegion = book;
        }
      } else {
        book[fx.base] = Math.max(0, (Number(book[fx.base]) || 0) - cbBoughtUSD);
        cbDefend.fxReservesByRegion = book;
      }
    }
  });

  // Apply what cleared, pair by pair. Pairs are PRIMARY now: a cross rate is what its own book
  // printed, not an arithmetic consequence of two others.
  ctx.updatedFxPairs = ctx.updatedFxPairs.map((fx) => {
    const rate = Number((clearedRateByPair.get(pairKey(fx.base, fx.quote)) ?? fx.rate).toFixed(4));
    if (!(rate > 0) || !isFinite(rate)) return fx;
    return {
      ...fx,
      rate,
      change1W: Number((rate - fx.rate).toFixed(4)),
      historicalRates: [...fx.historicalRates.slice(-51), rate],
    };
  });

  // A currency's value against the USD is now a READING of its USD pair, for the consumers that
  // want one number per currency — no longer the thing every pair is derived from.
  const valueUSD: Record<string, number> = { USA: 1 };
  REGIONS.filter(r => r !== 'USA').forEach(r => {
    const direct = ctx.updatedFxPairs.find(p => p.base === r && p.quote === 'USA');
    const inverse = ctx.updatedFxPairs.find(p => p.base === 'USA' && p.quote === r);
    valueUSD[r] = direct && direct.rate > 0 ? direct.rate
      : inverse && inverse.rate > 0 ? 1 / inverse.rate : 1;
  });
  ctx.currencyValueUSD = valueUSD;

  // ---- XB6: the desks' positions are the fills their OWN schedules produced. Two things this
  // replaces, both the same defect wearing different clothes. (1) The desks used to be flattened
  // pro rata by "the share of the float the market absorbed", which is not a trade anyone made.
  // (2) The unabsorbed residual was then warehoused across them by capacity SHARE, whether or not
  // the capacity was there — the residual-with-no-owner pattern G3 removed from every other book.
  // Now a desk's book moves by exactly what it bid for, bounded by exactly what it can carry;
  // whatever the market still could not absorb is a diagnostic below, not a position forced onto
  // someone. The book is NOTIONAL risk, so no cash leg is invented here; the pip the desks should
  // earn on client flow needs those clients' conversions to stop happening at mid elsewhere (§6).
  if (deskFillByTicker.size > 0) {
    ctx.updatedCompanies = ctx.updatedCompanies.map((c: any) => {
      const delta = deskFillByTicker.get(c.ticker);
      const sheet = ctx.companyUpdates[c.ticker]?.bankBalanceSheet ?? c.bankBalanceSheet;
      if (!delta || !sheet?.fxDealerBook) return c;
      const nextNet = { ...sheet.fxDealerBook.netNotionalByRegion };
      (Object.keys(delta) as RegionId[]).forEach(r => {
        nextNet[r] = (Number(nextNet[r]) || 0) + delta[r]!;
      });
      const grossUSD = Object.values(nextNet).reduce((a: number, v: any) => a + Math.abs(Number(v) || 0), 0);
      const nextSheet = {
        ...sheet,
        fxDealerBook: { ...sheet.fxDealerBook, netNotionalByRegion: nextNet, grossNotionalUSD: grossUSD },
      };
      if (!ctx.companyUpdates[c.ticker]) ctx.companyUpdates[c.ticker] = {};
      ctx.companyUpdates[c.ticker].bankBalanceSheet = nextSheet;
      return { ...c, bankBalanceSheet: nextSheet };
    });
  }

  // XB6 publishes what each PAIR could not absorb, which is the only honest measure this model
  // has of how deep a pair is. A pair whose whole flow clears is cheap to transact in; one where
  // the dealers are left carrying is dear. XB3a-5's invoice currency is priced off exactly this,
  // so a vehicle currency emerges where the direct pair is thin and the two legs through it are
  // not — which is what a vehicle currency IS.
  const illiquidity: Record<string, number> = {};
  grossByPair.forEach((gross, key) => {
    const residual = Math.abs(residualByPair.get(key) ?? 0);
    illiquidity[key] = gross > 0 ? Math.min(1, residual / gross) : 0;
  });
  state.fxPairIlliquidity = illiquidity;

  // Record what the market did, including what it could NOT clear.
  REGIONS.filter((r) => r !== 'USA').forEach((r) => {
    const reg: any = ctx.updatedRegions[r];
    if (!reg) return;
    const key = ctx.updatedFxPairs.some(p => p.base === r && p.quote === 'USA')
      ? pairKey(r, 'USA') : pairKey('USA', r);
    const prior = state.fxPairs.find(p => pairKey(p.base, p.quote) === key)?.rate ?? 0;
    const now = clearedRateByPair.get(key) ?? prior;
    reg.fxClearedMovePct = Number((prior > 0 ? (now / prior - 1) * 100 : 0).toFixed(4));
    reg.fxUnclearedResidualUSD = Number((residualByPair.get(key) ?? 0).toFixed(0));
    reg.fxGrossDemandUSD = Number((grossByPair.get(key) ?? 0).toFixed(0));
  });
}

export function recordForeignHoldingsSnapshot(ctx: WeeklyStepContext): void {
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e: any) => {
    const byRegion: Record<string, number> = {};
    (e.itemizedHoldings || []).forEach((h: any) => {
      if (!h.issuerRegion || h.issuerRegion === e.region) return;
      byRegion[h.issuerRegion] = (byRegion[h.issuerRegion] ?? 0) + (h.quantityOrNotionalUSD ?? 0);
    });
    return { ...e, priorForeignHoldingsByRegion: byRegion };
  });
}
