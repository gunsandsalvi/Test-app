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
  FxDemandSchedule, clearCurrencyMovePct, FX_MAX_WEEKLY_MOVE_PCT,
  SPECULATOR_SLOPE_PER_CAPITAL, SPECULATOR_FX_RISK_BUDGET, CENTRAL_BANK_FX_SLOPE_PER_RESERVE,
} from '../../../domain/fx-market';
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
    const schedules: FxDemandSchedule[] = [];

    // ---- INELASTIC 1: the dealers' delta hedge. Long the currency from writing client forwards,
    // they sell it — the order XB2c executed against nothing. ----
    let dealerNetUSD = 0;
    ctx.updatedCompanies.forEach((c: any) => {
      const book = c.bankBalanceSheet?.fxDealerBook;
      if (!book) return;
      dealerNetUSD += Number(book.netNotionalByRegion?.[region]) || 0;
    });
    if (Math.abs(dealerNetUSD) > 1e6) {
      // Long -> wants to SELL, so its demand is negative. Inelastic: a desk flattening risk is
      // not choosing a price, it is getting out.
      schedules.push({ participantId: 'DEALERS', netDemandAtCurrentUSD: -dealerNetUSD, slopeUSDPerPct: 0 });
    }

    // ---- INELASTIC 2: cross-border securities settlement, BOTH legs (see above). ----
    const portfolioUSD = settlementFlowByRegion.get(region) ?? 0;
    if (Math.abs(portfolioUSD) > 1e6) {
      schedules.push({ participantId: 'PORTFOLIO', netDemandAtCurrentUSD: portfolioUSD, slopeUSDPerPct: 0 });
    }

    // ---- INELASTIC 3: trade. An exporter is paid in the buyer's money and converts it home; a
    // net exporter is therefore a net buyer of its own currency. ----
    const reg: any = ctx.updatedRegions[region];
    const tradeUSD = ((reg?.exportsUSD ?? 0) - (reg?.importsUSD ?? 0)) / 52;
    if (Math.abs(tradeUSD) > 1e6) {
      schedules.push({ participantId: 'TRADE', netDemandAtCurrentUSD: tradeUSD, slopeUSDPerPct: 0 });
    }

    // ---- ELASTIC 1: speculators. They have no need for the currency at all — they take the
    // other side because the move pays them, and how much capital is willing to do that IS the
    // depth of the market. ----
    const specCapitalUSD = ctx.updatedInstitutionalEntities
      .filter((e: any) => e.entityType === 'HEDGE_FUND' && !e.isDefaulted)
      .reduce((a: number, e: any) => a + Math.max(0, e.totalAssetsUSD) * SPECULATOR_FX_RISK_BUDGET, 0);
    if (specCapitalUSD > 0) {
      schedules.push({
        participantId: 'SPECULATORS',
        netDemandAtCurrentUSD: 0,
        // Negative: an appreciating currency is one they sell into.
        slopeUSDPerPct: -specCapitalUSD * SPECULATOR_SLOPE_PER_CAPITAL,
      });
    }

    // ---- ELASTIC 2: the central bank, leaning against a disorderly move with real reserves. ----
    const cb = reg?.centralBankSheet;
    const reservesUSD = cb ? centralBankAssetsUSD(cb) : 0;
    if (reservesUSD > 0) {
      schedules.push({
        participantId: 'CENTRAL_BANK',
        netDemandAtCurrentUSD: 0,
        slopeUSDPerPct: -reservesUSD * CENTRAL_BANK_FX_SLOPE_PER_RESERVE,
      });
    }

    const { movePct, residualUSD, grossDemandUSD } = clearCurrencyMovePct(schedules, FX_MAX_WEEKLY_MOVE_PCT);
    moveByRegion.set(region, movePct);
    residualByRegion.set(region, residualUSD);
    grossByRegion.set(region, grossDemandUSD);
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
