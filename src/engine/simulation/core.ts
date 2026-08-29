import { GameState, RegionId } from '../../types';
import { createInitialContext } from './stages/context';
import { setRngState, getRngState } from '../rng';
import { runMacroFeedbackStage } from './stages/01-macro-feedback';
import { runRegionMacroStage } from './stages/02-region-macro';
import { runBankDiversificationStage } from './stages/02b-bank-diversification';
import { runCategoryDemandStage } from './stages/03-category-demand';
import { runLaborMarketStage, runLaborReconciliationStage } from './stages/labor-market';
import { runCentralBankStage } from './stages/central-bank';
import { runInputOutputStage } from './stages/04-input-output';
import { runUnitBiddingStage } from './stages/05-unit-bidding';
import { runFxAndTradeStage } from './stages/06-fx-and-trade';
import { runCommoditiesStage } from './stages/07-commodities';
import { runCorporateBondClearingStage } from './stages/07b-corporate-bond-clearing';
import { buildHoldingsStore, finalizeHoldingsStore } from './stages/holdings-store';
import { runSettlementStage } from './stages/settlement';
import { runSmePoolStage } from './stages/sme-pools';
import { accrueInstitutionalIncome, markInstitutionalBooks } from './stages/institutional-balance-sheet';
import { runSovereignBondClearingStage } from './stages/07c-sovereign-bond-clearing';
import { runLeveragedLoanClearingStage } from './stages/07d-leveraged-loan-clearing';
import { runShortDebtClearingStage } from './stages/07f-short-debt-clearing';
import { runEquityClearingStage } from './stages/07e-equity-clearing';
import { runCompanyFundamentalsStage } from './stages/08-company-fundamentals';
import { runPeLifecycleForRegion, settlePeLifecycleDeals, runFirmBirthsForRegion } from './stages/pe-lifecycle';
import { applyPendingCorporateActionSettlements } from './stages/shared-helpers';
import { runIndexCalculationStage } from './stages/index-calculation';
import { runEtfFlowsStage } from './stages/etf-flows';
import { runHouseholdBalanceSheetStage } from './stages/household-balance-sheet';
import { runInsuranceAndPensionsStage } from './stages/insurance-and-pensions';
import { generatePrivateCompanies } from '../companyGenerator';
import { runConcentrationRiskStage } from './stages/09-concentration-risk';
import { runMergersStage } from './stages/10-mergers';
import { runFiscalAndSovereignDebtStage } from './stages/11-fiscal-and-sovereign-debt';
import { runBillAccretionStage } from './stages/bill-accretion';
import { runFxHedgingStage } from './stages/fx-hedging';
import { runFxClearingStage, recordForeignHoldingsSnapshot } from './stages/fx-clearing';
import { runSourcingIntentStage } from './stages/sourcing-intent';
import { runGoodsArrivalStage } from './stages/goods-arrival';
import { runTradeSettlementStage } from './stages/trade-settlement';
// Side effect only: registers the (Node-only, env-gated) clearing worker pool with the engine.
import './stages/clearing-worker-pool';
import { runFreightClearingStage } from './stages/freight-clearing';
import { runPortfolioAndPositionsStage } from './stages/12-portfolio-and-positions';
import { runNewsAndTurnSummaryStage } from './stages/13-news-and-turn-summary';
import { distributeMoneyFundIncome } from './stages/money-market-fund';

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
  // HH5: the labor market clears between credit (02b) and goods demand (03) — employment is
  // determined before the income it generates is spent.
  run('labor-market', () => runLaborMarketStage(state, ctx));
  run('03-category-demand', () => runCategoryDemandStage(state, ctx));
  run('04-input-output', () => runInputOutputStage(state, ctx));
  // XB3a: the week's first two passes. A buyer forms its sourcing plan against observed prices
  // and books the freight it implies; the rate clears against real carrier capacity; the goods
  // auction then prices every origin at the landed cost that rate produces. No lag, no iteration.
  // XB3a-4: what was ordered weeks ago lands before this week's ordering is decided.
  // XB3a-5: invoices struck weeks ago come due before this week's trade is decided, so each one
  // carries exactly the exposure its own terms implied.
  run('trade-settlement', () => runTradeSettlementStage(state, ctx));
  run('goods-arrival', () => runGoodsArrivalStage(state, ctx));
  run('sourcing-intent', () => runSourcingIntentStage(state, ctx));
  run('freight-clearing', () => runFreightClearingStage(state, ctx));
  run('05-unit-bidding', () => runUnitBiddingStage(state, ctx));
  run('06-fx-and-trade', () => runFxAndTradeStage(state, ctx));
  run('07-commodities', () => runCommoditiesStage(state, ctx));
  // Income first, so this week's real coupon receipts can fund this week's bids; mark after,
  // so next week's structural shares are sized by this week's actual close (S11).
  run('institutional-income', () => accrueInstitutionalIncome(ctx));
  // SCALE C1: sweep every entity's holdings ONCE into the shared store; the five books read,
  // claim and append against it, and the write-back after 07e recomposes the arrays — the same
  // rows in the same order the old per-book partition-and-rebuild chain produced.
  run('holdings-store', () => buildHoldingsStore(ctx));
  run('07b-corporate-bond-clearing', () => runCorporateBondClearingStage(state, ctx));
  run('07c-sovereign-bond-clearing', () => runSovereignBondClearingStage(state, ctx));
  run('07d-leveraged-loan-clearing', () => runLeveragedLoanClearingStage(state, ctx));
  run('07f-short-debt-clearing', () => runShortDebtClearingStage(state, ctx));
  run('07e-equity-clearing', () => runEquityClearingStage(state, ctx));
  run('holdings-writeback', () => finalizeHoldingsStore(ctx));
  run('institutional-marking', () => markInstitutionalBooks(ctx));
  run('08-company-fundamentals', () => runCompanyFundamentalsStage(state, ctx));
  // HC Wave 2: the corporate lifecycle. Settles the deals whose financing priced in this
  // week's clearing books, then decides next week's — so a deal is always announced, priced,
  // and settled through the real markets rather than executed on announcement.
  // CASH/SETL2: the week's payments settle. It sits here, directly after the stage that records
  // them, because a balance must be settled before the stages below read it. As later slices
  // migrate more stages onto instructions this moves to the end of the week, where a net
  // settlement system actually runs.
  run('settlement', () => runSettlementStage(ctx));
  // SEG-D: the SME pools' week, measured from the payments settlement just executed — margin,
  // the revenue history the labor market hires against, cash-gated investment, and cash-measured
  // distress. Directly after settlement, because that is where its inputs land.
  run('sme-pools', () => runSmePoolStage(ctx));
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

  // HH1c: the liability flows. After stage 08, so the insurers' own P&L for the week is struck
  // and this stage moves the cash that P&L implies; before the household books, which mark what
  // is left. Somebody pays the premiums and somebody receives the claims.
  run('insurance-and-pensions', () => runInsuranceAndPensionsStage(state, ctx));

  // Indexes after the lifecycle: this week's listings, delistings and cleared prices are all in,
  // so a rebalance sees the market as it finally stands rather than as it opened.
  run('index-calculation', () => runIndexCalculationStage(state, ctx));

  // ETF flows after the indexes are struck: this week's memberships are final, and the creations
  // set up NEXT week's fund demand into the clearing books — the same announce-then-price rhythm
  // WS8 uses, because a fund that decides and executes in one instant is not intermediation.
  run('etf-flows', () => runEtfFlowsStage(state, ctx));

  // The household books, after every price they are marked from: the clearing stages, the
  // indexes and the fund flows. HH1 also records what each institution owes its beneficiaries,
  // which is the same claim seen from the other side.
  run('household-balance-sheet', () => runHouseholdBalanceSheetStage(state, ctx));

  run('09-concentration-risk', () => runConcentrationRiskStage(state, ctx));
  run('10-mergers', () => runMergersStage(state, ctx));
  // PUB3d: bills accrete BEFORE the fiscal stage redeems them, so a maturing bill is repaid at
  // the face its holder has accreted to rather than at last week's value.
  // A stable-NAV fund pays its yield as new shares and its fee leaves to the manager.
  // XB2: hedge the cross-border book that the clearing stages actually left behind.
  run('fx-hedging', () => runFxHedgingStage(state, ctx));
  // WS9/XB2d: the FX market clears against every participant's real demand — including the
  // hedging flow the desks just generated, which now has a counterparty.
  run('fx-clearing', () => { runFxClearingStage(state, ctx); recordForeignHoldingsSnapshot(ctx); });
  run('money-fund-income', () => distributeMoneyFundIncome(ctx));
  run('bill-accretion', () => runBillAccretionStage(state, ctx));
  run('11-fiscal-and-sovereign-debt', () => runFiscalAndSovereignDebtStage(state, ctx));
  // HH5: employment's one representation, re-read after defaults (08), mergers (10) and births
  // have landed — a bankrupt firm's staff are unemployed the week the firm goes, not the next.
  run('labor-reconciliation', () => runLaborReconciliationStage(state, ctx));
  // PUB2: the central bank's week — remittances, the TGA, and the reserves its flows move.
  // After stage 11 so every treasury flow of the week has posted.
  run('central-bank', () => runCentralBankStage(state, ctx));
  run('12-portfolio-and-positions', () => runPortfolioAndPositionsStage(state, ctx));
  const nextState = run('13-news-and-turn-summary', () => runNewsAndTurnSummaryStage(state, ctx));

  return { state: { ...nextState, rngState: getRngState(), lastWeekDamperBoundIds: ctx.damperBoundInstrumentIds, primaryOfferings: ctx.primaryOfferingsWorking, marketIndexes: ctx.updatedMarketIndexes,
    // SETL2: the week's settlement, decomposed. §6 watches the boundary line DOWN, and a number
    // you cannot attribute is a number you cannot watch — this carries what hit it and why.
    lastSettlement: ctx.lastSettlementReport && {
      grossUSD: ctx.lastSettlementReport.grossUSD,
      unresolvedUSD: ctx.lastSettlementReport.unresolvedUSD,
      clearingHouseResidualUSD: ctx.lastSettlementReport.clearingHouseResidualUSD,
      centralBankResidualUSD: ctx.lastSettlementReport.centralBankResidualUSD,
      unmodeledByReason: Object.fromEntries(ctx.lastSettlementReport.unmodeledByReason),
    },
    // SEG1: payments recorded after this week's settlement cutoff settle next cycle instead of
    // dying with the context (they used to be silently dropped — tender proceeds never landed).
    pendingPaymentInstructions: ctx.paymentInstructions,
  }, timings };
}
