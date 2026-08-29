/** Regions, the currency each issues, shipping distances between them, and the FX pair type. */

export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';

/**
 * The currency each region issues. The model's RegionIds are places, not money — writing a pair
 * as 'EUR/USA' or 'USA/JPN' names a country where a currency belongs.
 */
export const CURRENCY_BY_REGION: Record<RegionId, string> = {
  USA: 'USD',
  EUR: 'EUR',
  UK: 'GBP',
  JPN: 'JPY',
};

/**
 * Shipping distance in nautical miles over the routes freight actually takes. A physical fact,
 * which is the kind of primitive rule 4 allows — unlike a trade share, which is a result.
 *
 * The diagonal is a region's own average domestic haul and is deliberately NOT zero: zero would
 * hand every domestic seller a free advantage, an assumption dressed as geography.
 */
export const LANE_DISTANCE_NM: Record<RegionId, Record<RegionId, number>> = {
  USA: { USA: 800, EUR: 3_300, UK: 3_000, JPN: 4_800 },
  EUR: { USA: 3_300, EUR: 500, UK: 250, JPN: 11_200 },
  UK: { USA: 3_000, EUR: 250, UK: 150, JPN: 11_300 },
  JPN: { USA: 4_800, EUR: 11_200, UK: 11_300, JPN: 250 },
};

export function laneDistanceNm(from: RegionId, to: RegionId): number {
  return LANE_DISTANCE_NM[from]?.[to] ?? 0;
}

/** Conventional pair label, e.g. EUR/USD, GBP/USD, USD/JPY. */
export function fxPairLabel(base: RegionId, quote: RegionId): string {
  return `${CURRENCY_BY_REGION[base]}/${CURRENCY_BY_REGION[quote]}`;
}

export interface FxPair {
  pair: string; // e.g. "EUR/USD", "GBP/USD", "USD/JPY"
  base: RegionId;
  quote: RegionId;
  rate: number; // Units of quote per 1 base (e.g. 1.0850 USD per EUR)
  historicalRates: number[];
  change1W: number;
  basisSpreadBps: number; // Cross currency basis spread in bps (e.g. -15 bps)
}
