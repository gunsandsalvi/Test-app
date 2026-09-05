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
}

export const ccpSheetOf = (cashLocal: number, marginHeldLocal: number): CcpSheet => ({ cashLocal, marginHeldLocal });

/**
 * What the clearing house holds BEYOND its members' margin: the margin a party that ceased to
 * exist never took back, and — from 17-iv-c — the default fund and its own capital. Negative
 * means the CCP holds less cash than it owes its members, which is a defect until the waterfall
 * gives it a meaning.
 */
export const ccpFreeResourcesLocal = (s: CcpSheet): number => s.cashLocal - s.marginHeldLocal;

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
