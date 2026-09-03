/**
 * Analytical Black-Scholes-Merton (BSM) Options Pricing and Greek Engine
 */

// Standard normal cumulative distribution function (CDF) approximation (Abramowitz & Stegun)
export function normalCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.3989422804014327; // 1 / sqrt(2 * pi)

  if (x >= 0) {
    const k = 1.0 / (1.0 + p * x);
    const poly = ((((b5 * k + b4) * k + b3) * k + b2) * k + b1) * k;
    return 1.0 - c * Math.exp(-0.5 * x * x) * poly;
  } else {
    const k = 1.0 / (1.0 - p * x);
    const poly = ((((b5 * k + b4) * k + b3) * k + b2) * k + b1) * k;
    return c * Math.exp(-0.5 * x * x) * poly;
  }
}

// Standard normal probability density function (PDF)
export function normalPdf(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

export interface BsmGreeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // 1-week theta
  vega: number; // 1% change in vol
  rho: number;
}

/**
 * Calculates BSM option price and analytical Greeks
 * @param S Current underlying price
 * @param K Strike price
 * @param T Time to expiry in years
 * @param r Risk-free rate (annual)
 * @param sigma Implied volatility (annual)
 * @param type 'CALL' | 'PUT'
 * @param q Dividend yield or foreign interest rate
 */
export function calculateBlackScholesGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: 'CALL' | 'PUT',
  q: number = 0
): BsmGreeks {
  if (T <= 0.0001) {
    const intrinsic = type === 'CALL' ? Math.max(0, S - K) : Math.max(0, K - S);
    return {
      price: intrinsic,
      delta: type === 'CALL' ? (S > K ? 1 : 0) : (S < K ? -1 : 0),
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
    };
  }

  const vol = Math.max(0.01, sigma);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  const exp_qT = Math.exp(-q * T);
  const exp_rT = Math.exp(-r * T);
  const pdf_d1 = normalPdf(d1);

  let price: number, delta: number, rho: number;

  if (type === 'CALL') {
    price = S * exp_qT * normalCdf(d1) - K * exp_rT * normalCdf(d2);
    delta = exp_qT * normalCdf(d1);
    rho = (K * T * exp_rT * normalCdf(d2)) / 100; // Per 1% interest rate move
  } else {
    price = K * exp_rT * normalCdf(-d2) - S * exp_qT * normalCdf(-d1);
    delta = exp_qT * (normalCdf(d1) - 1);
    rho = (-K * T * exp_rT * normalCdf(-d2)) / 100;
  }

  const gamma = (exp_qT * pdf_d1) / (S * vol * sqrtT);
  // Vega per 1% change in vol
  const vega = (S * exp_qT * sqrtT * pdf_d1) / 100;

  // Annual Theta, then converted to 1-week theta (/ 52)
  const term1 = -(S * exp_qT * pdf_d1 * vol) / (2 * sqrtT);
  let thetaAnnual: number;
  if (type === 'CALL') {
    thetaAnnual = term1 - r * K * exp_rT * normalCdf(d2) + q * S * exp_qT * normalCdf(d1);
  } else {
    thetaAnnual = term1 + r * K * exp_rT * normalCdf(-d2) - q * S * exp_qT * normalCdf(-d1);
  }
  const thetaWeekly = thetaAnnual / 52;

  return {
    price: Math.max(0.001, price),
    delta,
    gamma,
    theta: thetaWeekly,
    vega,
    rho,
  };
}
