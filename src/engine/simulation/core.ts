import { bankReservesOf } from '../ledger/accounts';
import type { EntityId } from '../../domain/ids';
import { ensureManagements, runManagementReviewStage } from './stages/management-review';
import { runFxRevaluationStage } from './stages/fx-revaluation';
import { toNumeraire } from '../../domain/currency';
import { currencyOfId } from '../../engine2/world';
import { runNewsDerivationStage } from './stages/news-derivation';

import { GameState } from '../../types';
import { dealersFromBanks } from '../dealers';
import { runPrimeBrokerageStage } from './stages/prime-brokerage';
import { runRelativeValueStage } from './stages/relative-value';
import { runOverdraftSweep } from './stages/overdraft-sweep';
import { runDerivativesStage } from './stages/derivatives';
import { runSecuritiesLendingStage, runBondLendingPass } from './stages/securities-lending';
import { runEstateResolutionStage } from './stages/estate-resolution';
import { reconcileRepoPledges } from './stages/repo-clearing';
import { createInitialContext } from './stages/context';
import { StageDependencyTrace, stageTraceEnabled } from './stage-deps';
import { BankIdentityTrace, bankIdentityTraceEnabled } from './bank-identity-trace';
import { CentralBankIdentityTrace, centralBankIdentityTraceEnabled } from './central-bank-identity-trace';
import { setActiveWireJournal, setActiveWireWorld, summarizeWires } from '../ledger/wire';
import { reasonText } from './stages/settlement';
import { setRngState, getRngState } from '../rng';
import { runMacroFeedbackStage } from './stages/01-macro-feedback';
import { runRegionMacroStage } from './stages/02-region-macro';
import { runBankDiversificationStage } from './stages/02b-bank-diversification';
import { runCategoryDemandStage } from './stages/03-category-demand';
import { runLaborMarketStage, runLaborReconciliationStage } from './stages/labor-market';
import { runCentralBankStage } from './stages/central-bank';
import { runUnitBiddingStage } from './stages/05-unit-bidding';
import { runFxAndTradeStage } from './stages/06-fx-and-trade';
import { runCommoditiesStage } from './stages/07-commodities';
import { runCorporateBondClearingStage } from './stages/07b-corporate-bond-clearing';
import { buildHoldingsStore, finalizeHoldingsStore, consolidateRegister } from './stages/holdings-store';
import { markRegisterToMarket } from './stages/register-marking';
import { runSettlementStage } from './stages/settlement';
import { runBankResolutionStage } from './stages/bank-resolution';
import { runBankFundingCloseStage } from './stages/bank-funding-close';
import { runSmePoolStage } from './stages/sme-pools';
import { accrueInstitutionalIncome } from './stages/institutional-balance-sheet';
import { runSovereignBondClearingStage } from './stages/07c-sovereign-bond-clearing';
import { runLeveragedLoanClearingStage } from './stages/07d-leveraged-loan-clearing';
import { runShortDebtClearingStage } from './stages/07f-short-debt-clearing';
import { runSovereignCurveStage } from './stages/sovereign-curve';
import { runEquityClearingStage } from './stages/07e-equity-clearing';
import { runCompanyFundamentalsStage } from './stages/08-company-fundamentals';
import { auditCompanyStore, syncCompanyField } from '../../engine2/company-store';
import { drainSeedRings } from '../../engine2/world';
import { seedOpeningCreditPrices } from '../bootstrap/close-seed';
import { runPeLifecycleForRegion, settlePeLifecycleDeals, runFirmBirthsForRegion } from './stages/pe-lifecycle';
import { applyPendingCorporateActionSettlements } from './stages/shared-helpers';
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
import { runFxClearingStage, recordForeignHoldingsSnapshot } from './stages/fx-clearing';
import { runSourcingIntentStage } from './stages/sourcing-intent';
import { runGoodsArrivalStage } from './stages/goods-arrival';
import { runTradeSettlementStage } from './stages/trade-settlement';
// Side effect only: registers the (Node-only, env-gated) clearing worker pool with the engine.
import './stages/clearing-worker-pool';
import { ensureV2, typeRefOf } from '../../engine2/world';
import { wireWorldOf } from '../ledger/wire-world';
import { bankBookAssetsLocal } from '../desk-register';
import { materializeLadder, facilityBookOf } from '../../engine2/tranches';
import { seedLadder } from '../ledger/tranche-ledger';
import { seedBook, issuerOfHoldingRow } from '../ledger/holdings-ledger';
import { buildEntityIndex } from '../ledger/entity-index';
import type { ItemizedHolding } from '../../domain/banking';
import type { PartyRef } from '../ledger/party';

import { bookHeadOf, instrumentIdAt, materializeBook, clearDirtyBooks } from '../../engine2/holdings';
import './stages/native-kernels';
import { runFreightClearingStage } from './stages/freight-clearing';
import { runPortfolioAndPositionsStage } from './stages/12-portfolio-and-positions';
import { runNewsAndTurnSummaryStage } from './stages/13-news-and-turn-summary';
import { distributeMoneyFundIncome } from './stages/money-market-fund';
import { REGION_IDS } from '../../domain/geography';
import { equityIssuerId } from '../../domain/instrument-keys';

export { computeOccupationDemand } from './stages/shared-helpers';

/** Wall-clock cost of one stage, for one week. See `advanceWeeklyStep`'s `profile` option. */
interface StageTiming {
  stage: string;
  ms: number;
}

interface WeeklyStepOptions {
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

interface WeeklyStepResult {
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
    // Any entity that entered the world by any path without a management gets its two
    // primitives drawn here, once, from its own stream.
    ensureManagements(state.companies, state.institutionalEntities ?? [], state.currentWeek);
  }
  const baseCtx = createInitialContext(state);
  // §5-STRUCT step 5: `ctx` is a binding the stage closures read at call time, so the runner can
  // swap a recording proxy in around each stage without any stage knowing. Off by default; when
  // off this costs one boolean test per stage and `ctx` is `baseCtx` throughout.
  let ctx = baseCtx;
  const trace = stageTraceEnabled() ? new StageDependencyTrace() : undefined;
  const idTrace = bankIdentityTraceEnabled() ? new BankIdentityTrace() : undefined;
  idTrace?.begin(state, baseCtx);
  // The week's wire journal is active from the first stage to the last write-back — and beside it
  // the world every wire resolves its parties and its instrument against (§3.13-BOOK d2): the
  // week's entity arrays, grown by each birth, and the tranche store.
  setActiveWireJournal(baseCtx.wireJournal);
  setActiveWireWorld(wireWorldOf(ensureV2(state), baseCtx.updatedCompanies, baseCtx.updatedInstitutionalEntities));
  {
    // THE LADDERS' CATCH-UP, INSIDE THE JOURNAL. Any firm whose ladder is not yet open — every
    // birth path — opens its ladder here, by wire, which is why this cannot run before the
    // journal is live (it used to, and that is precisely why the opening ladders had none).
    // It must still come before any stage: the register's rows name tranches and every reader
    // resolves an issuer through the store, so week 1's books cannot run on an empty store.
    // A no-op from week 2.
    const v2 = ensureV2(state);
    for (const c of state.companies) {
      if (!v2.tranches.synced.has(c.id)) seedLadder(v2, { id: c.id, ticker: c.ticker, region: c.region }, c.debtTranches);
    }
    // The REGISTER opens the same way. A holding's issuer is the party its instrument names: a
    // firm for equity and corporate paper (the id IS the company's), the treasury for a sovereign
    // tranche, the fund itself for its own shares.
    const { companyById } = buildEntityIndex(state.companies, state.institutionalEntities ?? []);
    const issuerOfHolding = (h: ItemizedHolding): PartyRef => issuerOfHoldingRow(v2, h, companyById);
    for (const e of state.institutionalEntities ?? []) {
      if (!v2.holdings.synced.has(e.id)) seedBook(v2, { kind: 'INSTITUTION', id: e.id }, e.itemizedHoldings, issuerOfHolding);
    }
  }
  const cbTrace = centralBankIdentityTraceEnabled() ? new CentralBankIdentityTrace() : undefined;
  cbTrace?.begin(state, baseCtx);
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
      idTrace?.afterStage(stage, state, baseCtx);
      cbTrace?.afterStage(stage, state, baseCtx);
      // MINT_STAGE_TRACE=<companyId> — read-only: prints the stage after which the named
      // issuer's CORP_BOND holder total moved (the §7.289 mint-drift dig's instrument).
      const mintFocus = process.env.MINT_STAGE_TRACE;
      if (mintFocus) {
        const focusIds = new Set(
          baseCtx.updatedCompanies.filter((c) => c.ticker === mintFocus).map((c) => c.id));
        let usd = 0;
        // THE ROWS, mid-week: the array is the week's opening view and would never move between
        // stages, which is the one thing this instrument exists to see.
        const v2m = ensureV2(state);
        const Hm = v2m.holdings;
        // Debug instrument, not dispatch: the class literal lives in a const so the
        // ASSET_SWITCH ratchet keeps counting real dispatch sites only.
        const corpBond: string = 'CORP_BOND';
        const corpBondRef = typeRefOf(v2m, corpBond);
        baseCtx.updatedInstitutionalEntities.forEach((e) => {
          if (e.isDefaulted) return;
          for (let r = bookHeadOf(v2m, e.id); r >= 0; r = Hm.next[r]) {
            if (Hm.typeRef[r] !== corpBondRef) continue;
            const id = instrumentIdAt(v2m, r);
            if (focusIds.size > 0 ? focusIds.has(equityIssuerId(id)) : id === mintFocus) usd += Hm.qtyLocal[r];
          }
        });
        if (focusIds.size > 1) console.log(`  [mint-stage] NOTE: ${focusIds.size} ids share ticker ${mintFocus}`);
        const prev = (globalThis as { __mintPrevLocal?: number }).__mintPrevLocal ?? usd;
        if (Math.abs(usd - prev) > 1e6) {
          console.log(`  [mint-stage] ${stage}: ${(prev / 1e6).toFixed(0)}M -> ${(usd / 1e6).toFixed(0)}M`);
        }
        (globalThis as { __mintPrevLocal?: number }).__mintPrevLocal = usd;
      }
    }
  };

  // §3.13c-REVAL: the week opens on the rate the last auction cleared, and every foreign balance
  // is marked to it before anything reads one. First, so no stage sees two rates.
  run('fx-revaluation', () => runFxRevaluationStage(state));
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
  // §3.17e-ii-a: the relative-value books state their legs off last week's prints, on the lines
  // just struck, before the books that clear them open.
  run('relative-value', () => runRelativeValueStage(state, ctx));
  run('03-category-demand', () => runCategoryDemandStage(state, ctx));
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
  // §3.17e-iii-b / 17f-v: a bond borrow — a sovereign's rung or a corporate's — is located and
  // struck on the opening register, before the bond auctions, so the paper is sold into this
  // week's bid.
  run('bond-lending', () => runBondLendingPass(state, ctx));
  run('07b-corporate-bond-clearing', () => runCorporateBondClearingStage(state, ctx));
  run('07c-sovereign-bond-clearing', () => runSovereignBondClearingStage(state, ctx));
  run('07d-leveraged-loan-clearing', () => runLeveragedLoanClearingStage(state, ctx));
  run('07f-short-debt-clearing', () => runShortDebtClearingStage(state, ctx));
  // §3.13-SOV row 5 / §3.25: ONE owner fits the region's curve, once, through every point the
  // week's sovereign sessions cleared — after both of them, because both produce points.
  run('sovereign-curve', () => runSovereignCurveStage(ctx));
  syncCompanyField(state, 'totalDebt');
  // HF: the borrow is located and struck BEFORE the equity book opens, so a short sells its
  // borrowed shares into this week's real bid and a recalled one buys in against it.
  run('securities-lending', () => runSecuritiesLendingStage(state, ctx));
  syncCompanyField(state, 'shortInterestShares');
  run('07e-equity-clearing', () => runEquityClearingStage(state, ctx));
  syncCompanyField(state, 'stockPrice'); syncCompanyField(state, 'marketCap');
  // DRV — THE ONE DERIVATIVE STAGE, the clearing phase (§7.382): swaps after 07c (the cleared
  // curve every schedule reads), protection after 07b (the cleared OAS), futures after
  // 07-commodities (spot) — every class the registry names, in its order, over one standing index.
  run('derivatives', () => runDerivativesStage(state, ctx, 'CLEARING'));
  syncCompanyField(state, 'cdsSpreadBps'); syncCompanyField(state, 'cdsBasisBps');
  // REPO2: the sovereign books have all cleared, so a pledge on paper a bank no longer holds is
  // called and the loan it secured shrinks with it.
  run('repo-collateral-reconcile', () => reconcileRepoPledges(ctx));
  run('holdings-writeback', () => finalizeHoldingsStore(ctx));
  // §9.13-CREDIT row 5: A POSITION IS WORTH ITS QUANTITY AT THIS WEEK'S PRICE, and
  // `register-marking` runs at the CLOSE rather than here. Marking at this point does not
  // converge — every stage after it writes rows back in par space, so the register would end the
  // week part marked and part not.
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
        // §5-WIRES W6: a newborn's ladder is issued by wire at its birth (pe-lifecycle); nothing
        // to seed.
        // §3.13: a newborn's ladder is aged the same way the seed's is, so it opens with the same
        // per-tranche price the seed deposits — otherwise its first session prices aged paper as
        // though it had been struck at par this week.
        seedOpeningCreditPrices(ctx.updatedRegions, born, ensureV2(state), ctx.nextWeek);
      }
    });
    // §5-MNC: a firm that has lost a foreign merit order for the measured year builds there —
    // through the SAME birth machinery, funded by the parent's own money crossing settlement.
    const fdiBorn = runForeignDirectInvestment(ctx, ctx.nextWeek, generatePrivateCompanies);
    if (fdiBorn.length > 0) {
      ctx.updatedCompanies.push(...fdiBorn);
      drainSeedRings({ v2: ensureV2(state), companies: fdiBorn });
      // §5-WIRES W6: a subsidiary is born with no debt (FDI is equity); its ladder is empty.
      const v2f = ensureV2(state);
      for (const b of fdiBorn) seedLadder(v2f, { id: b.id, ticker: b.ticker, region: b.region }, []);
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
  syncCompanyField(state, 'grossPPELocal');
  run('09-concentration-risk', () => runConcentrationRiskStage(state, ctx));
  syncCompanyField(state, 'customerConcentration'); syncCompanyField(state, 'supplierConcentration');
  run('10-mergers', () => runMergersStage(state, ctx));
  // §5-MGMT — the quarterly review: a management that fails its measured record is replaced.
  run('management-review', () => runManagementReviewStage(state, ctx));
  for (const f of ['accumulatedDepreciationLocal', 'acquiredById', 'annualRevenue', 'capex', 'employeeCount', 'grossPPELocal', 'growthCapex', 'maintenanceCapex', 'marketCap', 'mergerAcquired', 'sharesOutstanding', 'stockPrice', 'totalDebt'] as const) syncCompanyField(state, f);
  // PUB3d: bills accrete BEFORE the fiscal stage redeems them, so a maturing bill is repaid at
  // the face its holder has accreted to rather than at last week's value.
  // A stable-NAV fund pays its yield as new shares and its fee leaves to the manager.
  // XB2/DRV: the one derivative stage's post-settlement phase — the forwards hedge the
  // cross-border book that the clearing stages actually left behind.
  run('derivatives-post-settlement', () => runDerivativesStage(state, ctx, 'POST_SETTLEMENT'));
  // WS9/XB2d: the FX market clears against every participant's real demand — including the
  // hedging flow the desks just generated, which now has a counterparty.
  run('fx-clearing', () => { runFxClearingStage(state, ctx); recordForeignHoldingsSnapshot(ctx); });
  run('money-fund-income', () => distributeMoneyFundIncome(ctx));
  syncCompanyField(state, 'mmfSharesLocal');
  run('bill-accretion', () => runBillAccretionStage(ctx));
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
  // §5-CLOSE M4: every negative balance — firm, fund, pool — is named credit before the close.
  run('overdraft-sweep', () => runOverdraftSweep(ctx));
  // CASH: the CLOSE. Everything the late stages posted — the insurers, the money fund, the ETFs,
  // the FX desks, the estates, the treasury's redemptions — settles here. A week has two cycles
  // because a day does, and without the second one those stages had nowhere to send a payment.
  run('settlement-close', () => runSettlementStage(ctx));
  syncCompanyField(state, 'cash');
  // §7.339: a bank under prompt corrective action is closed on the week's final sheets and its
  // books go whole to the strongest peer — after the close (an empty journal, every sheet
  // final), before the central bank counts the reserves it just moved.
  // §3.20-LLR-i: THE MONEY MARKET CLEARS HERE — the repo session with the standing facility as
  // its ceiling, the unsecured book on the name, the overnight window taking what was left
  // unlent — after the close has settled, where every bank's need is knowable.
  run('bank-funding-close', () => runBankFundingCloseStage(state, ctx));
  run('bank-resolution', () => runBankResolutionStage(state, ctx));
  for (const f of ['cash', 'isDefaulted', 'defaultedWeek', 'bankResolvedWeek', 'employeeCount', 'grossPPELocal', 'accumulatedDepreciationLocal', 'annualRevenue', 'ebitda', 'ebit', 'bankMarketShare', 'homeBankId', 'creditRating', 'stockPrice', 'marketCap'] as const) syncCompanyField(state, f);
  // PUB2: the central bank's week — remittances, the TGA, and the reserves its flows move.
  // After stage 11 AND after the close, so every flow of the week has posted before it counts
  // its own liabilities: settling reserves after it reconciled left its sheet not closing.
  run('central-bank', () => runCentralBankStage(state, ctx));
  // §5-CLOSE — THE THIRD CYCLE. The funding close, the resolution and the central bank's own
  // week all post payments after the close (the central bank's coupon and remittance, the
  // lender-of-last-resort draw, the treasury's guarantee); they used to settle NEXT week, which
  // was the whole of M1's and M6's remaining residual (a one-week lag of ~1B). A week's money is
  // settled inside the week: nothing recorded after the close waits for the next one.
  run('settlement-funding', () => runSettlementStage(ctx));
  run('12-portfolio-and-positions', () => runPortfolioAndPositionsStage(state, ctx));
  // SCALE: one row per position before the week closes, so next week's sweeps of the register
  // walk positions rather than the fills that built them (stages/holdings-store.ts).
  run('register-consolidation', () => consolidateRegister(ctx));
  // §9.13-CREDIT row 5 / §9.13-EQUITY — THE MARK, AND IT IS THE LAST WORD. Every stage that
  // writes a register row has run and the week's fills are one row per position, so nothing after
  // this puts the book back into par space. The books trade QUANTITY (`units`); this moves only
  // what that quantity is WORTH, at the price its own market printed.
  run('register-marking', () => markRegisterToMarket(state, ctx));
  // §5-NEWS — the derived stories over what this week recorded, before the feed is assembled.
  run('news-derivation', () => runNewsDerivationStage(state, ctx));
  const nextState = run('13-news-and-turn-summary', () => runNewsAndTurnSummaryStage(state, ctx));
  {
    // §7.311 WRITER FLIP — the rows ARE the ladder; the object arrays are a view materialized
    // once here, for the UI, STATE_DUMP and the seed-time readers, and nothing in a week reads
    // them (§3.13-BOOK d1b).
    const v2 = ensureV2(state);
    for (const c of nextState.companies) c.debtTranches = materializeLadder(v2, c.id);
    // §7.313 flip, holdings — same pattern: the rows ARE the register; the object books are a
    // view materialized here for the UI, STATE_DUMP and the seed-time readers — but only the
    // books a writer touched (§7.315): a clean book's view from last close is still exact, and
    // nothing in a week reads or writes the arrays (§3.13-BOOK d1), so carrying one forward
    // aliases nothing.
    const dirtyBooks = v2.holdings.dirty;
    for (const e of nextState.institutionalEntities ?? []) {
      if (dirtyBooks.has(e.id)) e.itemizedHoldings = materializeBook(v2, e.id);
    }
    clearDirtyBooks(v2);
  }
  idTrace?.report(baseCtx.nextWeek);
  cbTrace?.report(baseCtx.nextWeek);

  return { state: { ...nextState, rngState: getRngState(), estates: ctx.estates,
    lastCashOverdraftLocal: ctx.cashOverdraftLocal,
    overdraftStreaks: ctx.overdraftStreaks,
    // G3b: the player's counterparties ARE the named banks' desks, so the list is re-derived
    // every week off their sheets — a desk that filled up this week quotes differently next.
    dealers: dealersFromBanks(ctx.v2, (b) => bankReservesOf(ctx.v2, b.id), (b) => facilityBookOf(ctx.v2, b.id), (b) => bankBookAssetsLocal(ctx.v2, b.id), nextState.companies), lastWeekDeadCeilingBooks: ctx.deadCeilingBooks, lastWeekUnclearedBooks: ctx.unclearedBooks, primaryOfferings: ctx.primaryOfferingsWorking, marketIndexes: ctx.updatedMarketIndexes,
    // SETL2: the week's settlement, decomposed. §6 watches the boundary line DOWN, and a number
    // you cannot attribute is a number you cannot watch — this carries what hit it and why.
    lastSettlement: ctx.lastSettlementReport && {
      grossLocal: ctx.lastSettlementReport.grossLocal,
      grossByCurrency: { ...ctx.lastSettlementReport.grossByCurrency },
      unresolvedLocal: ctx.lastSettlementReport.unresolvedLocal,
      clearingHouseResidualLocal: ctx.lastSettlementReport.clearingHouseResidualLocal,
      centralBankResidualLocal: ctx.lastSettlementReport.centralBankResidualLocal,
      accountRowsUnmapped: ctx.lastSettlementReport.accountRowsUnmapped,
      accountUnmappedLocal: ctx.lastSettlementReport.accountUnmappedLocal,
      accountUnmappedByKind: Object.fromEntries(ctx.lastSettlementReport.accountUnmappedByKind.entries()),
      treasuryFlowsByRegion: Object.fromEntries(
        Array.from(ctx.lastSettlementReport.treasuryFlowsByRegion.entries())
          .map(([r, m]) => [r, Object.fromEntries(m.entries())])
      ),
      smePoolFlowsByPool: Object.fromEntries(
        Array.from(ctx.lastSettlementReport.smePoolFlowsByPool.entries())
          .map(([k, m]) => [k, Object.fromEntries(m.entries())])
      ),
      householdFlowsByRegion: Object.fromEntries(
        Array.from(ctx.lastSettlementReport.householdFlowsByRegion.entries())
          .map(([k, m]) => [k, Object.fromEntries(m.entries())])
      ),
      ...(() => {
        // Keyed off EVERY company, not the banks among them. These tallies are keyed by a bank's
        // ticker, and a bank that stops being one during the week — resolved, or merged and its
        // sheet cleared — is still the company whose region the money moved in. Filtering to
        // `isBankEntity` dropped its whole delta on the floor, silently, and M6 saw the deposits
        // move with no creator to explain them.
        // §3.13-BOOK (c-then-2): the week's index first, the week-start one behind it. Two
        // populations on purpose — a bank that vanished mid-week is still the company whose
        // region the money moved in, and that is the whole point of the fallback.
        // §3.13-BOOK (c-then-3b): the tallies are keyed by the bank's ENTITY id.
        const nowById = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities).companyById;
        const wasById = buildEntityIndex(state.companies, state.institutionalEntities ?? []).companyById;
        const regionOfBank = (bankId: EntityId): string | undefined =>
          (nowById.get(bankId) ?? wasById.get(bankId))?.region;
        const mergeMapsForRegion = (x: Map<EntityId, number>, y: Map<EntityId, number>): Map<EntityId, number> => {
          const out = new Map(x); y.forEach((v, k) => out.set(k, (out.get(k) ?? 0) + v)); return out;
        };
        // Whatever still finds no region is NAMED, never absorbed: a tally that cannot be placed
        // is money the identity below cannot see, which is the thing M6 exists to report.
        let unmappedLocal = 0;
        const byRegion = (m: Map<EntityId, number>): Record<string, number> => {
          const out: Record<string, number> = {};
          m.forEach((v, bankId) => {
            const r = regionOfBank(bankId);
            if (r) out[r] = (out[r] ?? 0) + v; else unmappedLocal += v;
          });
          return out;
        };
        const creditCreatedByRegion = byRegion(ctx.lastSettlementReport.creditCreatedByBank);
        const bankOwnAccountByRegion = byRegion(mergeMapsForRegion(ctx.lastSettlementReport.bankEquityDeltaByBank, ctx.lastSettlementReport.bankSecuritiesDeltaByBank));
        return {
          bankTallyUnmappedLocal: unmappedLocal,
          creditCreatedByRegion,
          bankOwnAccountByRegion,
          centralBankIssuanceByRegion: Object.fromEntries(ctx.lastSettlementReport.centralBankIssuanceByRegion.entries()),
          crossBorderByRegion: Object.fromEntries(ctx.lastSettlementReport.crossBorderByRegion.entries()),
        };
      })(),
    },
    // SEG1: payments recorded after this week's settlement cutoff settle next cycle instead of
    // dying with the context (they used to be silently dropped — tender proceeds never landed).
    pendingPaymentJournal: ctx.paymentJournal,
    nextWireId: ctx.wireJournal.base + ctx.wireJournal.n,
    ...(process.env.GOODS_TRACE === '1' ? { lotReceiptsTrace: (ctx.wireJournal as unknown as { lotReceipts?: Record<string, number> }).lotReceipts ?? {} } : {}),
    // §3.13c: the tail that settles next week is the numéraire value of those rows, matching the
    // summary it is netted against — four currencies of dated rows do not add.
    lastWires: summarizeWires(ctx.wireJournal, (() => {
      let numeraire = 0; const byCurrency: Record<string, number> = {};
      for (let i = 0; i < ctx.paymentJournal.n; i++) {
        const cur = currencyOfId(ctx.paymentJournal.currencyId[i]);
        numeraire += toNumeraire(ctx.paymentJournal.amount[i], cur, ctx.fx);
        byCurrency[cur] = (byCurrency[cur] ?? 0) + ctx.paymentJournal.amount[i];
      }
      return { numeraire, byCurrency };
    })(),
      (() => { const m = new Map<string, string>(); for (const c of nextState.companies) m.set(c.ticker, c.region); return (t: string) => m.get(t); })(), reasonText, ctx.fx),
  }, timings, stageTrace: trace };
}
