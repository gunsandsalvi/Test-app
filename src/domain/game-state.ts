/**
 * The whole world for one week.
 *
 * NOT immutable, despite what this header used to claim: stage 08 rebuilds each company with
 * `Object.assign(comp, ...)` and several stages mutate the region objects in place. Treat any
 * reference you hold as live.
 *
 * RULE 3, CLOSED (AU slice 1, §7.342): the UI state that used to live here (`isTradeModalOpen`,
 * `selectedInstrument`, `isNewsDrawerOpen`, the two game-over flags) is gone — the shell keeps
 * its workspace in the UI layer, and nothing the engine hashes for determinism moves when a
 * screen opens.
 */

import { RegionId, FxPair } from './geography';
import { Company, CreditRating } from './company';
import { InstitutionalEntity } from './institutions';
import { Commodity, Dealer } from './instruments';
import { CompositeBenchmarkIndices } from './markets';
import { Portfolio, ReturnAttribution } from './portfolio';
import { NewsItem, DiagnosticsLog } from './events';
import { Region } from './region-macro';

export interface GameState {
  /** ENGINE V2 (§7.304) — the persistent columnar world: tables land here as mechanisms port.
   *  Plain data only (typed arrays, Maps, number[]s), so `structuredClone(state)` deep-copies
   *  it and battery replays stay isolated by construction. Created on first touch. */
  v2?: import('../engine2/world').V2World;
  currentWeek: number;
  year: number;
  /**
   * The seed this world was generated from, and where its random stream currently sits. Carried
   * on the state so a saved game resumes the same world rather than forking into a new one, and
   * so any measurement of this simulation can be repeated exactly. See engine/rng.ts.
   */
  rngSeed: number;
  rngState: number;
  /** WS8 — pending primary offerings: enqueued by issuers in stage 08, priced by the relevant
   * clearing book the following week, then settled or withdrawn and removed. */
  primaryOfferings: import('./primary-market').PrimaryOffering[];
  /** ETF — the published indexes: membership struck quarterly, level moved weekly by the
   * constituents' own cleared prices (`stages/index-calculation.ts`). */
  marketIndexes: import('./indexes').MarketIndex[];
  /** XB3a-1 — the physical mass of one unit of each sub-unit's output, in tonnes. Derived once
   *  at seed from the good's own baseline price and its real value density (see
   *  domain/goods-physical.ts) and never moved after: mass is physical, so when a good's price
   *  doubles the same tonne is worth twice as much rather than weighing half as much. This is
   *  what freight is charged on. */
  unitMassTonnes: Record<string, number>;
  /** XB3a-4 — consignments bought and still on their way. A buyer's capital is in them and its
   *  production cannot use them yet, which is the real cost of a long lead time. */
  goodsInTransit: import('../engine/simulation/stages/goods-arrival').InTransitShipment[];
  /** XB3a-2 — last cleared freight per tonne by directed lane key ("USA>EUR"), each in that
   *  lane's OWN money (its origin's), which is where the carrier's fuel and crew are paid. What a
   *  buyer forms its next sourcing intent against, converting into its own money to compare. */
  freightRatePerTonneLaneMoneyByLane: Record<string, number>;
  /** XB6 — the share of each pair's own weekly flow its market could NOT absorb, keyed
   *  "BASE/QUOTE". The model's one real measure of how deep a currency pair is, and what the
   *  invoice-currency choice is priced against. */
  fxPairIlliquidity: Record<string, number>;
  /** XB3a-5 — cross-border sales delivered and not yet paid for, in the market's own emergent
   *  invoice currency, due on terms derived from the buyer's own credit. */
  tradeInvoices: import('./trade-invoice').TradeInvoice[];
  /** G5 — open and just-closed workouts, carried across weeks. §7.274: REQUIRED — the optional
   *  form let a state without the field compile, and the `?? []` default at context creation
   *  silently reset every open workout (§4.0 Tier 1 item 3's resetting-default trap). */
  estates: import('./estate').Estate[];
  /**
   * CAL — accrued-but-unpaid interest by (instrument, holder); see stages/shared-helpers.ts.
   *
   * SCALE: a **Map**, carried across the week boundary as itself. It was a plain object, so every
   * week rebuilt it into a Map on the way in and back into an object on the way out — and this
   * ledger holds ~105,000 keys. Those two lines were the #1 and #5 self-time lines in the whole
   * program, 5.25% of all CPU, converting a container to another container and back. Nothing
   * serialises or hashes GameState, so the object form was buying nothing at all.
   */
  holderAccruedInterestUSD: Map<string, Map<string, number>>;
  /** CAL — accrued-but-unpaid SOVEREIGN interest by (region, tenor bucket, party); see
   *  stages/sovereign-calendar.ts. Party-keyed rather than holder-keyed because a bank holds
   *  government paper on its own balance sheet and is not on the institutional register. */
  sovereignAccruedInterestUSD: Map<string, number>;
  /** CASH — reserves 02b invented this week to cover balances that moved outside settlement. */
  lastCashReconcileUSD?: Partial<Record<import('./geography').RegionId, number>>;
  lastCashReconcileByClassUSD?: { corporate: number; institutional: number; sme: number };
  /** CASH — clamped negative balances, summed over the week's reconciliations. */
  lastCashOverdraftUSD?: number;
  /** §6 damper diagnostic — see WeeklyStepContext.damperBoundInstrumentIds. */
  lastWeekDamperBoundIds?: string[];
  /** Signed consecutive-week bind streak per `book:id` (+ up, − down) — the adaptive damper's
   *  memory (financial-clearing-engine.ts `damperBindStreak`). Rolled weekly by core.ts. */
  damperBindStreakById?: Record<string, number>;
  /** GUARD — books that could not trade this week: no participant's ceiling exceeded its own
   * position. Must be empty; see WeeklyStepContext.deadCeilingBooks. */
  lastWeekDeadCeilingBooks?: string[];
  /** SETL2 — last week's settlement, decomposed. `unmodeledByReason` names every flow still
   * missing a real counterparty and how much it moved; §6 watches the total DOWN as each one
   * gets named, and this is what makes that watchable rather than asserted. */
  lastSettlement?: {
    grossUSD: number;
    unresolvedUSD: number;
    /** SETL6 — what the cleared books' central counterparty was left holding. Must be zero. */
    clearingHouseResidualUSD: number;
    /** SETL6 — reserves + treasury account, net of what the central bank issued. Must be zero. */
    centralBankResidualUSD: number;
    unmodeledByReason: Record<string, number>;
  };
  /** SEG1 — payments recorded AFTER the week's settlement cutoff (hc-lifecycle's tender
   * settlements, birth carves). A real net-settlement system rolls after-cutoff payments into
   * the next cycle; before this field they were silently dropped when the week's context died,
   * so a take-private's tender proceeds never actually reached the holders. */
  /** SEG1 — payments recorded AFTER the week's settlement cutoff (hc-lifecycle's tender
   * settlements, birth carves), carried into the next cycle as a real net-settlement system
   * does. Before this existed they were silently dropped when the week's context died, so a
   * take-private's tender proceeds never reached the holders.
   *
   * SCALE: columns, not objects — see stages/settlement.ts's PaymentJournal. */
  pendingPaymentJournal?: import('../engine/simulation/stages/settlement').PaymentJournal;
  regions: Record<RegionId, Region>;
  fxPairs: FxPair[];
  companies: Company[];
  institutionalEntities: InstitutionalEntity[];
  commodities: Commodity[];
  /** DRV — the one derivative book: every bilateral contract of every class (swaps, CDS,
   *  futures, FX forwards), one shape, one lifecycle. Born empty (§7.44). */
  derivativesBook?: import('./derivatives/contract').DerivativeContract[];
  compositeIndices: CompositeBenchmarkIndices;
  recentIPOs: { ticker: string; name: string; category: string; week: number }[];
  recentMergers: { acquirerTicker: string; acquirerName: string; targetTicker: string; targetName: string; week: number; dealValueUSD: number }[];
  marketVolPremium?: number;
  dealers: Dealer[];
  portfolio: Portfolio;
  newsFeed: NewsItem[];
  turnSummary: {
    week: number;
    pnlDeltaUSD: number;
    pnlDeltaPct: number;
    interestIncomeUSD: number;
    financingCostUSD: number;
    defaultedCompanies: string[];
    ratingsChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[];
    earningsReported: { ticker: string; name: string; actualEps: number; consensusEps: number; surprisePct: number }[];
    marginAlert: string | null;
    attribution: ReturnAttribution;
  } | null;
  diagnosticsLogs: DiagnosticsLog[];
}
