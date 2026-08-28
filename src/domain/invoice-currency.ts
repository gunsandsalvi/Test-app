/**
 * Which currency a cross-border trade is invoiced in (XB3a).
 *
 * Nothing here assigns one. Dollar invoicing dominance is a RESULT of a history this simulation
 * does not have, and importing it would mean the model could never say anything about currency
 * dominance because the answer was assumed (rule 4). The four currencies start exactly level and
 * the outcome is contested on every trade by three forces the model already measures:
 *
 *  1. RELATIVE MARKET POWER in that specific market. The more concentrated side of a market gets
 *     to name the currency — a supplier with no substitutes invoices at home, and so does a buyer
 *     with no alternative sellers. Concentration is measured on both sides with a Herfindahl over
 *     the world book's own offers and bids. No threshold: how hard each party can insist is the
 *     product of its side's concentration and its own share of that side.
 *  2. COALESCING. Firms want to price in the same currency as their competitors, so relative
 *     prices do not swing on FX. This is the network effect that CREATES a vehicle currency, and
 *     it needs the state variable it feeds on: the share of the world's trade, by value, already
 *     invoiced in each currency.
 *  3. STABILITY AND DEPTH. A currency is a worse unit of account the more its price level moves,
 *     and a better one the deeper the money market standing behind it — the bill stock, the repo
 *     book and the money funds, all real and present here.
 *
 * A vehicle currency may emerge from this, and if it is EUR or JPY on a given seed that is a
 * result, not a bug.
 */

import { RegionId, CURRENCY_BY_REGION } from './geography';

const REGION_BY_CURRENCY: Record<string, RegionId> = (() => {
  const map: Record<string, RegionId> = {};
  (Object.keys(CURRENCY_BY_REGION) as RegionId[]).forEach(r => { map[CURRENCY_BY_REGION[r]] = r; });
  return map;
})();

export const INVOICE_MARKET_REGION_IDS: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

/**
 * How the three forces trade off. Stated behavioural primitives, not fitted numbers: coalescing
 * leads because the persistence of vehicle currencies is the single most robust fact about
 * invoicing, market power follows because it is what dislodges one, and macro standing is the
 * slowest of the three. None of them names a currency, which is the property that matters — the
 * seed is uniform, so no currency is handed an advantage these weights could launder.
 */
export const INVOICE_FORCE_WEIGHTS = { network: 0.45, marketPower: 0.35, depthStability: 0.20 };

/** What stands behind a currency, measured from the books that already exist. */
export interface CurrencyStanding {
  /** Money-market depth: bill stock + the repo book + money-fund assets, in USD. */
  depthUSD: number;
  /** Standard deviation of the region's recent inflation prints — its unit-of-account risk. */
  inflationVol: number;
}

function shareOf(values: Record<string, number>): Record<string, number> {
  const total = INVOICE_MARKET_REGION_IDS.reduce((s, r) => s + Math.max(0, values[r] ?? 0), 0);
  const shares: Record<string, number> = {};
  INVOICE_MARKET_REGION_IDS.forEach(r => {
    shares[r] = total > 0 ? Math.max(0, values[r] ?? 0) / total : 1 / INVOICE_MARKET_REGION_IDS.length;
  });
  return shares;
}

export function inflationVolatility(historicalInflation: number[] | undefined, window = 26): number {
  const recent = (historicalInflation ?? []).slice(-window).filter(v => Number.isFinite(v));
  if (recent.length < 3) return 0;
  const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) * (v - mean), 0) / recent.length;
  return Math.sqrt(variance);
}

/**
 * The share of the world's trade already invoiced in each currency, by value. This is force 2's
 * state variable, and it is the ONLY thing carrying a currency's standing from one week to the
 * next — a currency is attractive to invoice in because everyone else already does.
 *
 * It measures INVOICES rather than markets, so it is a real distribution: a currency can hold
 * three-fifths of world trade without holding all of it, which is what invoicing shares actually
 * look like and what a market-level tally could not express.
 *
 * With nothing invoiced yet it returns the four currencies exactly level — the seed that keeps
 * dominance an outcome rather than an input.
 */
export function levelInvoiceCurrencyShares(): Record<string, number> {
  const level: Record<string, number> = {};
  INVOICE_MARKET_REGION_IDS.forEach(r => { level[r] = 1 / INVOICE_MARKET_REGION_IDS.length; });
  return level;
}

/** The standing a currency carries into this week: last week's measurement, or dead level. */
export function carriedInvoiceCurrencyShares(stored: Record<string, number> | undefined): Record<string, number> {
  if (stored && INVOICE_MARKET_REGION_IDS.some(r => (stored[r] ?? 0) > 0)) return stored;
  return levelInvoiceCurrencyShares();
}

export function measureInvoiceCurrencyShares(
  invoices: { currency: string; amountCurrency: number; bookedUsdPerCurrency: number }[],
  previous?: Record<string, number>
): Record<string, number> {
  const byRegion: Record<string, number> = {};
  INVOICE_MARKET_REGION_IDS.forEach(r => { byRegion[r] = 0; });
  let anyValue = 0;
  invoices.forEach(inv => {
    const region = REGION_BY_CURRENCY[inv.currency];
    if (!region) return;
    const valueUSD = inv.amountCurrency * inv.bookedUsdPerCurrency;
    if (!(valueUSD > 0)) return;
    byRegion[region] += valueUSD;
    anyValue += valueUSD;
  });
  // A week with no cross-border trade changes nobody's standing; it does not reset it.
  if (anyValue <= 0) return carriedInvoiceCurrencyShares(previous);
  return shareOf(byRegion);
}

/**
 * The invoice currency of ONE cross-border trade, as the region whose currency it is.
 *
 * The choice belongs to the transaction, not to the industry: a contract is struck between two
 * named parties, and a Japanese seller may well invoice a European buyer in euros and an American
 * one in dollars in the very same market. Deciding it once per market instead made every market a
 * 0/1 outcome, so the largest region's currency took all of them in the first week — before the
 * network effect carried any information — and the coalescing term then made that unassailable
 * forever. That is a property of an argmax over one market-wide score, not of any real mechanism,
 * and it would have meant no seed could ever produce a different answer.
 *
 * `supplyByRegion`/`demandByRegion` are the world book's own offered and bid quantities: the
 * market power at stake is power in THIS market, not size in general. Only the two parties can
 * insist on their own currency; a third currency wins on the other two forces alone, which is
 * exactly the route by which a vehicle currency takes a trade it is not party to.
 */
export function chooseInvoiceRegion(
  sellerRegion: RegionId,
  buyerRegion: RegionId,
  supplyByRegion: Record<string, number>,
  demandByRegion: Record<string, number>,
  networkShare: Record<string, number>,
  standings: Record<string, CurrencyStanding>
): RegionId {
  const supplyShare = shareOf(supplyByRegion);
  const demandShare = shareOf(demandByRegion);

  // Herfindahl on each side. How hard a party can insist depends both on how concentrated its
  // side of the market is and on how much of that side it is: an irreplaceable seller in a
  // market of two suppliers has leverage a marginal one in a market of fifty does not. No
  // threshold decides who "has power" — the two products are compared continuously.
  const hhiSupply = INVOICE_MARKET_REGION_IDS.reduce((s, r) => s + supplyShare[r] * supplyShare[r], 0);
  const hhiDemand = INVOICE_MARKET_REGION_IDS.reduce((s, r) => s + demandShare[r] * demandShare[r], 0);
  const sellerInsist = hhiSupply * supplyShare[sellerRegion];
  const buyerInsist = hhiDemand * demandShare[buyerRegion];
  const insistTotal = sellerInsist + buyerInsist;

  const marketPower: Record<string, number> = {};
  INVOICE_MARKET_REGION_IDS.forEach(r => { marketPower[r] = 0; });
  if (insistTotal > 0) {
    marketPower[sellerRegion] += sellerInsist / insistTotal;
    marketPower[buyerRegion] += buyerInsist / insistTotal;
  } else {
    marketPower[sellerRegion] += 0.5;
    marketPower[buyerRegion] += 0.5;
  }

  const depthStabilityRaw: Record<string, number> = {};
  INVOICE_MARKET_REGION_IDS.forEach(r => {
    const standing = standings[r];
    depthStabilityRaw[r] = Math.max(0, standing?.depthUSD ?? 0) / (1 + Math.max(0, standing?.inflationVol ?? 0));
  });
  const depthStability = shareOf(depthStabilityRaw);

  let best: RegionId = sellerRegion;
  let bestScore = -Infinity;
  INVOICE_MARKET_REGION_IDS.forEach(r => {
    const score =
      INVOICE_FORCE_WEIGHTS.marketPower * marketPower[r]
      + INVOICE_FORCE_WEIGHTS.network * (networkShare[r] ?? 0)
      + INVOICE_FORCE_WEIGHTS.depthStability * depthStability[r];
    if (score > bestScore) { bestScore = score; best = r; }
  });
  return best;
}

export function invoiceCurrencyOf(region: RegionId): string {
  return CURRENCY_BY_REGION[region];
}
