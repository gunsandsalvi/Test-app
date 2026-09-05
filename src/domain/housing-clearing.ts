/**
 * §3.26b-ii — THE HOUSE PRICE IS A BOOK.
 *
 * The affordability walk priced the marginal buyer honestly and nobody transacted: the week's
 * supply was absorbed tier by tier and the price was what the last buyer needed to bid, but no
 * seller had a reservation and no offer could go unsold. Here the two sides are named, in UNITS:
 * the OFFERS are the owners whose tenure ends this week (the turnover the banks measure off their
 * own vintages), each reserving at what it must fetch — the mortgage payoff per dwelling off the
 * vintage cross-section the bank pass publishes (`sellerPayoffLadderOf`), and never below what a
 * dwelling costs to build (the construction sector's own cleared price, §7.130) — plus the
 * builders' completions at the build cost; the BIDS are the wealth tiers, each at what it can
 * borrow at the keenest quote, for the households of its own that move. The cross is uniform
 * price: the units clear where a bid meets a reservation, the price is the last buyer's bid that
 * did, and an offer no bid reaches does not clear — volumes collapse before prices (housing B4).
 * A week in which nothing clears has no print, and the caller keeps last week's.
 */

export interface DwellingOffer { units: number; reservationLocal: number }
export interface DwellingBid { units: number; maxPriceLocal: number }

export interface DwellingBook {
  /** The last buyer's bid that met a reservation; undefined when nothing cleared. */
  priceLocal: number | undefined;
  unitsCleared: number;
  unitsOffered: number;
  unitsBid: number;
}

/** A uniform-price cross of bids (highest first) against offers (cheapest first). */
export function clearDwellings(offers: readonly DwellingOffer[], bids: readonly DwellingBid[]): DwellingBook {
  const asks = offers.filter((o) => o.units > 0).sort((a, b) => a.reservationLocal - b.reservationLocal);
  const wants = bids.filter((b) => b.units > 0).sort((a, b) => b.maxPriceLocal - a.maxPriceLocal);
  const unitsOffered = asks.reduce((a, o) => a + o.units, 0);
  const unitsBid = wants.reduce((a, b) => a + b.units, 0);
  let bi = 0, oi = 0;
  let bidLeft = wants[0]?.units ?? 0, askLeft = asks[0]?.units ?? 0;
  let unitsCleared = 0;
  let priceLocal: number | undefined;
  while (bi < wants.length && oi < asks.length) {
    if (wants[bi].maxPriceLocal < asks[oi].reservationLocal) break;
    const q = Math.min(bidLeft, askLeft);
    unitsCleared += q;
    priceLocal = wants[bi].maxPriceLocal;
    bidLeft -= q; askLeft -= q;
    if (bidLeft <= 1e-9) { bi++; bidLeft = wants[bi]?.units ?? 0; }
    if (askLeft <= 1e-9) { oi++; askLeft = asks[oi]?.units ?? 0; }
  }
  return { priceLocal: unitsCleared > 0 ? priceLocal : undefined, unitsCleared, unitsOffered, unitsBid };
}

/** One rung of what the owners must fetch: the dwellings a vintage is secured on, and the loan
 *  left per dwelling — measured off the book by the bank pass, read by next week's book. */
export interface SellerPayoffRung { units: number; payoffLocal: number }

/** The vintage cross-section as a payoff ladder: each vintage was written on
 *  `originationCollateral / originationHomePrice` dwellings, and what is left of its principal
 *  is what each of them must fetch to discharge the loan. */
export function sellerPayoffLadderOf(
  vintages: readonly { principalLocal: number; originationCollateralLocal: number; originationHomePriceLocal: number }[]
): SellerPayoffRung[] {
  const out: SellerPayoffRung[] = [];
  for (const v of vintages) {
    if (!(v.principalLocal > 0) || !(v.originationHomePriceLocal > 0)) continue;
    const units = Math.max(0, v.originationCollateralLocal) / v.originationHomePriceLocal;
    if (!(units > 0)) continue;
    out.push({ units, payoffLocal: v.principalLocal / units });
  }
  return out;
}

/**
 * The week's offers. The owners whose tenure ends are drawn from every owner alike, so the
 * mortgaged rungs and the outright owners each put up their share; a rung reserves at its payoff
 * or the build cost, whichever is higher; an outright owner and a builder's completion at the
 * build cost. Before the first bank pass has published a ladder every owner is treated as
 * outright (§7.4: the seed stands in until the measurement exists).
 */
export function dwellingOffersOf(args: {
  ownerOccupiedUnits: number;
  /** The share of owners that moves this week — the measured annual turnover over 52. */
  turnoverShareThisWeek: number;
  sellerPayoffLadder?: readonly SellerPayoffRung[];
  buildCostLocal: number;
  /** The builders' completions bought this week: new dwellings, at the build cost. */
  newUnits: number;
}): DwellingOffer[] {
  const owners = Math.max(0, args.ownerOccupiedUnits);
  const share = Math.max(0, args.turnoverShareThisWeek);
  const floor = Math.max(0, args.buildCostLocal);
  const ladder = args.sellerPayoffLadder ?? [];
  const mortgagedUnits = ladder.reduce((a, r) => a + r.units, 0);
  // The books can carry more dwellings than the register (a seed's rounding): then every owner is
  // mortgaged, pro rata, and nobody is outright.
  const scale = mortgagedUnits > owners && mortgagedUnits > 0 ? owners / mortgagedUnits : 1;
  const offers: DwellingOffer[] = ladder
    .map((r) => ({ units: r.units * scale * share, reservationLocal: Math.max(floor, r.payoffLocal) }))
    .filter((o) => o.units > 0);
  const outright = Math.max(0, owners - mortgagedUnits * scale) * share;
  if (outright > 0) offers.push({ units: outright, reservationLocal: floor });
  if (args.newUnits > 0) offers.push({ units: args.newUnits, reservationLocal: floor });
  return offers;
}
