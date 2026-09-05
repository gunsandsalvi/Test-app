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
import { V2World, internType, internInstrument, typeOf } from '../../engine2/world';
import { companyParty, bankPartyOf, bankSecuritiesPartyOf } from '../../domain/party';
import { addAccrued, addRealised, adjustLots,
  HoldingStore, mutableHoldings, bookHeadOf, pushBookRow, relinkBook, markBookDirty, pruneEmptyRows, instrumentIdAt, rowUnits } from '../../engine2/holdings';
import { ItemizedHolding } from '../../domain/banking';
import { PartyRef, partyKey, partyFromKey } from './party';
import { REGION_IDS } from '../../domain/geography';
import { InstrumentId, EntityId, asEntityId } from '../../domain/ids';
import { wire, AssetKind, ASSET_KINDS, activeWireJournal, hasActiveWireJournal } from './wire';
import { internReason } from '../simulation/stages/settlement';
import { RegionId } from '../../domain/geography';
import { defect } from '../../domain/defect';
import { PLEDGE_ROUNDING_TOLERANCE_LOCAL } from '../../domain/collateral';
import { issuerIdOf } from '../../engine2/tranches';
import { instrumentCurrencyOf } from '../../engine2/instruments';
import { currencyOf } from '../../domain/geography';
import { holdingClassOf } from '../../domain/assets';
import type { Company } from '../../domain/company';

export type HoldingKind = ItemizedHolding['instrumentType'];

/** The wire's asset kind for a register row: the kinds the wire ledger names, else a contract.
 *  §3.13-BOOK (e): a private-equity interest is a wire kind of its own now; it went as CONTRACT. */
const kindOfType = (t: string): AssetKind => ((ASSET_KINDS as readonly string[]).includes(t) ? (t as AssetKind) : 'CONTRACT');

export interface HoldingSpec {
  instrumentType: HoldingKind;
  instrumentId: InstrumentId;
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

/**
 * THE HOUSEHOLD SECTOR'S BOOK. One per region, and the id is the one 07e already used for the
 * household clearing participant — one thing, one key (`O8`).
 */
export const householdBookId = (region: string): string => `HOUSEHOLD-${region}`;

/**
 * §3.13-BOOK d3a — THE CENTRAL BANK'S BOOK. One per region; its id is the central bank party's
 * own key (`partyKey`), so `partyFromKey` inverts it and no third id grammar is minted for a book
 * whose holder already has a name. The household id above predates this and doubles as 07e's
 * clearing-participant id, which is why it keeps its own shape.
 */
export const centralBankBookId = (region: RegionId): string => partyKey({ kind: 'CENTRAL_BANK', region });
/** §3.13-BOOK d3d — A BANK'S DESK BOOK: its trading inventory, keyed by the securities party's own
 *  key. A desk is a market maker, so this is the one book the register lets go SHORT: a row here
 *  carries a signed position (`adjustDeskRow`), never a debit refused. */
export const deskBookId = (bankId: EntityId): string => partyKey(bankSecuritiesPartyOf(bankId));
const isDeskBook = (bookId: string): boolean => bookId.startsWith('BANK_SECURITIES:');

/**
 * The register's own read of a party as a holder.
 *
 * §9.13-EQUITY — THE HOUSEHOLD SECTOR IS A HOLDER. It used to return an id for institutions
 * alone, so the largest holder class in the model held its listed equity as `marketCap` minus
 * what the named books hold: a SUBTRACTION, recomputed from scratch every time anybody asked.
 * It could not be pointed at, could not be anyone's counterparty, and was the same residual the
 * dividend walk paid under the second name "the public float" (rule 4). Rule 2: a residual with
 * no holder is a defect, not a boundary.
 *
 * Companies, banks and the central bank still hold their books outside this register
 * (`the-register.md` A1.a) — that is the tree's own statement of its boundary, and it is not
 * this step's.
 */
/**
 * WHICH BOOK A PARTY HOLDS ON, for the instruction in hand — `undefined` where the party is not a
 * holder in this register. §3.13-BOOK d3c: a COMPANY is a holder of OTHER issuers' paper (its
 * treasury book: bills, since it bids for them in 07f) and never of its own — the same `COMPANY`
 * party stands on the ISSUER side of every corporate action, merger exchange and placement wire
 * of its own equity and its own tranches, and an issuer retiring or placing its paper holds
 * nothing. So the company arm answers only when the instrument's issuer is somebody else; the
 * seed's `seedBook` passes no instruction and a company is never seeded a book.
 */
const holderIdOf = (v2: V2World, p: PartyRef, spec?: { instrumentId: InstrumentId }): string | undefined => (
  p.kind === 'COMPANY' ? (spec !== undefined && (issuerIdOf(v2, spec.instrumentId) as string) !== (p.id as string) ? p.id : undefined)
    : bookIdOfParty(p));

/** THE REGISTER BOOK A PARTY HOLDS ON — for every party whose book does not depend on the paper
 *  (a company's does: `holderIdOf`). §3.13-BOOK d3f: the accrual ledgers key a holder by this, so
 *  the same id names a holder's rows and its unpaid coupons. */
export const bookIdOfParty = (p: PartyRef): string | undefined => (
  p.kind === 'INSTITUTION' ? p.id
    : p.kind === 'HOUSEHOLD' ? householdBookId(p.region)
      // §3.13-BOOK d3a: the central bank holds its sovereign book here, like any holder.
      : p.kind === 'CENTRAL_BANK' ? centralBankBookId(p.region)
        // §3.13-BOOK d3b: a bank's OWN book (its liquidity buffer) is the entity's book, under the
        // party whose money buys it — its reserves.
        : p.kind === 'BANK' ? p.id
          // §3.13-BOOK d3d: the desk's inventory, signed, on its own book.
          : p.kind === 'BANK_SECURITIES' ? deskBookId(p.id)
            : undefined);

/** The bank whose desk a book id names, or undefined for any other book — the inverse of
 *  `deskBookId`, read off the party key it is. */
export const deskBankIdOf = (bookId: string): EntityId | undefined => {
  const p = partyFromKey(bookId);
  return p !== undefined && p.kind === 'BANK_SECURITIES' ? p.id : undefined;
};

/**
 * §3.13-BOOK slice (c) — WHO ISSUED THE PAPER ON THIS ROW.
 *
 * Written twice, identically, in `core.ts` and `simulation/initialization.ts` — the two paths that
 * open a book by wiring each holding from its issuer. Both carried the same comment claiming a
 * corporate bond's row names its COMPANY, and both were wrong about it in the same way: since
 * §9.13-CREDIT row 1 those rows name a TRANCHE (`ACME-T1`), while the ticker map is keyed by the
 * company id (`USA_ACME`), so the lookup could never hit and every seeded corporate-bond and
 * leveraged-loan row was issued from `{ INSTITUTION, id: <trancheId> }` — a party that does not
 * exist, interned into the party table and wired from.
 *
 * Asking `issuerIdOf` is the fix and it is also why this is one function now: two copies of a
 * rule are two places for it to rot, and these two rotted together.
 */
export function issuerOfHoldingRow(
  v2: V2World, h: ItemizedHolding, companyById: ReadonlyMap<EntityId, Company>,
): PartyRef {
  // The registry says which kinds are sovereign; this does not switch on the kind itself.
  if (holdingClassOf(h.instrumentType) === 'SOVEREIGN') return { kind: 'GOVERNMENT', region: h.issuerRegion };
  // A tranche resolves to its issuer; anything else — equity, a fund's own shares — is its own
  // issuer, so those two resolve exactly as they did before.
  const issuer = companyById.get(issuerIdOf(v2, h.instrumentId));
  // §3.13-BOOK (c2b): no ticker resolved, so the row names something the company table does not
  // carry — a fund share, keyed on the register by the fund ENTITY itself. That crossing is why
  // an instrument id can stand here, and slice (d)'s registry is what removes the need.
  return issuer ? companyParty(issuer) : { kind: 'INSTITUTION', id: asEntityId(h.instrumentId) };
}

/**
 * EVERY BOOK THE REGISTER HOLDS, and the party each one pays and is paid as.
 *
 * One place says who the register's holders are, because everything that must reach ALL of them —
 * a corporate action, the week's consolidation, the close's mark — was written as a walk over
 * `institutionalEntities` back when that was the whole list. A holder added anywhere else is a
 * holder those three walks silently skip, which is how the desks came to accrue nothing for
 * thirteen weeks (§9.13-CREDIT row 2) and how a household buyback would have handed the household
 * sector free shares. The institutions come first and in the order given, so a caller that still
 * needs to rebuild its entity array off the same flags can index straight into them.
 */
export function registerBooks(entityIds: readonly EntityId[], companies: readonly { id: EntityId; isBankEntity?: boolean; bankBalanceSheet?: unknown }[]): { id: string; payee: PartyRef }[] {
  return [
    ...entityIds.map((id) => ({ id, payee: { kind: 'INSTITUTION' as const, id } })),
    // §3.13-BOOK d3b/d3c: every company's own book — a bank's liquidity buffer, paid as the bank
    // (its reserves); any other firm's treasury book, paid as the company.
    ...companies.map((c) => ({ id: c.id as string, payee: (c.isBankEntity && c.bankBalanceSheet ? bankPartyOf(c.id) : companyParty(c)) as PartyRef })),
    // §3.13-BOOK d3d: and each bank's DESK, paid as its securities party.
    ...companies.filter((c) => c.isBankEntity && c.bankBalanceSheet).map((c) => ({ id: deskBookId(c.id), payee: bankSecuritiesPartyOf(c.id) as PartyRef })),
    ...REGION_IDS.map((region) => ({ id: householdBookId(region), payee: { kind: 'HOUSEHOLD' as const, region } })),
    // §3.13-BOOK d3a: and the central banks' books — consolidated and marked with everyone else's.
    ...REGION_IDS.map((region) => ({ id: centralBankBookId(region), payee: { kind: 'CENTRAL_BANK' as const, region } })),
  ];
}

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

/** §3.13-BOOK f1: the week a lot arrives — the journal's, or the seed's week 0. */
const lotWeek = (): number => (hasActiveWireJournal() ? activeWireJournal().week : 0);

/** Add to (or open) the holder's row of this instrument. §3.13-BOOK f4a: `accruedIn` is the
 *  interest that came with the paper — what the debit on the other side took off its row. */
function creditRow(v2: V2World, holderId: string, spec: HoldingSpec, accruedIn = 0): void {
  const H = mutableHoldings(v2);
  const tRef = internType(v2, spec.instrumentType), iRef = internInstrument(v2, spec.instrumentId);
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    H.accruedLocal[r] += accruedIn;
    // §3.13-READ A6: what the row already holds is read BEFORE the row is touched, so the
    // fallback is the ordinary one and not a value the addition has to be unwound out of.
    const priorUnits = rowUnits(H, r);
    H.qtyLocal[r] += spec.valueLocal;
    if (spec.shares !== undefined) H.shares[r] = (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]) + spec.shares;
    H.units[r] = priorUnits + unitsOf(spec);
    // §3.13-BOOK f1: what arrived is a lot at the wire's price.
    adjustLots(v2, r, unitsOf(spec), priceOf(spec).priceLocal, lotWeek());
    markBookDirty(v2, holderId);
    return;
  }
  const opened = pushBookRow(v2, holderId, {
    instrumentId: spec.instrumentId, instrumentType: spec.instrumentType, issuerRegion: spec.issuerRegion,
    quantityOrNotionalLocal: spec.valueLocal, quantityShares: spec.shares,
    units: unitsOf(spec),
  }, lotWeek());
  H.accruedLocal[opened] += accruedIn;
}

/**
 * §3.13-BOOK d3d — A DESK ROW IS SIGNED. A market maker's inventory in a name is one number that
 * can be long or short: it sells what it does not have and buys it back. So the desk's book takes
 * a credit and a debit as the same operation with a sign, on the one row of that (kind,
 * instrument), and a row that returns to exactly nothing leaves the chain. Everyone else's debit
 * stays a debit (`debitRow`), which refuses to go below zero — that is C4 ("no short by
 * accident"), and this is the deliberate short the node allows for.
 */
function adjustDeskRow(v2: V2World, holderId: string, spec: HoldingSpec, sign: 1 | -1, accruedIn = 0, carryAccrued = true): number {
  const H = mutableHoldings(v2);
  const tRef = internType(v2, spec.instrumentType), iRef = internInstrument(v2, spec.instrumentId);
  const dValue = sign * spec.valueLocal;
  const dUnits = sign * unitsOf(spec);
  let accruedOut = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    const priorUnits = rowUnits(H, r);
    // §3.13-BOOK f4a: what the desk is owed moves with what it sells, pro rata; what it buys
    // brings its own.
    if (carryAccrued && sign < 0 && priorUnits > 0 && H.accruedLocal[r] !== 0) {
      accruedOut = H.accruedLocal[r] * Math.min(1, unitsOf(spec) / priorUnits);
      H.accruedLocal[r] -= accruedOut;
    }
    H.accruedLocal[r] += accruedIn;
    H.qtyLocal[r] += dValue;
    if (spec.shares !== undefined) H.shares[r] = (Number.isNaN(H.shares[r]) ? 0 : H.shares[r]) + sign * spec.shares;
    H.units[r] = priorUnits + dUnits;
    // §3.13-BOOK f1: signed lots — a short is a negative one, and a cover consumes it.
    adjustLots(v2, r, dUnits, priceOf(spec).priceLocal, lotWeek());
    markBookDirty(v2, holderId);
    const flat = Math.abs(H.qtyLocal[r]) < 1e-6 && Math.abs(H.units[r]) < 1e-9 && (Number.isNaN(H.shares[r]) || Math.abs(H.shares[r]) < 1e-9)
      && H.accruedLocal[r] === 0; // f4a: a flat desk row still owed its coupon stays
    if (flat) {
      H.qtyLocal[r] = 0; H.units[r] = 0; if (!Number.isNaN(H.shares[r])) H.shares[r] = 0;
      const kept: number[] = [];
      for (let k = bookHeadOf(v2, holderId); k >= 0; k = H.next[k]) if (k !== r) kept.push(k);
      relinkBook(v2, holderId, kept);
    }
    return accruedOut;
  }
  const opened = pushBookRow(v2, holderId, {
    instrumentId: spec.instrumentId, instrumentType: spec.instrumentType, issuerRegion: spec.issuerRegion,
    quantityOrNotionalLocal: dValue, quantityShares: spec.shares === undefined ? undefined : sign * spec.shares,
    units: dUnits,
  }, lotWeek());
  H.accruedLocal[opened] += accruedIn;
  return accruedOut;
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
  H.qtyLocal[r] !== 0 || (!Number.isNaN(H.shares[r]) && H.shares[r] !== 0)
  || H.lienUnits[r] > 0 // d5a: a lien keeps an empty row
  || H.accruedLocal[r] !== 0; // f4a: so does interest still owed on it

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
/**
 * §3.13-BOOK f2a — THE DEBIT TAKES THE UNITS THE WIRE NAMES. It used to take the wire's VALUE and
 * let the units follow in proportion, so a sale of 120 face at par out of a row marked at 0.99
 * took 121 face — the quantity a realised gain needs did not exist. The units leave first, oldest
 * lot first; the value that leaves with them is the row's OWN mark on those units, so what is
 * left is still `units × mark`, and the difference between the wire's proceeds and the mark-value
 * that left is the sale's gain against the mark (the lots say the gain against cost — f2b).
 *
 * §3.13-BOOK d5a — A ROW UNDER A LIEN CANNOT BE SOLD BELOW IT. `enforceLien` is the transfer's
 * arm: a sale that would leave fewer units than are pledged defects at the site (the auctions
 * floor a pledging bank's holding at its pledged face, so this is the guard behind that floor).
 * A retirement is the other arm: the paper ceased, the lien shrinks to what is left, and the
 * repo book's collateral call takes it from there.
 *
 * A DEBIT LARGER THAN THE POSITION IS A DEFECT, NOT A SHORTFALL TO SWALLOW. The wire for the
 * FULL quantity is already written by the time this runs, so a remainder left after the walk is
 * paper minted on the receiving side that never left the payer's book. `retireTranche` defects on
 * exactly this case; so does this. One walk of the chain, one relink only if a row emptied.
 */
/** §3.13-BOOK f4a: a TRANSFER carries the row's accrued out pro rata with the units (the buyer
 *  pays the seller for it beside the paper, and the balance follows the paper); a RETIREMENT
 *  leaves it on the row — the paper is gone, the coupon is still due, and the row stays until it
 *  is paid. Returns what left. */
function debitRow(v2: V2World, holderId: string, spec: HoldingSpec, enforceLien: boolean, carryAccrued = enforceLien): number {
  const H = mutableHoldings(v2);
  const tRef = internType(v2, spec.instrumentType), iRef = internInstrument(v2, spec.instrumentId);
  const askedUnits = unitsOf(spec);
  let leftUnits = askedUnits;
  let hit = false; let drops = false;
  let accruedOut = 0;
  // The residue of a row-by-row subtraction scales with the whole position the walk draws from,
  // not with the amount asked for.
  let walkedUnits = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === tRef && H.instrRef[r] === iRef && leftUnits > 1e-12) {
      hit = true;
      const unitsHere = rowUnits(H, r);
      walkedUnits += Math.abs(unitsHere);
      const takeUnits = Math.min(leftUnits, Math.max(0, unitsHere));
      const nextUnits = unitsHere - takeUnits;
      const takeLocal = unitsHere > 0 ? H.qtyLocal[r] * (takeUnits / unitsHere) : 0;
      if (H.lienUnits[r] > 0) {
        if (enforceLien && nextUnits < H.lienUnits[r] - Math.max(PLEDGE_ROUNDING_TOLERANCE_LOCAL, 1e-9 * H.lienUnits[r])) {
          defect(`${holderId} sold ${spec.instrumentType} ${spec.instrumentId} under a lien: ${H.lienUnits[r]} units pledged, ${nextUnits} would be left`);
        }
        if (!enforceLien && H.lienUnits[r] > nextUnits) H.lienUnits[r] = Math.max(0, nextUnits);
      }
      H.qtyLocal[r] -= takeLocal;
      H.units[r] = nextUnits;
      // A share-counted row's units ARE its shares (`unitsOf` says so on the way in).
      if (!Number.isNaN(H.shares[r])) H.shares[r] = nextUnits;
      if (carryAccrued && unitsHere > 0 && H.accruedLocal[r] !== 0) {
        const share = H.accruedLocal[r] * (takeUnits / unitsHere);
        H.accruedLocal[r] -= share; accruedOut += share;
      }
      // §3.13-BOOK f1: what leaves comes off the oldest lots first. f2b: what the wire fetched
      // for those units, less what the lots say they cost, is REALISED on this book, in the
      // instrument's money — a sale's gain, a redemption's pull to par, a write-off's loss.
      const consumed = adjustLots(v2, r, -takeUnits, priceOf(spec).priceLocal, lotWeek());
      addRealised(v2, holderId, instrumentCurrencyOf(v2, spec.instrumentId) ?? currencyOf(spec.issuerRegion),
        priceOf(spec).priceLocal * takeUnits - consumed.consumedBasisLocal);
      leftUnits -= takeUnits;
    }
    if (!keepsRow(H, r)) drops = true;
  }
  // What is left after the walk is either float noise from the row-by-row subtraction — which
  // scales with the position it walked — or paper the holder never had.
  if (leftUnits > 1e-9 * Math.max(1, askedUnits, walkedUnits)) {
    defect(`${holderId} was debited ${spec.instrumentType} ${spec.instrumentId} beyond its position`
      + ` — ${leftUnits} units undelivered`);
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
  return accruedOut;
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
  const fromId = holderIdOf(v2, from, spec), toId = holderIdOf(v2, to, spec);
  const n = wireHolding(from, to, spec, reason);
  // §3.13-BOOK f4a: the interest owed on the paper travels with it, from the one row to the other
  // — BETWEEN TWO BOOKS. A fill against the clearing house is the exception (f4b): the house holds
  // no row, and the book that cleared moves the accrued explicitly, per participant, at the
  // paper's own per-face rate (`accruedOnFills`), so the seller's balance waits on its row for
  // that move rather than leaving with the wire.
  const carry = fromId !== undefined && toId !== undefined;
  let accrued = 0;
  if (fromId) accrued = isDeskBook(fromId) ? adjustDeskRow(v2, fromId, spec, -1, 0, carry) : debitRow(v2, fromId, spec, true, carry);
  if (toId) { if (isDeskBook(toId)) adjustDeskRow(v2, toId, spec, 1, accrued); else creditRow(v2, toId, spec, accrued); }
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
  const toId = holderIdOf(v2, holder, spec);
  if (toId) { if (isDeskBook(toId)) adjustDeskRow(v2, toId, spec, 1); else creditRow(v2, toId, spec); }
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
  const holderId = holderIdOf(v2, holder);
  if (!holderId) return;
  // The chain is claimed empty (and the book marked opened) before the first issue lands.
  relinkBook(v2, holderId, []);
  for (const h of book ?? []) {
    issueHolding(v2, issuerOf(h), holder, {
      instrumentType: h.instrumentType,
      instrumentId: h.instrumentId,
      issuerRegion: h.issuerRegion,
      valueLocal: h.quantityOrNotionalLocal,
      shares: h.quantityShares,
      // §9.13-CREDIT row 5: an opening position states its QUANTITY like any other, so the wire
      // carries a real price and the row opens with the face it holds.
      units: h.units,
    }, 'seed: book opened');
  }
}

/** A holder's paper returns to the issuer: a redemption, a buyback, a write-off. */
export function retireHolding(v2: V2World, holder: PartyRef, issuer: PartyRef, spec: HoldingSpec, reason: string): number {
  if (!(spec.valueLocal > 0) && !((spec.shares ?? 0) > 0)) return -1;
  const n = wireHolding(holder, issuer, spec, reason);
  const fromId = holderIdOf(v2, holder, spec);
  if (fromId) { if (isDeskBook(fromId)) adjustDeskRow(v2, fromId, spec, -1); else debitRow(v2, fromId, spec, false); }
  return n;
}

/**
 * §3.13-BOOK d5a — THE LIEN ON A POSITION. What of a book's row in one instrument is pledged,
 * and the one write that sets it: the repo book's publish (`contract-ledger.ts:publishRepoBook`)
 * writes every borrower's pledged face onto its rows, so the register's liens ARE the book's
 * pledges, and a resolution moves a lien with the rows it binds (`bank-transfer.ts`).
 */
export function lienUnitsOf(v2: V2World, bookId: string, instrumentType: HoldingKind, instrumentId: InstrumentId): number {
  const H = v2.holdings;
  const tRef = internType(v2, instrumentType), iRef = internInstrument(v2, instrumentId);
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] === tRef && H.instrRef[r] === iRef) return H.lienUnits[r];
  }
  return 0;
}

/** Set the lien on a book's row of one instrument to `units`. A lien above what the book holds is
 *  an over-pledge, which the repo book's own reconcile calls. */
export function setLien(v2: V2World, bookId: string, instrumentType: HoldingKind, instrumentId: InstrumentId, issuerRegion: RegionId, units: number): void {
  if (!(units >= 0) || !Number.isFinite(units)) return defect(`lien of ${units} on ${instrumentId}`);
  const H = mutableHoldings(v2);
  const tRef = internType(v2, instrumentType), iRef = internInstrument(v2, instrumentId);
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== tRef || H.instrRef[r] !== iRef) continue;
    if (H.lienUnits[r] === units) return;
    H.lienUnits[r] = units;
    markBookDirty(v2, bookId);
    return;
  }
  // A lien on paper the book does not hold at all is an over-pledge by the whole face — the
  // register records it on an EMPTY row, which the reconcile's collateral call empties of its lien
  // and the next relink then frees. The row's region is the instrument's own.
  if (!(units > 0)) return;
  const r = pushBookRow(v2, bookId, { instrumentId, instrumentType, issuerRegion, quantityOrNotionalLocal: 0, units: 0 });
  H.lienUnits[r] = units;
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
  before: Map<InstrumentId, BookEntry>,
  after: Map<InstrumentId, BookEntry>,
  priceOf: (instrumentId: InstrumentId) => number | undefined,
  reason: string,
): void {
  const house: PartyRef = { kind: 'CLEARING_HOUSE', region };
  const ids = new Set<InstrumentId>([...before.keys(), ...after.keys()]);
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
  priceOfRow: (instrumentType: string, instrumentId: InstrumentId) => number | undefined
): { rows: number; deltaLocal: number } {
  const H = mutableHoldings(v2);
  let rows = 0, deltaLocal = 0;
  for (let r = bookHeadOf(v2, holderId); r >= 0; r = H.next[r]) {
    const instrumentType = typeOf(v2, H.typeRef[r]);
    if (Number.isNaN(H.units[r])) H.units[r] = rowUnits(H, r);
    const unitsHeld = H.units[r];
    if (!(Math.abs(unitsHeld) > 0)) continue;
    const price = priceOfRow(instrumentType, instrumentIdAt(v2, r));
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

/** §3.13-BOOK f4a — the weekly accrual lands on a row: what the holder of record earned this
 *  week on the paper it holds, in the paper's own money. The one door a stage writes it through. */
export function accrueInterestOnRow(v2: V2World, r: number, usd: number): void { addAccrued(v2, r, usd); }
/** And the coupon date takes it back off the row as it pays it. */
export function settleAccruedOnRow(v2: V2World, r: number, usd: number): void { addAccrued(v2, r, -usd); }

// `bookPositions` is deleted (§9.13-CREDIT row 5): it had no caller, and what it returned was
// a book in MONEY at a moment when the only honest before/after of a credit book is in units.
