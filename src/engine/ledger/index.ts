/**
 * §5-STRUCT step 1 — THE MONEY API. Import money from here, from nowhere else.
 *
 * `post` is the only conserved way to move money: it takes a payer AND a payee, so a one-legged
 * flow cannot be written by accident. `creditUnbacked` is the named exception for a stage that does
 * not yet know its counterparty; it is counted and printed, so it is loud rather than silent, and
 * the count is a to-do list.
 *
 * WHY THIS EXISTS (§7.229): before it, forty-three sites across fifteen files assigned to a balance
 * directly, and two mechanisms existed solely to absorb the resulting gap — 02b's reconcile, which
 * invented 14.3B of reserves a week, and the `Math.max(0, cashUSD)` clamp, which destroyed negative
 * balances and so created 6.0B a week of overspend. Conservation was a habit forty-three authors
 * happened to share. It is now a property of the import graph, enforced by `check-hygiene.sh`.
 */

export type { PartyRef } from './party';
export { partyId, partyOf, partyKey, partyFromKey } from './party';
export type { PartyModule } from './parties';
export { PARTY_REGISTRY, partyModule, holdsDeposit, isBankingSystem, isModelledParty } from './parties';
export { creditHolderBalance } from './balance';
export type { WireInstruction, WireJournal, AssetKind } from './wire';
export { wire, wirePush, newWireJournal, setActiveWireJournal, activeWireJournal, internAsset, assetText, assetKindOfId, summarizeWires, ASSET_KINDS } from './wire';

/**
 * Record a conserved payment: payer down, payee up, one row in the week's journal. This IS
 * `settlement.pay` — the name changes at the boundary because "pay" reads like a stage's verb and
 * this is the ledger's primitive.
 */
export { pay as post } from '../simulation/stages/settlement';
export type { PaymentInstruction, PaymentJournal } from '../simulation/stages/settlement';
export { newPaymentJournal, journalPayment, reasonText } from '../simulation/stages/settlement';
