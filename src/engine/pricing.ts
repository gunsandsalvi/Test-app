import { NelsonSiegelParams, calculateDiscountFactor, calculateForwardRate, calculateNelsonSiegelZeroRate } from './nelsonSiegel';
import { CreditRating } from '../types';

/**
 * Base OAS credit spread table by rating (in basis points)
 */
export const RATING_OAS_SPREADS: Record<CreditRating, { baseBps: number; minBps: number; maxBps: number }> = {
  AAA: { baseBps: 45, minBps: 25, maxBps: 70 },
  AA: { baseBps: 75, minBps: 50, maxBps: 110 },
  A: { baseBps: 120, minBps: 85, maxBps: 180 },
  BBB: { baseBps: 190, minBps: 140, maxBps: 280 },
  BB: { baseBps: 340, minBps: 250, maxBps: 520 },
  B: { baseBps: 580, minBps: 420, maxBps: 850 },
  CCC: { baseBps: 1100, minBps: 800, maxBps: 1800 },
  D: { baseBps: 4000, minBps: 2500, maxBps: 6000 },
};

/**
 * Benchmark sector PE multiples
 */
export const SECTOR_BENCHMARKS = {
  Tech: { basePE: 28.5, growthRate: 0.12, vol: 0.28 },
  Energy: { basePE: 12.0, growthRate: 0.04, vol: 0.32 },
  Financials: { basePE: 13.5, growthRate: 0.06, vol: 0.22 },
  Industrials: { basePE: 18.0, growthRate: 0.07, vol: 0.20 },
  Consumer: { basePE: 21.0, growthRate: 0.05, vol: 0.18 },
};

/**
 * Equities Pricing: Forward P/E multiple hybrid
 * P_t = EPS_t * PE_sector * (1 + SentimentFactor)
 */
export function priceEquity(
  eps: number,
  sectorPE: number,
  sentiment: number,
  isDefaulted: boolean = false
): number {
  if (isDefaulted || eps <= 0) {
    if (isDefaulted) return 0.00;
    return Math.max(1.5, Math.abs(eps) * sectorPE * 0.4);
  }
  const sentimentMultiplier = 1 + sentiment * 0.35; // sentiment between -1 and +1 modifies PE by +/- 35%
  const price = eps * sectorPE * sentimentMultiplier;
  return Math.max(0.5, price);
}

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

  for (let year = 1; year <= maturityYears; year++) {
    const baseZeroRate = calculateNelsonSiegelZeroRate(year, sovCurveParams);
    const discountRate = baseZeroRate + spread;
    const df = Math.exp(-discountRate * year);
    const cf = year === maturityYears ? annualCoupon + 100 : annualCoupon;
    pv += cf * df;
    weightedTime += year * cf * df;
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
export function priceLeveragedLoan(
  quotedMarginBps: number,
  oasSpreadBps: number,
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
  // Discount margin reflects current credit risk (approx 85-90% of unsecured OAS due to senior lien collateral)
  const discountMarginBps = Math.round(oasSpreadBps * 0.85);
  const marginDeltaBps = discountMarginBps - quotedMarginBps;
  // Price in points of par
  const pricePar = Math.max(10, Math.min(105, 100 - (marginDeltaBps / 10000) * creditDuration * 100));
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
