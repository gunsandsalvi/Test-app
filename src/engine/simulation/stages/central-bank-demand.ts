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
import { transferHolding } from '../../ledger/holdings-ledger';
import type { PartyRef } from '../../ledger/party';
import type { V2World } from '../../../engine2/world';
import { centralBankPositions } from '../../sovereign-register';
import type { InstrumentId } from '../../../domain/ids';

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
  v2: V2World, regionId: RegionId,
  cb: CentralBank,
  bondIds: InstrumentId[],
  statKind: 'YIELD_LIKE' | 'PRICE_LIKE' = 'YIELD_LIKE'
): { participant: ClearingParticipant; orderedLocal: number } | null {
  const holdings = new Map<InstrumentId, number>();
  const demand = new Map<InstrumentId, ParticipantDemand>();
  let orderedLocal = 0;
  // §3.13-BOOK d3a: what it holds is its register rows' FACE — the auction clears face.
  const heldByBond = new Map<InstrumentId, number>();
  centralBankPositions(v2, regionId).forEach((p) => heldByBond.set(p.bondId, (heldByBond.get(p.bondId) ?? 0) + p.faceLocal));
  bondIds.forEach((key) => {
    const heldLocal = heldByBond.get(key) ?? 0;
    const orderLocal = Math.max(0, Number(cb.plannedPurchasesByBond?.[key]) || 0);
    orderedLocal += orderLocal;
    holdings.set(key, heldLocal);
    demand.set(key, {
      reservationStat: statKind === 'PRICE_LIKE' ? NO_RESERVATION_STAT : -NO_RESERVATION_STAT,
      maxHoldingLocal: heldLocal + orderLocal,
      // Full size at once: any positive range would make it price-sensitive.
      fullSizeStatRange: 1e-6,
      maxNetPurchaseLocal: orderLocal,
      // It does not sell what it already holds. Runoff happens through maturity, not the market
      // — a central bank selling its book outright is a rarer operation than QT and is not this.
      minHoldingLocal: heldLocal,
    });
  });
  if (orderedLocal <= 0) return null;
  return {
    participant: { id: CENTRAL_BANK_PARTICIPANT_ID, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand },
    orderedLocal,
  };
}

/**
 * §5-FINALIZATION step 13 (W2) / §3.13-BOOK d3a: THE CB'S FILLS, BOOKED. Each is a transfer from
 * the clearing house onto the central bank's register book — the wire and the row in one ledger
 * operation, the same `transferHolding` every other holder's paper moves by. No cash is debited:
 * it paid with reserves it created, which is what makes a central-bank purchase grow the
 * monetary base instead of moving money between holders; the sellers' cash legs are the calling
 * stage's. `newHoldings` is the auction's face per bond, before against after. Returns what it
 * bought, in face.
 */
export function bookCentralBankFills(
  v2: V2World, regionId: RegionId, bondIds: InstrumentId[],
  newHoldings: Map<InstrumentId, number>, reason: string
): number {
  const heldByBond = new Map<InstrumentId, number>();
  centralBankPositions(v2, regionId).forEach((p) => heldByBond.set(p.bondId, (heldByBond.get(p.bondId) ?? 0) + p.faceLocal));
  const house: PartyRef = { kind: 'CLEARING_HOUSE', region: regionId };
  const cbParty: PartyRef = { kind: 'CENTRAL_BANK', region: regionId };
  let purchasedLocal = 0;
  bondIds.forEach((id) => {
    const filledLocal = newHoldings.get(id);
    if (filledLocal === undefined) return;
    const deltaLocal = filledLocal - (heldByBond.get(id) ?? 0);
    purchasedLocal += deltaLocal;
    if (!(Math.abs(deltaLocal) > 1)) return;
    // The primary slice books at cost, and the auction's face IS the cost at par here — the
    // row is marked to the session's print at the close like every other row.
    const spec = { instrumentType: 'GOV_BOND' as const, instrumentId: id, issuerRegion: regionId, valueLocal: Math.abs(deltaLocal), units: Math.abs(deltaLocal) };
    if (deltaLocal > 0) transferHolding(v2, house, cbParty, spec, reason);
    else transferHolding(v2, cbParty, house, spec, reason);
  });
  return purchasedLocal;
}
