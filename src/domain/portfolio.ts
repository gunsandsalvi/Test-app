/** The player's portfolio: cash, positions, NAV, margin, aggregate Greeks, and the five-factor
 *  return attribution (carry, rates, credit spread, equity delta, vol theta). */

import { Position } from './instruments';

export interface ReturnAttribution {
  carryUSD: number;
  macroRatesUSD: number;
  creditSpreadUSD: number;
  equityDeltaUSD: number;
  volThetaUSD: number;
}

export interface HistoricalBenchmarkRecord {
  week: number;
  nav: number;
  benchmark6040: number;
  cashHurdle: number;
}

export interface Portfolio {
  cashLocal: number;
  startingCapitalUSD: number;
  navUSD: number;
  previousNavUSD: number;
  historicalNav: number[];
  historicalBenchmarks: HistoricalBenchmarkRecord[];
  positions: Position[];
  closedPositionsCount: number;
  realizedPnLTotal: number;
  
  // Performance attribution breakdown
  cumulativeAttribution: ReturnAttribution;
  lastWeekAttribution: ReturnAttribution;
  
  // Margining & Risk
  totalRequiredMarginUSD: number;
  maintenanceMarginUSD: number;
  marginUtilizationPct: number;
  isMarginCall: boolean;
  marginCallWarning: string | null;
  totalLeverage: number;
  
  // Aggregate Portfolio Greeks
  netDeltaUSD: number;
  netGammaUSD: number;
  netVegaUSD: number;
  netDV01USD: number;
}
