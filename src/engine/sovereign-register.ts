/**
 * WHO HOLDS A GOVERNMENT'S PAPER — the one walk, over every store that carries any of it.
 *
 * §3.13-SOV row 3 gave every one of those stores the same id space (the bond's own tranche id),
 * which is what makes a single walk possible at all. What it did not do is give them one SHAPE:
 * a sovereign holding lives in FOUR places, because only one holder class is in the register
 * (`the-register.md` A1.a is that boundary, stated by the tree itself) —
 *
 *   · the institutions, the households, the CENTRAL BANK (§3.13-BOOK d3a) and the BANKS' OWN
 *     BOOKS (d3b), as `GOV_BOND` rows on the register (`registerBooks` lists every book it holds);
 *   · the banks' desks, as `dealerDeskInventory['sovereign bond' | 'bill']` on each bank's sheet;
 *   · a company's own treasury book, `comp.treasuryHoldings` — which only the seed's
 *     reconciliation and `O1`'s credit arms knew about and no sovereign walk did.
 *
 * **AND FIVE PLACES OPEN-CODED THE WALK.** The seed's stock reconciliation, `holdings-view`'s
 * ownership shares, `O1`'s sovereign arm, `O11`'s stray-id check and the UI's holder list each
 * enumerated the four stores themselves, so each could be — and one of them was — out of date
 * about which stores exist. That is rule 4 applied to a READ rather than to a number, and it is
 * what makes §3's **13-OUTSIDE** (moving the two `Record` books into the register) a change in
 * five files instead of one. It is one function now, and those callers are projections of it.
 *
 * WHAT IT REPORTS IS FACE, as far as each store can say. The register carries `units` and means
 * it; a desk row reports its `units` where it has them and its money where it does not, which is
 * d3d's finding.
 */

import { GameState, RegionId } from '../types';
import { V2World, typeRefOf, regionRefOf, regionOf } from '../engine2/world';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../engine2/holdings';
import { isActiveCompany } from '../domain/company';
import { holdingClassOf } from '../domain/assets';
import { registerBooks, centralBankBookId } from './ledger/holdings-ledger';
import type { InstrumentId } from '../domain/ids';

/** The kind of book a sovereign position sits in — what `holdings-view` reports as its shares,
 *  and the only thing a caller has to know about WHERE a holding is kept. */
export type SovereignHolderClass = 'REGISTER' | 'BANK' | 'CENTRAL_BANK' | 'DESK' | 'TREASURY';

export interface SovereignPosition {
  /** The bond's own tranche id — one id space across all four stores (§3.13-SOV row 3). */
  bondId: string;
  /** The book it sits in: an institution's or household's id, a bank's ticker, `CB`. */
  holderKey: string;
  holderClass: SovereignHolderClass;
  /** What that book says it holds. See the note above on what the two `Record` books mean by it. */
  faceLocal: number;
}

/**
 * Every position in one region's sovereign paper, from every store that keeps one.
 *
 * `visit` rather than an array: `O11` and the seed run this over every region every week, and the
 * largest caller wants only a per-bond total — allocating a row object per position to throw it
 * away is the shape §7.327 measured.
 */
export function forEachSovereignPosition(
  v2: V2World, state: GameState, regionId: RegionId,
  visit: (p: SovereignPosition) => void
): void {
  const H = v2.holdings;
  const govRef = typeRefOf(v2, 'GOV_BOND');
  const regRef = regionRefOf(v2, regionId);

  // 1. THE REGISTER — the institutions, the household sector and the central banks, whatever
  //    books it holds today (`registerBooks` is the one statement of that, §9.13-EQUITY). A
  //    central bank's book is its own holder class here, because the ownership shares and the
  //    UI report it as one; the row is the same shape as anyone else's.
  // A bank's book reports under its TICKER (the key every consumer of this walk has always seen
  // for a bank), and a bank holds its OWN sovereign as its liquidity buffer (07c's domestic
  // mandate), so the row's region test is the issuer's, as for every other book.
  const activeBanks = state.companies.filter((c) => isActiveCompany(c) && c.bankBalanceSheet !== undefined);
  const bankTickerById = new Map(activeBanks.map((c) => [c.id as string, c.ticker as string]));
  if (govRef >= 0 && regRef >= 0) {
    registerBooks((state.institutionalEntities ?? []).filter((e) => !e.isDefaulted).map((e) => e.id), activeBanks.map((c) => c.id))
      .forEach((b) => {
        const holderClass: SovereignHolderClass = b.payee.kind === 'CENTRAL_BANK' ? 'CENTRAL_BANK' : b.payee.kind === 'BANK' ? 'BANK' : 'REGISTER';
        const holderKey = holderClass === 'CENTRAL_BANK' ? 'CB' : holderClass === 'BANK' ? (bankTickerById.get(b.id) ?? b.id) : b.id;
        for (let r = bookHeadOf(v2, b.id); r >= 0; r = H.next[r]) {
          if (H.typeRef[r] !== govRef || H.regionRef[r] !== regRef) continue;
          const faceLocal = rowUnits(H, r);
          if (faceLocal !== 0) visit({ bondId: instrumentIdAt(v2, r), holderKey, holderClass, faceLocal });
        }
      });
  }

  // 2. THE DESKS' inventory — still outside the register (§3.13-BOOK d3d).
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    const sheet = c.bankBalanceSheet;
    if (!sheet) return;
    if (c.region !== regionId) return;
    // The DESKS off the banks that carry them, not off `bankingSector.sovBondDealerInventory` —
    // that regional array is a derived roll-up (`regionalDeskView`) which keeps only the money,
    // so it cannot report a face at all (§9.13-CREDIT row 5b found `O1` reading it for one).
    (['sovereign bond', 'bill'] as const).forEach((book) => {
      (sheet.dealerDeskInventory?.[book] ?? []).forEach((p) => {
        const faceLocal = p.units ?? p.inventoryLocal;
        if (faceLocal !== 0) visit({ bondId: p.instrumentId, holderKey: c.ticker, holderClass: 'DESK', faceLocal });
      });
    });
  });

  // 3. A COMPANY'S OWN TREASURY BOOK. `stage08-back` writes it, `O1`'s credit arms counted it and
  // no sovereign walk ever did — so a treasury's government paper was outstanding, held, and
  // invisible to every check that asks who holds a bond.
  state.companies.forEach((c) => {
    if (!isActiveCompany(c)) return;
    (c.treasuryHoldings ?? []).forEach((h) => {
      if (h.issuerRegion !== regionId || holdingClassOf(h.instrumentType) !== 'SOVEREIGN') return;
      const faceLocal = h.units ?? h.quantityOrNotionalLocal ?? 0;
      if (faceLocal !== 0) visit({ bondId: h.instrumentId, holderKey: c.ticker, holderClass: 'TREASURY', faceLocal });
    });
  });
}

/** What each BOND of a region's ladder is claimed by, summed over every store. */
export function sovereignHeldByBond(v2: V2World, state: GameState, regionId: RegionId): Map<string, number> {
  const out = new Map<string, number>();
  forEachSovereignPosition(v2, state, regionId, (p) => {
    if (p.faceLocal > 0) out.set(p.bondId, (out.get(p.bondId) ?? 0) + p.faceLocal);
  });
  return out;
}

/** What each CLASS of holder holds of a region's paper — `holdings-view`'s ownership shares. */
export function sovereignHeldByClass(v2: V2World, state: GameState, regionId: RegionId): Record<SovereignHolderClass, number> {
  const out: Record<SovereignHolderClass, number> = { REGISTER: 0, BANK: 0, CENTRAL_BANK: 0, DESK: 0, TREASURY: 0 };
  forEachSovereignPosition(v2, state, regionId, (p) => {
    if (p.faceLocal > 0) out[p.holderClass] += p.faceLocal;
  });
  return out;
}

/** One sovereign row of a register book: the bond, its FACE and its VALUE (the mark). */
export interface SovereignRow { row: number; bondId: InstrumentId; issuerRegion: RegionId; faceLocal: number; valueLocal: number }

/**
 * §3.13-BOOK d3a/d3b — A BOOK'S SOVEREIGN ROWS, read off the register. Every reader of the deleted
 * `Record<bondId, dollars>` books asks this: an auction's participant (face held), stage 11's
 * maturities and reinvestment (face), coupon income (face), repo collateral (face), and a balance
 * sheet (value — the mark, which is what the Record held and what `register-marking` moves).
 */
export function sovereignRowsOf(v2: V2World, bookId: string): SovereignRow[] {
  const H = v2.holdings;
  const govRef = typeRefOf(v2, 'GOV_BOND');
  const out: SovereignRow[] = [];
  if (govRef < 0) return out;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) {
    if (H.typeRef[r] !== govRef) continue;
    out.push({ row: r, bondId: instrumentIdAt(v2, r), issuerRegion: regionOf(v2, H.regionRef[r]) as RegionId, faceLocal: rowUnits(H, r), valueLocal: H.qtyLocal[r] });
  }
  return out;
}

/** A book's sovereign rows at their marked VALUE — the asset line on the holder's sheet. */
export function sovereignBookLocalOf(v2: V2World, bookId: string): number {
  const H = v2.holdings;
  const govRef = typeRefOf(v2, 'GOV_BOND');
  let total = 0;
  if (govRef < 0) return 0;
  for (let r = bookHeadOf(v2, bookId); r >= 0; r = H.next[r]) if (H.typeRef[r] === govRef) total += H.qtyLocal[r];
  return total;
}

/** The central bank's book, by region. */
export const centralBankPositions = (v2: V2World, regionId: RegionId): SovereignRow[] => sovereignRowsOf(v2, centralBankBookId(regionId));
export const centralBankBookLocal = (v2: V2World, regionId: RegionId): number => sovereignBookLocalOf(v2, centralBankBookId(regionId));
/** A bank's OWN book (§3.13-BOOK d3b), by its entity id — its liquidity buffer, not its desk. */
export const bankSovereignPositions = (v2: V2World, bankId: string): SovereignRow[] => sovereignRowsOf(v2, bankId);
export const bankSovereignBookLocal = (v2: V2World, bankId: string): number => sovereignBookLocalOf(v2, bankId);
/** A bank's own book as `bondId → face`, for the readers that ask by bond. */
export function bankSovereignFaceByBond(v2: V2World, bankId: string): Map<InstrumentId, number> {
  const out = new Map<InstrumentId, number>();
  bankSovereignPositions(v2, bankId).forEach((p) => out.set(p.bondId, (out.get(p.bondId) ?? 0) + p.faceLocal));
  return out;
}
/** A bank's own book as `bondId → marked value`, for the yield read that weights by position. */
export function bankSovereignValueRecord(v2: V2World, bankId: string): Record<string, number> {
  const out: Record<string, number> = {};
  bankSovereignPositions(v2, bankId).forEach((p) => { out[p.bondId] = (out[p.bondId] ?? 0) + p.valueLocal; });
  return out;
}
/** Every bank of a region's own book, summed by bond at marked value — the regional aggregate
 *  `bankingSector.sovereignBondHoldingsByBond` used to store (§3.13-BOOK d3b: a read now). */
export function regionBankSovereignValueRecord(v2: V2World, bankIds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  bankIds.forEach((id) => bankSovereignPositions(v2, id).forEach((p) => { out[p.bondId] = (out[p.bondId] ?? 0) + p.valueLocal; }));
  return out;
}
