/**
 * DRV — HEDGING IS ONE DECISION, WHATEVER THE UNDERLYING. Every derivative book in this model
 * exists because somebody's own sheet cannot absorb an exposure, and the arithmetic of that
 * decision was written four times with four vocabularies (FX tolerance, futures concession,
 * swap absorbable-loss, CDS carryable). It is one rule with class-local inputs:
 *
 *   1. EXPOSURE — measured off the hedger's OWN books (rule 13; class-local: a sovereign book's
 *      repricing, a loan book's single name, next season's commodity spend, an invoice's
 *      currency). The measurement stays with each class's market stage, because it reads that
 *      class's books.
 *   2. ABSORBANCE — what the hedger can carry itself: covenant headroom for a corporate
 *      (corporate-financing's `exposureToHedgeUSD`), capital above the floor for a bank (07g),
 *      the large-exposure limit for a lender (cds.ts). Also the hedger's own, also class-local.
 *   3. NET THE STANDING BOOK (§7.241) — `standingCoverUSD`/`standingCoverUnits` in contract.ts,
 *      written once over the one book.
 *   4. THE WALK-AWAY — what removing the risk is WORTH, which is this module: the risk removed,
 *      priced at what carrying it costs the hedger. Past it, the hedger keeps the risk — which
 *      is what makes every hedge-demand curve slope without a posted tolerance anywhere.
 */

/**
 * The walk-away in PRICE terms, per unit of underlying: a consumer pays this much over expected
 * spot, a producer accepts this much under it — the capital the unhedged swing consumes over
 * the horizon, at the hedger's own cost of capital. (The futures book's concession, verbatim;
 * now every price-quoted hedge's.)
 */
export function hedgeConcessionPerUnit(args: {
  spotPrice: number;
  annualVol: number;
  costOfCapital: number;
  tenorYears: number;
}): number {
  const oneSigma = Math.max(0, args.annualVol) * Math.sqrt(Math.max(0, args.tenorYears));
  return Math.max(0, args.spotPrice) * Math.max(0, args.costOfCapital) * oneSigma;
}

/**
 * The walk-away in SPREAD terms, in bps of notional: the exposure's own annualised volatility,
 * scaled by the share of it the hedger's mandate or covenant says it must not run. A
 * liability-driven book hedging everything pays up to a full sigma; a book that hedges nothing
 * pays nothing. (The FX basis tolerance, verbatim; now every basis-priced hedge's.)
 */
export function hedgeToleranceBps(annualSigma: number, mustHedgeShare: number): number {
  return Math.max(0, annualSigma * 10000 * Math.max(0, Math.min(1, mustHedgeShare)));
}
