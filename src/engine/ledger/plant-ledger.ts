/**
 * THE PLANT LEDGER (§3.26-f-iii). Every move of plant between two parties is a numbered wire —
 * kind PLANT; the asset `PLANT` for vintages in service or `PLANT_QUEUE` for capital that has
 * arrived and is not yet plant; the quantity is the COST moved (gross book, the unit a register
 * is kept in, so a re-mark cannot move it); the price is the money per unit of cost the move was
 * struck at (an estate's cleared price of book; nothing, for a merger, a spin-off, a resolution
 * or a birth's carve-out, where the consideration is shares or the pool's own capital). What is
 * not a move — commissioning, wear-out, scrap, abandonment, a birth's minting — is a
 * TRANSFORMATION recorded on the same journal per firm, the way `goods-ledger.ts` records
 * production and scrappage, so the week's identity closes per firm (`audit/wires.ts` W6):
 *
 *   Δ(gross plant) = commissioned − retired − scrapped − abandoned + born + wires in − wires out
 *   Δ(queue)       = arrived − commissioned + queue wires in − queue wires out
 *
 * The seed's plant is an opening stock and writes nothing here (`the-seed.md` A3); the audit's
 * baseline is the seed's own snapshot.
 */
import { wire, activeWireJournal } from './wire';
import { internReason } from '../simulation/stages/settlement';
import type { PartyRef } from './party';
import type { EntityId } from '../../domain/ids';
import type { PlantVintage, PlantFlow } from '../../domain/plant';

export const PLANT_ASSET = 'PLANT';
export const PLANT_QUEUE_ASSET = 'PLANT_QUEUE';

function flowOf(companyId: EntityId): PlantFlow {
  const j = activeWireJournal();
  let f = j.plantFlows[companyId];
  if (!f) {
    f = { commissionedLocal: 0, retiredLocal: 0, scrappedLocal: 0, abandonedLocal: 0, bornLocal: 0, arrivedLocal: 0 };
    j.plantFlows[companyId] = f;
  }
  return f;
}

/** Vintages move from one party to another, at what was paid for them. Returns the wire number
 *  (−1 when nothing moved). */
export function movePlant(from: PartyRef, to: PartyRef, vintages: readonly PlantVintage[], paidLocal: number, reason: string): number {
  const costLocal = vintages.reduce((a, v) => a + v.costLocal, 0);
  if (!(costLocal > 0)) return -1;
  return wire({ from, to, kind: 'PLANT', asset: PLANT_ASSET, quantity: costLocal, priceLocal: Math.max(0, paidLocal) / costLocal, reason }, internReason);
}

/** Capital that has arrived and is not yet plant moves with its owner's books. */
export function movePlantQueue(from: PartyRef, to: PartyRef, lots: readonly { valueLocal: number }[], reason: string): number {
  const valueLocal = lots.reduce((a, l) => a + l.valueLocal, 0);
  if (!(valueLocal > 0)) return -1;
  return wire({ from, to, kind: 'PLANT', asset: PLANT_QUEUE_ASSET, quantity: valueLocal, priceLocal: 0, reason }, internReason);
}

/** A capital good landed and joined the construction queue (a transformation: the GOOD was consumed on receipt). */
export function arrivePlant(companyId: EntityId, valueLocal: number): void {
  if (valueLocal > 0) flowOf(companyId).arrivedLocal += valueLocal;
}
/** A lot entered service: out of the queue, onto the register as this week's vintage. */
export function commissionPlant(companyId: EntityId, costLocal: number): void {
  if (costLocal > 0) flowOf(companyId).commissionedLocal += costLocal;
}
/** Fully worn vintages left the register. */
export function retirePlant(companyId: EntityId, costLocal: number): void {
  if (costLocal > 0) flowOf(companyId).retiredLocal += costLocal;
}
/** A share of the plant was written off for good (§5-DYN's scrap). */
export function scrapPlant(companyId: EntityId, costLocal: number): void {
  if (costLocal > 0) flowOf(companyId).scrappedLocal += costLocal;
}
/** What a workout's last week could not sell — abandoned, not sold to nobody. */
export function abandonPlant(companyId: EntityId, costLocal: number): void {
  if (costLocal > 0) flowOf(companyId).abandonedLocal += costLocal;
}
/** Plant that came into existence with its owner and was moved from nobody — a birth the model
 *  MINTS rather than builds (an FDI subsidiary's opening plant). Recorded so the identity closes
 *  and the minting stays visible; a pool carve-out is a wire from the pool, not this. */
export function bornPlant(companyId: EntityId, costLocal: number): void {
  if (costLocal > 0) flowOf(companyId).bornLocal += costLocal;
}
