/**
 * Nelson-Siegel Parametric Sovereign Yield Curve Model
 * y(t) = beta0 + beta1 * ((1 - exp(-t/lambda)) / (t/lambda)) + beta2 * (((1 - exp(-t/lambda)) / (t/lambda)) - exp(-t/lambda))
 */

export interface NelsonSiegelParams {
  beta0: number; // Long-term asymptotic level
  beta1: number; // Short-term component (slope)
  beta2: number; // Medium-term component (curvature / hump)
  lambda: number; // Decay parameter controlling the location of the hump
}

export function calculateNelsonSiegelZeroRate(t: number, params: NelsonSiegelParams): number {
  if (t <= 0.001) {
    // Limit as t -> 0: y(0) = beta0 + beta1
    return Math.max(0.0001, params.beta0 + params.beta1);
  }

  const lambda = params.lambda > 0 ? params.lambda : 1.5;
  const tau = t / lambda;
  const factor1 = (1 - Math.exp(-tau)) / tau;
  const factor2 = factor1 - Math.exp(-tau);

  const rate = params.beta0 + params.beta1 * factor1 + params.beta2 * factor2;
  return Math.max(0.0001, rate);
}

/**
 * Calculates zero rates for standard tenors (3M, 2Y, 5Y, 10Y, 30Y)
 */
export function calculateTenorZeroRates(params: NelsonSiegelParams) {
  return {
    tenor3M: calculateNelsonSiegelZeroRate(0.25, params),
    tenor2Y: calculateNelsonSiegelZeroRate(2.0, params),
    tenor5Y: calculateNelsonSiegelZeroRate(5.0, params),
    tenor10Y: calculateNelsonSiegelZeroRate(10.0, params),
    tenor30Y: calculateNelsonSiegelZeroRate(30.0, params),
  };
}

/**
 * Zero-coupon discount factor P(0, t) = exp(-y(t) * t)
 */
export function calculateDiscountFactor(t: number, params: NelsonSiegelParams): number {
  const zeroRate = calculateNelsonSiegelZeroRate(t, params);
  return Math.exp(-zeroRate * t);
}

/**
 * Forward rate F(t1, t2) between two future tenors
 */
export function calculateForwardRate(t1: number, t2: number, params: NelsonSiegelParams): number {
  if (t2 <= t1) return calculateNelsonSiegelZeroRate(t1, params);
  const p1 = calculateDiscountFactor(t1, params);
  const p2 = calculateDiscountFactor(t2, params);
  const dt = t2 - t1;
  return (p1 / p2 - 1) / dt;
}

/**
 * Closed-form price of a fixed-rate coupon bond using Nelson-Siegel curve
 * Annual coupon payments, face value = 100
 */
export function priceSovereignBond(
  maturityYears: number,
  couponRate: number,
  params: NelsonSiegelParams,
  spreadBps: number = 0
): { price: number; yieldToMaturity: number; macaulayDuration: number; modifiedDuration: number; dv01: number } {
  let pv = 0;
  let weightedTime = 0;
  const spread = spreadBps / 10000;
  const annualCoupon = 100 * couponRate;

  for (let year = 1; year <= maturityYears; year++) {
    const baseZeroRate = calculateNelsonSiegelZeroRate(year, params);
    const effectiveRate = baseZeroRate + spread;
    const df = Math.exp(-effectiveRate * year);
    const cashFlow = year === maturityYears ? annualCoupon + 100 : annualCoupon;
    pv += cashFlow * df;
    weightedTime += year * cashFlow * df;
  }

  // Handle fractional periods if needed
  if (maturityYears < 1) {
    const effectiveRate = calculateNelsonSiegelZeroRate(maturityYears, params) + spread;
    const df = Math.exp(-effectiveRate * maturityYears);
    pv = (100 + annualCoupon * maturityYears) * df;
    weightedTime = maturityYears * pv;
  }

  const macaulayDuration = pv > 0 ? weightedTime / pv : maturityYears;
  const ytm = calculateNelsonSiegelZeroRate(maturityYears, params) + spread;
  const modifiedDuration = macaulayDuration / (1 + ytm);
  // DV01 = Dollar Value of 01 bp (1 bp change on $100 face value)
  const dv01 = (pv * modifiedDuration * 0.0001);

  return {
    price: pv,
    yieldToMaturity: ytm,
    macaulayDuration,
    modifiedDuration,
    dv01,
  };
}
