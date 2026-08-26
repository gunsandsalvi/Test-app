
import { GameState } from '../../types';

export interface PipelineContext {
    [key: string]: any;
}
import { runStage_01_macro_feedback } from './stages/01-macro-feedback';
import { runStage_02_region_macro } from './stages/02-region-macro';
import { runStage_03_category_demand } from './stages/03-category-demand';
import { runStage_04_input_output } from './stages/04-input-output';
import { runStage_05_unit_bidding } from './stages/05-unit-bidding';
import { runStage_06_fx_and_trade } from './stages/06-fx-and-trade';
import { runStage_07_commodities } from './stages/07-commodities';
import { runStage_08_company_fundamentals } from './stages/08-company-fundamentals';
import { runStage_09_concentration_risk } from './stages/09-concentration-risk';
import { runStage_13_news_and_turn_summary } from './stages/13-news-and-turn-summary';
import { runStage_10_ipo_and_ma } from './stages/10-ipo-and-ma';
import { runStage_11_fiscal_and_sovereign_debt } from './stages/11-fiscal-and-sovereign-debt';
import { runStage_12_portfolio_and_positions } from './stages/12-portfolio-and-positions';

export function advanceWeeklyStep(state: GameState): GameState {
    let ctx: PipelineContext = { state };
    ctx = runStage_01_macro_feedback(ctx);
    ctx = runStage_02_region_macro(ctx);
    ctx = runStage_03_category_demand(ctx);
    ctx = runStage_04_input_output(ctx);
    ctx = runStage_05_unit_bidding(ctx);
    ctx = runStage_06_fx_and_trade(ctx);
    ctx = runStage_07_commodities(ctx);
    ctx = runStage_08_company_fundamentals(ctx);
    ctx = runStage_09_concentration_risk(ctx);
    ctx = runStage_13_news_and_turn_summary(ctx);
    ctx = runStage_10_ipo_and_ma(ctx);
    ctx = runStage_11_fiscal_and_sovereign_debt(ctx);
    ctx = runStage_12_portfolio_and_positions(ctx);

    return ctx.state;
}
