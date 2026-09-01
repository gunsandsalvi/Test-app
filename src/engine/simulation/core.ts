import { rollDamperStreaks, setDamperStreaks } from './stages/financial-clearing-engine';
import { GameState, RegionId } from '../../types';
import { dealersFromBanks } from '../dealers';
import { runPrimeBrokerageStage, runPrimeBrokerageCloseSweep } from './stages/prime-brokerage';
import { runSwapClearingStage } from './stages/07g-swap-clearing';
import { runCdsClearingStage } from './stages/07h-cds-clearing';
import { runCommodityFuturesStage } from './stages/07i-commodity-futures';
import { runSecuritiesLendingStage } from './stages/securities-lending';
import { runEstateResolutionStage } from './stages/estate-resolution';
import { reconcileRepoPledges } from './stages/repo-clearing';
import { createInitialContext } from './stages/context';
import { StageDependencyTrace, stageTraceEnabled } from './stage-deps';
import { BankIdentityTrace, bankIdentityTraceEnabled } from './bank-identity-trace';
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
import { buildHoldingsStore, finalizeHoldingsStore, consolidateRegister } from './stages/holdings-store';
import { runSettlementStage } from './stages/settlement';
import { runSmePoolStage } from './stages/sme-pools';
import { accrueInstitutionalIncome, markInstitutionalBooks } from './stages/institutional-balance-sheet';
import { runSovereignBondClearingStage } from './stages/07c-sovereign-bond-clearing';
import { runLeveragedLoanClearingStage } from './stages/07d-leveraged-loan-clearing';
import { runShortDebtClearingStage } from './stages/07f-short-debt-clearing';
import { runEquityClearingStage } from './stages/07e-equity-clearing';
import { runCompanyFundamentalsStage } from './stages/08-company-fundamentals';
import { auditCompanyStore, syncCompanyField } from '../../engine2/company-store';
import { drainSeedRings } from '../../engine2/world';
import { runPeLifecycleForRegion, settlePeLifecycleDeals, runFirmBirthsForRegion } from './stages/pe-lifecycle';
import { applyPendingCorporateActionSettlements, applyHolderInterestAccruals } from './stages/shared-helpers';
import { runIndexCalculationStage } from './stages/index-calculation';
import { runEtfFlowsStage } from './stages/etf-flows';
import { runHouseholdBalanceSheetStage } from './stages/household-balance-sheet';
import { runInsuranceAndPensionsStage } from './stages/insurance-and-pensions';
import { generatePrivateCompanies } from '../companyGenerator';
import { runForeignDirectInvestment } from './stages/foreign-direct-investment';
import { runConcentrationRiskStage } from './stages/09-concentration-risk';
import { runMergersStage } from './stages/10-mergers';
import { runFiscalAndSovereignDebtStage } from './stages/11-fiscal-and-sovereign-debt';
import { runSovereignCalendarStage } from './stages/sovereign-calendar';
import { runBillAccretionStage } from './stages/bill-accretion';
import { runFxHedgingStage } from './stages/fx-hedging';
import { runFxClearingStage, recordForeignHoldingsSnapshot } from './stages/fx-clearing';
import { runSourcingIntentStage } from './stages/sourcing-intent';
import { runGoodsArrivalStage } from './stages/goods-arrival';
import { runTradeSettlementStage } from './stages/trade-settlement';
// Side effect only: registers the (Node-only, env-gated) clearing worker pool with the engine.
import './stages/clearing-worker-pool';
import { ensureV2 } from '../../engine2/world';
import { syncLadderRows, assertLaddersInSync, materializeLadder } from '../../engine2/tranches';
import { ensureBooksSynced, assertBooksInSync, materializeBook } from '../../engine2/holdings';
import './stages/native-kernels';
import { runFreightClearingStage } from './stages/freight-clearing';
import { runPortfolioAndPositionsStage } from './stages/12-portfolio-and-positions';
import { runNewsAndTurnSummaryStage } from './stages/13-news-and-turn-summary';
import { distributeMoneyFundIncome } from './stages/money-market-fund';
import { REGION_IDS } from '../../domain/geography';

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
  /** §5-STRUCT step 5 — populated only under STAGE_TRACE=1: what each stage actually read and
   *  wrote, and therefore which orderings are load-bearing. */
  stageTrace?: StageDependencyTrace;
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
  {
    // §7.310 tranche flip stage 1 — the mirror's catch-up: any firm not yet synced (the seed,
    // and every birth path) gets its ladder mirrored before the week reads anything.
    const v2 = ensureV2(state);
    for (const c of state.companies) {
      if (!v2.tranches.synced.has(c.id)) syncLadderRows(v2, c.id, c.debtTranches);
    }
    // Holdings flip stage 1 — the same catch-up for the institutional register: the seed and any
    // unhooked creation path (fund births, estate spawns) get their books mirrored here.
    ensureBooksSynced(v2, state.institutionalEntities ?? []);
  }
  const baseCtx = createInitialContext(state);
  // The adaptive damper's memory for this week's books (financial-clearing-engine.ts).
  setDamperStreaks(state.damperBindStreakById);
  // §5-STRUCT step 5: `ctx` is a binding the stage closures read at call time, so the runner can
  // swap a recording proxy in around each stage without any stage knowing. Off by default; when
  // off this costs one boolean test per stage and `ctx` is `baseCtx` throughout.
  let ctx = baseCtx;
  const trace = stageTraceEnabled() ? new StageDependencyTrace() : undefined;
  const idTrace = bankIdentityTraceEnabled() ? new BankIdentityTrace() : undefined;
  idTrace?.begin(state, baseCtx);
  const timings: StageTiming[] = [];
  const profile = options?.profile === true;
  const run = <T>(stage: string, fn: () => T): T => {
    if (trace) ctx = trace.begin(stage, baseCtx);
    try {
      if (process.env.COMPANY_STORE_AUDIT === '1') {
        const r = fn();
        auditCompanyStore(state, stage);
        return r;
      }
      if (!profile) return fn();
      const startedAt = performance.now();
      const result = fn();
      timings.push({ stage, ms: performance.now() - startedAt });
      return result;
    } finally {
      if (trace) { trace.end(); ctx = baseCtx; }
      if (process.env.ALIAS_TRACE === '1' && stage === '01-macro-feedback') {
        const scan = (label: string, list: { ticker: string; id: string; debtTranches?: unknown }[]): void => {
          const seen = new Map<object, { ticker: string; id: string }>();
          let pairs = 0; let cloneFam = 0; const ex: string[] = [];
          for (const c of list) {
            if (!c.debtTranches) continue;
            const prior = seen.get(c.debtTranches as object);
            if (prior) {
              pairs++;
              if (c.id.startsWith(prior.id) || prior.id.startsWith(c.id)) cloneFam++;
              if (ex.length < 3) ex.push(`${prior.ticker}(${prior.id})~${c.ticker}(${c.id})`);
            } else seen.set(c.debtTranches as object, { ticker: c.ticker, id: c.id });
          }
          console.log(`[alias] w${baseCtx.nextWeek} ${label}: ${pairs} pairs (${cloneFam} clone-family) ${ex.join(' | ')}`);
        };
        scan('updatedCompanies', baseCtx.updatedCompanies as never);
        scan('state.companies', state.companies as never);
      }
      idTrace?.afterStage(stage, state, baseCtx);
      // MINT_STAGE_TRACE=<companyId> — read-only: prints the stage after which the named
      // issuer's CORP_BOND holder total moved (the §7.289 mint-drift dig's instrument).
      const mintFocus = process.env.MINT_STAGE_TRACE;
      if (mintFocus) {
        const focusIds = new Set(
          baseCtx.updatedCompanies.filter((c) => c.ticker === mintFocus).map((c) => c.id));
        let usd = 0;
        baseCtx.updatedInstitutionalEntities.forEach((e) => {
          if (!e.isDefaulted) e.itemizedHoldings.forEach((h) => {
            // Debug instrument, not dispatch: the class literal lives in a const so the
            // ASSET_SWITCH ratchet keeps counting real dispatch sites only.
            const corpBond: string = 'CORP_BOND';
            if (focusIds.size > 0 ? focusIds.has(h.instrumentId) : h.instrumentId === mintFocus) {
              if (h.instrumentType === corpBond) usd += h.quantityOrNotionalUSD ?? 0;
            }
          });
        });
        if (focusIds.size > 1) console.log(`  [mint-stage] NOTE: ${focusIds.size} ids share ticker ${mintFocus}`);
        const prev = (globalThis as { __mintPrevUSD?: number }).__mintPrevUSD ?? usd;
        if (Math.abs(usd - prev) > 1e6) {
          console.log(`  [mint-stage] ${stage}: ${(prev / 1e6).toFixed(0)}M -> ${(usd / 1e6).toFixed(0)}M`);
        }
        (globalThis as { __mintPrevUSD?: number }).__mintPrevUSD = usd;
      }
    }
  };

  run('01-macro-feedback', () => runMacroFeedbackStage(state, ctx));
  syncCompanyField(state, 'cash');
  run('02-region-macro', () => runRegionMacroStage(state, ctx));
  run('02b-bank-diversification', () => runBankDiversificationStage(state, ctx));
  syncCompanyField(state, 'bankMarketShare'); syncCompanyField(state, 'totalDebt'); // II.4 sync mesh (writers named by the store audit)
  // HH5: the labor market clears between credit (02b) and goods demand (03) — employment is
  // determined before the income it generates is spent.
  run('labor-market', () => runLaborMarketStage(state, ctx));
  // HF1: the funds' lines are re-struck before any book opens, so a line cut this week is a
  // fund that has to sell in this week's auctions.
  run('prime-brokerage', () => runPrimeBrokerageStage(state, ctx));
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
  syncCompanyField(state, 'oasSpreadBps');
  run('07c-sovereign-bond-clearing', () => runSovereignBondClearingStage(state, ctx));
  run('07d-leveraged-loan-clearing', () => runLeveragedLoanClearingStage(state, ctx));
  run('07f-short-debt-clearing', () => runShortDebtClearingStage(state, ctx));
  syncCompanyField(state, 'totalDebt');
  // HF: the borrow is located and struck BEFORE the equity book opens, so a short sells its
  // borrowed shares into this week's real bid and a recalled one buys in against it.
  run('securities-lending', () => runSecuritiesLendingStage(state, ctx));
  syncCompanyField(state, 'shortInterestShares');
  run('07e-equity-clearing', () => runEquityClearingStage(state, ctx));
  syncCompanyField(state, 'stockPrice'); syncCompanyField(state, 'marketCap');
  // DER1: after the sovereign curve is this week's cleared one, which every schedule reads.
  run('07g-swap-clearing', () => runSwapClearingStage(state, ctx));
  // CRD/DER2: after 07b, whose cleared OAS every schedule in the protection book prices against.
  run('07h-cds-clearing', () => runCdsClearingStage(state, ctx));
  syncCompanyField(state, 'cdsSpreadBps'); syncCompanyField(state, 'cdsBasisBps');
  // DER4: after 07-commodities, whose spot every futures schedule prices against.
  run('07i-commodity-futures', () => runCommodityFuturesStage(state, ctx));
  // REPO2: the sovereign books have all cleared, so a pledge on paper a bank no longer holds is
  // called and the loan it secured shrinks with it.
  run('repo-collateral-reconcile', () => reconcileRepoPledges(ctx));
  run('holdings-writeback', () => finalizeHoldingsStore(ctx));
  run('institutional-marking', () => markInstitutionalBooks(ctx));
  run('08-company-fundamentals', () => runCompanyFundamentalsStage(state, ctx));
  // §7.250 — stage 08 has consumed the bank-sheet channel; any later write to it throws.
  ctx.bankSheetChannelClosed = true;
  // HC Wave 2: the corporate lifecycle. Settles the deals whose financing priced in this
  // week's clearing books, then decides next week's — so a deal is always announced, priced,
  // and settled through the real markets rather than executed on announcement.
  // CASH/SETL2: the week's payments settle. It sits here, directly after the stage that records
  // them, because a balance must be settled before the stages below read it. As later slices
  // migrate more stages onto instructions this moves to the end of the week, where a net
  // settlement system actually runs.
  run('settlement', () => runSettlementStage(ctx));
  syncCompanyField(state, 'cash');
  // SEG-D: the SME pools' week, measured from the payments settlement just executed — margin,
  // the revenue history the labor market hires against, cash-gated investment, and cash-measured
  // distress. Directly after settlement, because that is where its inputs land.
  run('sme-pools', () => runSmePoolStage(ctx));
  run('hc-lifecycle', () => {
    settlePeLifecycleDeals(ctx, ctx.nextWeek);
    REGION_IDS.forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (!reg) return;
      runPeLifecycleForRegion(regionId, reg, ctx, ctx.nextWeek);
      const born = runFirmBirthsForRegion(regionId, reg, ctx, ctx.nextWeek, generatePrivateCompanies);
      if (born.length > 0) {
        ctx.updatedCompanies.push(...born);
      drainSeedRings({ v2: ensureV2(state), companies: born });
        const v2b = ensureV2(state);
        for (const b of born) syncLadderRows(v2b, b.id, b.debtTranches);
      }
    });
    // §5-MNC: a firm that has lost a foreign merit order for the measured year builds there —
    // through the SAME birth machinery, funded by the parent's own money crossing settlement.
    const fdiBorn = runForeignDirectInvestment(ctx, ctx.nextWeek, generatePrivateCompanies);
    if (fdiBorn.length > 0) {
      ctx.updatedCompanies.push(...fdiBorn);
      drainSeedRings({ v2: ensureV2(state), companies: fdiBorn });
      const v2f = ensureV2(state);
      for (const b of fdiBorn) syncLadderRows(v2f, b.id, b.debtTranches);
    }
    // A take-private's tender is a corporate action recorded on the same per-week maps stage 08
    // uses — and stage 08 has already drained them by the time this stage runs, so settling here
    // is not optional. Without it the register was extinguished and the shareholders were paid
    // nothing: measured, institutional equity buying power fell 53.9B -> 43.0B against the
    // control because the capital calls went out and the tender proceeds never came back.
    applyPendingCorporateActionSettlements(ctx);
    // CAL's accruals are NOT run again here. Stage 08 is where the week's interest is registered
    // and where the coupon dates are declared, and it applies them itself; a second call walked
    // the whole register again for nothing — or, in a week with no coupon due, for a second
    // accrual on top of the first.
  });
  syncCompanyField(state, 'lastRecapWeek'); syncCompanyField(state, 'listingStatus'); syncCompanyField(state, 'stockPrice'); syncCompanyField(state, 'marketCap'); syncCompanyField(state, 'sharesOutstanding');

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

  // G5: after stage 08 has named this week's defaults, so a workout opens the week it fails.
  run('estate-resolution', () => runEstateResolutionStage(state, ctx));
  syncCompanyField(state, 'grossPPEUSD');
  run('09-concentration-risk', () => runConcentrationRiskStage(state, ctx));
  syncCompanyField(state, 'customerConcentration'); syncCompanyField(state, 'supplierConcentration');
  run('10-mergers', () => runMergersStage(state, ctx));
  for (const f of ['accumulatedDepreciationUSD', 'acquiredByTicker', 'annualRevenue', 'capex', 'employeeCount', 'grossPPEUSD', 'growthCapex', 'maintenanceCapex', 'marketCap', 'mergerAcquired', 'sharesOutstanding', 'stockPrice', 'totalDebt'] as const) syncCompanyField(state, f);
  // PUB3d: bills accrete BEFORE the fiscal stage redeems them, so a maturing bill is repaid at
  // the face its holder has accreted to rather than at last week's value.
  // A stable-NAV fund pays its yield as new shares and its fee leaves to the manager.
  // XB2: hedge the cross-border book that the clearing stages actually left behind.
  run('fx-hedging', () => runFxHedgingStage(state, ctx));
  // WS9/XB2d: the FX market clears against every participant's real demand — including the
  // hedging flow the desks just generated, which now has a counterparty.
  run('fx-clearing', () => { runFxClearingStage(state, ctx); recordForeignHoldingsSnapshot(ctx); });
  run('money-fund-income', () => distributeMoneyFundIncome(ctx));
  syncCompanyField(state, 'mmfSharesUSD');
  run('bill-accretion', () => runBillAccretionStage(state, ctx));
  // CAL: the sovereign calendar. After every book that trades government paper has cleared and
  // the bills have accreted, so the holders it walks are the ones the week ended with; before the
  // fiscal stage, which strikes the treasury's own interest line against the same holdings. The
  // payments it posts settle at the close below.
  run('sovereign-calendar', () => runSovereignCalendarStage(ctx));
  run('11-fiscal-and-sovereign-debt', () => runFiscalAndSovereignDebtStage(state, ctx));
  // HH5: employment's one representation, re-read after defaults (08), mergers (10) and births
  // have landed — a bankrupt firm's staff are unemployed the week the firm goes, not the next.
  run('labor-reconciliation', () => runLaborReconciliationStage(state, ctx));
  // §4.0 Tier 1 item 6: a leveraged fund's mid-week debit is financed the same week — the
  // margin account's sweep, run against everything the close is about to settle.
  run('prime-brokerage-close-sweep', () => runPrimeBrokerageCloseSweep(ctx));
  // CASH: the CLOSE. Everything the late stages posted — the insurers, the money fund, the ETFs,
  // the FX desks, the estates, the treasury's redemptions — settles here. A week has two cycles
  // because a day does, and without the second one those stages had nowhere to send a payment.
  run('settlement-close', () => runSettlementStage(ctx));
  syncCompanyField(state, 'cash');
  // PUB2: the central bank's week — remittances, the TGA, and the reserves its flows move.
  // After stage 11 AND after the close, so every flow of the week has posted before it counts
  // its own liabilities: settling reserves after it reconciled left its sheet not closing.
  run('central-bank', () => runCentralBankStage(state, ctx));
  run('12-portfolio-and-positions', () => runPortfolioAndPositionsStage(state, ctx));
  // SCALE: one row per position before the week closes, so next week's sweeps of the register
  // walk positions rather than the fills that built them (stages/holdings-store.ts).
  run('register-consolidation', () => consolidateRegister(ctx));
  const nextState = run('13-news-and-turn-summary', () => runNewsAndTurnSummaryStage(state, ctx));
  {
    // §7.311 WRITER FLIP — the rows are the ladder's authority; the object arrays are a view
    // materialized once here, for the UI, STATE_DUMP and the seed-time readers. One linear pass
    // replaces the per-writer syncs and every mid-week object rebuild.
    const v2 = ensureV2(state);
    for (const c of nextState.companies) c.debtTranches = materializeLadder(v2, c.id);
    // §7.313 flip, holdings — same pattern: the rows are the register's authority; the object
    // books are a view materialized here for the UI, STATE_DUMP and the seed-time readers —
    // but only the books a writer touched (§7.315): a clean book's view from last close is
    // still exact, and nothing mutates view arrays any more (all writers are row-native), so
    // carrying the array forward aliases nothing. A missed dirty mark cannot survive gating:
    // HOLDINGS_SYNC_CHECK compares EVERY book to its rows.
    const dirtyBooks = v2.holdings.dirty;
    for (const e of nextState.institutionalEntities ?? []) {
      if (dirtyBooks.has(e.id)) e.itemizedHoldings = materializeBook(v2, e.id);
    }
    dirtyBooks.clear();
  }
  if (process.env.TRANCHE_SYNC_CHECK === '1') assertLaddersInSync(ensureV2(state), nextState.companies);
  if (process.env.HOLDINGS_SYNC_CHECK === '1') assertBooksInSync(ensureV2(state), nextState.institutionalEntities ?? []);
  idTrace?.report(baseCtx.nextWeek);

  return { state: { ...nextState, rngState: getRngState(), estates: ctx.estates,
    derivativesBook: ctx.derivativesBook ?? state.derivativesBook,
    holderAccruedInterestUSD: ctx.holderAccruedInterestUSD,
    sovereignAccruedInterestUSD: ctx.sovereignAccruedInterestUSD,
    lastCashReconcileUSD: ctx.cashReconcileUSD,
    lastCashReconcileByClassUSD: ctx.cashReconcileByClassUSD,
    lastCashOverdraftUSD: ctx.cashOverdraftUSD,
    // G3b: the player's counterparties ARE the named banks' desks, so the list is re-derived
    // every week off their sheets — a desk that filled up this week quotes differently next.
    dealers: dealersFromBanks(nextState.companies), lastWeekDamperBoundIds: ctx.damperBoundInstrumentIds, damperBindStreakById: rollDamperStreaks(state.damperBindStreakById, ctx.damperBoundInstrumentIds), lastWeekDeadCeilingBooks: ctx.deadCeilingBooks, primaryOfferings: ctx.primaryOfferingsWorking, marketIndexes: ctx.updatedMarketIndexes,
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
    pendingPaymentJournal: ctx.paymentJournal,
  }, timings, stageTrace: trace };
}
