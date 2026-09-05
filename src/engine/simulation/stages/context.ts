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

import { newWireJournal } from '../../ledger/wire';
import type { EntityId } from '../../../domain/ids';
import { newPaymentJournal, seedPendingNetFromJournal } from './settlement';
import { ensureV2 } from '../../../engine2/world';
import {
  GameState, Company, Region, Position, FxPair, Commodity, CompositeBenchmarkIndices,
  InstitutionalEntity, NewsItem, RegionId,
} from '../../../types';
import { isActiveCompany, isPubliclyListed, CreditRating } from '../../../domain/company';
import { DiagnosticsLog, EarningsReport } from '../../../domain/events';
import type { InstrumentId } from '../../../domain/ids';
import type { Ticker } from '../../../domain/ids';
export type { EarningsReport };

/**
 * The hand-off record for one company, written by the stages that measure a flow and read by the
 * stage that books it. Every field optional: a stage writes only what it measured.
 */
export interface CompanyWeekUpdate {
  /** 02b, repo, short-debt, estates: the bank's sheet as re-derived this week. */
  bankBalanceSheet?: import('../../../domain/banking').BankingSector;
  /** HH5 — the labour market decides headcount and wages before the company's own week runs. */
  employeeCount?: number;
  previousEmployeeCount?: number;
  offeredWageIndex?: number;
  unfilledVacancyShare?: number;
  /** §5-BRAINS — the labour stage's adaptive earnings expectation for this firm. */
  expectedEbitdaLocal?: number;
  /** §7.345 — units sold this week by product line (contracts + auction), the record next
   *  week's production decision reads. */
  salesUnitsBySubUnit?: Record<string, number>;
  /** §7.345 — revenue share of the plant this week's production did not need (produce-to-sales
   *  below capacity), integrated by the capacity-retirement rule like `idleLineRevenueShare`. */
  demandSlackRevenueShare?: number;
  /** IND — what stage 05's auction actually cleared for this firm, both sides. */
  salesLocal?: number;
  purchasesLocal?: number;
  capexPurchasesLocal?: number;
  /** The same two flows in UNITS, which the goods market needs and the P&L does not — the type
   *  found these: a read-side survey of stage 08 missed them because only stage 05 uses them. */
  salesUnits?: number;
  purchasesUnits?: number;
  /** IND11 — the backlog, two-sided: what this firm owes on contract and what it delivered. */
  _contractOwedUnits?: number;
  _contractDeliveredUnits?: number;
  /** IND15 — how much of its input basket the firm actually got, which caps what it can make. */
  inputSupplyConstraintFactor?: number;
  /** §5-DYN — revenue share of the firm's lines that failed this week's §7.139 cost-covering
   *  test (stage 05 is the only place the test runs); stage 08's capacity-retirement rule
   *  integrates it into the mothball/scrap stock response. */
  idleLineRevenueShare?: number;
  /** §5-PROD — units this firm STARTED making this week (experience accrues on making, not on
   *  selling); stage 08 folds it into the Wright's-law learning state. */
  producedUnitsThisWeek?: number;
  /** §3.20d-ii — the same, per line, so a line's own idleness can be read. */
  producedUnitsBySubUnit?: Record<string, number>;
  /** §5-PROD — the plant's structural weekly rate (capacity, unthrottled): the learning seed's
   *  anchor basis, so a throttled first week cannot under-seed the curve (§7.301). */
  plantCapacityUnitsThisWeek?: number;
  /** IND12 — trade credit, both legs, booked and settled. */
  tradeReceivableBookedLocal?: number;
  tradeReceivableCollectedLocal?: number;
  tradePayableBookedLocal?: number;
  tradePayableSettledLocal?: number;
  /** IND10/IND13 — the stocks stage 05 moved: warehouse, input lots, the production pipeline and
   *  capital delivered but not yet commissioned. */
  outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueLocal: number }>;
  wipBySubUnit?: Record<string, { units: number; valueLocal: number }[]>;
  capexUnderConstruction?: { valueLocal: number; entersServiceWeek: number }[];
  /** The production target stage 05 set, carried so stage 08 books against the same number. The
   *  underscore is the original author's marker that it is a hand-off and not a company field. */
  _targetProductionLocal?: number;
}

/** WS8 — what a book did with an offering this week; ONE type (it was spelled in three files). */
export interface PrimarySettlement {
  offering: import('../../../domain/primary-market').PrimaryOffering;
  clearedStat: number;
  /** §3.13: the terms the book STRUCK the paper on, for the stage that issues it. */
  struckTerms?: { couponRate: number; maturityWeek: number };
  withdrawn: boolean;
  marketTakeLocal: number;
  issuedLocal: number;
  proceedsLocal: number;
  /** §3.16-ii: the instrument the book LISTED the deal as — the bond it tapped, or the fresh tranche's id. */
  listedInstrumentId?: import('../../../domain/ids').InstrumentId;
}

export interface WeeklyStepContext {
  /** §7.307 flips — the persistent columnar world, one access point for every stage. */
  v2: import('../../../engine2/world').V2World;
  // Time bookkeeping
  nextWeek: number;
  currentWeekMod13: number;

  // Cross-stage accumulators
  /**
   * §7.235 — WHAT ONE STAGE HANDS THE NEXT ABOUT A COMPANY, TYPED.
   *
   * This was `Record<string, any>`, and it was the single largest hole `noImplicitAny` could not
   * close: five of that flag's errors were element types erased by reading through it, and every
   * `?.` on it returned `any`, so a typo in a field name was a silent `undefined` rather than a
   * compile error. Stage 08 reads seventeen fields off it; nothing anywhere said which seventeen.
   *
   * It is deliberately NOT `Partial<Company>`. Most of these are not Company fields at all — they
   * are the WEEK'S FLOWS (what this firm bought, sold, booked and settled) that stage 05 measures
   * and stage 08 consumes, plus two the labour market writes ahead of the company's own week. A
   * carrier for inter-stage hand-off is its own thing and now says so.
   */
  companyUpdates: Record<string, CompanyWeekUpdate>;
  /** §7.250 — set by core.ts the moment stage 08 has consumed the bank-sheet channel. Four
   *  post-08 stages wrote it for nothing (only stage 08 applies it; the context dies with the
   *  week) — bills never accreted, write-offs never landed, silently, both legs together. A
   *  write after consumption throws now; a post-08 stage writes the LIVE sheet. */
  bankSheetChannelClosed?: boolean;
  /** PUB1b: corporate tax remitted this week, by region — collected into the TGA in stage 11. */
  /** §5-CLOSE F2: employer payroll tax remitted this week by every employer (firms in 08, pools in
   *  03), as payments to the treasury — what stage 11 reports as payroll revenue. */
  payrollTaxByRegion: Record<string, number>;
  /** PUB1b: corporate tax ACCRUED this week — the smooth expectation behind the lumpy remittance. */
  taxAccruedByRegion: Record<string, number>;
  prevActiveFirms: Company[];
  /** Active PRIVATE companies (HC Wave 1) — consumed only by stages that have explicitly taken
   * the handover; see the note on prevActiveFirms below. */
  prevActivePrivateFirms: Company[];
  recentIPOs: { ticker: Ticker; name: string; category: string; week: number }[];
  recentMergers: { acquirerTicker: Ticker; acquirerName: string; targetTicker: Ticker; targetName: string; week: number; dealValueLocal: number }[];
  diagnosticLogs: DiagnosticsLog[];
  newsItems: NewsItem[];
  rateChanges: { region: RegionId; deltaBps: number }[];
  ratingChanges: { ticker: Ticker; from: CreditRating; to: CreditRating; name: string }[];
  /** What each firm reported this week — written by stage 08's kernel, read by the news stage. */
  earningsReportedThisTurn: EarningsReport[];
  defaultedTickers: Ticker[];
  /** §3.17e-ii-a — the relative-value books' legs for the week, stated before any book opens;
   *  the market that clears each leg reads it here (`stages/relative-value.ts`). */
  relativeValueLegs: (import('../../../domain/relative-value').RelativeValueLeg & { entityId: import('../../../domain/ids').EntityId })[];
  /** §3.17e-iii-a — what the books need to borrow to be short a cash instrument this week; the
   *  lending book reads it as borrow demand. */
  borrowNeeds: import('../../../domain/relative-value').BorrowNeed[];
  /** GUARD — books whose demand side could not grow at any price this week: no participant's
   * holding ceiling exceeded what it already held. A market that cannot trade is a defect, not
   * a quiet pass (§7.102's shape). Asserted empty by the harness. */
  deadCeilingBooks: string[];
  /** CASH/SETL1 — the week's payment instructions. Stages record; the settlement stage executes
   * (see stages/settlement.ts). A stage must not move money any other way. */
  /** SCALE phase 2: the register as typed-array columns, invalidated with the index above. */
  holdingsTable?: import('../../columns/holdings-table').HoldingsTable;
  /** SCALE: the week's payments as four parallel columns (stages/settlement.ts). */
  paymentJournal: import('./settlement').PaymentJournal;
  /** §5-WIRES — the week's wire journal: every asset move, numbered. Installed as the active
   *  journal by core.ts before the first stage; read back into the state at the end. */
  wireJournal: import('../../ledger/wire').WireJournal;
  /** SETL6 — the running net of those instructions per party: what each has committed to pay or
   * is due to receive before the settlement pass runs. Read through
   * `pendingSettlementLocal` (stages/settlement.ts); maintained by `pay`. */
  /** SCALE: the week's running net, dense by party id (stages/settlement.ts). Was a
   *  `Map<string, number>` keyed by a string rebuilt on every one of ~580,000 lookups a week. */
  pendingNetById: number[];
  pendingTouchedIds: number[];
  /** What the last settlement run did — read by the invariants harness and the diagnostics. */
  lastSettlementReport?: import('./settlement').SettlementReport;
  /** LAST week's flows, complete across all three settlement cycles. `lastSettlementReport` is
   *  rebuilt from scratch every week and merged pass by pass, so a stage that runs before the
   *  close sees only the intraday pass; anything settled in the close or the funding cycle is
   *  simply missing from it. A stage that wants a whole week reads this. */
  priorWeekFlows: {
    smePoolFlowsByPool: Map<string, Map<string, number>>;
    householdFlowsByRegion: Map<string, Map<string, number>>;
  };
  /**
   * SCALE C1 — the week's holdings, swept once and shared by the five clearing books; present
   * only between the store's build (before 07b) and its write-back (after 07e).
   *
   * §3.13-READ C2 — AND THE STALENESS OUTLASTS THE HANDLE. This note used to say the entity
   * `itemizedHoldings` arrays are stale week-start snapshots "while it is set", which is where
   * two stages went wrong by reading them after the write-back. `finalizeHoldingsStore` drops the
   * handle; it does NOT refresh the arrays. The only site that does is `core.ts:459`, at the very
   * END of the week. So the arrays are the week's OPENING positions from the store's build until
   * the week closes, whether or not this field is set — every stage from `holdings-store` (269)
   * onwards must read positions through the ROWS.
   */
  /** DRV — THE ONE DERIVATIVE BOOK, the week's working copy: §3.13-BOOK d4c-i, the store is
   * `v2.obligations` and this is it materialized once on first touch (`contract-ledger.ts` owns
   * every read and write; market stages strike into it through the ledger). */
  derivativesBook?: import('../../../domain/derivatives/contract').DerivativeContract[];
  /** The standing index of that book (derivative-lifecycle.ts `standingBookOf`), valid while
   * `book` is the live array — the lifecycle replaces the array when a contract leaves. */
  derivativeStanding?: {
    book: import('../../../domain/derivatives/contract').DerivativeContract[];
    index: import('../../../domain/derivatives/standing-book').StandingBook;
  };
  holdingsStore?: import('./holdings-store').HoldingsStore;
  /** HF — what the securities-lending stage struck this week, read by 07e in the same pass.
   * `lentShares` is exposure a lender still has through a loan receivable, so its holding
   * ceiling in the equity book comes down by it rather than sending it out to re-buy what it
   * just lent. `buyInShares` is a recalled borrower's delivery obligation: a purchase with no
   * reservation price, which is what a squeeze is made of. Both keyed
   * `entityId + '|' + companyId`. */
  lentSharesByLender: Map<string, number>;
  buyInSharesByBorrower: Map<string, number>;
  /** WS8 — this week's working copy of the offering queue: adapters consume entries they
   * price (recording outcomes below), stage 08 appends new enqueues, core writes the
   * survivors back to state. */
  primaryOfferingsWorking: import('../../../domain/primary-market').PrimaryOffering[];
  /** WS8 — per-offering pricing outcomes for stage 08 to settle onto the issuers. */
  /** G2: credit demand the banks DECLINED this week for want of capital — a real credit
   * crunch, measurable rather than an index. Read by the diagnostics and (post-MS) by the
   * demand side that lost the funding. */
  g2DeclinedOriginationLocal: Record<import('../../../types').RegionId, number>;
  /** `issuedLocal` is the paper that came into EXISTENCE — the whole deal under firm commitment,
   *  whatever the book took — while `marketTakeLocal` is only the part the book bought. They differ
   *  by the residual the lead is left holding, and creating the tranche at the take instead of at
   *  the issue is how the lead came to hold paper that did not exist (a ledger minting claims). */
  primarySettlements: Map<string, PrimarySettlement>;

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
  /** §5-FINALIZATION 13b — a tranche REPLACED this week (an accretive call's replacement issue):
   *  `kind:oldTrancheId` → the new tranche id. The paying agent re-keys the retired rows onto the
   *  new paper through the house, with no principal cash (the issuer's call and its replacement
   *  proceeds net on its own walk, as the issuer-level ratio of one always implied). */
  /** §3.13-BOOK slice (a): keyed `TYPE:oldInstrumentId` (a composite, so a plain string); the
   *  VALUE is the replacement's instrument id, and is branded. */
  pendingHolderReplacements: Map<string, InstrumentId>;
  /**
   * Cash an issuer owes its holders this week for a corporate action, keyed the same way as
   * `pendingHolderSettlements` — today the CALL PREMIUM paid to retire paper early. Settled pro
   * rata to holders of record in the same single pass, so the money the issuer's ledger posts
   * out arrives on somebody's book instead of vanishing.
   */
  pendingHolderCashLocal: Map<string, number>;
  /**
   * HH1 — index-fund shares households bought this week, by fund, handed from `etf-flows.ts` (the
   * flow) to `household-balance-sheet.ts` (the books).
   */
  /** §7.248: the executed household flow AND the NAV per share it transacted at — the register
   *  settles shares at the SAME price the cash leg paid (one transaction, one price; the fund's
   *  book is mid-flight when the register stage reads it, so re-deriving there divided by an
   *  empty week-one book). */
  householdEtfPurchasesLocal: Map<string, { spentLocal: number; navPerShare: number }>;
  /** ETF slice 1 — this week's published indexes (`stages/index-calculation.ts`). */
  updatedMarketIndexes: import('../../../domain/indexes').MarketIndex[];
  updatedCommodities: Commodity[];
  updatedCompositeIndices: CompositeBenchmarkIndices;
  marketVolPremium: number;
  workingPositions: Position[];

  // Stage 01 (macro-feedback) outputs, read by stage 02
  regionTrackedHealthSignal: Record<RegionId, number>;
  regionPublicCompanyEmployment: Record<RegionId, number>;
  recentDefaultsCount: number;
  creditContagionBps: number;
  systemicStressFactorGlobal: number;

  // Stage 05/06 boundary outputs, read by stage 08/12
  marketVolComponent: number;
  /** §3.13c — THE WEEK'S RATES: what one unit of each money is worth in the numéraire, as the
   *  LAST auction cleared it. The world's own table (`v2.fx`), not a copy, so a stage, an audit
   *  and the UI cannot read one balance three ways — and it does not move inside a week, because
   *  this week's auction writes `v2.fxNext` and the next week's open promotes it. Measured when
   *  it did move mid-week: settlement valued the week's gross at one rate and the wire summary
   *  the same wires at another (a 0.04B hole), and a resolution valued a failed bank's book at
   *  the post-auction rate while paying it away at the pre-auction one (134.8M reported as money
   *  left on the shell). Both were revaluations wearing a leak's clothes. */
  fx: import('../../../domain/currency').FxTable;
  getFxToUsd: (regionId: RegionId) => number;
  /** WS9/XB2d: each currency's cleared value in USD. Every pair is derived from two of these,
   * so no set of pair moves can violate triangular arbitrage. */
  currencyValueLocal?: Record<string, number>;
  /**
   * XB3a — who bought from whom this week, in USD: `[exporter][importer]`. Set by stage 05 from
   * the world book's own fills (a lot whose two sides sit in different regions IS an export) and
   * published as each region's trade position by stage 06. WEEKLY, unlike the annualised
   * `Region.exportsLocal` it feeds — rule 8.
   */
  bilateralTradeWeeklyLocal: Record<RegionId, Record<RegionId, number>>;
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
  /** IND16 — what each distribution firm earned this week running the channel: the margin
   * households paid inside the shelf price of every physical good they bought. Booked as real
   * revenue in stage 08, exactly as the carriers' freight is. */
  channelMarginRevenue: Record<string, number>;
  /** IND16 — who runs the channel in each region, and each firm's share of it, by the size of its
   * own distribution line. Built once a week; the settlement legs read it per lot. */
  /** §3.13-BOOK slice (c2c): region → DISTRIBUTOR TICKER → its share of that channel. */
  /** §3.13-BOOK (c-then-3b): the distributors that warehouse a region's stock, by ENTITY id. */
  channelShareByRegion: Record<string, Map<EntityId, number>>;
  carrierTonneNm: Record<string, number>;
  /** XB3a-4 — units that completed transit this week. */
  goodsArrivedUnits: number;
  /** XB3a-4 — consignments dispatched this week, appended to what is already in transit. */
  shipmentsDispatched: import('./goods-arrival').InTransitShipment[];
  /** XB3a-5 — invoices struck this week, and the realised exposure on those that came due. */
  tradeInvoicesBooked: import('../../../domain/trade-invoice').TradeInvoice[];
  /** G5 — the open workouts. A defaulted issuer's assets and the claims on them, carried across
   *  weeks until the assets are gone and the residual is written off. */
  estates: import('../../../domain/estate').Estate[];
  /** CAL — this week's interest accruals to distribute over the register, by instrument. */
  /** CASH — balances that are NEGATIVE and clamped to zero by the deposit reconciliation: a
   *  holder spending money it does not have, which the plug then hides. Not unrouted flow. */
  cashOverdraftLocal: number;
  /** §3.15b-iii — the overdraft runs as of this week's sweep (`banking.ts:rollOverdraftStreaks`);
   *  opened from the state's, replaced by the sweep, read by the news, written back by core. */
  overdraftStreaks: Record<string, import('../../../domain/banking').OverdraftStreak>;
  pendingHolderAccrualLocal: Map<string, number>;
  /** CAL — the instruments whose coupon falls due this week: their accrued balances become cash. */
  pendingHolderAccrualPayout: Set<string>;
  /** What each institution means to park at the reverse repo window this week, decided in the
   *  money-market session and drawn at the CLOSE — the window is an end-of-day facility, so the
   *  cash is in the institution's hands while its books trade. */
  rrpIntendedByEntity: Map<string, number>;
  /** The window's posted rate per region, carried from the session that set the corridor to the
   *  close that draws on it. */
  rrpRateAnnualByRegion: Map<string, number>;
  /** §7.321 barrier mode: suppress emission-time running-net application (merge applies it). */
  deferPendingNet?: boolean;
  // §3.13-BOOK f4a: what each holder has EARNED and not been paid is `holdings.ts:accruedLocal`,
  // a column of the register row it accrues on; not a ledger beside it.
  /** §3.13-BOOK f4a — the interest a clearing book moved with each participant's fills, waiting
   *  for the write-back to make the rows it lands on (`finalizeHoldingsStore`). */
  pendingAccruedMoves: { bookId: string; instrumentType: string; instrumentId: string; usd: number }[];
  tradeInvoiceFxGainLocal: number;
  tradeInvoiceWriteOffLocal: number;
  /** XB3a-2 — what the freight market cleared, read by stage 08 for the carriers' P&L. */
  freightClearing?: import('./freight-clearing').FreightClearing;
  /** §3.13-SOV row 5 / §3.25 — what the week's sovereign sessions actually cleared, per region:
   *  one (tenor, yield) point per bond and bill that traded, deposited by 07c and 07f and read by
   *  `sovereign-curve.ts`, which is the ONE owner that fits the curve and publishes its points. */
  sovereignCurvePoints: Map<RegionId, { tenorYears: number; yield: number }[]>;

  // Stage 11 output, read by stage 13
  weeklyInterestIncomeLocal: number;
  weeklyFinancingCostLocal: number;
  weeklyRealizedCashLocal: number;
  weeklyRealizedPnL: number;
  totalRequiredMarginLocal: number;
  maintenanceMarginLocal: number;
  netDeltaLocal: number;
  netDV01Local: number;
  attributionCarry: number;
  attributionMacroRates: number;
  attributionCreditSpread: number;
  attributionEquityDelta: number;
  attributionVolTheta: number;
  updatedPositions: Position[];
}

/** A persisted `{key: {reason: usd}}` block back as the nested maps the stages read. */
function nestedFlows(src: Record<string, Record<string, number>> | undefined): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  Object.entries(src ?? {}).forEach(([k, byReason]) => out.set(k, new Map(Object.entries(byReason))));
  return out;
}

export function createInitialContext(state: GameState): WeeklyStepContext {
  const nextWeek = state.currentWeek + 1;
  const ctx = buildContext(state, nextWeek);
  // A DATED ROW JOINS THE RUNNING NET IN ITS OWN WEEK. Carried instructions sit in the journal
  // from the week they were recorded, but the net that every budget reads is cleared at the end
  // of each settlement pass and nothing ever added them back — so an obligation dated for this
  // week (corporate tax, above all) was invisible to every sizer on the very week it is paid.
  seedPendingNetFromJournal(ctx, nextWeek);
  return ctx;
}

function buildContext(state: GameState, nextWeek: number): WeeklyStepContext {
  return {
    v2: ensureV2(state),
    nextWeek,
    currentWeekMod13: ((nextWeek - 1) % 13) + 1,

    companyUpdates: {},
    payrollTaxByRegion: {},
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
    relativeValueLegs: [],
    borrowNeeds: [],
    lentSharesByLender: new Map(),
    buyInSharesByBorrower: new Map(),
    deadCeilingBooks: [],
    // SEG1: last week's after-cutoff payments (recorded by stages that run after the
    // settlement stage) roll into this cycle — a real system's next-day settlement.
    paymentJournal: (state as { pendingPaymentJournal?: import('./settlement').PaymentJournal })
      .pendingPaymentJournal ?? newPaymentJournal(),
    pendingNetById: [],
    priorWeekFlows: {
      smePoolFlowsByPool: nestedFlows(state.lastSettlement?.smePoolFlowsByPool),
      householdFlowsByRegion: nestedFlows(state.lastSettlement?.householdFlowsByRegion),
    },
    wireJournal: newWireJournal((state as { nextWireId?: number }).nextWireId ?? 1, state.currentWeek + 1),
    pendingTouchedIds: [],
    g2DeclinedOriginationLocal: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    primaryOfferingsWorking: [...(state.primaryOfferings ?? [])],
    primarySettlements: new Map(),

    updatedRegions: { ...state.regions },
    updatedFxPairs: [...state.fxPairs],
    updatedCompanies: [...state.companies],
    updatedInstitutionalEntities: [...state.institutionalEntities],
    pendingHolderSettlements: new Map<string, number>(),
    pendingHolderReplacements: new Map<string, InstrumentId>(),
    pendingHolderCashLocal: new Map<string, number>(),
    householdEtfPurchasesLocal: new Map<string, { spentLocal: number; navPerShare: number }>(),
    updatedMarketIndexes: [...(state.marketIndexes ?? [])],
    updatedCommodities: [...state.commodities],
    updatedCompositeIndices: { ...state.compositeIndices },
    marketVolPremium: state.marketVolPremium || 0,
    workingPositions: [...state.portfolio.positions],

    regionTrackedHealthSignal: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    regionPublicCompanyEmployment: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    recentDefaultsCount: 0,
    creditContagionBps: 0,
    systemicStressFactorGlobal: 0,

    marketVolComponent: 0,
    fx: ensureV2(state).fx,
    getFxToUsd: () => 1.0,
    currencyValueLocal: undefined,
    bilateralTradeWeeklyLocal: {
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
    channelMarginRevenue: {},
    channelShareByRegion: {},
    carrierTonneNm: {},
    goodsArrivedUnits: 0,
    shipmentsDispatched: [],
    tradeInvoicesBooked: [],
    estates: state.estates,
    cashOverdraftLocal: 0,
    overdraftStreaks: state.overdraftStreaks ?? {},
    pendingHolderAccrualLocal: new Map(),
    pendingHolderAccrualPayout: new Set(),
    rrpIntendedByEntity: new Map(),
    rrpRateAnnualByRegion: new Map(),
    pendingAccruedMoves: [],
    tradeInvoiceFxGainLocal: 0,
    tradeInvoiceWriteOffLocal: 0,
    sovereignCurvePoints: new Map(),

    weeklyInterestIncomeLocal: 0,
    weeklyFinancingCostLocal: 0,
    weeklyRealizedCashLocal: 0,
    weeklyRealizedPnL: 0,
    totalRequiredMarginLocal: 0,
    maintenanceMarginLocal: 0,
    netDeltaLocal: 0,
    netDV01Local: 0,
    attributionCarry: 0,
    attributionMacroRates: 0,
    attributionCreditSpread: 0,
    attributionEquityDelta: 0,
    attributionVolTheta: 0,
    updatedPositions: [],
  };
}

/**
 * §7.250 — THE ONE WRITE PATH INTO THE PRE-08 BANK-SHEET CHANNEL. Before stage 08 it is the
 * hand-off every clearing stage chains through; after stage 08 has consumed it, a write here is
 * a write to NOWHERE and throws instead of failing silently. (The doctrine, completed from
 * §7.103: before 08 the channel is the ONLY sheet write that survives; after 08 it is the only
 * one that cannot.)
 */
export function updateBankSheet(
  ctx: WeeklyStepContext,
  ticker: Ticker,
  sheet: import('../../../domain/banking').BankingSector
): void {
  if (ctx.bankSheetChannelClosed) {
    throw new Error(
      `ENGINE DEFECT: bank-sheet channel write for ${ticker} after stage 08 consumed it — write the live sheet (§7.250)`
    );
  }
  if (!ctx.companyUpdates[ticker]) ctx.companyUpdates[ticker] = {};
  ctx.companyUpdates[ticker].bankBalanceSheet = sheet;
}
