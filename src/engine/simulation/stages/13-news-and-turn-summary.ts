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

import { GameState, RegionId, Portfolio } from '../../../types';
import { checkForIPO } from '../ipo';
import { WeeklyStepContext } from './context';

export function runNewsAndTurnSummaryStage(state: GameState, ctx: WeeklyStepContext): GameState {
  const { nextWeek, currentWeekMod13, updatedRegions, updatedCompanies, updatedPositions } = ctx;

  // 6. Generate Weekly Breaking News & Sentiment Shifts
  (Object.keys(updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const ipo = checkForIPO(regionId, reg, state.companies, nextWeek);
    if (ipo) {
      const underwritingFeePct = 0.02;
      const proceedsUSDReal = ipo.sharesOutstanding * ipo.stockPrice;
      const underwritingFeeUSD = proceedsUSDReal * underwritingFeePct;
      reg.bankingSector.bankEquityUSD += underwritingFeeUSD;
      if (!reg.bankingSector.itemizedHoldings) reg.bankingSector.itemizedHoldings = [];
      reg.bankingSector.itemizedHoldings.push({
        instrumentId: ipo.id,
        instrumentType: 'EQUITY',
        issuerRegion: regionId,
        quantityOrNotionalUSD: proceedsUSDReal * 0.05
      });
      updatedCompanies.push(ipo);
      ctx.recentIPOs.push({ ticker: ipo.ticker, name: ipo.name, category: ipo.productLines?.[0]?.industry || 'Unknown', week: nextWeek });
      if (ctx.recentIPOs.length > 20) ctx.recentIPOs.shift();
      ctx.diagnosticLogs.push({
        week: nextWeek,
        timestamp: new Date().toISOString(),
        category: 'MACRO',
        message: `New IPO: ${ipo.name} enters ${ipo.productLines?.[0]?.industry} amid strong demand growth`,
        deltaText: '',
        data: { regionId }
      });
    }
  });

  const cashAfterWeek = state.portfolio.cashUSD + ctx.weeklyInterestIncomeUSD + ctx.weeklyRealizedPnL + ctx.weeklyRealizedCashUSD - ctx.weeklyFinancingCostUSD;
  const navUSD = cashAfterWeek + updatedPositions.reduce((s, p) => s + p.unrealizedPnL, 0);
  const updatedPortfolio: Portfolio = {
    ...state.portfolio,
    cashUSD: cashAfterWeek,
    positions: updatedPositions,
    navUSD,
    totalRequiredMarginUSD: ctx.totalRequiredMarginUSD,
    maintenanceMarginUSD: ctx.maintenanceMarginUSD,
    marginUtilizationPct: navUSD > 0 ? Math.round((ctx.totalRequiredMarginUSD / navUSD) * 100) : 100,
    isMarginCall: navUSD < ctx.maintenanceMarginUSD,
  };
  const updatedNewsFeed = [...state.newsFeed, ...ctx.newsItems].slice(-100);
  const updatedDiagnosticsLogs = [...state.diagnosticsLogs, ...ctx.diagnosticLogs].slice(-100);
  const year = state.year + (currentWeekMod13 === 13 && nextWeek % 52 === 0 ? 1 : 0);

  const pnlDeltaUSD = navUSD - state.portfolio.navUSD;
  const turnSummary: GameState['turnSummary'] = {
    week: nextWeek,
    pnlDeltaUSD,
    pnlDeltaPct: state.portfolio.navUSD > 0 ? Number(((pnlDeltaUSD / state.portfolio.navUSD) * 100).toFixed(2)) : 0,
    interestIncomeUSD: ctx.weeklyInterestIncomeUSD,
    financingCostUSD: ctx.weeklyFinancingCostUSD,
    defaultedCompanies: ctx.defaultedTickers,
    ratingsChanges: ctx.ratingChanges,
    earningsReported: ctx.earningsReportedThisTurn,
    marginAlert: updatedPortfolio.isMarginCall ? 'ACCOUNT IN MARGIN CALL: required maintenance margin exceeds NAV.' : null,
    attribution: {
      carryUSD: ctx.attributionCarry,
      macroRatesUSD: ctx.attributionMacroRates,
      creditSpreadUSD: ctx.attributionCreditSpread,
      equityDeltaUSD: ctx.attributionEquityDelta,
      volThetaUSD: ctx.attributionVolTheta,
    },
  };
  const isGameOver = navUSD <= 0;
  const gameOverReason = isGameOver ? 'Portfolio wiped out — NAV reached zero or below.' : null;

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
    isGameOver,
    gameOverReason
  };
}
