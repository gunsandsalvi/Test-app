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
  /** PUB1b: corporate tax remitted this week, by region — collected into the TGA in stage 11. */
  taxCollectedByRegion: Record<string, number>;
  /** PUB1b: corporate tax ACCRUED this week — the smooth expectation behind the lumpy remittance. */
  taxAccruedByRegion: Record<string, number>;
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
  /**
   * HH1 — index-fund shares households bought this week, by fund, handed from `etf-flows.ts` (the
   * flow) to `household-balance-sheet.ts` (the books).
   */
  householdEtfPurchasesUSD: Map<string, number>;
  /** ETF slice 1 — this week's published indexes (`stages/index-calculation.ts`). */
  updatedMarketIndexes: import('../../../domain/indexes').MarketIndex[];
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
  /** WS9/XB2d: each currency's cleared value in USD. Every pair is derived from two of these,
   * so no set of pair moves can violate triangular arbitrage. */
  currencyValueUSD?: Record<string, number>;
  /**
   * XB3a — who bought from whom this week, in USD: `[exporter][importer]`. Set by stage 05 from
   * the world book's own fills (a lot whose two sides sit in different regions IS an export) and
   * published as each region's trade position by stage 06. WEEKLY, unlike the annualised
   * `Region.exportsUSD` it feeds — rule 9.
   */
  bilateralTradeWeeklyUSD: Record<RegionId, Record<RegionId, number>>;
  /** XB3a-3 — where each region intends to source each good this week, set by the sourcing-intent
   *  stage and read by the goods auction. key: `${buyerRegion}|${subUnitId}`. */
  sourcingSplitByRegionSubUnit: Map<string, import('./sourcing-intent').SourcingSplit>;
  /** XB3a-2 — this week's cleared freight per tonne by lane, each in that lane's own money. */
  freightRatePerTonneLaneMoneyByLane: Record<string, number>;
  /** XB3a-3 — tonnage the goods auction actually put on each lane, which is what carriers are
   *  paid for. Booked capacity that went unused earns nothing, as on a real spot market. */
  shippedTonnesByLane: Record<string, number>;
  /** XB3a-3 — this week's forward freight bookings, from the sourcing intent. */
  laneBookings: import('./sourcing-intent').LaneBooking[];
  /** XB3a-2 — what each carrier earned and carried this week, in its OWN money, from real
   *  shipments. Read by stage 08 to build the carriers' P&L. */
  carrierFreightRevenue: Record<string, number>;
  carrierTonneNm: Record<string, number>;
  /** XB3a-4 — units that completed transit this week. */
  goodsArrivedUnits: number;
  /** XB3a-4 — consignments dispatched this week, appended to what is already in transit. */
  shipmentsDispatched: import('./goods-arrival').InTransitShipment[];
  /** XB3a-5 — invoices struck this week, and the realised exposure on those that came due. */
  tradeInvoicesBooked: import('../../../domain/trade-invoice').TradeInvoice[];
  tradeInvoiceFxGainUSD: number;
  tradeInvoiceWriteOffUSD: number;
  /** XB3a-2 — what the freight market cleared, read by stage 08 for the carriers' P&L. */
  freightClearing?: import('./freight-clearing').FreightClearing;

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
    taxCollectedByRegion: {},
    taxAccruedByRegion: {},
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
    householdEtfPurchasesUSD: new Map<string, number>(),
    updatedMarketIndexes: [...(state.marketIndexes ?? [])],
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
    currencyValueUSD: undefined,
    bilateralTradeWeeklyUSD: {
      USA: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
      EUR: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
      UK: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
      JPN: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    },
    sourcingSplitByRegionSubUnit: new Map(),
    freightRatePerTonneLaneMoneyByLane: {},
    shippedTonnesByLane: {},
    laneBookings: [],
    carrierFreightRevenue: {},
    carrierTonneNm: {},
    goodsArrivedUnits: 0,
    shipmentsDispatched: [],
    tradeInvoicesBooked: [],
    tradeInvoiceFxGainUSD: 0,
    tradeInvoiceWriteOffUSD: 0,

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
