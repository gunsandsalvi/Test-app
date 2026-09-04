/**
 * REPO — secured funding as an instrument somebody holds.
 *
 * What this replaces. Repo already CLEARED — the same auction engine as every other book, with
 * derived schedules and the standing facility as a real seat — but it was not an ASSET CLASS.
 * A position was a scalar `repoLentLocal` beside books that itemize everything else (rule 4); who
 * lent to whom was unknowable, so the cash leg had no counterparty and the collateral leg had no
 * owner (rule 5); and the pledge was one number, so no particular bond was encumbered and
 * collateral quality could not matter.
 *
 * A repo is now a CONTRACT: a named lender, a named borrower, the rate it was struck at, the
 * week it matures, and the specific paper pledged against it. It is stored ONCE, on the region's
 * book, with both parties named — which is what makes it two-sided (rule 5) without being two
 * copies of one thing (rule 4). Every scalar the sheets used to carry is derived from it.
 *
 * Sovereign general collateral only, deliberately (§5-REPO's scope decision): `collateral` names
 * a tenor BUCKET, and other collateral becomes another kind of registry entry rather than a
 * rewrite of this file (rule 15).
 */

import { RegionId } from './geography';
import type { EntityId } from './ids';
import type { PartyOfKind } from './party';
import type { InstrumentId } from './ids';

/**
 * §3.13-BOOK (c-then-3a) — the two named arms are views of the ONE union; the central bank's is
 * the one genuine variant in the model and stays declared here. `PartyRef`'s
 * `{ kind: 'CENTRAL_BANK'; region }` carries a region because a payment can cross a border; a
 * repo cannot. `reg.repoBook` is per region, so the region is already stated by the book the
 * contract sits in and `repoPartyKey`'s `'CB'` is unambiguous within it — checked, not assumed
 * (`repo-clearing.ts:379,814` both read one region's book).
 */
export type RepoParty =
  | PartyOfKind<'BANK'>
  | PartyOfKind<'INSTITUTION'>
  /** The standing facility. A posted-rate seat in the auction, and a real counterparty here. */
  | { kind: 'CENTRAL_BANK' };

/** The specific paper pledged: which bond, and how much face of it. */
export interface RepoPledge {
  /** §3.13-BOOK slice (a): the paper pledged, in the INSTRUMENT id space — the same key the
   *  register and the sovereign ladder use. */
  bondId: InstrumentId;
  faceLocal: number;
}

export interface RepoContract {
  id: string;
  regionId: RegionId;
  lender: RepoParty;
  /** Borrowers are named banks: nothing else in the model funds itself secured yet. */
  borrowerId: EntityId;
  principalLocal: number;
  /** Annualised decimal, struck at this session's cleared level (rule 8). */
  rateAnnual: number;
  struckWeek: number;
  /** REPO3: overnight is `struckWeek + 1`; term is further out and cannot be called back. */
  maturityWeek: number;
  collateral: RepoPledge[];
}

export function repoPartyKey(p: RepoParty): string {
  // §3.13-BOOK (c-then-3b): every named arm is an entity id, and `INST:` is `INSTITUTION:` —
  // the same party under two key formats, which is what one union was supposed to end.
  return p.kind === 'CENTRAL_BANK' ? 'CB' : `${p.kind}:${p.id}`;
}

/** One week's interest on a contract, at the rate it was struck at. */
export function repoWeeklyInterestLocal(c: RepoContract): number {
  return (c.principalLocal * c.rateAnnual) / 52;
}

/** Interest owed over a contract's whole life — what settles when it matures. */
export function repoInterestToMaturityLocal(c: RepoContract): number {
  const weeks = Math.max(1, c.maturityWeek - c.struckWeek);
  return (c.principalLocal * c.rateAnnual * weeks) / 52;
}

export function repoBorrowedLocal(book: RepoContract[], bankId: EntityId): number {
  return book.reduce((a, c) => a + (c.borrowerId === bankId ? c.principalLocal : 0), 0);
}

export function repoLentLocal(book: RepoContract[], party: RepoParty): number {
  const key = repoPartyKey(party);
  return book.reduce((a, c) => a + (repoPartyKey(c.lender) === key ? c.principalLocal : 0), 0);
}

/** What the central bank's window has outstanding to one bank — the sheet's `srfBorrowingLocal`. */
export function srfBorrowedLocal(book: RepoContract[], bankId: EntityId): number {
  return book.reduce(
    (a, c) => a + (c.borrowerId === bankId && c.lender.kind === 'CENTRAL_BANK' ? c.principalLocal : 0), 0
  );
}

/**
 * REPO2 — encumbrance is a property of the pledged PAPER, not one number on the sheet. What this
 * bank has pledged, bond by bond, at face: 07c and 07f read it as a floor on the bonds they
 * actually touch, so pledging thirty-year paper stops constraining the two-year book.
 */
export function encumberedFaceByBond(book: RepoContract[], bankId: EntityId): Map<InstrumentId, number> {
  const byBond = new Map<InstrumentId, number>();
  book.forEach((c) => {
    if (c.borrowerId !== bankId) return;
    c.collateral.forEach((p) => byBond.set(p.bondId, (byBond.get(p.bondId) ?? 0) + p.faceLocal));
  });
  return byBond;
}

/** Total face pledged by one bank across every bond. */
export function encumberedFaceLocal(book: RepoContract[], bankId: EntityId): number {
  let faceLocal = 0;
  encumberedFaceByBond(book, bankId).forEach((v) => { faceLocal += v; });
  return faceLocal;
}

/** The contracts that come due at or before `week` — what settles before new ones are struck. */
export function maturingAt(book: RepoContract[], week: number): RepoContract[] {
  return book.filter((c) => c.maturityWeek <= week);
}
