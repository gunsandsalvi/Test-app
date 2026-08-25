/**
 * News, Diagnostic Logging, and Modal Chart Domain Model
 *
 * Models event notifications, news items, structured diagnostic logs, and interactive chart popup payload data.
 * Written by macro event generators, simulation step logging, and UI chart interactions.
 */

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
  sentimentDelta: number;
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
