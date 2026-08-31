/**
 * Stage 7: Commodity Evolution
 *
 * Evolves each tracked commodity's spot/futures curve from regional demand, weather, and
 * resource-endowment feedback (see macro/evolution.ts's evolveCommodity).
 */

import { GameState } from '../../../types';
import { evolveCommodity } from '../../macro/evolution';
import { WeeklyStepContext } from './context';

export function runCommoditiesStage(state: GameState, ctx: WeeklyStepContext): void {
  ctx.updatedCommodities = state.commodities.map((comm) =>
    evolveCommodity(comm, ctx.updatedRegions.USA.gdpGrowth, ctx.updatedRegions.USA.zeroRates.tenor3M, ctx.updatedRegions, state.companies, ctx.getFxToUsd)
  );
}
