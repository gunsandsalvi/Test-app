/**
 * WS9/XB2d — the week's FX market: every participant's demand, one cleared rate per currency.
 *
 * Runs after the hedging stage, so the desks' delta-hedge flow is a real order in this book
 * rather than a coefficient applied to a drift. Five participant classes, all of which exist as
 * real balance sheets in this model:
 *
 *   INELASTIC (they need the currency and take the price)
 *     - dealers flattening the FX inventory their client forwards left them
 *     - institutions settling cross-border securities purchases
 *     - exporters and importers converting trade receipts
 *   ELASTIC (they set the price by being willing to take the other side)
 *     - hedge funds, who take the position because it moved far enough to pay them
 *     - central banks, leaning against a disorderly move, bounded by real reserves
 *
 * The elastic side is the answer to "who is the desk selling to". Before this it was nobody.
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
import { centralBankAssetsUSD } from '../../../domain/central-bank';

const REGIONS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

export function runFxClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  // Each non-numéraire currency clears against the USD. The USA's value is 1 by definition, so
  // its own excess demand shows up as the mirror of everyone else's.
  const moveByRegion = new Map<RegionId, number>();
  const residualByRegion = new Map<RegionId, number>();
  const grossByRegion = new Map<RegionId, number>();

  // ---- Every cross-border payment has TWO legs, and building them one currency at a time is how
  // a leg goes missing. A JPN insurer buying EUR paper BUYS euro and SELLS yen; counting only the
  // euro side means the yen is never sold and the trade has one end. With the USD as numéraire a
  // direct JPY->EUR trade is exactly "sell JPY for USD, buy EUR with USD" and the dollar legs
  // net out — which is also how the real market routes most non-dollar pairs. So both legs are
  // registered here, in one pass over the entities, and the flow conserves by construction. ----
  const settlementFlowByRegion = new Map<RegionId, number>();
  const addFlow = (r: RegionId, usd: number) =>
    settlementFlowByRegion.set(r, (settlementFlowByRegion.get(r) ?? 0) + usd);
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
      addFlow(issuer as RegionId, deltaUSD);      // buys the issuer's money
      addFlow(e.region as RegionId, -deltaUSD);   // and sells its own to get it
    });
  });

  REGIONS.filter((r) => r !== 'USA').forEach((region) => {
    const reg: any = ctx.updatedRegions[region];
    if (!reg) return;
    const currentRate = ctx.getFxToUsd(region);
    if (!(currentRate > 0) || !isFinite(currentRate)) return;

    // ---- The FLOAT: the week's inelastic flow, which must find a buyer at some price. Dealers
    // flattening the inventory their client forwards left them, cross-border settlement (both
    // legs), and trade receipts. None of these is choosing a price — they need the currency. ----
    let dealerNetUSD = 0;
    ctx.updatedCompanies.forEach((c: any) => {
      const book = c.bankBalanceSheet?.fxDealerBook;
      if (book) dealerNetUSD += Number(book.netNotionalByRegion?.[region]) || 0;
    });
    const portfolioUSD = settlementFlowByRegion.get(region) ?? 0;
    const tradeUSD = ((reg.exportsUSD ?? 0) - (reg.importsUSD ?? 0)) / 52;
    // Net SELLING pressure is what needs absorbing: dealers long the currency sell it, while a
    // net buyer of the currency reduces what the market has to place.
    const netSupplyUSD = dealerNetUSD - portfolioUSD - tradeUSD;

    const instrument: ClearingInstrument = {
      id: `FX-${region}`,
      outstandingUSD: Math.abs(netSupplyUSD),
      tradableFloatUSD: Math.abs(netSupplyUSD),
      currentStat: currentRate,
      statKind: 'PRICE_LIKE',
      durationYears: 0,
    };

    // ---- The ELASTIC side, posting the same schedule shape every other book uses: a level it is
    // indifferent at, a range over which it scales in, a position CAP from its own capital, and a
    // cash budget. No slope coefficient anywhere. ----
    const sign = netSupplyUSD >= 0 ? 1 : -1;
    const participants: ClearingParticipant[] = [];

    ctx.updatedInstitutionalEntities.forEach((e: any) => {
      if (e.entityType !== 'HEDGE_FUND' || e.isDefaulted) return;
      const capUSD = Math.max(0, e.totalAssetsUSD) * SPECULATOR_FX_RISK_BUDGET;
      if (capUSD <= 0) return;
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: currentRate * (1 - sign * SPECULATOR_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: capUSD,
        fullSizeStatRange: currentRate * (SPECULATOR_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: Math.max(0, e.cashUSD ?? 0),
      });
      participants.push({ id: e.id, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    });

    const cb = reg.centralBankSheet;
    const reservesUSD = cb ? centralBankAssetsUSD(cb) : 0;
    if (reservesUSD > 0) {
      const demand = new Map<string, ParticipantDemand>();
      demand.set(instrument.id, {
        reservationStat: currentRate * (1 - sign * CENTRAL_BANK_RESERVATION_MOVE_PCT / 100),
        maxHoldingUSD: reservesUSD * CENTRAL_BANK_FX_INTERVENTION_SHARE,
        fullSizeStatRange: currentRate * (CENTRAL_BANK_FULL_SIZE_RANGE_PCT / 100),
        maxNetPurchaseUSD: reservesUSD * CENTRAL_BANK_FX_INTERVENTION_SHARE,
      });
      participants.push({ id: `CB-${region}`, currentHoldingsByInstrumentId: new Map(), demandByInstrumentId: demand });
    }

    if (instrument.tradableFloatUSD <= 0 || participants.length === 0) {
      moveByRegion.set(region, 0);
      residualByRegion.set(region, netSupplyUSD);
      grossByRegion.set(region, Math.abs(netSupplyUSD));
      return;
    }

    const result = clearFinancialAsset([instrument], participants, new Map(), {
      dealerSpreadBps: 0,
      maxWeeklyStatMovePct: MAX_WEEKLY_FX_MOVE_PCT / 100,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

    const clearedRate = result.newStatById.get(instrument.id) ?? currentRate;
    moveByRegion.set(region, ((clearedRate - currentRate) / currentRate) * 100);
    // What no buyer took at the cleared level is the dealers' to carry — the same residual every
    // other book leaves with its dealer, rather than a number a clamp invented.
    residualByRegion.set(region, result.newDealerInventoryById.get(instrument.id) ?? 0);
    grossByRegion.set(region, Math.abs(netSupplyUSD));

    // Settle: the desks offered their whole position; the market took the float less whatever the
    // dealer residual is. Reduce each desk's inventory by its share of what was absorbed, and it
    // carries the rest — which is what a dealer of last resort actually does.
    const residual = Math.abs(result.newDealerInventoryById.get(instrument.id) ?? 0);
    const absorbedUSD = Math.max(0, Math.abs(netSupplyUSD) - residual);
    if (absorbedUSD > 0 && Math.abs(dealerNetUSD) > 0) {
      const shareAbsorbed = Math.min(1, absorbedUSD / Math.abs(dealerNetUSD));
      ctx.updatedCompanies = ctx.updatedCompanies.map((c: any) => {
        const book = c.bankBalanceSheet?.fxDealerBook;
        const pos = Number(book?.netNotionalByRegion?.[region]) || 0;
        if (!book || pos === 0) return c;
        const nextBook = {
          ...book,
          netNotionalByRegion: { ...book.netNotionalByRegion, [region]: pos * (1 - shareAbsorbed) },
        };
        const sheet = ctx.companyUpdates[c.ticker]?.bankBalanceSheet ?? c.bankBalanceSheet;
        const nextSheet = { ...sheet, fxDealerBook: nextBook };
        if (!ctx.companyUpdates[c.ticker]) ctx.companyUpdates[c.ticker] = {};
        ctx.companyUpdates[c.ticker].bankBalanceSheet = nextSheet;
        return { ...c, bankBalanceSheet: nextSheet };
      });
    }
  });

  // Apply: each currency's value against the USD moves by what cleared, and every PAIR is derived
  // from two of those — so no set of pair moves can violate triangular arbitrage.
  // The prior value comes from the PAIRS, which persist across weeks — the context is rebuilt
  // every week, so reading it back from there would silently reset every rate to parity.
  const valueUSD: Record<string, number> = { USA: 1 };
  REGIONS.filter((r) => r !== 'USA').forEach((r) => {
    const prior = ctx.getFxToUsd(r);
    valueUSD[r] = (prior > 0 && isFinite(prior) ? prior : 1) * (1 + (moveByRegion.get(r) ?? 0) / 100);
  });
  ctx.currencyValueUSD = valueUSD;

  ctx.updatedFxPairs = ctx.updatedFxPairs.map((fx) => {
    const rate = Number(((valueUSD[fx.base] ?? 1) / (valueUSD[fx.quote] ?? 1)).toFixed(4));
    if (!(rate > 0) || !isFinite(rate)) return fx;
    return {
      ...fx,
      rate,
      change1W: Number((rate - fx.rate).toFixed(4)),
      historicalRates: [...fx.historicalRates.slice(-51), rate],
    };
  });

  // Record what the market did, including what it could NOT clear.
  REGIONS.filter((r) => r !== 'USA').forEach((r) => {
    const reg: any = ctx.updatedRegions[r];
    if (!reg) return;
    reg.fxClearedMovePct = Number((moveByRegion.get(r) ?? 0).toFixed(4));
    reg.fxUnclearedResidualUSD = Number((residualByRegion.get(r) ?? 0).toFixed(0));
    reg.fxGrossDemandUSD = Number((grossByRegion.get(r) ?? 0).toFixed(0));
  });
}

/** Snapshot each entity's foreign holdings so next week can read the CHANGE as settlement flow. */
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
