import { NelsonSiegelParams, calculateDiscountFactor, calculateNelsonSiegelZeroRate } from './nelsonSiegel';
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
 * Corporate Bond Pricing
 * Sovereign Benchmark Yield + OAS Rating Spread
 */
export function priceCorporateBond(
  maturityYears: number,
  couponRate: number,
  sovCurveParams: NelsonSiegelParams,
  oasSpreadBps: number,
  isDefaulted: boolean = false,
  recoveryRate: number = 0.40
): { price: number; yieldToMaturity: number; dv01: number; duration: number } {
  if (isDefaulted) {
    return {
      price: recoveryRate * 100, // e.g. 40 on 100 par
      yieldToMaturity: 0.50,
      dv01: 0,
      duration: 0,
    };
  }

  const spread = oasSpreadBps / 10000;
  const annualCoupon = 100 * couponRate;
  let pv = 0;
  let weightedTime = 0;

  const cfTimes: number[] = [];
  for (let t = maturityYears; t > 0; t -= 1) {
    cfTimes.push(t);
  }

  for (const t of cfTimes) {
    const baseZeroRate = calculateNelsonSiegelZeroRate(t, sovCurveParams);
    const discountRate = baseZeroRate + spread;
    const df = Math.exp(-discountRate * t);
    const cf = t === maturityYears ? annualCoupon + 100 : annualCoupon;
    pv += cf * df;
    weightedTime += t * cf * df;
  }

  const ytm = calculateNelsonSiegelZeroRate(maturityYears, sovCurveParams) + spread;
  const duration = pv > 0 ? (weightedTime / pv) / (1 + ytm) : maturityYears;
  const dv01 = (pv * duration * 0.0001);

  return {
    price: pv,
    yieldToMaturity: ytm,
    dv01,
    duration,
  };
}

/**
 * Par Swap Rate for an Interest Rate Swap (IRS)
 * S_par = (1 - P(0, T)) / sum(tau_i * P(0, t_i))
 */
export function calculateParSwapRate(
  tenorYears: number,
  sovCurveParams: NelsonSiegelParams,
  frequency: number = 1 // annual payments tau = 1
): { parRate: number; annuity: number; dv01PerMillion: number } {
  let annuity = 0;
  const tau = 1 / frequency;
  const numPeriods = Math.round(tenorYears * frequency);

  for (let i = 1; i <= numPeriods; i++) {
    const t = i * tau;
    const df = calculateDiscountFactor(t, sovCurveParams);
    annuity += tau * df;
  }

  const p0T = calculateDiscountFactor(tenorYears, sovCurveParams);
  const parRate = annuity > 0 ? (1 - p0T) / annuity : calculateNelsonSiegelZeroRate(tenorYears, sovCurveParams);
  // DV01 for $1,000,000 notional = Notional * Annuity * 0.0001
  const dv01PerMillion = 1000000 * annuity * 0.0001;

  return { parRate, annuity, dv01PerMillion };
}

/**
 * Closed-form Mark-to-Market NPV of an Interest Rate Swap (Fixed vs. Floating)
 * Pay Fixed NPV = Notional * sum( (F_i - S_fixed) * tau_i * P(0, t_i) )
 *               = Notional * (S_par - S_fixed) * Annuity
 */
export function priceInterestRateSwap(
  notional: number,
  fixedRate: number,
  tenorYears: number,
  direction: 'PAY_FIXED' | 'RECEIVE_FIXED',
  sovCurveParams: NelsonSiegelParams
): { npv: number; currentParRate: number; dv01: number; annuity: number } {
  const { parRate, annuity, dv01PerMillion } = calculateParSwapRate(tenorYears, sovCurveParams);
  
  // Spread difference (Current Par Rate - Fixed Contracted Rate)
  const rateDiff = parRate - fixedRate;
  const multiplier = direction === 'PAY_FIXED' ? 1 : -1;
  const npv = notional * rateDiff * annuity * multiplier;
  const dv01 = (notional / 1000000) * dv01PerMillion * (direction === 'PAY_FIXED' ? 1 : -1);

  return {
    npv,
    currentParRate: parRate,
    dv01,
    annuity,
  };
}

/**
 * Closed-form Single-Name CDS Pricing
 * Hazard rate lambda = OAS / (1 - R), R = 0.40
 * RPV01 = sum(tau_i * P(0, t_i) * exp(-lambda * t_i))
 * NPV_CDS = Notional * (S_current - S_contracted) * RPV01
 */
export function priceCreditDefaultSwap(
  notional: number,
  contractedSpreadBps: number,
  currentOasBps: number,
  tenorYears: number,
  direction: 'BUY_PROTECTION' | 'SELL_PROTECTION',
  sovCurveParams: NelsonSiegelParams,
  recoveryRate: number = 0.40,
  isDefaulted: boolean = false
): { npv: number; rpv01: number; hazardRate: number; currentCdsSpreadBps: number; defaultPayoff: number } {
  const currentOasDecimal = currentOasBps / 10000;
  const hazardRate = isDefaulted ? 10.0 : currentOasDecimal / (1 - recoveryRate);
  
  if (isDefaulted) {
    // Immediate default settlement: Buy Protection receives (1 - R) * Notional
    const defaultPayoff = direction === 'BUY_PROTECTION' 
      ? notional * (1 - recoveryRate) 
      : -notional * (1 - recoveryRate);
    return {
      npv: defaultPayoff,
      rpv01: 0,
      hazardRate,
      currentCdsSpreadBps: 10000,
      defaultPayoff,
    };
  }

  let rpv01 = 0;
  const numPeriods = Math.round(tenorYears * 4); // Quarterly CDS premium payments
  const tau = 0.25;

  for (let i = 1; i <= numPeriods; i++) {
    const t = i * tau;
    const df = calculateDiscountFactor(t, sovCurveParams);
    const survivalProb = Math.exp(-hazardRate * t);
    rpv01 += tau * df * survivalProb;
  }

  // Model CDS spread approx equal to OAS spread with standard market liquidity adjustment
  const currentCdsSpreadBps = currentOasBps;
  const spreadDeltaDecimal = (currentCdsSpreadBps - contractedSpreadBps) / 10000;
  const multiplier = direction === 'BUY_PROTECTION' ? 1 : -1;
  const npv = notional * spreadDeltaDecimal * rpv01 * multiplier;

  return {
    npv,
    rpv01,
    hazardRate,
    currentCdsSpreadBps,
    defaultPayoff: 0,
  };
}

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
 * S6: a pure converter from a CLEARED discount margin to price/yield — never a price-setter.
 * The DM is set once, by the real loan auction (07d); this maps it to points-of-par for
 * display and P&L. The old version re-derived a DM from OAS via a demand-premium-adjusted
 * senior-lien multiple — a second, parallel price-setter for an asset that already clears.
 */
export function priceLeveragedLoan(
  quotedMarginBps: number,
  clearedDiscountMarginBps: number,
  tenorYears: number = 5,
  isDefaulted: boolean = false,
  recoveryRate: number = 0.65
): { pricePar: number; discountMarginBps: number; effectiveYield: number; duration: number } {
  if (isDefaulted) {
    return {
      pricePar: recoveryRate * 100, // 65 on 100 par
      discountMarginBps: 3000,
      effectiveYield: 0.40,
      duration: 0,
    };
  }

  // Floating rate loans have low interest rate duration (approx 0.25y) but credit spread duration ~ 3.5y
  const creditDuration = Math.min(4.0, tenorYears * 0.7);
  const discountMarginBps = Math.round(clearedDiscountMarginBps);
  const marginDeltaBps = discountMarginBps - quotedMarginBps;
  // Price in points of par
  const pricePar = (100 - (marginDeltaBps / 10000) * creditDuration * 100);
  const effectiveYield = (quotedMarginBps / 10000) + ((100 - pricePar) / creditDuration) / 100;

  return {
    pricePar: Number(pricePar.toFixed(2)),
    discountMarginBps,
    effectiveYield,
    duration: creditDuration,
  };
}

/**
 * Cross-Currency Basis Swap (XCS) Pricing & MTM
 */
export function priceCrossCurrencyBasisSwap(
  notionalBase: number, // e.g. EUR 10M
  fxSpot: number, // USD per EUR
  contractedBasisBps: number,
  currentBasisBps: number,
  tenorYears: number,
  direction: 'LONG' | 'SHORT' // Pay EUR / Receive USD or vice versa
): { npvUSD: number; dv01USD: number } {
  const basisDiffBps = currentBasisBps - contractedBasisBps;
  // Approximate duration = tenorYears * 0.9
  const duration = tenorYears * 0.9;
  const notionalUSD = notionalBase * fxSpot;
  const multiplier = direction === 'LONG' ? 1 : -1;
  const npvUSD = notionalUSD * (basisDiffBps / 10000) * duration * multiplier;
  const dv01USD = notionalUSD * duration * 0.0001 * multiplier;

  return { npvUSD, dv01USD };
}
