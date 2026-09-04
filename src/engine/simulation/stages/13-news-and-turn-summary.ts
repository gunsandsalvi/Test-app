/**
 * Stage 13: IPOs, Portfolio Settlement & Turn Summary
 *
 * Checks each region for a new IPO (this is the IPO check's actual, original
 * execution point — it runs after stages 09-12, not adjacent to the stage-10
 * merger logic, despite both being "corporate actions"; moving it earlier would
 * let a freshly-IPO'd company participate in this week's fiscal/portfolio
 * calculations, which is a behavior change we deliberately did not make when
 * splitting this file), settles cash/NAV/margin for the week, and assembles the
 * final GameState returned to the caller.
 */

import { GameState, Portfolio } from '../../../types';
import { WeeklyStepContext } from './context';

export function runNewsAndTurnSummaryStage(state: GameState, ctx: WeeklyStepContext): GameState {
  const { nextWeek, currentWeekMod13, updatedRegions, updatedCompanies, updatedPositions } = ctx;

  // HC7: the synthetic IPO block that used to sit here is gone with `generateIPOCompany`. A
  // listing is a sponsor's decision about a real company it already owns, priced as a real WS8
  // equity offering in 07e (stages/pe-lifecycle.ts) — including the underwriting fee, which
  // now reaches a NAMED lead bank's balance sheet instead of the region aggregate that 02b
  // overwrites the following week (§7.30's "a write to a derived view is a write to nothing").

  const cashAfterWeek = state.portfolio.cashLocal + ctx.weeklyInterestIncomeLocal + ctx.weeklyRealizedPnL + ctx.weeklyRealizedCashLocal - ctx.weeklyFinancingCostLocal;
  const navLocal = cashAfterWeek + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const updatedPortfolio: Portfolio = {
    ...state.portfolio,
    cashLocal: cashAfterWeek,
    positions: updatedPositions,
    navLocal,
    totalRequiredMarginLocal: ctx.totalRequiredMarginLocal,
    maintenanceMarginLocal: ctx.maintenanceMarginLocal,
    marginUtilizationPct: navLocal > 0 ? Math.round((ctx.totalRequiredMarginLocal / navLocal) * 100) : 100,
    isMarginCall: navLocal < ctx.maintenanceMarginLocal,
  };
  // §5-NEWS — a quarter of stories (the derived feed runs ~30–60 a week); the UI reads nothing older.
  const updatedNewsFeed = [...state.newsFeed, ...ctx.newsItems].slice(-600);
  const updatedDiagnosticsLogs = [...state.diagnosticsLogs, ...ctx.diagnosticLogs].slice(-100);
  const year = state.year + (currentWeekMod13 === 13 && nextWeek % 52 === 0 ? 1 : 0);

  const pnlDeltaLocal = navLocal - state.portfolio.navLocal;
  const turnSummary: GameState['turnSummary'] = {
    week: nextWeek,
    pnlDeltaLocal,
    pnlDeltaPct: state.portfolio.navLocal > 0 ? Number(((pnlDeltaLocal / state.portfolio.navLocal) * 100).toFixed(2)) : 0,
    interestIncomeLocal: ctx.weeklyInterestIncomeLocal,
    financingCostLocal: ctx.weeklyFinancingCostLocal,
    defaultedCompanies: ctx.defaultedTickers,
    ratingsChanges: ctx.ratingChanges,
    earningsReported: ctx.earningsReportedThisTurn,
    marginAlert: updatedPortfolio.isMarginCall ? 'ACCOUNT IN MARGIN CALL: required maintenance margin exceeds NAV.' : null,
    attribution: {
      carryLocal: ctx.attributionCarry,
      macroRatesLocal: ctx.attributionMacroRates,
      creditSpreadLocal: ctx.attributionCreditSpread,
      equityDeltaLocal: ctx.attributionEquityDelta,
      volThetaLocal: ctx.attributionVolTheta,
    },
  };

  return {
    ...state,
    currentWeek: nextWeek,
    year,
    regions: updatedRegions,
    fxPairs: ctx.updatedFxPairs,
    companies: updatedCompanies,
    institutionalEntities: ctx.updatedInstitutionalEntities,
    commodities: ctx.updatedCommodities,
    compositeIndices: ctx.updatedCompositeIndices,
    recentIPOs: ctx.recentIPOs,
    recentMergers: ctx.recentMergers,
    marketVolPremium: ctx.marketVolPremium,
    portfolio: updatedPortfolio,
    newsFeed: updatedNewsFeed,
    diagnosticsLogs: updatedDiagnosticsLogs,
    turnSummary,
  };
}
