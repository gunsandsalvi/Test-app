/** News items, diagnostic log rows, and the chart-modal payload. */

import { RegionId } from './geography';
import { Sector } from './company';
import { TradeableInstrument } from './instruments';

export interface NewsItem {
  id: string;
  week: number;
  title: string;
  description: string;
  category: 'CENTRAL_BANK' | 'MACRO' | 'EARNINGS' | 'CREDIT' | 'GEOPOLITICS' | 'COMMODITY' | 'WEATHER';
  impactBadge: string;
  impactRegion?: RegionId;
  impactSector?: Sector;
  affectedTicker?: string;
  urgent: boolean;
  tradeShortcut?: TradeableInstrument;
}

export interface DiagnosticsLog {
  week: number;
  timestamp: string;
  category: 'MACRO' | 'MICRO' | 'EARNINGS' | 'CREDIT' | 'CONTAGION' | 'EXECUTION';
  message: string;
  deltaText?: string;
  data?: Record<string, any>;
}

export interface ChartModalData {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  ticker?: string;
  unit: string;
  currentVal: number;
  change1W: number;
  historicalSeries: number[];
  tradeableInstrument?: TradeableInstrument;
}
