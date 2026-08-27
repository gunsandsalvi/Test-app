import { GameState } from '../../types';
import { createInitialContext } from './stages/context';
import { runMacroFeedbackStage } from './stages/01-macro-feedback';
import { runRegionMacroStage } from './stages/02-region-macro';
import { runBankDiversificationStage } from './stages/02b-bank-diversification';
import { runCategoryDemandStage } from './stages/03-category-demand';
import { runInputOutputStage } from './stages/04-input-output';
import { runUnitBiddingStage } from './stages/05-unit-bidding';
import { runFxAndTradeStage } from './stages/06-fx-and-trade';
import { runCommoditiesStage } from './stages/07-commodities';
import { runCompanyFundamentalsStage } from './stages/08-company-fundamentals';
import { runConcentrationRiskStage } from './stages/09-concentration-risk';
import { runMergersStage } from './stages/10-mergers';
import { runFiscalAndSovereignDebtStage } from './stages/11-fiscal-and-sovereign-debt';
import { runPortfolioAndPositionsStage } from './stages/12-portfolio-and-positions';
import { runNewsAndTurnSummaryStage } from './stages/13-news-and-turn-summary';

export { computeOccupationDemand } from './stages/shared-helpers';

/**
 * Advances the simulation by one week, running the thirteen weekly-step stages in
 * order against a single shared WeeklyStepContext. See stages/context.ts for why the
 * stages share one mutable context instead of narrow per-stage interfaces, and each
 * stage file's header for what that stage owns.
 */
export function advanceWeeklyStep(state: GameState): GameState {
  const ctx = createInitialContext(state);

  runMacroFeedbackStage(state, ctx);
  runRegionMacroStage(state, ctx);
  runBankDiversificationStage(state, ctx);
  runCategoryDemandStage(state, ctx);
  runInputOutputStage(state, ctx);
  runUnitBiddingStage(state, ctx);
  runFxAndTradeStage(state, ctx);
  runCommoditiesStage(state, ctx);
  runCompanyFundamentalsStage(state, ctx);
  runConcentrationRiskStage(state, ctx);
  runMergersStage(state, ctx);
  runFiscalAndSovereignDebtStage(state, ctx);
  runPortfolioAndPositionsStage(state, ctx);
  return runNewsAndTurnSummaryStage(state, ctx);
}
