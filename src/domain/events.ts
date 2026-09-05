/** News items, diagnostic log rows, and the chart-modal payload. */

import { RegionId } from './geography';
import { Sector } from './company';
import { TradeableInstrument } from './instruments';
import type { Ticker } from './ids';

export interface NewsItem {
  id: string;
  week: number;
  title: string;
  description: string;
  category: 'CENTRAL_BANK' | 'MACRO' | 'EARNINGS' | 'CREDIT' | 'GEOPOLITICS' | 'COMMODITY' | 'WEATHER';
  impactBadge: string;
  impactRegion?: RegionId;
  impactSector?: Sector;
  affectedTicker?: Ticker;
  urgent: boolean;
  tradeShortcut?: TradeableInstrument;
  /** §5-NEWS — a DERIVED story cites the state it derives from: the objects it names (every
   *  one a link in the UI), the kind of event, its size (what it ranks by), and the WHY traced
   *  through the ledger. Items without these are the older generator's. */
  kind?: string;
  refs?: { type: 'company' | 'institution' | 'region'; id: string }[];
  materialityLocal?: number;
  cause?: string;
}

/**
 * One firm's quarter as stage 08 reports it. It was declared twice — `EarningsReportEvent` in
 * `newsGenerator.ts` with `sector: string`, and inline on `WeeklyStepContext` as `any[]` — so the
 * two could not disagree loudly and the sector arrived as a bare string on one side of the same
 * row (rule 4: one representation per real thing).
 */
export interface EarningsReport {
  ticker: Ticker;
  name: string;
  actualEps: number;
  consensusEps: number;
  surprisePct: number;
  guidanceSnippet: string;
  sector: Sector;
  region: RegionId;
}

export interface DiagnosticsLog {
  week: number;
  timestamp?: string;
  /** Severity, when the writer states one. */
  level?: 'INFO' | 'WARN' | 'ERROR';
  category?: 'MACRO' | 'MICRO' | 'EARNINGS' | 'CREDIT' | 'CONTAGION' | 'EXECUTION';
  message: string;
  deltaText?: string;
  data?: Record<string, unknown>;
}

