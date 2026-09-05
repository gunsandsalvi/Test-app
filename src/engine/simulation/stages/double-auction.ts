/**
 * The one double auction the real-economy markets clear through.
 *
 * `financial-clearing-engine.ts` prices a demand SCHEDULE — every participant posts a reservation
 * level and a size to scale in over, and the solve bisects for the level where demand equals the
 * float. That is the right mechanism for a security, where a holder's appetite genuinely slopes
 * with the price it is offered.
 *
 * This is the other shape, and the goods market has always used it: discrete bids and offers with
 * a reservation each, a clearing price where the two curves cross, and PRO-RATA allocation among
 * everyone in the money on the constrained side. Allocation used to be the walk itself — indices
 * draining the sorted arrays in order — which meant a participant sorted near the back could be
 * shut out entirely even when aggregate supply and demand balanced exactly. It is pro rata now,
 * the way real double auctions and oversubscribed allocations actually work.
 *
 * It is extracted here because XB3a gave the model a second market of this shape: FREIGHT, where
 * carriers offer real capacity at their own marginal cost and shippers bid the surplus a route
 * saves them. Two copies of a clearing rule is how the two drift apart (§7.5, §7.9), and a
 * market's price is not the place to find out that they did.
 */

import { defect } from '../../../domain/defect';
import { sortIndexByKey } from './financial-clearing-engine';

export interface AuctionBid {
  /** Whatever the caller needs to settle against — a ticker, a lane, an aggregate's key. */
  key: string;
  quantity: number;
  maxPrice: number;
}

export interface AuctionOffer {
  key: string;
  quantity: number;
  minPrice: number;
}

export interface AuctionFill {
  key: string;
  quantity: number;
  amount: number;
}

/** Who supplied what to whom, at the cleared price. */
interface AuctionLot {
  buyerKey: string;
  sellerKey: string;
  quantity: number;
}

interface AuctionResult {
  clearedPrice: number;
  clearedQuantity: number;
  /** Every filled seller and buyer, keyed. Callers settle from these. */
  sales: Map<string, AuctionFill>;
  purchases: Map<string, AuctionFill>;
  /** Lots grouped by buyer, so a buyer can see each real counterparty it bought from. */
  lotsByBuyer: Map<string, AuctionLot[]>;
  /** The entries that cleared, for callers that form relationships out of who transacted. */
  inMoneyBids: AuctionBid[];
  inMoneyOffers: AuctionOffer[];
}

/** A quantity small enough that carrying it costs more than it is worth. Not a floor on a price. */
const NEGLIGIBLE = 0.0001;

/** Ascending stable sort of `arr` by the parallel `keys`, permuting `arr` in place. */
function sortInPlaceByKey<T>(arr: T[], keys: number[]): void {
  const idx = sortIndexByKey(keys, arr.length);
  const copy = arr.slice();
  for (let i = 0; i < arr.length; i++) arr[i] = copy[idx[i]];
}

function emptyAuctionResult(anchorPrice: number): AuctionResult {
  return {
    clearedPrice: anchorPrice,
    clearedQuantity: 0,
    sales: new Map(),
    purchases: new Map(),
    lotsByBuyer: new Map(),
    inMoneyBids: [],
    inMoneyOffers: [],
  };
}

/**
 * Clear one book.
 *
 * `anchorPrice` is what the price stays at when nothing trades — the market's own last print, not
 * a bound the solve is allowed to return as a result (§7.21, and §7.75 where the same error was
 * made a second time in a new market).
 */
export function clearDoubleAuction(
  bids: AuctionBid[],
  offers: AuctionOffer[],
  anchorPrice: number
): AuctionResult {
  if (bids.length === 0 || offers.length === 0) return emptyAuctionResult(anchorPrice);

  // SCALE: sort through a numeric key array instead of a property-loading comparator (the
  // profiler put these two sorts at ~10 ms/week across the books). The index tiebreak
  // reproduces the stable sort's equal-price order exactly, and the arrays are permuted in
  // place so callers still see the sorted originals.
  sortInPlaceByKey(bids, bids.map(b => -b.maxPrice));
  sortInPlaceByKey(offers, offers.map(o => o.minPrice));

  // Discovery only: this walk finds the price and the volume, never who gets how much.
  let clearedPrice = anchorPrice;
  let clearedQuantity = 0;
  {
    let bidIdx = 0;
    let offerIdx = 0;
    const remainingBid = bids.map(b => b.quantity);
    const remainingOffer = offers.map(o => o.quantity);
    let guard = 0;
    while (bidIdx < bids.length && offerIdx < offers.length) {
      // §3.18-iii: a walk that does not advance is a defect at the site, never a silent break —
      // every step below moves one index, so the walk cannot take more steps than there are orders.
      if (guard++ > bids.length + offers.length) defect('double auction: the discovery walk did not advance');
      const bid = bids[bidIdx];
      const offer = offers[offerIdx];
      if (bid.maxPrice < offer.minPrice) break;
      const transact = Math.min(remainingBid[bidIdx], remainingOffer[offerIdx]);
      if (!isFinite(transact) || isNaN(transact) || transact <= 0) {
        bidIdx++;
        offerIdx++;
        continue;
      }
      clearedPrice = (bid.maxPrice + offer.minPrice) / 2;
      clearedQuantity += transact;
      remainingBid[bidIdx] -= transact;
      remainingOffer[offerIdx] -= transact;
      if (remainingBid[bidIdx] <= NEGLIGIBLE) bidIdx++;
      if (remainingOffer[offerIdx] <= NEGLIGIBLE) offerIdx++;
    }
  }

  const result = emptyAuctionResult(clearedPrice);
  result.clearedQuantity = clearedQuantity;
  result.inMoneyBids = bids.filter(b => b.maxPrice >= clearedPrice);
  result.inMoneyOffers = offers.filter(o => o.minPrice <= clearedPrice);
  if (clearedQuantity <= NEGLIGIBLE) return result;

  const totalBidQty = result.inMoneyBids.reduce((s, b) => s + b.quantity, 0);
  const totalOfferQty = result.inMoneyOffers.reduce((s, o) => s + o.quantity, 0);
  const bidFill = totalBidQty > 0 ? Math.min(1, clearedQuantity / totalBidQty) : 0;
  const offerFill = totalOfferQty > 0 ? Math.min(1, clearedQuantity / totalOfferQty) : 0;

  const add = (into: Map<string, AuctionFill>, key: string, quantity: number) => {
    const existing = into.get(key);
    if (existing) { existing.quantity += quantity; existing.amount += quantity * clearedPrice; }
    else into.set(key, { key, quantity, amount: quantity * clearedPrice });
  };
  result.inMoneyOffers.forEach(o => {
    const filled = o.quantity * offerFill;
    if (filled > NEGLIGIBLE) add(result.sales, o.key, filled);
  });
  result.inMoneyBids.forEach(b => {
    const filled = b.quantity * bidFill;
    if (filled > NEGLIGIBLE) add(result.purchases, b.key, filled);
  });

  // Pro-rata clearing does not pair a specific buyer with a specific seller, but the quantities
  // on both sides are fully known, so a northwest-corner walk produces a real, quantity-consistent
  // pairing — the assumption a clearinghouse itself settles on, not an invented attribution. It is
  // what tells a buyer who its inputs came from, and (XB3a) which side of a border they crossed.
  const sellersLeft = result.inMoneyOffers
    .map(o => ({ key: o.key, qty: o.quantity * offerFill }))
    .filter(s => s.qty > NEGLIGIBLE);
  const buyersLeft = result.inMoneyBids
    .map(b => ({ key: b.key, qty: b.quantity * bidFill }))
    .filter(b => b.qty > NEGLIGIBLE);
  let si = 0, bi = 0;
  while (si < sellersLeft.length && bi < buyersLeft.length) {
    const s = sellersLeft[si], b = buyersLeft[bi];
    const qty = Math.min(s.qty, b.qty);
    if (qty > NEGLIGIBLE) {
      const bucket = result.lotsByBuyer.get(b.key);
      const lot: AuctionLot = { buyerKey: b.key, sellerKey: s.key, quantity: qty };
      if (bucket) bucket.push(lot); else result.lotsByBuyer.set(b.key, [lot]);
    }
    s.qty -= qty; b.qty -= qty;
    if (s.qty <= NEGLIGIBLE) si++;
    if (b.qty <= NEGLIGIBLE) bi++;
  }

  return result;
}
