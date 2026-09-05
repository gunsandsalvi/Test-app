/**
 * §3.13-BOOK slice (c-then) — THE ENTITY INDEX: ONE SHAPE FOR "WHO IS THIS".
 *
 * The entity store is two arrays — `companies` and `institutionalEntities` — and every consumer
 * that needed to turn an id or a ticker back into the thing built its own map over them. Measured
 * before this file existed: **thirty index builds** across the audit, the stages and the seed, and
 * three of them in `settlement.ts` alone, where `partyRegionOf` and `regionOfParty` were the SAME
 * switch over the same two maps written twice sixty lines apart (rule 4). The cost is not the
 * milliseconds; it is that thirty copies of "who is this" drift, and a `PartyRef` cannot become a
 * VIEW of a store that has no single read door.
 *
 * **THE PREDICATE STAYS AT THE SITE, AND THAT IS DELIBERATE.** The four `bankByTicker` builds this
 * replaces did NOT agree on what a bank is — `isBankEntity` alone (the audit's O4, stage 08's
 * lanes), `bankBalanceSheet` alone (estate resolution, which must find DEAD banks or a bank's
 * estate cannot be resolved at all), and `banksOf` = live sheet + active (settlement). Collapsing
 * those into one filter would silently pick one of three answers and change two behaviours; so
 * this file indexes EVERY entity, alive or dead, and each caller names its own predicate on the
 * result — `banksOf`, `isActiveCompany`, `bankBalanceSheet` — where it can be read. An index is a
 * lookup; a filter is a claim.
 *
 * **IT IS NOT MEMOISED, AND THAT IS ALSO DELIBERATE** (rule 19's stale mirror).
 * `08-company-fundamentals.ts:470` replaces elements of `updatedCompanies` IN PLACE, at the same
 * index and the same length, so a cache keyed on the array's identity — or on its length — hands
 * back last week's object for a live ticker. The audit is the one place a memo is safe, because it
 * runs at the close over a world no stage is still writing and is handed a fresh state each week;
 * it keeps its own `WeakMap` (`audit/ownership.ts`) and passes the result here.
 */

import type { Company } from '../../domain/company';
import type { InstitutionalEntity } from '../../domain/institutions';
import type { EntityId, Ticker } from '../../domain/ids';
import type { RegionId } from '../../domain/geography';
import type { PartyRef } from './party';
import { assertNever } from '../../domain/defect';

/**
 * Every entity the world has named, by each of the two identities a firm carries and the one an
 * institution does. Read-only by type: the index is a view of the store, never a place to write.
 */
export interface EntityIndex {
  readonly companyById: ReadonlyMap<EntityId, Company>;
  readonly companyByTicker: ReadonlyMap<Ticker, Company>;
  readonly institutionById: ReadonlyMap<EntityId, InstitutionalEntity>;
}

/**
 * One pass over the two arrays. Takes the arrays rather than a state or a context so the audit
 * (`state.companies`) and the engine (`ctx.updatedCompanies`) build the same shape from the two
 * different snapshots each of them legitimately holds.
 */
export function buildEntityIndex(
  companies: readonly Company[],
  institutions: readonly InstitutionalEntity[],
): EntityIndex {
  const companyById = new Map<EntityId, Company>();
  const companyByTicker = new Map<Ticker, Company>();
  for (const c of companies) {
    companyById.set(c.id, c);
    companyByTicker.set(c.ticker, c);
  }
  const institutionById = new Map<EntityId, InstitutionalEntity>();
  for (const e of institutions) institutionById.set(e.id, e);
  return { companyById, companyByTicker, institutionById };
}

/**
 * The firm behind a `PartyRef`, for the four arms that name one. The other six arms are not
 * firms — a segment, a household, a government, a central bank and the clearing house are parties
 * without a company row — so this answers `undefined` for them by construction rather than by a
 * failed lookup, and a caller that needs to tell those apart switches on `ref.kind` itself.
 *
 * §3.13-BOOK (c-then-3b) keyed those four arms by `EntityId`; this function was the seam.
 */
export function companyOfParty(index: EntityIndex, ref: PartyRef): Company | undefined {
  switch (ref.kind) {
    case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES':
      return index.companyById.get(ref.id);
    case 'INSTITUTION': case 'SEGMENT': case 'HOUSEHOLD':
    case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CLEARING_HOUSE': case 'CCP':
      return undefined;
    default: return assertNever(ref, 'companyOfParty');
  }
}

/**
 * C4b — WHICH CENTRAL BANK'S SYSTEM A SIDE OF A PAYMENT LIVES IN.
 *
 * Every party but the clearing house has one; the clearing house is the hub a leg passes through,
 * so a leg to or from it attributes through its OTHER side and the hub itself contributes nothing.
 * That `undefined` is a statement, not a miss — it is why the arm carries a region it does not
 * answer with.
 *
 * A firm or an institution the index does not hold also answers `undefined`: the caller decides
 * whether an unknown party is an unresolved payment or a party outside its snapshot, and both
 * callers today count it (`settlement.ts` into `unresolvedLocal`).
 */
export function regionOfParty(index: EntityIndex, ref: PartyRef): RegionId | undefined {
  switch (ref.kind) {
    case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES':
      return index.companyById.get(ref.id)?.region;
    case 'INSTITUTION': return index.institutionById.get(ref.id)?.region;
    case 'SEGMENT': case 'HOUSEHOLD': case 'GOVERNMENT': case 'CENTRAL_BANK': case 'CCP':
      return ref.region;
    case 'CLEARING_HOUSE': return undefined;
    default: return assertNever(ref, 'regionOfParty');
  }
}
