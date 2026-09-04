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
  valueLocal: number;
  /** Shares moved (equity, fund shares); undefined for notional-only paper. */
  shares?: number;
  /**
   * HOW MANY UNITS moved, in the instrument's own unit — FACE for credit, shares for equity.
   * `valueLocal` is units × price, so the wire carries a real price instead of the 1.00 every
   * notional instrument used to move at. Defaults to shares, then to the value — and the value is
   * the right default exactly while a book's price is one, which is what makes this safe to
   * introduce before the mark is wired.
   *
   * It was called `faceLocal` and no caller ever set it: the field was read three times and
   * written nowhere, so every credit wire in the model has moved at a price of exactly 1.
   */
  units?: number;
}

/** The register's own read of a party as a holder: only institutions hold register rows today. */
const holderIdOf = (p: PartyRef): string | undefined => (p.kind === 'INSTITUTION' ? p.id : undefined);

/**
 * WHAT MOVED, AND AT WHAT PRICE. The quantity is the thing owned — shares for equity, FACE for
 * credit — and the price is what a unit of it fetched. Credit used to return `{ quantity: value,
 * price: 1 }`, which is the whole of "credit always trades at par": a bond whose issuer's spread
 * had doubled still wired at 100. A row that carries no face yet falls back to the old reading,
 * where value and face are the same number because the price was always one.
 */
function priceOf(spec: HoldingSpec): { quantity: number; priceLocal: number } {
  if (spec.shares !== undefined && spec.shares > 0) return { quantity: spec.shares, priceLocal: spec.valueLocal / spec.shares };
  if (spec.units !== undefined && spec.units > 0) return { quantity: spec.units, priceLocal: spec.valueLocal / spec.units };
  return { quantity: spec.valueLocal, priceLocal: 1 };
}

/** WHAT QUANTITY THIS INSTRUCTION MOVES — shares where the instrument is share-counted, else the
 *  units the caller named, else the value, which is the units at a price of one. */
const unitsOf = (spec: HoldingSpec): number => spec.shares ?? spec.units ?? spec.valueLocal;

/** Add to (or open) the holder's row of this instrument. */
function creditRow(v2: V2World, holderId: string, spec: HoldingSpec): void {
  const H = mutableHoldings(v2);
  const tRef = internString(v2, spec.instrumentType), iRef = internString(v2, spec.instrumentId);
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    H.qtyLocal[r] += spec.valueLocal;
    if (spec.shares !== undefined) H.shares[r] = (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]) + spec.shares;
    // A row whose units were never stored has none to add to, and the only honest reading of what
    // it already holds is its value — which is what par pricing made them equal to.
    const priorUnits = Number.isNaN(H.units[r]) ? H.qtyLocal[r] - spec.valueLocal : H.units[r];
    H.units[r] = priorUnits + unitsOf(spec);
    markBookDirty(v2, holderId);
    return;
  }
  pushBookRow(v2, holderId, {
    instrumentId: spec.instrumentId, instrumentType: spec.instrumentType, issuerRegion: spec.issuerRegion,
    quantityOrNotionalLocal: spec.valueLocal, quantityShares: spec.shares,
    units: unitsOf(spec),
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
  H.qtyLocal[r] !== 0 || (!Number.isNaN(H.shares[r]) && H.shares[r] !== 0);

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
  let leftLocal = spec.valueLocal; let leftShares = spec.shares ?? Number.NaN;
  let hit = false; let drops = false;
  // The residue of a row-by-row subtraction scales with the whole position the walk draws from,
  // not with the amount asked for: a debit of a thousand dollars taken out of a book of billions
  // carries the book's rounding, not its own.
  let walkedLocal = 0; let walkedShares = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === tRef && H.instrRef[r] === iRef && (leftLocal > 1e-9 || leftShares > 1e-12)) {
      hit = true;
      walkedLocal += Math.abs(H.qtyLocal[r]);
      const takeLocal = Math.min(leftLocal, H.qtyLocal[r]);
      // §9.13-CREDIT row 5 — AND THE QUANTITY LEAVES WITH THE VALUE. This took value and shares
      // and left `units` where it was, so every debit of a credit row drove the two apart: a
      // holder that sold half its position still reported the whole face. The units taken are the
      // row's OWN — what fraction of its value is leaving, applied to what it holds — so the
      // ledger never needs the caller to know, and while value and units are the same number this
      // subtracts exactly what the value line does.
      const rowUnits = Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r];
      const takeUnits = H.qtyLocal[r] > 0 ? rowUnits * (takeLocal / H.qtyLocal[r]) : 0;
      H.qtyLocal[r] -= takeLocal; leftLocal -= takeLocal;
      H.units[r] = rowUnits - takeUnits;
      if (!Number.isNaN(leftShares) && !Number.isNaN(H.shares[r])) {
        walkedShares += Math.abs(H.shares[r]);
        const takeSh = Math.min(leftShares, H.shares[r]); H.shares[r] -= takeSh; leftShares -= takeSh;
        // A share-counted row's units ARE its shares (`unitsOf` says so on the way in), so it
        // takes the share line rather than the value proportion — the two agree only while the
        // row's own price and the instruction's are the same number.
        H.units[r] = H.shares[r];
      }
    }
    if (!keepsRow(H, r)) drops = true;
  }
  // What is left after the walk is either float noise from the row-by-row subtraction — which
  // scales with the position it walked — or paper the holder never had.
  if (leftLocal > 1e-9 * Math.max(1, spec.valueLocal, walkedLocal)
    || leftShares > 1e-9 * Math.max(1, spec.shares ?? 0, walkedShares)) {
    defect(`${holderId} was debited ${spec.instrumentType} ${spec.instrumentId} beyond its position`
      + ` — ${(leftLocal / 1e6).toFixed(6)}M and ${Number.isNaN(leftShares) ? 0 : leftShares} shares undelivered`);
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
  const { quantity, priceLocal } = priceOf(spec);
  return wire({ from, to, kind: kindOfType(spec.instrumentType), asset: spec.instrumentId, quantity, priceLocal, reason }, internReason);
}

/** A holding moves from one holder to another. Returns the wire number. */
export function transferHolding(v2: V2World, from: PartyRef, to: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueLocal > 0) && !((spec.shares ?? 0) > 0)) return -1;
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
  if (!(spec.valueLocal > 0) && !((spec.shares ?? 0) > 0)) return -1;
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
      valueLocal: h.quantityOrNotionalLocal ?? 0,
      shares: h.quantityShares,
    }, 'seed: book opened');
  }
}

/** A holder's paper returns to the issuer: a redemption, a buyback, a write-off. */
export function retireHolding(v2: V2World, holder: PartyRef, issuer: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueLocal > 0) && !((spec.shares ?? 0) > 0)) return -1;
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
  let valueLocal = 0, shares = 0, units = 0, anyShares = false, region: RegionId | undefined;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    valueLocal += H.qtyLocal[r] * Math.abs(1 - ratio);
    if (!Number.isNaN(H.shares[r])) { anyShares = true; shares += H.shares[r] * Math.abs(1 - ratio); }
    // §9.13-CREDIT row 5: a corporate action scales the QUANTITY, and the value follows from it.
    // Reading only the value left the ratio applied to the money and not to the face.
    units += (Number.isNaN(H.units[r]) ? H.qtyLocal[r] : H.units[r]) * Math.abs(1 - ratio);
    region = v2.internedStrings[H.regionRef[r]] as RegionId;
  }
  if (!(valueLocal > 0) || !region) return 0;
  const spec: HoldingSpec = { instrumentType, instrumentId, issuerRegion: region, valueLocal, units, shares: anyShares ? shares : undefined };
  return ratio < 1 ? retireHolding(v2, holder, issuer, spec, reason) : issueHolding(v2, issuer, holder, spec, reason);
}

/**
 * A clearing book's fills for one holder: the new position against the old, per instrument,
 * wired against the clearing house of the book's region — bought (house → holder) or sold
 * (holder → house). The rows themselves are rebuilt by the holdings store's write-back; this
 * records the moves. Returns the number of wires.
 */
/**
 * §3.13b: THE ACCRUED IS NOT WIRED HERE. What the buyer owes the seller for interest that ran
 * before it bought is settled per PARTICIPANT, against the book's own clearing house, alongside
 * the money for the paper itself — `book-settlement.ts:accruedOnFills`. This function sees only
 * the holders whose books it happens to rewrite, so an accrued leg computed here would cover part
 * of a session and net to nothing anyone could pay.
 */
/**
 * One side of a book, per instrument: what it is worth and HOW MUCH OF IT there is.
 *
 * §9.13-CREDIT row 5 — `units` is why the credit branch below can subtract two weeks that are not
 * struck at the same price. A holder's book at the start of the week carries last week's MARK and
 * the fills appended this week are written in par space, so a delta taken on the money is the
 * revaluation plus the trade, and only one of those is a wire. Absent means the value IS the
 * quantity, which is what par pricing made it — every caller that does not mark is unaffected.
 */
export interface BookEntry { valueLocal: number; shares?: number; units?: number }

export function clearedBookDelta(
  holder: PartyRef, region: RegionId, instrumentType: HoldingKind,
  before: Map<string, BookEntry>,
  after: Map<string, BookEntry>,
  priceOf: (instrumentId: string) => number | undefined,
  reason: string,
): void {
  const house: PartyRef = { kind: 'CLEARING_HOUSE', region };
  const ids = new Set<string>([...before.keys(), ...after.keys()]);
  ids.forEach((id) => {
    const b = before.get(id), a = after.get(id);
    const px = priceOf(id);
    const bShares = b?.shares, aShares = a?.shares;
    const inShares = bShares !== undefined || aShares !== undefined;
    const dSh = (aShares ?? 0) - (bShares ?? 0);
    const dLocal = (a?.valueLocal ?? 0) - (b?.valueLocal ?? 0);
    // The QUANTITY that changed hands. Where a side states its units they are the two weeks'
    // common measure; where it does not, the value is the quantity at a price of one.
    const dUnits = (a?.units ?? a?.valueLocal ?? 0) - (b?.units ?? b?.valueLocal ?? 0);
    const moved = inShares ? Math.abs(dSh) > 1e-9 : Math.abs(dUnits) > 1;
    if (!moved) return;
    const spec: HoldingSpec = inShares
      ? { instrumentType, instrumentId: id, issuerRegion: region, shares: Math.abs(dSh), valueLocal: Math.abs(dSh) * (px ?? (Math.abs(dLocal) / Math.max(1e-12, Math.abs(dSh)))) }
      : { instrumentType, instrumentId: id, issuerRegion: region, units: Math.abs(dUnits), valueLocal: Math.abs(dUnits) * (px ?? 1) };
    const sign = inShares ? dSh : dUnits;
    if (sign > 0) wireHolding(house, holder, spec, reason); else wireHolding(holder, house, spec, reason);
  });
}

/**
 * THE BOOK, RE-MARKED — every row of it whose market printed a price this week.
 *
 * A price move is not a trade: the holder owns the same QUANTITY before and after, so nothing
 * moves and nothing is wired — the same rule `markHolding` states for one row, applied to a whole
 * book. What changes is only what that quantity is worth.
 *
 * §9.13-EQUITY: this was `markCreditBook` and walked the tranche kinds alone, so an EQUITY row
 * kept whatever value the last session that touched it wrote — a holder that did not trade this
 * week carried its shares at a stale print, and its NAV, its capital ratio and every allocation
 * sized off them were struck on last week's market. Equity has stored its own quantity (shares)
 * since WS4; what it had no owner for was the re-mark. `priceOfRow` is asked per KIND, because a
 * bond's price comes from the price store and a share's from its issuer.
 *
 * It also FIXES THE QUANTITY on a row that has none: a book writes its fills in par space, so the
 * value it was written with IS the face. After that the two are separate numbers and only the
 * value moves, which is what lets a book keep trading face while the register carries a price.
 *
 * `priceOfRow` returns undefined for anything it cannot price; that row is left alone rather than
 * marked to a guess.
 */
export function markBookToMarket(
  v2: V2World, holderId: string,
  priceOfRow: (instrumentType: string, instrumentId: string) => number | undefined
): { rows: number; deltaLocal: number } {
  const H = mutableHoldings(v2);
  let rows = 0, deltaLocal = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    const instrumentType = v2.internedStrings[H.typeRef[r]];
    if (Number.isNaN(H.units[r])) H.units[r] = H.qtyLocal[r];
    const unitsHeld = H.units[r];
    if (!(Math.abs(unitsHeld) > 0)) continue;
    const price = priceOfRow(instrumentType, v2.internedStrings[H.instrRef[r]]);
    if (price === undefined) continue;
    const before = H.qtyLocal[r];
    H.qtyLocal[r] = unitsHeld * price;
    deltaLocal += H.qtyLocal[r] - before;
    rows++;
  }
  if (rows > 0) markBookDirty(v2, holderId);
  return { rows, deltaLocal };
}

/** A change of value with no change of quantity — accretion, a NAV mark. No wire: nothing moved. */
export function markHolding(v2: V2World, holderId: string, row: number, valueLocal: number): void {
  const H: HoldingStore = mutableHoldings(v2);
  H.qtyLocal[row] = valueLocal;
  markBookDirty(v2, holderId);
}

/** The rows a written-down book has left holding nothing are closed — no wire: nothing moved. */
export function closeEmptyPositions(v2: V2World, holderId: string): void { pruneEmptyRows(v2, holderId); }

// `bookPositions` is deleted (§9.13-CREDIT row 5): it had no caller, and what it returned was
// a book in MONEY at a moment when the only honest before/after of a credit book is in units.
