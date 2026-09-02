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
import { newPaymentJournal } from './settlement';
import { ensureV2 } from '../../../engine2/world';
import {
  GameState, Company, Region, Position, FxPair, Commodity, CompositeBenchmarkIndices,
  InstitutionalEntity, NewsItem, RegionId,
} from '../../../types';
import { isActiveCompany, isPubliclyListed, CreditRating } from '../../../domain/company';

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
  expectedEbitdaUSD?: number;
  /** §7.345 — units sold this week by product line (contracts + auction), the record next
   *  week's production decision reads. */
  salesUnitsBySubUnit?: Record<string, number>;
  /** §7.345 — revenue share of the plant this week's production did not need (produce-to-sales
   *  below capacity), integrated by the capacity-retirement rule like `idleLineRevenueShare`. */
  demandSlackRevenueShare?: number;
  /** IND — what stage 05's auction actually cleared for this firm, both sides. */
  salesUSD?: number;
  purchasesUSD?: number;
  capexPurchasesUSD?: number;
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
  /** §5-PROD — the plant's structural weekly rate (capacity, unthrottled): the learning seed's
   *  anchor basis, so a throttled first week cannot under-seed the curve (§7.301). */
  plantCapacityUnitsThisWeek?: number;
  /** IND12 — trade credit, both legs, booked and settled. */
  tradeReceivableBookedUSD?: number;
  tradeReceivableCollectedUSD?: number;
  tradePayableBookedUSD?: number;
  tradePayableSettledUSD?: number;
  /** IND10/IND13 — the stocks stage 05 moved: warehouse, input lots, the production pipeline and
   *  capital delivered but not yet commissioned. */
  outputInventoryBySubUnit?: Record<string, { unitsHeld: number; valueUSD: number }>;
  wipBySubUnit?: Record<string, { units: number; valueUSD: number }[]>;
  capexUnderConstruction?: { valueUSD: number; entersServiceWeek: number }[];
  /** WS7 — the treasury sweep's resulting holdings. */
  treasuryHoldings?: import('../../../types').ItemizedHolding[];
  /** The production target stage 05 set, carried so stage 08 books against the same number. The
   *  underscore is the original author's marker that it is a hand-off and not a company field. */
  _targetProductionUSD?: number;
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
  /** GUARD — books whose demand side could not grow at any price this week: no participant's
   * holding ceiling exceeded what it already held. A market that cannot trade is a defect, not
   * a quiet pass (§7.102's shape). Asserted empty by the harness. */
  deadCeilingBooks: string[];
  /** SETL3/4 — issuer id → ticker, so the register's payments name a real payer. */
  issuerTickerById: Map<string, string>;
  /** CASH/SETL1 — the week's payment instructions. Stages record; the settlement stage executes
   * (see stages/settlement.ts). A stage must not move money any other way. */
  /** SCALE: the register's CSR index, cached across stages and dropped by `bumpRegister`
   *  whenever a stage changes WHICH ROWS EXIST (stages/register-index.ts). */
  registerIndex?: import('./register-index').RegisterIndex;
  /** SCALE phase 2: the register as typed-array columns, invalidated with the index above. */
  holdingsTable?: import('../../columns/holdings-table').HoldingsTable;
  /** SCALE: the week's payments as four parallel columns (stages/settlement.ts). */
  paymentJournal: import('./settlement').PaymentJournal;
  /** §5-WIRES — the week's wire journal: every asset move, numbered. Installed as the active
   *  journal by core.ts before the first stage; read back into the state at the end. */
  wireJournal: import('../../ledger/wire').WireJournal;
  /** SETL6 — the running net of those instructions per party: what each has committed to pay or
   * is due to receive before the settlement pass runs. Read through
   * `pendingSettlementUSD` (stages/settlement.ts); maintained by `pay`. */
  /** SCALE: the week's running net, dense by party id (stages/settlement.ts). Was a
   *  `Map<string, number>` keyed by a string rebuilt on every one of ~580,000 lookups a week. */
  pendingNetById: number[];
  pendingTouchedIds: number[];
  /** What the last settlement run did — read by the invariants harness and the diagnostics. */
  lastSettlementReport?: import('./settlement').SettlementReport;
  /** SCALE C1 — the week's holdings, swept once and shared by the five clearing books; present
   * only between the store's build (before 07b) and its write-back (after 07e). While it is
   * set, entity `itemizedHoldings` arrays are stale week-start snapshots: read positions
   * through the store. */
  /** DRV — THE ONE DERIVATIVE BOOK: every bilateral contract of every class, the week's working
   * copy (derivative-lifecycle.ts owns every read and write; market stages strike into it). */
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
  g2DeclinedOriginationUSD: Record<import('../../../types').RegionId, number>;
  /** `issuedUSD` is the paper that came into EXISTENCE — the whole deal under firm commitment,
   *  whatever the book took — while `marketTakeUSD` is only the part the book bought. They differ
   *  by the residual the lead is left holding, and creating the tranche at the take instead of at
   *  the issue is how the lead came to hold paper that did not exist (a ledger minting claims). */
  primarySettlements: Map<string, { offering: import('../../../domain/primary-market').PrimaryOffering; clearedStat: number; withdrawn: boolean; marketTakeUSD: number; issuedUSD: number; proceedsUSD: number }>;

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
  /** §7.248: the executed household flow AND the NAV per share it transacted at — the register
   *  settles shares at the SAME price the cash leg paid (one transaction, one price; the fund's
   *  book is mid-flight when the register stage reads it, so re-deriving there divided by an
   *  empty week-one book). */
  householdEtfPurchasesUSD: Map<string, { spentUSD: number; navPerShare: number }>;
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
  /** IND16 — what each distribution firm earned this week running the channel: the margin
   * households paid inside the shelf price of every physical good they bought. Booked as real
   * revenue in stage 08, exactly as the carriers' freight is. */
  channelMarginRevenue: Record<string, number>;
  /** IND16 — who runs the channel in each region, and each firm's share of it, by the size of its
   * own distribution line. Built once a week; the settlement legs read it per lot. */
  channelShareByRegion: Record<string, Map<string, number>>;
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
  cashOverdraftUSD: number;
  pendingHolderAccrualUSD: Map<string, number>;
  /** CAL — the instruments whose coupon falls due this week: their accrued balances become cash. */
  pendingHolderAccrualPayout: Set<string>;
  /** §7.321 barrier mode: suppress emission-time running-net application (merge applies it). */
  deferPendingNet?: boolean;
  /** CAL — what each holder has EARNED and not yet been paid, by (instrument, holder). The
   *  receivable that sits between an accrual and a coupon date, and the reason a bond can change
   *  hands mid-period without moving the interest to the wrong party. */
  holderAccruedInterestUSD: Map<string, Map<string, number>>;
  /** CAL — the same receivable for GOVERNMENT paper, keyed `<region>|<bucket>|<partyKey>` because
   *  its holders are not all on the institutional register: a bank holds sovereigns directly, per
   *  tenor, on its own balance sheet, and so do the central bank and the corporate treasuries. */
  sovereignAccruedInterestUSD: Map<string, number>;
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
    damperBoundInstrumentIds: [],
    lentSharesByLender: new Map(),
    buyInSharesByBorrower: new Map(),
    deadCeilingBooks: [],
    // SEG1: last week's after-cutoff payments (recorded by stages that run after the
    // settlement stage) roll into this cycle — a real system's next-day settlement.
    paymentJournal: (state as { pendingPaymentJournal?: import('./settlement').PaymentJournal })
      .pendingPaymentJournal ?? newPaymentJournal(),
    pendingNetById: [],
    wireJournal: newWireJournal((state as { nextWireId?: number }).nextWireId ?? 1, state.currentWeek + 1),
    pendingTouchedIds: [],
    issuerTickerById: new Map(state.companies.map((c) => [c.id, c.ticker])),
    g2DeclinedOriginationUSD: { USA: 0, EUR: 0, UK: 0, JPN: 0 },
    primaryOfferingsWorking: [...(state.primaryOfferings ?? [])],
    primarySettlements: new Map(),

    updatedRegions: { ...state.regions },
    updatedFxPairs: [...state.fxPairs],
    updatedCompanies: [...state.companies],
    updatedInstitutionalEntities: [...state.institutionalEntities],
    pendingHolderSettlements: new Map<string, number>(),
    pendingHolderCashUSD: new Map<string, number>(),
    householdEtfPurchasesUSD: new Map<string, { spentUSD: number; navPerShare: number }>(),
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
    channelMarginRevenue: {},
    channelShareByRegion: {},
    carrierTonneNm: {},
    goodsArrivedUnits: 0,
    shipmentsDispatched: [],
    tradeInvoicesBooked: [],
    estates: state.estates,
    cashOverdraftUSD: 0,
    pendingHolderAccrualUSD: new Map(),
    pendingHolderAccrualPayout: new Set(),
    holderAccruedInterestUSD: state.holderAccruedInterestUSD,
    sovereignAccruedInterestUSD: state.sovereignAccruedInterestUSD,
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

/**
 * §7.250 — THE ONE WRITE PATH INTO THE PRE-08 BANK-SHEET CHANNEL. Before stage 08 it is the
 * hand-off every clearing stage chains through; after stage 08 has consumed it, a write here is
 * a write to NOWHERE and throws instead of failing silently. (The doctrine, completed from
 * §7.103: before 08 the channel is the ONLY sheet write that survives; after 08 it is the only
 * one that cannot.)
 */
export function updateBankSheet(
  ctx: WeeklyStepContext,
  ticker: string,
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
