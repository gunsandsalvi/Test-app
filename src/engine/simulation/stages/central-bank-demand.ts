/**
 * PUB2b — the central bank as a bidder in the sovereign auctions.
 *
 * The CB posts a SIZE with no reservation level: it is not deciding what the paper is worth, it
 * is executing an open-market order. That is the same demand shape an index fund posts, and for
 * the same reason — neither is pricing.
 *
 * What makes the CB unique is the cash leg. Every other buyer pays out of a budget; the CB pays
 * with reserves it creates, so its fills are applied to the asset side with NO debit anywhere.
 * That is not a shortcut — reserve creation is literally what a central-bank purchase is, and it
 * is why QE grows the monetary base rather than moving money between holders.
 */

import { CentralBank } from '../../../domain/central-bank';
import { ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';

export const CENTRAL_BANK_PARTICIPANT_ID = 'CENTRAL-BANK';

/** No level at which it stops buying — the order is a quantity. */
const NO_RESERVATION_YIELD_BPS = 1e9;

/**
 * The CB's participant for one book, or null when it has no order this week — so a passive
 * central bank costs the auction nothing.
 *
 * `bucketKeys` are the buckets THIS auction prices (bonds in 07c, bills in 07f); the CB's
 * holdings in the other book pass through untouched, per the clearing-stage ownership rule.
 */
export function centralBankParticipant(
  cb: CentralBank,
  bucketKeys: string[],
  instrumentIdFor: (bucketKey: string) => string
): { participant: ClearingParticipant; orderedUSD: number } | null {
  const holdings = new Map<string, number>();
  const demand = new Map<string, ParticipantDemand>();
  let orderedUSD = 0;
  bucketKeys.forEach((key) => {
    const heldUSD = Number(cb.sovereignHoldingsByTenor?.[key]) || 0;
    const orderUSD = Math.max(0, Number(cb.plannedPurchasesByTenor?.[key]) || 0);
    orderedUSD += orderUSD;
    holdings.set(instrumentIdFor(key), heldUSD);
    demand.set(instrumentIdFor(key), {
      reservationStat: -NO_RESERVATION_YIELD_BPS,
      maxHoldingUSD: heldUSD + orderUSD,
      // Full size at once: any positive range would make it price-sensitive.
      fullSizeStatRange: 1e-6,
      maxNetPurchaseUSD: orderUSD,
      // It does not sell what it already holds. Runoff happens through maturity, not the market
      // — a central bank selling its book outright is a rarer operation than QT and is not this.
      minHoldingUSD: heldUSD,
    });
  });
  if (orderedUSD <= 0) return null;
  return {
    participant: { id: CENTRAL_BANK_PARTICIPANT_ID, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand },
    orderedUSD,
  };
}

/**
 * Apply the CB's fills. The bond it bought lands on the asset side; the cash it paid was created,
 * so nothing is debited. The seller's own cash leg is already credited by the calling stage.
 */
export function applyCentralBankFills(
  cb: CentralBank,
  bucketKeys: string[],
  instrumentIdFor: (bucketKey: string) => string,
  newHoldings: Map<string, number>
): number {
  let purchasedUSD = 0;
  const book = { ...cb.sovereignHoldingsByTenor };
  bucketKeys.forEach((key) => {
    const filledUSD = newHoldings.get(instrumentIdFor(key));
    if (filledUSD === undefined) return;
    purchasedUSD += filledUSD - (Number(book[key]) || 0);
    book[key] = filledUSD;
  });
  cb.sovereignHoldingsByTenor = book;
  return purchasedUSD;
}
