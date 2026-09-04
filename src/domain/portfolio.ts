/** The player's portfolio: cash, positions, NAV, margin, aggregate Greeks, and the five-factor
 *  return attribution (carry, rates, credit spread, equity delta, vol theta). */

import { Position } from './instruments';

export interface ReturnAttribution {
  carryLocal: number;
  macroRatesLocal: number;
  creditSpreadLocal: number;
  equityDeltaLocal: number;
  volThetaLocal: number;
}

export interface HistoricalBenchmarkRecord {
  week: number;
  nav: number;
  benchmark6040: number;
  cashHurdle: number;
}

export interface Portfolio {
  cashLocal: number;
  startingCapitalLocal: number;
  navLocal: number;
  previousNavLocal: number;
  historicalNav: number[];
  historicalBenchmarks: HistoricalBenchmarkRecord[];
  positions: Position[];
  closedPositionsCount: number;
  realizedPnLTotal: number;
  
  // Performance attribution breakdown
  cumulativeAttribution: ReturnAttribution;
  lastWeekAttribution: ReturnAttribution;
  
  // Margining & Risk
  totalRequiredMarginLocal: number;
  maintenanceMarginLocal: number;
  marginUtilizationPct: number;
  isMarginCall: boolean;
  marginCallWarning: string | null;
  totalLeverage: number;
  
  // Aggregate Portfolio Greeks
  netDeltaLocal: number;
  netGammaLocal: number;
  netVegaLocal: number;
  netDV01Local: number;
}
