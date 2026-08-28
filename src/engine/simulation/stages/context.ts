/**
 * Shared Weekly-Step Context
 *
 * advanceWeeklyStep (core.ts) is split into thirteen ordered stage functions, each named
 * for the concern it owns (macro feedback, region evolution, demand, bidding, FX, company
 * fundamentals, IPO/M&A, portfolio marking, etc). All thirteen read and write a single
 * shared, mutable WeeklyStepContext instead of closing over a 2,900-line function's local
 * variables — this is the explicit, typed equivalent of what the closure captured
 * implicitly before the split, so every cross-stage dependency is visible at a glance
 * instead of being an accident of variable scope.
 */

import {
  GameState, Company, Region, Position, FxPair, Commodity, CompositeBenchmarkIndices,
  InstitutionalEntity, NewsItem, RegionId,
} from '../../../types';
import { isActiveCompany, isPubliclyListed, CreditRating } from '../../../domain/company';

export interface WeeklyStepContext {
  // Time bookkeeping
  nextWeek: number;
  currentWeekMod13: number;

  // Cross-stage accumulators
  companyUpdates: Record<string, any>;
  prevActiveFirms: Company[];
  /** Active PRIVATE companies (HC Wave 1) — consumed only by stages that have explicitly taken
   * the handover; see the note on prevActiveFirms below. */
  prevActivePrivateFirms: Company[];
  recentIPOs: { ticker: string; name: string; category: string; week: number }[];
  recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[];
  diagnosticLogs: any[];
  newsItems: NewsItem[];
  rateChanges: { region: RegionId; deltaBps: number }[];
  ratingChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[];
  earningsReportedThisTurn: any[];
  defaultedTickers: string[];
  /** §6 damper diagnostic: instrument ids whose print was held away from its solve this week,
   * accumulated across every clearing stage; lands on GameState.lastWeekDamperBoundIds so the
   * invariants harness can alert on PERSISTENT binding (a print that is the damper, not the
   * market). */
  damperBoundInstrumentIds: string[];
  /** WS8 — this week's working copy of the offering queue: adapters consume entries they
   * price (recording outcomes below), stage 08 appends new enqueues, core writes the
   * survivors back to state. */
  primaryOfferingsWorking: import('../../../domain/primary-market').PrimaryOffering[];
  /** WS8 — per-offering pricing outcomes for stage 08 to settle onto the issuers. */
  /** G2: credit demand the banks DECLINED this week for want of capital — a real credit
   * crunch, measurable rather than an index. Read by the diagnostics and (post-MS) by the
   * demand side that lost the funding. */
  g2DeclinedOriginationUSD: Record<import('../../../types').RegionId, number>;
  primarySettlements: Map<string, { offering: import('../../../domain/primary-market').PrimaryOffering; clearedStat: number; withdrawn: boolean; marketTakeUSD: number; proceedsUSD: number }>;

  // Main working state, threaded and reassigned stage to stage
  updatedRegions: Record<RegionId, Region>;
  updatedFxPairs: FxPair[];
  updatedCompanies: Company[];
  updatedInstitutionalEntities: InstitutionalEntity[];
  /**
   * Corporate actions (defaults, refinancings, amortization) recorded during stage 08, as a
   * per-instrument scaling ratio, settled onto the real books in one pass at the end of the
   * stage — see applyPendingCorporateActionSettlements.
   */
  pendingHolderSettlements: Map<string, number>;
  /**
   * Cash an issuer owes its holders this week for a corporate action, keyed the same way as
   * `pendingHolderSettlements` — today the CALL PREMIUM paid to retire paper early. Settled pro
   * rata to holders of record in the same single pass, so the money the issuer's ledger posts
   * out arrives on somebody's book instead of vanishing.
   */
  pendingHolderCashUSD: Map<string, number>;
  updatedCommodities: Commodity[];
  updatedCompositeIndices: CompositeBenchmarkIndices;
  marketVolPremium: number;
  workingPositions: Position[];

  // Stage 01 (macro-feedback) outputs, read by stage 02
  regionFloatingPrincipal: Record<RegionId, number>;
  regionTrackedHealthSignal: Record<RegionId, number>;
  regionPublicCompanyEmployment: Record<RegionId, number>;
  avgMargin: number;
  marginCompression: number;
  recentDefaultsCount: number;
  creditContagionBps: number;
  systemicStressFactorGlobal: number;

  // Stage 05/06 boundary outputs, read by stage 08/12
  marketVolComponent: number;
  getFxToUsd: (regionId: RegionId) => number;
  regionCategoryExports: Record<RegionId, Record<string, number>>;

  // Stage 11 output, read by stage 13
  weeklyInterestIncomeUSD: number;
  weeklyFinancingCostUSD: number;
  weeklyRealizedCashUSD: number;
  weeklyRealizedPnL: number;
  totalRequiredMarginUSD: number;
  maintenanceMarginUSD: number;
  netDeltaUSD: number;
  netGammaUSD: number;
  netVegaUSD: number;
  netDV01USD: number;
  attributionCarry: number;
  attributionMacroRates: number;
  attributionCreditSpread: number;
  attributionEquityDelta: number;
  attributionVolTheta: number;
  updatedPositions: Position[];
}

export function createInitialContext(state: GameState): WeeklyStepContext {
  const nextWeek = state.currentWeek + 1;
  return {
    nextWeek,
    currentWeekMod13: ((nextWeek - 1) % 13) + 1,

    companyUpdates: {},
    // The containment gate for the private tier (HC Wave 1): every existing stage consumes
    // prevActiveFirms and therefore sees only the public universe it was built against. Private
    // firms opt IN per handover wave — debt markets in HC2, goods/labor in HC3 — so nothing
    // changes silently.
    prevActiveFirms: state.companies.filter((c) => isActiveCompany(c) && isPubliclyListed(c)),
    prevActivePrivateFirms: state.companies.filter((c) => isActiveCompany(c) && !isPubliclyListed(c)),
    recentIPOs: [],
    recentMergers: [],
    diagnosticLogs: [],
    newsItems: [],
    rateChanges: [],
    ratingChanges: [],
    earningsReportedThisTurn: [],
    defaultedTickers: [],
    damperBoundInstrumentIds: [],
    g2DeclinedOriginationUSD: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    primaryOfferingsWorking: [...(state.primaryOfferings ?? [])],
    primarySettlements: new Map(),

    updatedRegions: { ...state.regions },
    updatedFxPairs: [...state.fxPairs],
    updatedCompanies: [...state.companies],
    updatedInstitutionalEntities: [...state.institutionalEntities],
    pendingHolderSettlements: new Map<string, number>(),
    pendingHolderCashUSD: new Map<string, number>(),
    updatedCommodities: [...state.commodities],
    updatedCompositeIndices: { ...state.compositeIndices },
    marketVolPremium: state.marketVolPremium || 0,
    workingPositions: [...state.portfolio.positions],

    regionFloatingPrincipal: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    regionTrackedHealthSignal: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    regionPublicCompanyEmployment: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    avgMargin: 0,
    marginCompression: 0,
    recentDefaultsCount: 0,
    creditContagionBps: 0,
    systemicStressFactorGlobal: 0,

    marketVolComponent: 0,
    getFxToUsd: () => 1.0,
    regionCategoryExports: { USA: {}, EUR: {}, UK: {}, JPN: {} },

    weeklyInterestIncomeUSD: 0,
    weeklyFinancingCostUSD: 0,
    weeklyRealizedCashUSD: 0,
    weeklyRealizedPnL: 0,
    totalRequiredMarginUSD: 0,
    maintenanceMarginUSD: 0,
    netDeltaUSD: 0,
    netGammaUSD: 0,
    netVegaUSD: 0,
    netDV01USD: 0,
    attributionCarry: 0,
    attributionMacroRates: 0,
    attributionCreditSpread: 0,
    attributionEquityDelta: 0,
    attributionVolTheta: 0,
    updatedPositions: [],
  };
}
