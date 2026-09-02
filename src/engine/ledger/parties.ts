/**
 * §5-STRUCT step 4 — THE PARTY REGISTRY. One line per counterparty kind.
 *
 * `PartyRef.kind` was counted at **69 comparison sites across 19 files** (§7.229), 26 of them in
 * `settlement.ts` alone, and the settlement switch is the one that decides where a dollar lands. A
 * new counterparty kind has to be taught to all of them, and a missed case is not a compile error —
 * it is money quietly reported as unresolved.
 *
 * So the facts ABOUT a kind live here, once, and the settlement switch keeps only what is genuinely
 * per-kind behaviour. The two are different things and were tangled: "does this party hold a
 * deposit at a bank" is a fact; "which of its many banks does this week's net settle through" is
 * behaviour.
 */

import { PartyRef } from './party';

export interface PartyModule {
  /** Does this party hold a balance that a bank owes it (so a payment creates a deposit)? */
  readonly holdsDeposit: boolean;
  /** Which deposit line on a bank's sheet its balance sits in, if any. */
  readonly depositLine: 'corporate' | 'institutional' | 'sme' | 'household' | 'none';
  /** Is this the banking system itself, so a payment moves reserves rather than deposits? */
  readonly isBankingSystem: boolean;
  /** Is this a real modelled counterparty, or the declared boundary (§6's frontier list)? */
  readonly isModelled: boolean;
}

/** ONE LINE PER KIND. */
export const PARTY_REGISTRY: Record<PartyRef['kind'], PartyModule> = {
  COMPANY:          { holdsDeposit: true,  depositLine: 'corporate',     isBankingSystem: false, isModelled: true },
  INSTITUTION:      { holdsDeposit: true,  depositLine: 'institutional', isBankingSystem: false, isModelled: true },
  SEGMENT:          { holdsDeposit: true,  depositLine: 'sme',           isBankingSystem: false, isModelled: true },
  HOUSEHOLD:        { holdsDeposit: true,  depositLine: 'household',     isBankingSystem: false, isModelled: true },
  BANK:             { holdsDeposit: false, depositLine: 'none',          isBankingSystem: true,  isModelled: true },
  BANK_CREDIT:      { holdsDeposit: false, depositLine: 'none',          isBankingSystem: true,  isModelled: true },
  BANK_SECURITIES:  { holdsDeposit: false, depositLine: 'none',          isBankingSystem: true,  isModelled: true },
  CENTRAL_BANK:     { holdsDeposit: false, depositLine: 'none',          isBankingSystem: true,  isModelled: true },
  GOVERNMENT:       { holdsDeposit: false, depositLine: 'none',          isBankingSystem: false, isModelled: true },
  CLEARING_HOUSE:   { holdsDeposit: false, depositLine: 'none',          isBankingSystem: false, isModelled: true },
};

export const partyModule = (p: PartyRef): PartyModule => PARTY_REGISTRY[p.kind];
export const holdsDeposit = (p: PartyRef): boolean => PARTY_REGISTRY[p.kind].holdsDeposit;
export const isBankingSystem = (p: PartyRef): boolean => PARTY_REGISTRY[p.kind].isBankingSystem;
export const isModelledParty = (p: PartyRef): boolean => PARTY_REGISTRY[p.kind].isModelled;
