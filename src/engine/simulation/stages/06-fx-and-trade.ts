/**
 * Stage 6: FX basis evolution & the published trade position
 *
 * The exchange rate itself is not set here — XB2f moved it into `fx-clearing.ts`, where each
 * currency clears against real flow like every other asset class. What is left is the forward
 * basis, the USD conversion every other stage reads, and publishing the week's trade.
 *
 * XB3a: trade is no longer computed. It is REPORTED. Stage 05's world book already sold every
 * tradable good to a named buyer, so an export is simply a fill whose buyer sat in a different
 * region from its seller, and this stage sums those fills into each region's position. What it
 * replaced was `exportShareCapture` — a clamped formula that handed an exporter a share of the
 * importer's aggregate demand on a competitiveness-and-FX score, credited to firms separately in
 * stage 08. That was a second, independent way for a company to make a sale beside the auction
 * already selling its output: two mechanisms for one real thing (rule 4).
 */

import { GameState, RegionId, FxPair } from '../../../types';
import { WeeklyStepContext } from './context';
import { MARKET_REGION_IDS } from './05-unit-bidding';
import { defect } from '../../../domain/defect';
import { REGION_IDS, CURRENCY_BY_REGION } from '../../../domain/geography';
import { V2World, openFxWeek } from '../../../engine2/world';

/**
 * USD per one unit of a region's currency.
 *
 * It used to look pairs up by NAME, against labels the model did not build — every lookup missed
 * and every caller silently got a hardcoded fallback, which is why the exchange rate had never
 * moved anything: the one function converting to USD returned a constant. Matching on base and
 * quote instead makes it read the real cleared rate, whatever the pair happens to be labelled.
 */
export function getFxToUsd(updatedFxPairs: FxPair[], regionId: RegionId): number {
  if (regionId === 'USA') return 1.0;
  const direct = updatedFxPairs.find((p) => p.base === regionId && p.quote === 'USA');
  if (direct && direct.rate > 0 && isFinite(direct.rate)) return direct.rate;
  const inverse = updatedFxPairs.find((p) => p.base === 'USA' && p.quote === regionId);
  if (inverse && inverse.rate > 0 && isFinite(inverse.rate)) return 1 / inverse.rate;
  // GUARD: this used to return 1.0. That is what made the original failure invisible — every
  // lookup missed, every caller got a constant, and the exchange rate moved nothing for the
  // model's whole life. The lookup is fixed; a miss now fails where it happens.
  return defect(`no FX pair for ${regionId} against USA — the pair table is incomplete`);
}

/**
 * §3.13c — PUBLISH WHAT THE AUCTION CLEARED. It lands in `v2.fxNext` and takes effect at the NEXT
 * week's open (`openFxWeek`), because the rate a payment settles at is the one the LAST auction
 * cleared: a table that moves mid-week makes two honest reads of the same balance disagree, and
 * every such disagreement is a revaluation reported as a leak. Written in place, because the
 * week's context holds the same object.
 */
export function publishFxRates(v2: V2World, fxPairs: FxPair[]): void {
  REGION_IDS.forEach((r) => { v2.fxNext[CURRENCY_BY_REGION[r]] = getFxToUsd(fxPairs, r); });
}

/** The seed's rates are in force AND next: there is no earlier auction for the week to open on. */
export function publishFxRatesNow(v2: V2World, fxPairs: FxPair[]): void {
  publishFxRates(v2, fxPairs);
  openFxWeek(v2);
}

export function runFxAndTradeStage(state: GameState, ctx: WeeklyStepContext): void {
  // §3.17b-iv-b: nothing evolves a pair by formula any more — the rate clears (fx-clearing.ts)
  // and the basis clears (derivative-markets/xcs.ts); the week opens on copies.
  ctx.updatedFxPairs = state.fxPairs.map((fx) => ({ ...fx }));
  ctx.getFxToUsd = (regionId: RegionId) => getFxToUsd(ctx.updatedFxPairs, regionId);
  publishFxRates(ctx.v2, ctx.updatedFxPairs);

  MARKET_REGION_IDS.forEach(regionId => {
    let exportsWeeklyLocal = 0;
    let importsWeeklyLocal = 0;
    MARKET_REGION_IDS.forEach(counterparty => {
      if (counterparty === regionId) return;
      exportsWeeklyLocal += ctx.bilateralTradeWeeklyLocal[regionId][counterparty];
      importsWeeklyLocal += ctx.bilateralTradeWeeklyLocal[counterparty][regionId];
    });
    const reg = ctx.updatedRegions[regionId];
    // ANNUALISED, because that is the periodicity every consumer of these fields already reads
    // them at — the GDP identity's net-exports component in stage 11, and fx-clearing's own
    // `/52` back to a weekly flow. The measurement underneath is a real week of settled
    // cross-border sales; the x52 is the run-rate, and it is named as such (rule 8).
    reg.exportsLocal = exportsWeeklyLocal * 52;
    reg.importsLocal = importsWeeklyLocal * 52;
    reg.tradeBalance = reg.exportsLocal - reg.importsLocal;
  });
}
