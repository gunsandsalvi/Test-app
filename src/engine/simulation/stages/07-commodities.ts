/**
 * Stage 7: the commodity print.
 *
 * §3.22 — A COMMODITY'S SPOT IS A READ OF THE GOODS AUCTION. Every commodity is a value share of
 * a goods sub-unit that stage 05 clears per region (`COMMODITY_CATEGORY_LINKAGE`), and its spot
 * is what that sub-unit cleared at this week, at the gate, in the numéraire, in the commodity's
 * own unit (`domain/commodity-spot.ts`). Nothing here moves a price; the futures book clears the
 * curve against it after this stage (`derivative-markets/commodity-future.ts`).
 *
 * What this stage still owns is the inventory DISPLAY — a percentage on a random walk in
 * [0, 100], untouched by production or consumption and read by nothing but the screen. That is
 * §3 37-COMMODITY's (`commodities-spot.md` D2 / A4), and it moves here exactly as it did before.
 */

import { GameState } from '../../../types';
import { goodsInstrumentId } from '../../../domain/instrument-keys';
import { clearedPriceOf } from '../../../engine2/prices';
import { markCommodityToAuction } from '../../../domain/commodity-spot';
import { weatherYieldLossShareOf } from '../../macro/weather';
import { random } from '../../rng';
import { WeeklyStepContext } from './context';

export function runCommoditiesStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedCommodities = state.commodities.map((comm) => {
    const marked = markCommodityToAuction(comm, ctx.updatedRegions, ctx.getFxToUsd,
      (r, su) => clearedPriceOf(ctx.v2, goodsInstrumentId(r, su)));
    // 37-COMMODITY: the inventory percentage. A loss of yield somewhere in the world is the one
    // real thing it responds to, and it is at most all of the crop (§3.18-i).
    const yieldLossShare = Math.min(1, Object.values(ctx.updatedRegions)
      .reduce((s, r) => s + weatherYieldLossShareOf(r.weather, comm.id), 0));
    const inventoryLevelPct = Math.max(0, Math.min(100, Math.round(comm.inventoryLevelPct + (random() - 0.5) * 3 - yieldLossShare * 40)));
    return { ...marked, inventoryLevelPct };
  });
}
