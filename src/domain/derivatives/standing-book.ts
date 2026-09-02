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
 * owner builds a fresh index).
 */

import { DerivativeClassId, DerivativeContract, derivativePartyKey } from './contract';
import { DERIVATIVE_CLASSES, pfeAddOnRateOf } from './registry';

interface Cover { usd: number; units: number }
interface Charge { gradedUSD: number; flatUSD: number }

const WILDCARD = '*';
const coverKey = (classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId: string, termKey: string) =>
  `${classId}|${side}|${partyKey}|${referenceId}|${termKey}`;

export class StandingBook {
  private readonly cover = new Map<string, Cover>();
  private readonly charge = new Map<string, Charge>();
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
    this.addCover(c.classId, 'a', aKey, c.referenceId, c.termKey, c.notionalUSD, units);
    this.addCover(c.classId, 'b', bKey, c.referenceId, c.termKey, c.notionalUSD, units);
    // Charged on either side, once per contract (a party standing on both sides is one charge).
    const gradedUSD = c.notionalUSD * pfeAddOnRateOf(c, this.isInvestmentGrade);
    const flatUSD = c.notionalUSD * DERIVATIVE_CLASSES[c.classId].pfeAddOnRate;
    this.addCharge(aKey, gradedUSD, flatUSD);
    if (bKey !== aKey) this.addCharge(bKey, gradedUSD, flatUSD);
  }

  private addCover(
    classId: DerivativeClassId, side: 'a' | 'b', partyKey: string,
    referenceId: string, termKey: string, usd: number, units: number
  ): void {
    // The four shapes a question takes: on one reference at one tenor, on one reference at any
    // tenor, at one tenor on any reference, and the party's whole side of the class.
    this.addTo(coverKey(classId, side, partyKey, referenceId, termKey), usd, units);
    this.addTo(coverKey(classId, side, partyKey, referenceId, WILDCARD), usd, units);
    this.addTo(coverKey(classId, side, partyKey, WILDCARD, termKey), usd, units);
    this.addTo(coverKey(classId, side, partyKey, WILDCARD, WILDCARD), usd, units);
  }

  private addTo(key: string, usd: number, units: number): void {
    const entry = this.cover.get(key);
    if (entry) { entry.usd += usd; entry.units += units; return; }
    this.cover.set(key, { usd, units });
  }

  private addCharge(partyKey: string, gradedUSD: number, flatUSD: number): void {
    const entry = this.charge.get(partyKey);
    if (entry) { entry.gradedUSD += gradedUSD; entry.flatUSD += flatUSD; return; }
    this.charge.set(partyKey, { gradedUSD, flatUSD });
  }

  /** `standingCoverUSD` (contract.ts) answered from the index: live notional on one side. */
  coverUSD(classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId?: string, termKey?: string): number {
    return this.cover.get(coverKey(classId, side, partyKey, referenceId ?? WILDCARD, termKey ?? WILDCARD))?.usd ?? 0;
  }

  /** `standingCoverUnits` (contract.ts) answered from the index: live physical size on one side. */
  coverUnits(classId: DerivativeClassId, side: 'a' | 'b', partyKey: string, referenceId: string, termKey: string): number {
    return this.cover.get(coverKey(classId, side, partyKey, referenceId, termKey))?.units ?? 0;
  }

  /** `standingPfeChargeUSD` (registry.ts) with the reference's grade: what a party's standing
   *  book already charges against the one desk budget, every class at its own add-on. */
  pfeChargeUSD(partyKey: string): number {
    return this.charge.get(partyKey)?.gradedUSD ?? 0;
  }

  /** The same charge at every class's FLAT add-on — what `standingPfeChargeUSD` answers when
   *  the caller passes no grade. Kept only while a caller still reads it that way. */
  pfeChargeFlatUSD(partyKey: string): number {
    return this.charge.get(partyKey)?.flatUSD ?? 0;
  }
}
