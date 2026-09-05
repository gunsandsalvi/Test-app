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
import { asInstrumentId, type EntityId, type InstrumentId } from '../../domain/ids';
import { mergePlant, type PlantVintage, type PlantFlow } from '../../domain/plant';
import { V2World, internType, typeRefOf } from '../../engine2/world';
import { mutableHoldings, bookHeadOf, openKindRow, appendLot, recycleLots, relinkBook, instrumentIdAt, markBookDirty } from '../../engine2/holdings';

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

// ---- §3.13-BOOK g-ii — THE PLANT ROWS. A firm's plant is rows on its own register book: one
// row per capital good AND life (`plantInstrumentId`), in units of COST, whose lots are the
// vintages — the cost each entered service at, the week it entered, price 1 (a register kept in
// cost is a register nobody can re-mark; what a later buyer paid for a vintage is on its wire,
// `movePlant`, and W6 reads it there). `plantVintagesOf` reads the rows back as the vintage list
// `domain/plant.ts` computes on, and `writePlantRows` is the ONE writer: it relinks the firm's
// plant rows to exactly a vintage list, so every writer of a firm's plant keeps the register by
// handing it the list it computed (writers first, f1's discipline) — the same columns a bond's or
// a good's lots live in, and `O14`'s sum rule holds for them too.
// ----

export const PLANT_KIND = 'PLANT';
const PLANT_INSTRUMENT_PREFIX = 'PLANT:';
/** A firm's plant of one capital good with one life: `PLANT:<kind>:<life years>`. */
export const plantInstrumentId = (kind: string, usefulLifeYears: number): InstrumentId =>
  asInstrumentId(`${PLANT_INSTRUMENT_PREFIX}${kind}:${usefulLifeYears}`);
const plantInstrumentParts = (id: string): { kind: string; usefulLifeYears: number } => {
  const rest = id.slice(PLANT_INSTRUMENT_PREFIX.length);
  const at = rest.lastIndexOf(':');
  return { kind: rest.slice(0, at), usefulLifeYears: Number(rest.slice(at + 1)) };
};

/** The firm's plant as the vintage list its rows hold — in register order, oldest first, equal
 *  (week, life, kind) folded, exactly the shape `domain/plant.ts` keeps. */
export function plantVintagesOf(v2: V2World, companyId: EntityId): PlantVintage[] {
  const H = v2.holdings;
  const ref = typeRefOf(v2, PLANT_KIND);
  if (ref < 0) return [];
  const out: PlantVintage[] = [];
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== ref) continue;
    const { kind, usefulLifeYears } = plantInstrumentParts(instrumentIdAt(v2, r));
    for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) {
      out.push({ costLocal: H.lotUnits[l], kind, enteredServiceWeek: H.lotWeek[l], usefulLifeYears });
    }
  }
  return mergePlant(out, []);
}

/** THE ONE WRITER: the firm's plant rows become exactly `vintages` — a row per (kind, life), a
 *  lot per vintage at its own service week, every other row on the book untouched. An empty list
 *  takes the plant rows off the book. */
export function writePlantRows(v2: V2World, companyId: EntityId, region: string, vintages: readonly PlantVintage[]): void {
  const H = mutableHoldings(v2);
  const ref = internType(v2, PLANT_KIND);
  const byInstrument = new Map<string, PlantVintage[]>();
  for (const v of mergePlant(vintages, [])) {
    const id = plantInstrumentId(v.kind, v.usefulLifeYears) as string;
    const list = byInstrument.get(id);
    if (list) list.push(v); else byInstrument.set(id, [v]);
  }
  const existing = new Map<string, number>();
  const others: number[] = [];
  for (let r = bookHeadOf(v2, companyId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === ref) existing.set(instrumentIdAt(v2, r) as string, r); else others.push(r);
  }
  const kept: number[] = [];
  byInstrument.forEach((list, id) => {
    let r = existing.get(id);
    if (r === undefined) r = openKindRow(v2, companyId, PLANT_KIND, id, region);
    else {
      const lots: number[] = [];
      for (let l = H.lotHead[r]; l >= 0; l = H.lotNext[l]) lots.push(l);
      recycleLots(v2, lots);
      H.lotHead[r] = -1; H.lotTail[r] = -1;
    }
    let costLocal = 0;
    for (const v of list) { appendLot(v2, r, v.costLocal, 1, v.enteredServiceWeek); costLocal += v.costLocal; }
    H.units[r] = costLocal; H.qtyLocal[r] = costLocal; H.shares[r] = Number.NaN;
    kept.push(r);
  });
  relinkBook(v2, companyId, [...others, ...kept]);
  markBookDirty(v2, companyId);
}
