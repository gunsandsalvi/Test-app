/**
 * §5-STRUCT step 1 — WHO CAN BE PAID, AND THE ONE UNION THAT SAYS SO.
 *
 * A `PartyRef` is the ledger's only notion of identity: an id, never an object reference.
 *
 * §3.13-BOOK (c-then-3a) — IT LIVES IN `domain/` NOW, BECAUSE THERE WERE FOUR OF IT. The type
 * sat in `engine/ledger/party.ts` beside the interning table, which is engine machinery — so the
 * domain modules that also needed to name a party could not import it, and each wrote its own:
 *
 *   · `derivatives/contract.ts:DerivativeParty` — COMPANY, BANK, INSTITUTION
 *   · `estate.ts:ClaimHolder`                   — COMPANY, BANK, INSTITUTION (the SAME three,
 *                                                 declared twice under two names)
 *   · `repo.ts:RepoParty`                       — BANK, INSTITUTION, CENTRAL_BANK
 *
 * Four unions for one question, each re-declaring `{ kind: 'BANK'; ticker: Ticker }` and
 * `{ kind: 'INSTITUTION'; id: EntityId }`, and three key functions with **three incompatible
 * formats** for the same party (`partyKey` writes `INSTITUTION:`, `repoPartyKey` writes `INST:`,
 * `derivativePartyKey` writes `INSTITUTION:`). Nothing kept them in step: a new arm, or a change
 * to how an arm is keyed, had to be made four times or it silently was not.
 *
 * They are `Extract` views of this union now, so the arms exist ONCE — which is the whole reason
 * (c-then-3b) can change how a firm is keyed in one place instead of four.
 *
 * The interning table, `partyId` and `partyKey` stay in `engine/ledger/party.ts`, which re-exports
 * this so no importer has to move. The type is domain; the dense-integer table is not.
 */

import type { RegionId } from './geography';
import type { EntityId } from './ids';

export type PartyRef =
  /**
   * §3.13-BOOK (c-then-3b) — THE FOUR FIRM ARMS KEY BY `EntityId`, which is what makes `PartyRef`
   * a VIEW of the entity store rather than a parallel union. They keyed by TICKER while
   * `INSTITUTION` keyed by id, so `entity-index.ts` had to carry two indexes over one store and
   * the CROSS-TABLE CHECK — every position names a holder that exists — had no join between a
   * position's `bookId` and a payment's `partyKey`. One key now, and `partyKey` writes it.
   */
  | { kind: 'COMPANY'; id: EntityId }
  | { kind: 'BANK'; id: EntityId }
  /** SETL2b — the bank's own CREDIT, not its reserves. A loan does not move money from anywhere:
   *  the bank writes a loan on one side and a deposit on the other, and both appear at once. So
   *  a drawdown paid by BANK_CREDIT creates the borrower's balance WITHOUT any reserve leaving
   *  the lender — endogenous money, and the reason a banking system can fund itself. Reserves
   *  move only when the borrower then SPENDS it to a customer of another bank, which happens as
   *  an ordinary payment. (The loan asset stays owned by bank-lending.ts — one writer.) */
  | { kind: 'BANK_CREDIT'; id: EntityId }
  /** SETL6 — a bank settling its OWN securities trade. Reserves move and equity does NOT: the
   *  security is the other leg and the clearing stage books it in the same pass (rule 5).
   *  `BANK` above is the income case, where nothing else arrives and equity is the other side. */
  | { kind: 'BANK_SECURITIES'; id: EntityId }
  /** SETL6 — the central counterparty a cleared book settles through. Every participant, the
   *  dealer and the fee-earning desks settle against it, so it is flat by construction: a
   *  non-zero net is a leg some book forgot to name, reported rather than absorbed. */
  | { kind: 'CLEARING_HOUSE'; region: RegionId }
  /** §3.13-BOOK slice (c2b): the ONE arm keyed by an entity id rather than a ticker — an
   *  institution has no ticker the ledger uses, and this is the inconsistency `c-then` ends by
   *  making `PartyRef` a VIEW of the entity store rather than a parallel union. */
  | { kind: 'INSTITUTION'; id: EntityId }
  /** SEG1 — a private-sector segment pool: the mass of small firms below naming resolution.
   *  Its balance is `cashLocal` on the region's `SmePool`, held across the region's
   *  banks pro-rata by market share (small firms bank everywhere; there is no house bank). */
  | { kind: 'SEGMENT'; region: RegionId; industry: string }
  | { kind: 'HOUSEHOLD'; region: RegionId }
  | { kind: 'GOVERNMENT'; region: RegionId }
  | { kind: 'CENTRAL_BANK'; region: RegionId };

/** One arm, by kind — so a narrow position (a contract's counterparty, a claim's holder) can name
 *  exactly the arms it admits instead of re-declaring them. */
export type PartyOfKind<K extends PartyRef['kind']> = Extract<PartyRef, { kind: K }>;

/** §3.13-BOOK d4a — THE SAME PARTY, compared by what names it: kind and id, or kind and region
 *  (and industry for a segment). The domain's answer to "is this the lender", with no key string
 *  — the ledger's `partyKey` is the same identity spelled for a map. */
export function samePartyRef(a: PartyRef, b: PartyRef): boolean {
  if (a.kind !== b.kind) return false;
  if ('id' in a) return 'id' in b && a.id === b.id;
  if (a.kind === 'SEGMENT') return b.kind === 'SEGMENT' && a.region === b.region && a.industry === b.industry;
  return 'region' in b && a.region === b.region;
}

/**
 * The arms that name an ENTITY in the entity store, as opposed to a region or a segment. Five,
 * because a bank appears three times: `BANK` is its own account, `BANK_CREDIT` the deposit it
 * writes, `BANK_SECURITIES` its trading book — three flavours of one firm, and the reason
 * `entity-index.ts:companyOfParty` resolves all four ticker arms the same way.
 */
export type EntityParty = PartyOfKind<'COMPANY' | 'BANK' | 'BANK_CREDIT' | 'BANK_SECURITIES' | 'INSTITUTION'>;

/**
 * The three a COUNTERPARTY can be: a firm, a bank, or an institution. The two extra bank arms are
 * account flavours rather than parties one can face, so a contract or a claim never names them.
 * `DerivativeParty` and `ClaimHolder` are both exactly this.
 */
export type CounterpartyRef = PartyOfKind<'COMPANY' | 'BANK' | 'INSTITUTION'>;

// ---- THE CONSTRUCTORS (§3.13-BOOK c-then-3a, re-keyed in c-then-3b) ----
//
// 204 object literals built the four firm arms by hand. They go through these now, for the
// reason 13-READ gave every entity-id writer a constructor first: a change of key made in a
// constructor is made once. (c-then-3a) split them by what a site HELD — the entity, or only a
// ticker — and `grep -c PartyOfTicker` was the size of the job left; (c-then-3b) did that job by
// moving the eleven stored ticker references into the entity space, so the ticker forms are
// gone and every site either passes the firm or an id it already holds.

/** A firm, from the firm. */
export const companyParty = (c: { id: EntityId }): PartyOfKind<'COMPANY'> => ({ kind: 'COMPANY', id: c.id });
/** A bank's own account, from the bank. */
export const bankParty = (c: { id: EntityId }): PartyOfKind<'BANK'> => ({ kind: 'BANK', id: c.id });
/** The deposit a bank writes when it lends (SETL2b), from the bank. */
export const bankCreditParty = (c: { id: EntityId }): PartyOfKind<'BANK_CREDIT'> => ({ kind: 'BANK_CREDIT', id: c.id });
/** A bank's trading book (SETL6), from the bank. */
export const bankSecuritiesParty = (c: { id: EntityId }): PartyOfKind<'BANK_SECURITIES'> => ({ kind: 'BANK_SECURITIES', id: c.id });

/**
 * The same four from a bare id, for the sites that hold one without the firm — a register row's
 * lender, a stored reference. The `…PartyOfTicker` forms these replace are gone: there is no
 * ticker in a `PartyRef` any more, so a site that has only a ticker must find the firm first.
 */
export const companyPartyOf = (id: EntityId): PartyOfKind<'COMPANY'> => ({ kind: 'COMPANY', id });
export const bankPartyOf = (id: EntityId): PartyOfKind<'BANK'> => ({ kind: 'BANK', id });
export const bankCreditPartyOf = (id: EntityId): PartyOfKind<'BANK_CREDIT'> => ({ kind: 'BANK_CREDIT', id });
export const bankSecuritiesPartyOf = (id: EntityId): PartyOfKind<'BANK_SECURITIES'> => ({ kind: 'BANK_SECURITIES', id });
