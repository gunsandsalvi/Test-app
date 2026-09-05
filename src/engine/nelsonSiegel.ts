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
 * Fits Nelson-Siegel beta0/beta1/beta2 (keeping lambda fixed) to a small set of real, observed
 * yields at given tenors via ordinary least squares — the standard real-world technique for
 * building a smooth curve from a handful of actually-cleared benchmark points (e.g. 2Y/5Y/10Y/
 * 30Y), so every consumer of calculateNelsonSiegelZeroRate at an arbitrary tenor rides on real
 * cleared prices rather than an independent macro formula. Wall Street: see
 * stages/07c-sovereign-bond-clearing.ts, which clears those benchmark points via the same real
 * supply/demand engine as every other asset class, then calls this to refit the curve.
 */
export function fitNelsonSiegelParams(
  observedPoints: { tenorYears: number; yield: number }[],
  lambda: number
): NelsonSiegelParams {
  // Design matrix rows: [1, f1(t), f2(t)] per NS's linear-in-beta structure at fixed lambda.
  const rows = observedPoints.map(({ tenorYears: t, yield: y }) => {
    const tau = Math.max(0.001, t) / lambda;
    const f1 = (1 - Math.exp(-tau)) / tau;
    const f2 = f1 - Math.exp(-tau);
    return { x: [1, f1, f2], y };
  });

  // Normal equations: (X^T X) beta = X^T y, a 3x3 solve.
  const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const Xty = [0, 0, 0];
  rows.forEach(({ x, y }) => {
    for (let i = 0; i < 3; i++) {
      Xty[i] += x[i] * y;
      for (let j = 0; j < 3; j++) XtX[i][j] += x[i] * x[j];
    }
  });

  const beta = solve3x3(XtX, Xty);
  if (!beta) {
    // Degenerate (e.g. all observed tenors identical) — fall back to a flat curve at the
    // average observed yield rather than propagate a non-finite fit.
    const avgYield = observedPoints.reduce((s, p) => s + p.yield, 0) / Math.max(1, observedPoints.length);
    return { beta0: avgYield, beta1: 0, beta2: 0, lambda };
  }
  return { beta0: beta[0], beta1: beta[1], beta2: beta[2], lambda };
}

function solve3x3(A: number[][], b: number[]): number[] | null {
  const det =
    A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) -
    A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) +
    A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  if (!isFinite(det) || Math.abs(det) < 1e-12) return null;

  const replaceCol = (col: number) => {
    const M = A.map((row) => [...row]);
    for (let i = 0; i < 3; i++) M[i][col] = b[i];
    return M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  };

  return [replaceCol(0) / det, replaceCol(1) / det, replaceCol(2) / det];
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

  for (let t = maturityYears; t > 0; t -= 1) {
    const baseZeroRate = calculateNelsonSiegelZeroRate(t, params);
    const effectiveRate = baseZeroRate + spread;
    const df = Math.exp(-effectiveRate * t);
    const cashFlow = t === maturityYears ? annualCoupon + 100 : annualCoupon;
    pv += cashFlow * df;
    weightedTime += t * cashFlow * df;
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
