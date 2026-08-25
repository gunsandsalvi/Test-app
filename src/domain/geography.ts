/**
 * Geography Domain Model
 *
 * Models real-world regional identifiers (USA, UK, JPN, EUR) and foreign exchange rate pairs (FxPair).
 * Written to by macro simulation stages during FX evolution and cross-border trade flows.
 */

export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';

export interface FxPair {
  pair: string; // e.g. "EUR/USD", "GBP/USD", "USD/JPY"
  base: RegionId;
  quote: RegionId;
  rate: number; // Units of quote per 1 base (e.g. 1.0850 USD per EUR)
  historicalRates: number[];
  change1W: number;
  basisSpreadBps: number; // Cross currency basis spread in bps (e.g. -15 bps)
}
