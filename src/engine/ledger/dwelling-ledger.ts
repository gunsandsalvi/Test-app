/**
 * THE DWELLING LEDGER (§3.26b-i). A dwelling changing hands is a numbered wire — kind HOUSE, the
 * asset the region's dwellings, the quantity in units, the price what it was struck at — on the
 * kind `ledger/wire.ts` declared and nothing ever wrote. The first writer is the household
 * sector's purchase of a new dwelling at the goods auction: the GOOD wire there is the build
 * consumed on receipt (W4's sink), and this is the asset that now has an owner. The audit's W7
 * closes the identity per region: Δ(owner-occupied units) = HOUSE wires in − out.
 */
import { wire } from './wire';
import { internReason } from '../simulation/stages/settlement';
import type { PartyRef } from './party';
import type { RegionId } from '../../domain/geography';
import { dwellingAssetOf } from '../../domain/housing';

/** Dwellings move from one party to another, at the price they cleared at. Returns the wire
 *  number (−1 when nothing moved). */
export function moveDwellings(from: PartyRef, to: PartyRef, region: RegionId, units: number, unitPriceLocal: number, reason: string): number {
  if (!(units > 0)) return -1;
  return wire({ from, to, kind: 'HOUSE', asset: dwellingAssetOf(region), quantity: units, priceLocal: Math.max(0, unitPriceLocal), reason }, internReason);
}
