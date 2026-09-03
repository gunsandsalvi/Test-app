/**
 * THE SECURITIES LEDGER. The one place a register row moves, and every move a
 * numbered wire between two parties. A stage that wants a holding to change says WHO gives it
 * to WHOM, how much, at what price and why — exactly what it says for money — and gets a wire
 * number back. Direct writes to the store do not compile (`ReadonlyHoldingStore`).
 *
 * Operations:
 *   transferHolding — from one holder to another (a delivery in kind, a merger's share exchange)
 *   issueHolding    — from the issuer to a holder (a placement, a creation, a spin-off)
 *   retireHolding   — from a holder back to the issuer (a redemption, a buyback, a write-off)
 *   scaleHoldings   — every row of an issuer's instrument on a book scaled by a ratio, wired
 *                     against the issuer (the paying agent's pro-rata actions)
 *   clearedBookDelta — a clearing book's fills: the holder's new position against its old one,
 *                     wired against the clearing house, one wire per instrument
 *   markHolding     — a change of VALUE with no change of quantity: no wire (a mark is not a move;
 *                     P retires it when value becomes price × quantity by construction)
 */
import { V2World, internString } from '../../engine2/world';
import {
  HoldingStore, mutableHoldings, bookHeadOf, pushBookRow, relinkBook, markBookDirty, pruneEmptyRows, syncBookRows,
} from '../../engine2/holdings';
import { ItemizedHolding } from '../../domain/banking';
import { PartyRef } from './party';
import { wire, AssetKind, ASSET_KINDS } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { RegionId } from '../../domain/geography';
import { defect } from '../../domain/defect';

export type HoldingKind = ItemizedHolding['instrumentType'];

/** The wire's asset kind for a register row: the kinds the wire ledger names, else a contract. */
const kindOfType = (t: string): AssetKind => ((ASSET_KINDS as readonly string[]).includes(t) ? (t as AssetKind) : 'CONTRACT');

export interface HoldingSpec {
  instrumentType: HoldingKind;
  instrumentId: string;
  issuerRegion: RegionId;
  /** Notional / market value moved, USD. */
  valueUSD: number;
  /** Shares moved (equity, fund shares); undefined for notional-only paper. */
  shares?: number;
}

/** The register's own read of a party as a holder: only institutions hold register rows today. */
const holderIdOf = (p: PartyRef): string | undefined => (p.kind === 'INSTITUTION' ? p.id : undefined);

function priceOf(spec: HoldingSpec): { quantity: number; priceUSD: number } {
  if (spec.shares !== undefined && spec.shares > 0) return { quantity: spec.shares, priceUSD: spec.valueUSD / spec.shares };
  return { quantity: spec.valueUSD, priceUSD: 1 };
}

/** Add to (or open) the holder's row of this instrument. */
function creditRow(v2: V2World, holderId: string, spec: HoldingSpec): void {
  const H = mutableHoldings(v2);
  const tRef = internString(v2, spec.instrumentType), iRef = internString(v2, spec.instrumentId);
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    H.qtyUSD[r] += spec.valueUSD;
    if (spec.shares !== undefined) H.shares[r] = (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]) + spec.shares;
    markBookDirty(v2, holderId);
    return;
  }
  pushBookRow(v2, holderId, {
    instrumentId: spec.instrumentId, instrumentType: spec.instrumentType, issuerRegion: spec.issuerRegion,
    quantityOrNotionalUSD: spec.valueUSD, quantityShares: spec.shares,
  });
}

/**
 * A row still worth keeping on the chain: one that holds ANYTHING, in either unit.
 *
 * This kept rows over a dollar or over a millionth of a share, which meant two things. It
 * destroyed up to a dollar of value per row with no wire — and it did so on every row of the
 * holder's book, not only the one being debited, because the relink below rebuilds the whole
 * chain. A basket delivery that moved several instruments in turn could therefore drop a small
 * row of instrument B while transferring instrument A, and B's own transfer then found nothing
 * to take. It is also the predicate `pruneEmptyRows` uses, and the two disagreeing was a second
 * answer to one question.
 */
const keepsRow = (H: ReturnType<typeof mutableHoldings>, r: number): boolean =>
  H.qtyUSD[r] !== 0 || (!Number.isNaN(H.shares[r]) && H.shares[r] !== 0);

/**
 * Take from the holder's row(s) of this instrument; a row emptied is unlinked. One walk of the
 * chain: the debit lands on its rows and the walk notes whether any row (this one or a residue
 * elsewhere on the book) has to leave. Only then is the chain relinked — the relink rebuilds
 * the whole chain and the corporate-action pass debits every holder per instrument, so
 * relinking on every hit would be four walks and an allocation per action.
 *
 * A DEBIT LARGER THAN THE POSITION IS A DEFECT, NOT A SHORTFALL TO SWALLOW. The wire for the
 * FULL quantity is already written by the time this runs, so a remainder left after the walk is
 * paper minted on the receiving side that never left the payer's book — the gap then shows up
 * in the house's net and in the ownership family with no name on it. `retireTranche` defects on
 * exactly this case; so does this.
 */
function debitRow(v2: V2World, holderId: string, spec: HoldingSpec): void {
  const H = mutableHoldings(v2);
  const tRef = internString(v2, spec.instrumentType), iRef = internString(v2, spec.instrumentId);
  let leftUSD = spec.valueUSD; let leftShares = spec.shares ?? Number.NaN;
  let hit = false; let drops = false;
  // The residue of a row-by-row subtraction scales with the whole position the walk draws from,
  // not with the amount asked for: a debit of a thousand dollars taken out of a book of billions
  // carries the book's rounding, not its own.
  let walkedUSD = 0; let walkedShares = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === tRef && H.instrRef[r] === iRef && (leftUSD > 1e-9 || leftShares > 1e-12)) {
      hit = true;
      walkedUSD += Math.abs(H.qtyUSD[r]);
      const takeUSD = Math.min(leftUSD, H.qtyUSD[r]);
      H.qtyUSD[r] -= takeUSD; leftUSD -= takeUSD;
      if (!Number.isNaN(leftShares) && !Number.isNaN(H.shares[r])) {
        walkedShares += Math.abs(H.shares[r]);
        const takeSh = Math.min(leftShares, H.shares[r]); H.shares[r] -= takeSh; leftShares -= takeSh;
      }
    }
    if (!keepsRow(H, r)) drops = true;
  }
  // What is left after the walk is either float noise from the row-by-row subtraction — which
  // scales with the position it walked — or paper the holder never had.
  if (leftUSD > 1e-9 * Math.max(1, spec.valueUSD, walkedUSD)
    || leftShares > 1e-9 * Math.max(1, spec.shares ?? 0, walkedShares)) {
    defect(`${holderId} was debited ${spec.instrumentType} ${spec.instrumentId} beyond its position`
      + ` — ${(leftUSD / 1e6).toFixed(6)}M and ${Number.isNaN(leftShares) ? 0 : leftShares} shares undelivered`);
  }
  if (drops) {
    const kept: number[] = [];
    for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) if (keepsRow(H, r)) kept.push(r);
    relinkBook(v2, holderId, kept);
  } else if (hit) {
    // What a relink of an unchanged chain did besides relinking: the book is synced and dirty.
    H.synced.add(holderId);
    markBookDirty(v2, holderId);
  }
}

/**
 * THE INSTRUCTION ALONE, for a mover that writes the rows itself.
 *
 * Inside the clearing store's window the working copy owns the rows, so a stage that delivers
 * there cannot go through `transferHolding` without writing them twice. It still owes the wire:
 * a stock loan's delivery moved shares between two books with `addShares` on each side and no
 * instruction at all, which W5 saw as ~40 books a week off their wires.
 */
export function wireHoldingMove(from: PartyRef, to: PartyRef, spec: HoldingSpec, reason: string): number {
  return wireHolding(from, to, spec, reason);
}

function wireHolding(from: PartyRef, to: PartyRef, spec: HoldingSpec, reason: string): number {
  const { quantity, priceUSD } = priceOf(spec);
  return wire({ from, to, kind: kindOfType(spec.instrumentType), asset: spec.instrumentId, quantity, priceUSD, reason }, internReason);
}

/** A holding moves from one holder to another. Returns the wire number. */
export function transferHolding(v2: V2World, from: PartyRef, to: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueUSD > 0) && !((spec.shares ?? 0) > 0)) return -1;
  const fromId = holderIdOf(from), toId = holderIdOf(to);
  const n = wireHolding(from, to, spec, reason);
  if (fromId) debitRow(v2, fromId, spec);
  if (toId) creditRow(v2, toId, spec);
  return n;
}

/**
 * The issuer places paper (or shares) with a holder. The paper is CREATED: the issuer's own book
 * is never debited — an issuer that is itself a register holder (an ETF issuing its shares, a
 * fund) has no row of its own paper to give (measured at the first W2 run: retiring ETF shares
 * through `transferHolding` booked 4.8B of a fund's own shares on the fund as an asset, its NAV
 * followed, and the O family lit up four weeks later).
 */
export function issueHolding(v2: V2World, issuer: PartyRef, holder: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueUSD > 0) && !((spec.shares ?? 0) > 0)) return -1;
  const n = wireHolding(issuer, holder, spec, reason);
  const toId = holderIdOf(holder);
  if (toId) creditRow(v2, toId, spec);
  return n;
}

/**
 * A SEEDED HOLDER'S BOOK OPENS BY WIRE, like every other position it will ever take.
 *
 * The register was mirrored from `itemizedHoldings` straight into rows, so the world's opening
 * holdings existed because an array said so — the same gap `seedLadder` had on the issuers' side.
 * Each opening position is now ISSUED by its own issuer to the holder, through the same call a
 * primary settlement or an ETF creation uses, so the book is the replay of its wires from week 1.
 *
 * The chain is claimed empty first, so this cannot double a book. Rows MERGE by (type,
 * instrument) on the way in, which is what `consolidateRegister` does to the register at the
 * close of every week anyway — two entries for one instrument were always one position.
 */
export function seedBook(
  v2: V2World, holder: PartyRef, book: ItemizedHolding[] | undefined,
  issuerOf: (h: ItemizedHolding) => PartyRef
): void {
  const holderId = holderIdOf(holder);
  if (!holderId) return;
  syncBookRows(v2, holderId, []);
  for (const h of book ?? []) {
    issueHolding(v2, issuerOf(h), holder, {
      instrumentType: h.instrumentType,
      instrumentId: h.instrumentId,
      issuerRegion: h.issuerRegion,
      valueUSD: h.quantityOrNotionalUSD ?? 0,
      shares: h.quantityShares,
    }, 'seed: book opened');
  }
}

/** A holder's paper returns to the issuer: a redemption, a buyback, a write-off. */
export function retireHolding(v2: V2World, holder: PartyRef, issuer: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueUSD > 0) && !((spec.shares ?? 0) > 0)) return -1;
  const n = wireHolding(holder, issuer, spec, reason);
  const fromId = holderIdOf(holder);
  if (fromId) debitRow(v2, fromId, spec);
  return n;
}

/**
 * Every row of `instrumentId` on the holder's book scaled by `ratio`, the difference wired against
 * the issuer: below one a retirement (redemption, buyback, write-off), above one a placement.
 */
export function scaleHoldings(
  v2: V2World, holder: PartyRef, issuer: PartyRef, instrumentType: HoldingKind, instrumentId: string,
  ratio: number, reason: string
): number {
  const holderId = holderIdOf(holder);
  if (!holderId || !(ratio >= 0) || Math.abs(ratio - 1) < 1e-12) return 0;
  const H = mutableHoldings(v2);
  const tRef = internString(v2, instrumentType), iRef = internString(v2, instrumentId);
  let valueUSD = 0, shares = 0, anyShares = false, region: RegionId | undefined;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    valueUSD += H.qtyUSD[r] * Math.abs(1 - ratio);
    if (!Number.isNaN(H.shares[r])) { anyShares = true; shares += H.shares[r] * Math.abs(1 - ratio); }
    region = v2.internedStrings[H.regionRef[r]] as RegionId;
  }
  if (!(valueUSD > 0) || !region) return 0;
  const spec: HoldingSpec = { instrumentType, instrumentId, issuerRegion: region, valueUSD, shares: anyShares ? shares : undefined };
  return ratio < 1 ? retireHolding(v2, holder, issuer, spec, reason) : issueHolding(v2, issuer, holder, spec, reason);
}

/**
 * A clearing book's fills for one holder: the new position against the old, per instrument,
 * wired against the clearing house of the book's region — bought (house → holder) or sold
 * (holder → house). The rows themselves are rebuilt by the holdings store's write-back; this
 * records the moves. Returns the number of wires.
 */
export function clearedBookDelta(
  holder: PartyRef, region: RegionId, instrumentType: HoldingKind,
  before: Map<string, { valueUSD: number; shares?: number }>,
  after: Map<string, { valueUSD: number; shares?: number }>,
  priceOf: (instrumentId: string) => number | undefined,
  reason: string
): number {
  const house: PartyRef = { kind: 'CLEARING_HOUSE', region };
  let n = 0;
  const ids = new Set<string>([...before.keys(), ...after.keys()]);
  ids.forEach((id) => {
    const b = before.get(id), a = after.get(id);
    const px = priceOf(id);
    const bShares = b?.shares, aShares = a?.shares;
    const inShares = bShares !== undefined || aShares !== undefined;
    const dSh = (aShares ?? 0) - (bShares ?? 0);
    const dUSD = (a?.valueUSD ?? 0) - (b?.valueUSD ?? 0);
    const moved = inShares ? Math.abs(dSh) > 1e-9 : Math.abs(dUSD) > 1;
    if (!moved) return;
    const spec: HoldingSpec = inShares
      ? { instrumentType, instrumentId: id, issuerRegion: region, shares: Math.abs(dSh), valueUSD: Math.abs(dSh) * (px ?? (Math.abs(dUSD) / Math.max(1e-12, Math.abs(dSh)))) }
      : { instrumentType, instrumentId: id, issuerRegion: region, valueUSD: Math.abs(dUSD) };
    const sign = inShares ? dSh : dUSD;
    if (sign > 0) wireHolding(house, holder, spec, reason); else wireHolding(holder, house, spec, reason);
    n++;
  });
  return n;
}

/** A change of value with no change of quantity — accretion, a NAV mark. No wire: nothing moved. */
export function markHolding(v2: V2World, holderId: string, row: number, valueUSD: number): void {
  const H: HoldingStore = mutableHoldings(v2);
  H.qtyUSD[row] = valueUSD;
  markBookDirty(v2, holderId);
}

/** The rows a written-down book has left holding nothing are closed — no wire: nothing moved. */
export function closeEmptyPositions(v2: V2World, holderId: string): void { pruneEmptyRows(v2, holderId); }

/** The book's rows, keyed by instrument, for a delta read (before/after a clearing). */
export function bookPositions(v2: V2World, holderId: string, instrumentType: HoldingKind): Map<string, { valueUSD: number; shares?: number }> {
  const H = v2.holdings; const tRef = v2.internedIdByString.get(instrumentType);
  const out = new Map<string, { valueUSD: number; shares?: number }>();
  if (tRef === undefined) return out;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef) continue;
    const id = v2.internedStrings[H.instrRef[r]];
    const cur = out.get(id) ?? { valueUSD: 0, shares: undefined };
    cur.valueUSD += H.qtyUSD[r];
    if (!Number.isNaN(H.shares[r])) cur.shares = (cur.shares ?? 0) + H.shares[r];
    out.set(id, cur);
  }
  return out;
}
