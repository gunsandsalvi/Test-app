/**
 * §5-STRUCT step 1 — WHO CAN BE PAID.
 *
 * A `PartyRef` is the ledger's only notion of identity: an id, never an object reference. Moved out
 * of `settlement.ts` so that the money API does not live inside one of the stages that uses it —
 * the shape §7.229 found everywhere and the reason a rule with no home ends up inline in a
 * two-thousand-line function.
 */

import { RegionId } from '../../types';

export type PartyRef =
  | { kind: 'COMPANY'; ticker: string }
  | { kind: 'BANK'; ticker: string }
  /** SETL2b — the bank's own CREDIT, not its reserves. A loan does not move money from anywhere:
   *  the bank writes a loan on one side and a deposit on the other, and both appear at once. So
   *  a drawdown paid by BANK_CREDIT creates the borrower's balance WITHOUT any reserve leaving
   *  the lender — endogenous money, and the reason a banking system can fund itself. Reserves
   *  move only when the borrower then SPENDS it to a customer of another bank, which happens as
   *  an ordinary payment. (The loan asset stays owned by bank-lending.ts — one writer.) */
  | { kind: 'BANK_CREDIT'; ticker: string }
  /** SETL6 — a bank settling its OWN securities trade. Reserves move and equity does NOT: the
   *  security is the other leg and the clearing stage books it in the same pass (rule 14).
   *  `BANK` above is the income case, where nothing else arrives and equity is the other side. */
  | { kind: 'BANK_SECURITIES'; ticker: string }
  /** SETL6 — the central counterparty a cleared book settles through. Every participant, the
   *  dealer and the fee-earning desks settle against it, so it is flat by construction: a
   *  non-zero net is a leg some book forgot to name, reported rather than absorbed. */
  | { kind: 'CLEARING_HOUSE'; region: RegionId }
  | { kind: 'INSTITUTION'; id: string }
  /** SEG1 — a private-sector segment pool: the mass of small firms below naming resolution.
   *  Its balance is `cashUSD` on the region's `SmePool`, held across the region's
   *  banks pro-rata by market share (small firms bank everywhere; there is no house bank). */
  | { kind: 'SEGMENT'; region: RegionId; industry: string }
  | { kind: 'HOUSEHOLD'; region: RegionId }
  | { kind: 'GOVERNMENT'; region: RegionId }
  | { kind: 'CENTRAL_BANK'; region: RegionId }
  /** The named boundary: a counterparty this model does not have yet. Watched down, never
   *  netted away (§6's discipline for unmodeled lines). */
  | { kind: 'UNMODELED'; region: RegionId };

/**
 * SCALE — A PARTY IS AN `int32`.
 *
 * `partyKey` built a fresh string on every call and was called four times per payment — twice
 * here, twice again in the netting pass. Measured: **145,000 distinct payments a week, so ~580,000
 * string builds** for identities that never change. The interning table below hands each party a
 * dense integer once, so identity is an integer compare, the running net is an ARRAY indexed by
 * that integer rather than a hash map, and `partyKey` — still the ledgers' key, still exported —
 * becomes an array read after a party's first appearance.
 *
 * Parties are stable for the life of the process (a ticker is a ticker), so the table is too.
 */
const PARTY_KINDS: PartyRef['kind'][] = [
  'COMPANY', 'BANK', 'BANK_CREDIT', 'BANK_SECURITIES', 'CLEARING_HOUSE',
  'INSTITUTION', 'SEGMENT', 'HOUSEHOLD', 'GOVERNMENT', 'CENTRAL_BANK', 'UNMODELED',
];
const KIND_INDEX = new Map<string, number>(PARTY_KINDS.map((k, i) => [k, i]));
/** One name→id map per kind, so the kind never has to be concatenated into the lookup. */
const idByKindName: Map<string, number>[] = PARTY_KINDS.map(() => new Map<string, number>());
const partyKeyById: string[] = [];
const partyRefById: PartyRef[] = [];

/** The part of a party's identity that varies within its kind. */
const partyName = (p: PartyRef): string =>
  p.kind === 'COMPANY' || p.kind === 'BANK' || p.kind === 'BANK_CREDIT' || p.kind === 'BANK_SECURITIES'
    ? p.ticker
    : p.kind === 'INSTITUTION' ? p.id
      : p.kind === 'SEGMENT' ? `${p.region}\u0000${p.industry}`
        : p.region;

/** This party's dense integer id, assigned on first sight. */
export function partyId(p: PartyRef): number {
  const kindIdx = KIND_INDEX.get(p.kind) ?? 0;
  const name = partyName(p);
  const table = idByKindName[kindIdx];
  const existing = table.get(name);
  if (existing !== undefined) return existing;
  const id = partyKeyById.length;
  table.set(name, id);
  partyKeyById.push(
    p.kind === 'SEGMENT' ? `SEGMENT:${p.region}:${p.industry}` : `${p.kind}:${name}`);
  partyRefById.push(p);
  return id;
}

/** The party behind an id, for the apply pass. */
export const partyOf = (id: number): PartyRef => partyRefById[id];

export const partyKey = (p: PartyRef): string => partyKeyById[partyId(p)];

/** The inverse of `partyKey`, for the ledgers that key a balance by party (CAL's accrual). */
export function partyFromKey(key: string): PartyRef | undefined {
  const first = key.indexOf(':');
  if (first < 0) return undefined;
  const kind = key.slice(0, first);
  const rest = key.slice(first + 1);
  switch (kind) {
    case 'COMPANY': case 'BANK': case 'BANK_CREDIT': case 'BANK_SECURITIES':
      return { kind, ticker: rest } as PartyRef;
    case 'INSTITUTION':
      return { kind: 'INSTITUTION', id: rest };
    case 'SEGMENT': {
      const at = rest.indexOf(':');
      return at < 0 ? undefined
        : { kind: 'SEGMENT', region: rest.slice(0, at) as any, industry: rest.slice(at + 1) as any };
    }
    case 'GOVERNMENT': case 'CENTRAL_BANK': case 'HOUSEHOLD': case 'CLEARING_HOUSE': case 'UNMODELED':
      return { kind, region: rest } as PartyRef;
    default:
      return undefined;
  }
}
