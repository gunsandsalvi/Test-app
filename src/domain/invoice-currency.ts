/**
 * Which currency a cross-border trade is invoiced in (XB3a-5).
 *
 * Nothing here assigns one, and nothing here scores one either. An earlier attempt gave the four
 * currencies weights on three axes and took an argmax; that is a formula wearing a mechanism's
 * clothes, and the corner solution it produced was arithmetic between numbers I had invented
 * rather than anything about the world (§7.76's correction). This is the mechanism instead.
 *
 * **An invoice currency is a contract term, and it exists because whoever holds a claim in money
 * that is not theirs bears exchange risk between delivery and payment.** That risk costs real
 * money to carry. So the two parties do what two parties splitting a surplus do: they denominate
 * in whichever currency makes the total cost of that risk smallest, and bargain over the price.
 *
 * The cost is not a parameter. XB6 gave every pair its own book, so the model finally measures
 * how deep each one is — the share of a pair's own weekly flow its market could not absorb. A
 * pair that clears completely is cheap to bear risk in; one where the dealers are left carrying
 * is dear.
 *
 * That is what makes a VEHICLE currency possible rather than assumed. Invoicing in the seller's
 * or the buyer's money puts the whole exposure on the direct pair. Invoicing in a third puts two
 * smaller exposures on two other pairs — worse when the direct pair is deep, better when it is
 * thin and the routes through the third are not. Nobody has to be told that the dollar is a
 * vehicle; if it is, it is because its pairs are the deep ones, and if on some seed they are not,
 * it will not be.
 *
 * Between the two home currencies the cost is the same pair either way, so cost does not decide
 * it — POWER does, and the power is measured: whichever side of that week's goods market is
 * short is the side that can insist on its own money.
 */

import { RegionId, CURRENCY_BY_REGION } from './geography';

/** Key a pair the way the FX books key it, whichever way round that book is quoted. */
export function pairDepthKey(a: RegionId, b: RegionId, quotedPairs: { base: RegionId; quote: RegionId }[]): string {
  const forward = quotedPairs.find(p => p.base === a && p.quote === b);
  if (forward) return `${a}/${b}`;
  return `${b}/${a}`;
}

/**
 * What it costs to carry exposure between two currencies, as a pure share: the fraction of that
 * pair's own flow its market could not absorb this week. Zero when a currency is exposed to
 * itself — there is no risk to carry.
 */
export function exposureCost(
  a: RegionId,
  b: RegionId,
  illiquidity: Record<string, number>,
  quotedPairs: { base: RegionId; quote: RegionId }[]
): number {
  if (a === b) return 0;
  const depth = illiquidity[pairDepthKey(a, b, quotedPairs)];
  return typeof depth === 'number' && isFinite(depth) ? Math.max(0, depth) : 0;
}

/**
 * The invoice currency for one cross-border trade, as the region whose money it is.
 *
 * `sellerIsShort` is measured, not assumed: it is whether that week's book for the good left
 * unfilled demand rather than unsold supply. A seller in a short market can insist on its own
 * money; a buyer in a glutted one can.
 */
export function chooseInvoiceRegion(args: {
  sellerRegion: RegionId;
  buyerRegion: RegionId;
  candidates: RegionId[];
  illiquidity: Record<string, number>;
  quotedPairs: { base: RegionId; quote: RegionId }[];
  sellerIsShort: boolean;
}): RegionId {
  const { sellerRegion, buyerRegion, candidates, illiquidity, quotedPairs, sellerIsShort } = args;

  // The total exchange risk the pair has to carry under each possible denomination: whatever
  // each side has to bear to end up in its own money.
  const totalCost = (invoice: RegionId) =>
    exposureCost(sellerRegion, invoice, illiquidity, quotedPairs)
    + exposureCost(buyerRegion, invoice, illiquidity, quotedPairs);

  let best: RegionId = sellerIsShort ? sellerRegion : buyerRegion;
  let bestCost = totalCost(best);
  candidates.forEach(candidate => {
    const cost = totalCost(candidate);
    if (cost < bestCost) { bestCost = cost; best = candidate; }
    // A tie between the two parties' own currencies is not decided by cost — it is the same pair
    // either way. It is decided by which of them can refuse to carry the risk.
    else if (cost === bestCost && candidate !== best) {
      const preferred = sellerIsShort ? sellerRegion : buyerRegion;
      if (candidate === preferred) best = candidate;
    }
  });
  return best;
}

export function invoiceCurrencyOf(region: RegionId): string {
  return CURRENCY_BY_REGION[region];
}
