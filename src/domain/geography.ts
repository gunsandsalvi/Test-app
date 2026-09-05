/** Regions, the currency each issues, shipping distances between them, and the FX pair type. */

export type RegionId = 'USA' | 'UK' | 'JPN' | 'EUR';

/**
 * THE MONEY. A region is a PLACE; a currency is the money issued there, and the two are not the
 * same kind of thing — writing a pair as 'EUR/USA' names a country where a currency belongs.
 *
 * Every figure this model stores is denominated in one of these, and until now that fact lived
 * only in a comment: 11,243 identifiers carried a `USD` suffix while `currency.ts` said in its
 * own header that a figure is held in the money of whoever owns it. A German firm's `cashLocal`
 * was euros. The suffix is now the type, and a number that moves without one does not compile.
 */
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY';

/** The currency each region issues. */
export const CURRENCY_BY_REGION: Record<RegionId, CurrencyCode> = {
  USA: 'USD',
  EUR: 'EUR',
  UK: 'GBP',
  JPN: 'JPY',
};

/** Where each currency is issued — the inverse, which the compiler forces complete. */
export const REGION_BY_CURRENCY: Record<CurrencyCode, RegionId> = {
  USD: 'USA',
  EUR: 'EUR',
  GBP: 'UK',
  JPY: 'JPN',
};

/** Every currency, derived from the Record the compiler forces complete (the REGION_IDS pattern). */
export const CURRENCY_CODES = Object.keys(REGION_BY_CURRENCY) as readonly CurrencyCode[];

/** The world's numéraire: the one currency whose price in itself is 1 by definition. Every rate
 *  in the model is quoted against it, which is a measurement convention and not a claim that
 *  anybody's books are kept in it. */
export const NUMERAIRE: CurrencyCode = 'USD';

/** The money a region's residents keep their books in. */
export const currencyOf = (region: RegionId): CurrencyCode => CURRENCY_BY_REGION[region];

/**
 * Every region, derived from the one Record the compiler forces complete (§7.241): a new
 * RegionId member errors on CURRENCY_BY_REGION until it is named there, and every consumer of
 * this list then includes it automatically. Do not hand-write region arrays — 41 hand-kept
 * copies were how a fifth region would have shipped as an economy with no firms and no banks.
 */
export const REGION_IDS = Object.keys(CURRENCY_BY_REGION) as readonly RegionId[];

/**
 * §3.13-READ D8 — THE UI'S REGION REF IS STILL A PLAIN STRING, and this is the one place that
 * says so. `ObjectRef` carries `{ type: 'region'; id: string }`, so a component that has already
 * matched on `type === 'region'` knows more than the type does. Narrowing it here — once, named —
 * beats three `as RegionId` casts scattered through the views, and it is the site to delete when
 * `ObjectRef` finally carries the branded id.
 */
export const asRegionId = (id: string): RegionId => id as RegionId;

/**
 * Compile-loud completeness for a hand-ordered region tuple: `AllRegionsNamed<typeof X>`
 * resolves to `never` (a type error at the use site) until X names every RegionId. Use it for
 * orders that are bit-load-bearing (seed RNG draw order, float-sum order) and therefore must
 * NOT be rewritten onto REGION_IDS.
 */
type AllRegionsNamed<T extends readonly RegionId[]> =
  Exclude<RegionId, T[number]> extends never ? T : never;

/**
 * The seed/display iteration order. Distinct from REGION_IDS on purpose: generation-time RNG
 * draw order is part of the world (§7.223), so reordering this relabels every seed. Complete by
 * construction — a new RegionId fails to compile here until this order names it.
 */
export const REGION_IDS_SEED_ORDER = ['USA', 'UK', 'JPN', 'EUR'] as const;
const _seedOrderComplete: AllRegionsNamed<typeof REGION_IDS_SEED_ORDER> = REGION_IDS_SEED_ORDER;
void _seedOrderComplete;

/**
 * Shipping distance in nautical miles over the routes freight actually takes. A physical fact,
 * which is the kind of primitive rule 2 allows — unlike a trade share, which is a result.
 *
 * The diagonal is a region's own average domestic haul and is deliberately NOT zero: zero would
 * hand every domestic seller a free advantage, an assumption dressed as geography.
 */
const LANE_DISTANCE_NM: Record<RegionId, Record<RegionId, number>> = {
  USA: { USA: 800, EUR: 3_300, UK: 3_000, JPN: 4_800 },
  EUR: { USA: 3_300, EUR: 500, UK: 250, JPN: 11_200 },
  UK: { USA: 3_000, EUR: 250, UK: 150, JPN: 11_300 },
  JPN: { USA: 4_800, EUR: 11_200, UK: 11_300, JPN: 250 },
};

export function laneDistanceNm(from: RegionId, to: RegionId): number {
  return LANE_DISTANCE_NM[from][to];
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
}
