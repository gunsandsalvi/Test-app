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
import { fxDeskCapacityUSD } from '../../../domain/dealer-derivatives';
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

  // ---- Dealers flattening the inventory their client forwards left them. A desk's book is held
  // against its own base money, so that position is a pair against the USD. ----
  const dealerNetByRegion = new Map<RegionId, number>();
  ctx.updatedCompanies.forEach((c: any) => {
    const book = c.bankBalanceSheet?.fxDealerBook;
    if (!book) return;
    REGIONS.forEach(r => {
      const pos = Number(book.netNotionalByRegion?.[r]) || 0;
      if (pos !== 0) dealerNetByRegion.set(r, (dealerNetByRegion.get(r) ?? 0) + pos);
    });
  });
  dealerNetByRegion.forEach((pos, region) => {
    if (region === 'USA') return;
    // Long the currency means it will SELL it: negative demand for that currency.
    addPairFlow(flows, region, 'USA', -pos);
  });

  // ---- What the bank FX desks can still commit, which is what bounds the arbitrage. ----
  let arbitrageCapacityUSD = 0;
  ctx.updatedCompanies.forEach((c: any) => {
    const sheet = c.bankBalanceSheet;
    if (!sheet) return;
    arbitrageCapacityUSD += fxDeskCapacityUSD(leverageHeadroomUSD(sheet), sheet.fxDealerBook);
  });

  const clearedRateByPair = new Map<string, number>();
  const residualByPair = new Map<string, number>();
  const grossByPair = new Map<string, number>();

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

    const instrument: ClearingInstrument = {
      id: `FX-${key}`,
      outstandingUSD: Math.abs(netBaseDemandUSD),
      tradableFloatUSD: Math.abs(netBaseDemandUSD),
      currentStat: currentRate,
      statKind: 'PRICE_LIKE',
      durationYears: 0,
    };

    // Demand for the base pushes the rate (quote per base) up; supply pushes it down. The elastic
    // side takes the other end, so its reservation sits on the far side of the current level.
    const sign = netBaseDemandUSD >= 0 ? 1 : -1;
    const participants: ClearingParticipant[] = [];

    ctx.updatedInstitutionalEntities.forEach((e: any) => {
      if (e.entityType !== 'HEDGE_FUND') return;
      const capUSD = Math.max(0, e.totalAssetsUSD) * SPECULATOR_FX_RISK_BUDGET;
      if (capUSD <= 0) return;
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: currentRate * (1 + sign * SPECULATOR_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: capUSD,
        fullSizeStatRange: currentRate * (SPECULATOR_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: Math.max(0, e.cashUSD ?? 0),
      });
      participants.push({ id: `${e.id}-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    });

    // Either side's central bank may lean against a move in its own money, and only as far as its
    // real reserves allow (XB5).
    ([fx.base, fx.quote] as RegionId[]).forEach(side => {
      const cb = ctx.updatedRegions[side]?.centralBankSheet;
      const reservesUSD = cb ? centralBankFxReservesUSD(cb) : 0;
      if (!(reservesUSD > 0)) return;
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: currentRate * (1 - sign * CENTRAL_BANK_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: reservesUSD * CENTRAL_BANK_FX_INTERVENTION_SHARE,
        fullSizeStatRange: currentRate * (CENTRAL_BANK_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: reservesUSD * CENTRAL_BANK_FX_INTERVENTION_SHARE,
      });
      participants.push({ id: `CB-${side}-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    });

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
        reservationStat: impliedRate,
        maxHoldingUSD: arbitrageCapacityUSD,
        // Scales in over the gap between the print and the implied rate: a wider dislocation
        // pulls more capital, which is what makes the identity tighten rather than merely hold.
        fullSizeStatRange: Math.max(1e-9, Math.abs(impliedRate - currentRate)),
        maxNetPurchaseUSD: arbitrageCapacityUSD,
      });
      participants.push({ id: `ARB-${key}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    }

    if (participants.length === 0) {
      clearedRateByPair.set(key, currentRate);
      residualByPair.set(key, netBaseDemandUSD);
      return;
    }

    const result = clearFinancialAsset([instrument], participants, new Map(), {
      dealerSpreadBps: 0,
      maxWeeklyStatMovePct: MAX_WEEKLY_FX_MOVE_PCT / 100,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

    clearedRateByPair.set(key, result.newStatById.get(instrument.id) ?? currentRate);
    residualByPair.set(key, result.newDealerInventoryById.get(instrument.id) ?? 0);

    // XB5: what a central bank actually took MOVES its reserves. Defending your own money means
    // buying it with somebody else's, which spends them; a bank at zero stops being able to bid.
    ([fx.base, fx.quote] as RegionId[]).forEach(side => {
      const cb = ctx.updatedRegions[side]?.centralBankSheet;
      if (!cb) return;
      const filled = -(result.netCashDeltaByParticipantId.get(`CB-${side}-${key}`) ?? 0);
      if (!(Math.abs(filled) > 0)) return;
      const book = { ...(cb.fxReservesByRegion ?? {}) };
      const held = Object.keys(book).reduce((a, k) => a + Math.max(0, Number(book[k]) || 0), 0);
      if (!(held > 0)) return;
      Object.keys(book).forEach(k => {
        const share = Math.max(0, Number(book[k]) || 0) / held;
        book[k] = Math.max(0, (Number(book[k]) || 0) - filled * share);
      });
      cb.fxReservesByRegion = book;
    });
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

  // Settle the dealers: the desks offered their whole position and the market took the float less
  // whatever residual is left. Reduce each desk's inventory by its share of what was absorbed.
  dealerNetByRegion.forEach((pos, region) => {
    if (region === 'USA' || pos === 0) return;
    const key = ctx.updatedFxPairs.some(p => p.base === region && p.quote === 'USA')
      ? pairKey(region, 'USA') : pairKey('USA', region);
    const gross = grossByPair.get(key) ?? 0;
    const residual = Math.abs(residualByPair.get(key) ?? 0);
    const absorbedUSD = Math.max(0, gross - residual);
    if (!(absorbedUSD > 0)) return;
    const shareAbsorbed = Math.min(1, absorbedUSD / Math.abs(pos));
    ctx.updatedCompanies = ctx.updatedCompanies.map((c: any) => {
      const book = c.bankBalanceSheet?.fxDealerBook;
      const held = Number(book?.netNotionalByRegion?.[region]) || 0;
      if (!book || held === 0) return c;
      const nextBook = {
        ...book,
        netNotionalByRegion: { ...book.netNotionalByRegion, [region]: held * (1 - shareAbsorbed) },
      };
      const sheet = ctx.companyUpdates[c.ticker]?.bankBalanceSheet ?? c.bankBalanceSheet;
      const nextSheet = { ...sheet, fxDealerBook: nextBook };
      if (!ctx.companyUpdates[c.ticker]) ctx.companyUpdates[c.ticker] = {};
      ctx.companyUpdates[c.ticker].bankBalanceSheet = nextSheet;
      return { ...c, bankBalanceSheet: nextSheet };
    });
  });

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
