/** The one place a price is derived from a rate. Nothing here reads the world. */
export { discountFactor, annuityFactor, levelPaymentFactor, presentValuePerFace } from './discount';
export { zeroRateAt, priceFromSpreadBps, spreadBpsFromPrice, priceFromYield, yieldFromPrice, dv01PerUnitFace } from './bond';
export type { ZeroCurve, PaperTerms } from './bond';
export { pricePerFace, COUPON_PERIOD_WEEKS } from './tranche';
export type { ClearedPaper } from './tranche';
