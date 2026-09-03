/** The one place a price is derived from a rate. Nothing here reads the world. */
export { discountFactor, annuityFactor, levelPaymentFactor, presentValuePerFace } from './discount';
export { zeroRateAt, priceFromSpreadBps, spreadBpsFromPrice } from './bond';
export type { ZeroCurve, PaperTerms } from './bond';
