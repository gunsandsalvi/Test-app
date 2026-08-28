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
 * already selling its output: two mechanisms for one real thing (rule 3).
 */

import { GameState, RegionId, FxPair } from '../../../types';
import { evolveFxPair } from '../../macro/evolution';
import { WeeklyStepContext } from './context';
import { MARKET_REGION_IDS } from './05-unit-bidding';

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
  return 1.0;
}

export function runFxAndTradeStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedFxPairs = state.fxPairs.map((fx) => evolveFxPair(fx, ctx.updatedRegions));
  ctx.getFxToUsd = (regionId: RegionId) => getFxToUsd(ctx.updatedFxPairs, regionId);

  MARKET_REGION_IDS.forEach(regionId => {
    let exportsWeeklyUSD = 0;
    let importsWeeklyUSD = 0;
    MARKET_REGION_IDS.forEach(counterparty => {
      if (counterparty === regionId) return;
      exportsWeeklyUSD += ctx.bilateralTradeWeeklyUSD[regionId][counterparty];
      importsWeeklyUSD += ctx.bilateralTradeWeeklyUSD[counterparty][regionId];
    });
    const reg = ctx.updatedRegions[regionId];
    // ANNUALISED, because that is the periodicity every consumer of these fields already reads
    // them at — the GDP identity's net-exports component in stage 11, and fx-clearing's own
    // `/52` back to a weekly flow. The measurement underneath is a real week of settled
    // cross-border sales; the x52 is the run-rate, and it is named as such (rule 9).
    reg.exportsUSD = exportsWeeklyUSD * 52;
    reg.importsUSD = importsWeeklyUSD * 52;
    reg.tradeBalance = reg.exportsUSD - reg.importsUSD;
  });
}
