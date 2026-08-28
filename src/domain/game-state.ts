/**
 * Global Game State Domain Model
 *
 * Models the complete immutable state tree of the simulation engine for a given week.
 * Encompasses regions, companies, financial institutions, commodities, market indices,
 * portfolio positions, news feeds, UI state, and turn summaries.
 */

import { RegionId, FxPair } from './geography';
import { Company, CreditRating } from './company';
import { InstitutionalEntity } from './institutions';
import { Commodity, Dealer, TradeableInstrument } from './instruments';
import { CompositeBenchmarkIndices } from './markets';
import { Portfolio, ReturnAttribution } from './portfolio';
import { NewsItem, DiagnosticsLog } from './events';
import { Region } from './region-macro';

export interface GameState {
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
  /** §6 damper diagnostic — see WeeklyStepContext.damperBoundInstrumentIds. */
  lastWeekDamperBoundIds?: string[];
  regions: Record<RegionId, Region>;
  fxPairs: FxPair[];
  companies: Company[];
  institutionalEntities: InstitutionalEntity[];
  commodities: Commodity[];
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
  isTradeModalOpen: boolean;
  selectedInstrument: TradeableInstrument | null;
  isNewsDrawerOpen: boolean;
  diagnosticsLogs: DiagnosticsLog[];
  isGameOver: boolean;
  gameOverReason: string | null;
}
