/**
 * User Portfolio & Performance Attribution Domain Model
 *
 * Models user portfolio cash, positions, NAV, margin utilization, risk Greeks (Delta, Gamma, Vega, DV01),
 * and 5-factor performance attribution (carry, rates, credit spread, equity delta, vol theta).
 * Read and updated by trade execution, portfolio valuation, and performance tracking engines.
 */

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
  cashUSD: number;
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
