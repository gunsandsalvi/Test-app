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
import { RegionId } from '../../../domain/geography';
import { ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { clearedBookDelta } from '../../ledger/holdings-ledger';

export const CENTRAL_BANK_PARTICIPANT_ID = 'CENTRAL-BANK';

/** No level at which it stops buying — the order is a quantity, not a view.
 *
 *  §3.13-SOV row 4: WHICH SIGN MEANS "ALWAYS" DEPENDS ON THE BOOK. A YIELD_LIKE book's demand
 *  rises with the statistic, so buying at any level is a reservation at MINUS this; a PRICE_LIKE
 *  book's demand falls with it, so the same intent is PLUS this. Getting it backwards does not
 *  fail loudly — the central bank simply never fills, and its policy quantity silently leaves the
 *  auction. */
const NO_RESERVATION_STAT = 1e9;

/**
 * The CB's participant for one book, or null when it has no order this week — so a passive
 * central bank costs the auction nothing.
 *
 * `bondIds` are the instruments THIS auction prices (bonds in 07c, bills in 07f); the CB's
 * holdings in the other book pass through untouched, per the clearing-stage ownership rule.
 * §3.13-SOV row 3: the CB's book is keyed by the same bond ids every other holder's is, so there
 * is no key to translate — the `instrumentIdFor` mapper both callers passed was the identity.
 */
export function centralBankParticipant(
  cb: CentralBank,
  bondIds: string[],
  statKind: 'YIELD_LIKE' | 'PRICE_LIKE' = 'YIELD_LIKE'
): { participant: ClearingParticipant; orderedUSD: number } | null {
  const holdings = new Map<string, number>();
  const demand = new Map<string, ParticipantDemand>();
  let orderedUSD = 0;
  bondIds.forEach((key) => {
    const heldLocal = Number(cb.sovereignHoldingsByBond?.[key]) || 0;
    const orderUSD = Math.max(0, Number(cb.plannedPurchasesByBond?.[key]) || 0);
    orderedUSD += orderUSD;
    holdings.set(key, heldLocal);
    demand.set(key, {
      reservationStat: statKind === 'PRICE_LIKE' ? NO_RESERVATION_STAT : -NO_RESERVATION_STAT,
      maxHoldingLocal: heldLocal + orderUSD,
      // Full size at once: any positive range would make it price-sensitive.
      fullSizeStatRange: 1e-6,
      maxNetPurchaseUSD: orderUSD,
      // It does not sell what it already holds. Runoff happens through maturity, not the market
      // — a central bank selling its book outright is a rarer operation than QT and is not this.
      minHoldingUSD: heldLocal,
    });
  });
  if (orderedUSD <= 0) return null;
  return {
    participant: { id: CENTRAL_BANK_PARTICIPANT_ID, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand },
    orderedUSD,
  };
}

/** §5-FINALIZATION step 13 (W2): the CB's fills as wires from the clearing house — the paper it
 *  bought with the reserves it created; the bonds this auction priced, before against after. */
export function wireCentralBankFills(
  regionId: RegionId, cb: CentralBank, bondIds: string[],
  newHoldings: Map<string, number>, reason: string
): void {
  const before = new Map<string, { valueLocal: number }>(), after = new Map<string, { valueLocal: number }>();
  bondIds.forEach((key) => {
    const id = key;
    const filledLocal = newHoldings.get(id);
    if (filledLocal === undefined) return;
    before.set(id, { valueLocal: Number(cb.sovereignHoldingsByBond?.[key]) || 0 });
    after.set(id, { valueLocal: filledLocal });
  });
  clearedBookDelta({ kind: 'CENTRAL_BANK', region: regionId }, regionId, 'GOV_BOND', before, after, () => undefined, reason);
}

/**
 * Apply the CB's fills. The bond it bought lands on the asset side; the cash it paid was created,
 * so nothing is debited. The seller's own cash leg is already credited by the calling stage.
 */
export function applyCentralBankFills(
  cb: CentralBank,
  bondIds: string[],
  newHoldings: Map<string, number>
): number {
  let purchasedUSD = 0;
  const book = { ...cb.sovereignHoldingsByBond };
  bondIds.forEach((key) => {
    const filledLocal = newHoldings.get(key);
    if (filledLocal === undefined) return;
    purchasedUSD += filledLocal - (Number(book[key]) || 0);
    book[key] = filledLocal;
  });
  cb.sovereignHoldingsByBond = book;
  return purchasedUSD;
}
