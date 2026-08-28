import { GameState, RegionId } from '../../types';
import { createInitialContext } from './stages/context';
import { setRngState, getRngState } from '../rng';
import { runMacroFeedbackStage } from './stages/01-macro-feedback';
import { runRegionMacroStage } from './stages/02-region-macro';
import { runBankDiversificationStage } from './stages/02b-bank-diversification';
import { runCategoryDemandStage } from './stages/03-category-demand';
import { runInputOutputStage } from './stages/04-input-output';
import { runUnitBiddingStage } from './stages/05-unit-bidding';
import { runFxAndTradeStage } from './stages/06-fx-and-trade';
import { runCommoditiesStage } from './stages/07-commodities';
import { runCorporateBondClearingStage } from './stages/07b-corporate-bond-clearing';
import { accrueInstitutionalIncome, markInstitutionalBooks } from './stages/institutional-balance-sheet';
import { runSovereignBondClearingStage } from './stages/07c-sovereign-bond-clearing';
import { runLeveragedLoanClearingStage } from './stages/07d-leveraged-loan-clearing';
import { runShortDebtClearingStage } from './stages/07f-short-debt-clearing';
import { runEquityClearingStage } from './stages/07e-equity-clearing';
import { runCompanyFundamentalsStage } from './stages/08-company-fundamentals';
import { runPeLifecycleForRegion, settlePeLifecycleDeals, runFirmBirthsForRegion } from './stages/pe-lifecycle';
import { applyPendingCorporateActionSettlements } from './stages/shared-helpers';
import { runIndexCalculationStage } from './stages/index-calculation';
import { generatePrivateCompanies } from '../companyGenerator';
import { runConcentrationRiskStage } from './stages/09-concentration-risk';
import { runMergersStage } from './stages/10-mergers';
import { runFiscalAndSovereignDebtStage } from './stages/11-fiscal-and-sovereign-debt';
import { runPortfolioAndPositionsStage } from './stages/12-portfolio-and-positions';
import { runNewsAndTurnSummaryStage } from './stages/13-news-and-turn-summary';

export { computeOccupationDemand } from './stages/shared-helpers';

/** Wall-clock cost of one stage, for one week. See `advanceWeeklyStep`'s `profile` option. */
export interface StageTiming {
  stage: string;
  ms: number;
}

export interface WeeklyStepOptions {
  /**
   * Record per-stage wall-clock time and return it alongside the state.
   *
   * This exists because the first optimization pass bought 6%: the obvious filters were hoisted
   * and the real cost turned out to be somewhere else entirely (an O(firms x contracts) scan).
   * Guessing where a weekly step spends its time is unreliable — measure it. Off by default and
   * free when off; the only cost when on is one `performance.now()` per stage.
   */
  profile?: boolean;
}

export interface WeeklyStepResult {
  state: GameState;
  /** Populated only when `profile` was set. */
  timings: StageTiming[];
}

/**
 * Advances the simulation by one week, running the weekly-step stages in order against a single
 * shared WeeklyStepContext. See stages/context.ts for why the stages share one mutable context
 * instead of narrow per-stage interfaces, and each stage file's header for what that stage owns.
 */
export function advanceWeeklyStep(state: GameState, options?: WeeklyStepOptions): GameState {
  return advanceWeeklyStepProfiled(state, options).state;
}

/** As `advanceWeeklyStep`, but hands back the per-stage timings too. */
export function advanceWeeklyStepProfiled(state: GameState, options?: WeeklyStepOptions): WeeklyStepResult {
  // Pick the random stream up where this state left it, and hand the new position back on the
  // state below. A saved game therefore resumes the same world instead of forking into another
  // one, and a run replayed from the same seed is identical week for week (engine/rng.ts).
  setRngState(state.rngState);
  const ctx = createInitialContext(state);
  const timings: StageTiming[] = [];
  const profile = options?.profile === true;
  const run = <T>(stage: string, fn: () => T): T => {
    if (!profile) return fn();
    const startedAt = performance.now();
    const result = fn();
    timings.push({ stage, ms: performance.now() - startedAt });
    return result;
  };

  run('01-macro-feedback', () => runMacroFeedbackStage(state, ctx));
  run('02-region-macro', () => runRegionMacroStage(state, ctx));
  run('02b-bank-diversification', () => runBankDiversificationStage(state, ctx));
  run('03-category-demand', () => runCategoryDemandStage(state, ctx));
  run('04-input-output', () => runInputOutputStage(state, ctx));
  run('05-unit-bidding', () => runUnitBiddingStage(state, ctx));
  run('06-fx-and-trade', () => runFxAndTradeStage(state, ctx));
  run('07-commodities', () => runCommoditiesStage(state, ctx));
  // Income first, so this week's real coupon receipts can fund this week's bids; mark after,
  // so next week's structural shares are sized by this week's actual close (S11).
  run('institutional-income', () => accrueInstitutionalIncome(ctx));
  run('07b-corporate-bond-clearing', () => runCorporateBondClearingStage(state, ctx));
  run('07c-sovereign-bond-clearing', () => runSovereignBondClearingStage(state, ctx));
  run('07d-leveraged-loan-clearing', () => runLeveragedLoanClearingStage(state, ctx));
  run('07f-short-debt-clearing', () => runShortDebtClearingStage(state, ctx));
  run('07e-equity-clearing', () => runEquityClearingStage(state, ctx));
  run('institutional-marking', () => markInstitutionalBooks(ctx));
  run('08-company-fundamentals', () => runCompanyFundamentalsStage(state, ctx));
  // HC Wave 2: the corporate lifecycle. Settles the deals whose financing priced in this
  // week's clearing books, then decides next week's — so a deal is always announced, priced,
  // and settled through the real markets rather than executed on announcement.
  run('hc-lifecycle', () => {
    settlePeLifecycleDeals(ctx, ctx.nextWeek);
    (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (!reg) return;
      runPeLifecycleForRegion(regionId, reg, ctx, ctx.nextWeek);
      const born = runFirmBirthsForRegion(regionId, reg, ctx, ctx.nextWeek, generatePrivateCompanies);
      if (born.length > 0) ctx.updatedCompanies.push(...born);
    });
    // A take-private's tender is a corporate action recorded on the same per-week maps stage 08
    // uses — and stage 08 has already drained them by the time this stage runs, so settling here
    // is not optional. Without it the register was extinguished and the shareholders were paid
    // nothing: measured, institutional equity buying power fell 53.9B -> 43.0B against the
    // control because the capital calls went out and the tender proceeds never came back.
    applyPendingCorporateActionSettlements(ctx);
  });

  // Indexes after the lifecycle: this week's listings, delistings and cleared prices are all in,
  // so a rebalance sees the market as it finally stands rather than as it opened.
  run('index-calculation', () => runIndexCalculationStage(state, ctx));

  run('09-concentration-risk', () => runConcentrationRiskStage(state, ctx));
  run('10-mergers', () => runMergersStage(state, ctx));
  run('11-fiscal-and-sovereign-debt', () => runFiscalAndSovereignDebtStage(state, ctx));
  run('12-portfolio-and-positions', () => runPortfolioAndPositionsStage(state, ctx));
  const nextState = run('13-news-and-turn-summary', () => runNewsAndTurnSummaryStage(state, ctx));

  return { state: { ...nextState, rngState: getRngState(), lastWeekDamperBoundIds: ctx.damperBoundInstrumentIds, primaryOfferings: ctx.primaryOfferingsWorking, marketIndexes: ctx.updatedMarketIndexes }, timings };
}
