/**
 * §3.17-iv-a — THE CENTRAL COUNTERPARTY IS A PARTY WITH A BALANCE SHEET.
 *
 * A region has one derivatives clearing house (`PartyRef` kind `CCP`), and it is a REAL party:
 * it holds cash at the region's banks, the way the household sector and the pools do, and what
 * it holds is the initial margin its members posted. That is the difference from the cash books'
 * `CLEARING_HOUSE`, which is a settlement pass-through — flat by construction, holding nothing
 * and bearing nothing. A CCP that holds margin can lose it, and that is what the atlas's C3 and
 * C5 ask for: a named party whose resources are finite and enumerable
 * (`docs/systems/the-derivative-layer.md` C).
 *
 * The sheet here is what 17-iv-a gives it — cash held and margin held. The default fund and the
 * CCP's own capital (C3's other two lines) come with the waterfall (17-iv-c).
 */
import { CurrencyCode, REGION_BY_CURRENCY, RegionId } from './geography';
import { bankSecuritiesParty, ccpParty, CounterpartyRef, PartyOfKind, PartyRef } from './party';

export interface CcpSheet {
  /** Cash the clearing house holds at the region's banks, in the region's money. */
  cashLocal: number;
  /** Initial margin its live contracts posted to it, in the same money — a liability to the
   *  members, returned when each contract ends. */
  marginHeldLocal: number;
  /** §3.17-iv-c-i — the default fund: what the members have paid in against a member's default
   *  (`CcpFundContribution`), a liability to each until it is written down by the waterfall. */
  defaultFundLocal: number;
}

export const ccpSheetOf = (cashLocal: number, marginHeldLocal: number, defaultFundLocal: number): CcpSheet => ({ cashLocal, marginHeldLocal, defaultFundLocal });

/**
 * THE HOUSE'S OWN CAPITAL — C3's third line: what it holds beyond its members' money. It has no
 * shareholders and charges no fee, so its capital is what it has RETAINED: the margin a member
 * that ceased to exist never took back, less every loss the waterfall has put on the house
 * (17-iv-c-ii). Negative means the house holds less cash than it owes its members — past the end
 * of its resources, which is C5's real event.
 */
export const ccpOwnCapitalLocal = (s: CcpSheet): number => s.cashLocal - s.marginHeldLocal - s.defaultFundLocal;

/**
 * §3.17-iv-c-i — A MEMBER'S CONTRIBUTION TO THE DEFAULT FUND: a row of the contract store
 * (`contract-ledger.ts:ccpFundOf`), the house as one party and the member as the other, in the
 * house's money. Trued up every week to the member's share of the fund the house requires.
 */
export interface CcpFundContribution {
  regionId: RegionId;
  member: CounterpartyRef;
  amountLocal: number;
}

/**
 * THE CLOSE-OUT HORIZON, in sessions. Initial margin covers ONE session's move of the reference
 * (§3.17-ii); a defaulted member's book takes longer than that to close out, and the fund is
 * there for the move over the rest of the horizon. Five sessions is the horizon a cleared OTC
 * book is conventionally margined to; the move over it scales with its square root.
 */
export const CCP_CLOSE_OUT_SESSIONS = 5;

/**
 * COVER-ONE: the fund covers the LARGEST member's loss over the close-out horizon beyond the
 * margin it posted — its margin, scaled from one session's move to the horizon's, less the
 * margin itself. A house with no members needs no fund.
 */
export function coverOneFundLocal(marginByMember: Iterable<number>): number {
  let largest = 0;
  for (const m of marginByMember) if (m > largest) largest = m;
  return largest * (Math.sqrt(CCP_CLOSE_OUT_SESSIONS) - 1);
}

/** Each member's share of the fund, pro rata to the margin it has at the house — the member the
 *  house is most exposed to pays the most. */
export function fundContributionsOf<K>(requiredLocal: number, marginByMember: ReadonlyMap<K, number>): Map<K, number> {
  let total = 0;
  marginByMember.forEach((m) => { total += Math.max(0, m); });
  const out = new Map<K, number>();
  marginByMember.forEach((m, k) => out.set(k, total > 0 ? requiredLocal * Math.max(0, m) / total : 0));
  return out;
}

/**
 * THE CLEARING HOUSE A CONTRACT CLEARS AT: the one whose money the contract settles in. A
 * contract states its currency at strike (`contract.ts:currency`), and margin is posted in that
 * money — so the CCP that holds it is the one that keeps its books in it, and it never holds a
 * foreign balance.
 */
export const ccpOfMoney = (currency: CurrencyCode): PartyOfKind<'CCP'> => ccpParty(REGION_BY_CURRENCY[currency]);
export const ccpOfContract = (c: { currency: CurrencyCode }): PartyOfKind<'CCP'> => ccpOfMoney(c.currency);
/** The region a clearing house keeps its books in — its own. */
export const ccpRegionOf = (p: PartyOfKind<'CCP'>): RegionId => p.region;

/**
 * §3.17-iv-b — THE ACCOUNT A MEMBER'S MARGIN MOVES THROUGH. Margin is an asset swap, not income:
 * a bank member posts it from its securities account (reserves move, equity does not,
 * `party.ts:BANK_SECURITIES`) and carries what it posted as an asset
 * (`contract-ledger.ts:bankMarginAtHouseLocal`); a firm or a fund pays it from the one account it
 * has. Variation margin is P&L and goes through the member's own account, not this one.
 */
export const memberMarginAccount = (p: CounterpartyRef): PartyRef => (p.kind === 'BANK' ? bankSecuritiesParty(p) : p);

/** Every contract has two members, and each posts the margin the contract carries (§3.17-ii sizes
 *  it from the reference's move, which cuts both ways). */
export const MEMBERS_PER_CONTRACT = 2;
