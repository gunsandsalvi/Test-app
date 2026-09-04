/**
 * DRV — THE STANDING BOOK, INDEXED IN ONE WALK (FINALIZATION step 0, §7.382).
 *
 * Every derivative market asks the live book the same two questions before it strikes: what
 * cover a party already carries on one side of one class (§7.241 — never re-hedge what the book
 * already covers) and what potential-future exposure a party's whole derivative book already
 * charges against the one desk budget (registry.ts). The four market stages asked them by
 * WALKING EVERY CONTRACT PER PARTICIPANT — a producer, a consumer, a fund, an invoice holder, a
 * desk per commodity per tenor — and built a party-key string per contract per walk. With the
 * book growing ~3k rows a week (§7.328) that was two fifths of the week (§7.380).
 *
 * This is the same arithmetic folded once: one pass over the book, every sum accumulated in
 * BOOK ORDER (the order the walks summed in, so every float is the one the walk produced), then
 * a lookup per question. `extend` folds the contracts struck since (a strike only ever APPENDS
 * to the book; a contract leaves only when the lifecycle replaces the array, which is when the
 * owner builds a fresh index). The index is a party's map of its eight (class, side) books,
 * each with its totals by reference and by tenor — short keys, no composite strings (§7.383:
 * the first version built four ~45-character keys per side per contract and cost 5% of the week).
 */

import { DerivativeClassId, DerivativeContract, derivativePartyKey } from './contract';
import { DERIVATIVE_CLASS_IDS, pfeAddOnRateOf } from './registry';

interface Cover { usd: number; units: number }
interface ByRef extends Cover { byTerm: Map<string, Cover> }
/** One party's one side of one class: its total, by reference, by tenor, by both. */
interface SideBook extends Cover { byRef: Map<string, ByRef>; byTerm: Map<string, Cover> }

const sideIndex = (classId: DerivativeClassId, side: 'a' | 'b'): number =>
  DERIVATIVE_CLASS_IDS.indexOf(classId) * 2 + (side === 'a' ? 0 : 1);

export class StandingBook {
  private readonly books = new Map<string, (SideBook | undefined)[]>();
  private readonly chargeUSD = new Map<string, number>();
  /** How many contracts of the book the index has folded; `extend` resumes from here. */
  indexed = 0;

  constructor(
    /** The week the questions are asked in: a contract at or past maturity is not standing. */
    readonly week: number,
    /** The reference's grade, for the class whose add-on depends on it (CDS, §7.341). */
    private readonly isInvestmentGrade: (referenceId: string) => boolean
  ) {}

  /** Fold every contract not yet indexed, in book order. */
  extend(book: readonly DerivativeContract[]): void {
    for (let i = this.indexed; i < book.length; i++) this.add(book[i]);
    this.indexed = book.length;
  }

  private add(c: DerivativeContract): void {
    if (c.maturityWeek <= this.week) return;
    const aKey = derivativePartyKey(c.a);
    const bKey = derivativePartyKey(c.b);
    const units = c.units ?? 0;
    this.addCover(this.sideBook(aKey, sideIndex(c.classId, 'a')), c.referenceId, c.termKey, c.notional, units);
    this.addCover(this.sideBook(bKey, sideIndex(c.classId, 'b')), c.referenceId, c.termKey, c.notional, units);
    // Charged on either side, once per contract (a party standing on both sides is one charge).
    const chargeUSD = c.notional * pfeAddOnRateOf(c, this.isInvestmentGrade);
    this.chargeUSD.set(aKey, (this.chargeUSD.get(aKey) ?? 0) + chargeUSD);
    if (bKey !== aKey) this.chargeUSD.set(bKey, (this.chargeUSD.get(bKey) ?? 0) + chargeUSD);
  }

  private sideBook(partyKey: string, idx: number): SideBook {
    let sides = this.books.get(partyKey);
    if (!sides) { sides = new Array(DERIVATIVE_CLASS_IDS.length * 2).fill(undefined); this.books.set(partyKey, sides); }
    let book = sides[idx];
    if (!book) { book = { usd: 0, units: 0, byRef: new Map(), byTerm: new Map() }; sides[idx] = book; }
    return book;
  }

  private addCover(book: SideBook, referenceId: string, termKey: string, usd: number, units: number): void {
    // The four shapes a question takes: the party's whole side of the class, on one reference
    // at any tenor, at one tenor on any reference, and on one reference at one tenor.
    book.usd += usd; book.units += units;
    let ref = book.byRef.get(referenceId);
    if (!ref) { ref = { usd: 0, units: 0, byTerm: new Map() }; book.byRef.set(referenceId, ref); }
    ref.usd += usd; ref.units += units;
    let term = book.byTerm.get(termKey);
    if (!term) { term = { usd: 0, units: 0 }; book.byTerm.set(termKey, term); }
    term.usd += usd; term.units += units;
    let refTerm = ref.byTerm.get(termKey);
    if (!refTerm) { refTerm = { usd: 0, units: 0 }; ref.byTerm.set(termKey, refTerm); }
    refTerm.usd += usd; refTerm.units += units;
  }

  private cover(classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId?: string, termKey?: string): Cover | undefined {
    const book = this.books.get(partyKey)?.[sideIndex(classId, side)];
    if (!book) return undefined;
    if (referenceId === undefined) return termKey === undefined ? book : book.byTerm.get(termKey);
    const ref = book.byRef.get(referenceId);
    return termKey === undefined ? ref : ref?.byTerm.get(termKey);
  }

  /** `standingCoverUSD` (contract.ts) answered from the index: live notional on one side. */
  coverUSD(classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId?: string, termKey?: string): number {
    return this.cover(classId, side, partyKey, referenceId, termKey)?.usd ?? 0;
  }

  /** `standingCoverUnits` (contract.ts) answered from the index: live physical size on one side. */
  coverUnits(classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId: string, termKey: string): number {
    return this.cover(classId, side, partyKey, referenceId, termKey)?.units ?? 0;
  }

  /** `standingPfeChargeUSD` (registry.ts) with the reference's grade: what a party's standing
   *  book already charges against the one desk budget, every class at its own add-on. */
  pfeChargeUSD(partyKey: string): number {
    return this.chargeUSD.get(partyKey) ?? 0;
  }
}
