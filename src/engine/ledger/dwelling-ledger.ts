/**
 * THE DWELLING LEDGER (§3.26b-i, §3.13-BOOK g-i). A dwelling changing hands is a numbered wire —
 * kind DWELLING, the asset the region's dwellings, the quantity in units, the price what it was
 * struck at — and the same operation moves the REGISTER: the household sector's book carries a
 * row of kind DWELLING whose lots are the houses at the price each was bought at (g-i; the row
 * replaced `HousingMarket.ownerOccupiedUnits`). A builder or a pool CREATES a dwelling — it keeps
 * no row of houses, so the placement is an issue, like a tranche's; a household that sells to a
 * party outside the sector retires it off the row; a sale inside the sector moves the row's lots
 * between regions. The audit's W7 closes the identity per region: Δ(the row's units) = DWELLING
 * wires in − out.
 */
import type { V2World } from '../../engine2/world';
import { typeRefOf } from '../../engine2/world';
import { bookHeadOf, rowUnits } from '../../engine2/holdings';
import type { PartyRef } from './party';
import type { RegionId } from '../../domain/geography';
import { dwellingInstrumentId } from '../../domain/housing';
import { householdBookId, issueHolding, retireHolding, transferHolding } from './holdings-ledger';

/** Dwellings move from one party to another, at the price they cleared at — the wire and the
 *  register row in one operation. Returns the wire number (−1 when nothing moved). */
export function moveDwellings(v2: V2World, from: PartyRef, to: PartyRef, region: RegionId, units: number, unitPriceLocal: number, reason: string): number {
  if (!(units > 0)) return -1;
  const spec = { instrumentType: 'DWELLING' as const, instrumentId: dwellingInstrumentId(region), issuerRegion: region, valueLocal: units * Math.max(0, unitPriceLocal), units };
  if (from.kind !== 'HOUSEHOLD') return issueHolding(v2, from, to, spec, reason);
  return to.kind === 'HOUSEHOLD' ? transferHolding(v2, from, to, spec, reason) : retireHolding(v2, from, to, spec, reason);
}

/** The household sector's dwellings: its DWELLING row's units — the one read every housing
 *  number is a read of (`domain/housing.ts`). */
export function dwellingUnitsOf(v2: V2World, region: RegionId): number {
  const H = v2.holdings;
  const ref = typeRefOf(v2, 'DWELLING');
  if (ref < 0) return 0;
  let units = 0;
  for (let r = bookHeadOf(v2, householdBookId(region)); r >= 0; r = H.next[r]) if (H.typeRef[r] === ref) units += rowUnits(H, r);
  return units;
}
