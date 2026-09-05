import { CreditRating, Sector } from '../types';
import { INFLATION_TARGET } from './bootstrap/yield-curves';
import { EQUITY_RISK_PREMIUM } from './equity-valuation';

/**
 * OAS credit spread by rating: a geometric progression anchored on the CCC/default-boundary
 * spread, using the same proportional risk step (RATING_NOTCH_SPREAD_DECAY) between adjacent
 * notches as simulation/credit.ts's rating cutoffs — not a table copied from observed market
 * spreads.
 */
const CCC_BASE_SPREAD_BPS = 1100;
const RATING_NOTCH_SPREAD_DECAY = 0.60;
const RATING_SPREAD_ORDER: CreditRating[] = ['D', 'CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA'];

function buildRatingOasSpreads(): Record<CreditRating, { baseBps: number; minBps: number; maxBps: number }> {
  const table = {} as Record<CreditRating, { baseBps: number; minBps: number; maxBps: number }>;
  RATING_SPREAD_ORDER.forEach((rating, index) => {
    const notch = index - 1; // CCC sits at notch 0, D one notch worse, AAA six notches better
    const baseBps = Math.round(CCC_BASE_SPREAD_BPS * Math.pow(RATING_NOTCH_SPREAD_DECAY, notch));
    table[rating] = { baseBps, minBps: Math.round(baseBps * 0.7), maxBps: Math.round(baseBps * 1.6) };
  });
  return table;
}
export const RATING_OAS_SPREADS = buildRatingOasSpreads();

/**
 * Benchmark sector PE multiples, derived via the Gordon growth model (PE = 1 / (r - g))
 * from each sector's growth-rate coefficient and a shared discount rate primitive
 * (inflation target + a structural equity risk premium) — an output of the model, not an
 * independently chosen multiple.
 */
// ONE OWNER (§4.0 Tier 1 item 5): the structural equity risk premium lives in
// equity-valuation.ts — this file held a second copy at 0.045 against the owner's 0.035,
// so the seed's sector multiples were struck on a different premium than the market that
// would price the same names live.
const SECTOR_DISCOUNT_RATE = INFLATION_TARGET + EQUITY_RISK_PREMIUM;
const SECTOR_GROWTH_AND_VOL: Record<Sector, { growthRate: number; vol: number }> = {
  Tech: { growthRate: 0.12, vol: 0.28 },
  Energy: { growthRate: 0.04, vol: 0.32 },
  Financials: { growthRate: 0.06, vol: 0.22 },
  Industrials: { growthRate: 0.07, vol: 0.20 },
  Consumer: { growthRate: 0.05, vol: 0.18 },
  Banks: { growthRate: 0.03, vol: 0.24 },
};

function buildSectorBenchmarks(): Record<Sector, { basePE: number; growthRate: number; vol: number }> {
  const table = {} as Record<Sector, { basePE: number; growthRate: number; vol: number }>;
  (Object.keys(SECTOR_GROWTH_AND_VOL) as Sector[]).forEach((sector) => {
    const { growthRate, vol } = SECTOR_GROWTH_AND_VOL[sector];
    const basePE = Number((1 / Math.max(0.01, SECTOR_DISCOUNT_RATE - growthRate)).toFixed(1));
    table[sector] = { basePE, growthRate, vol };
  });
  return table;
}
export const SECTOR_BENCHMARKS = buildSectorBenchmarks();

/**
 * Commodity Futures Cost-of-Carry Pricing
 * F = S * exp((r - q) * T)
 */
export function priceCommodityFutures(
  spotPrice: number,
  riskFreeRate: number,
  convenienceYield: number,
  tenorYears: number
): number {
  return spotPrice * Math.exp((riskFreeRate - convenienceYield) * tenorYears);
}

/**
 * Leveraged Loan Pricing (Senior Secured First Lien, Floating Reference Rate + Quoted Margin)
 * Quoted in Points of Par using Discount Margin (DM) vs Quoted Margin (QM)
 * Price_par = 100 - (DM - QM) * ModifiedDuration
 * Default Recovery = 65% of Par
 */
/**
 * §3.13 row 3 — `priceLeveragedLoan` IS DELETED. It computed `pricePar = 100 − ΔDM × duration ×
 * 100`: a price linearised out of a cleared discount margin, which is `bond.md` N7.b's forbidden
 * direction. 07d clears the price itself now and every reader takes it from the price store.
 */
