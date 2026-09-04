/**
 * §5-STRUCT step 1 — THE ONE PLACE A BALANCE IS WRITTEN.
 *
 * The audit that produced this module (§7.229) found **43 direct writes to a money field across 15
 * files**, and two mechanisms whose entire job is to absorb the damage: 02b's reconcile, which
 * INVENTS reserves for any balance a stage moved without a payment instruction (14.3B a week), and
 * the `Math.max(0, cashLocal)` overdraft clamp, which destroys negative balances and so creates the
 * money that was overspent (6.0B a week). `unbackedBankCashLocal` ran 213B to 585B in seventeen weeks.
 *
 * None of that is a bug anyone introduced. It is what happens when conservation is a habit that
 * forty-three authors happen to share rather than a property of the code. The fix is not to find the
 * forty-three; it is to make the forty-fourth impossible.
 *
 * SO: every movement of money is a DOUBLE-ENTRY POST (`post()` in ./post.ts), which requires a payer
 * AND a payee. There is no single-sided API that is not named for what it is. When a stage genuinely
 * has no counterparty yet, it says so — `creditUnbacked` — and that call is counted and printed, so
 * an unbacked movement is loud rather than silent. That is the migration ladder, and it only runs one
 * way: direct write -> `creditUnbacked` (visible, counted) -> `post` (backed, conserved).
 *
 * FIELD SHAPE (§5-STRUCT's columnar note): every function here takes a `PartyRef` — an id, never an
 * object reference — so that when stage state moves into `SharedArrayBuffer`s the resolution changes
 * and the callers do not.
 */

import { PartyRef } from './party';

/**
 * THE END-STATE NOUN, STATED AS A TYPE (§5-STRUCT Tier 2's target). Today a balance is a
 * differently-named field on five types resolved by a kind-switch — `cash` on a Company,
 * `cashLocal` on an entity, `cashReservesLocal` / four deposit lines on a bank sheet, `cashLocal` on a
 * pool — which is the structural root under every money row §7.241 audited: the grep that cannot
 * see `cash` by name, the spread rebuild, the payer an instruction cannot express. The migration's
 * target is that those fields become VIEWS of rows shaped like this, owned by the ledger, keyed by
 * party — at which point conservation stops being a property the watchdog measures and becomes the
 * only thing the data structure can represent. Nothing constructs this yet ON PURPOSE: it lands
 * with the columnar state (SCALE Wave 2), where an account is a row index, not an object.
 */
export interface Account {
  readonly holder: PartyRef;
  /** The named bank whose liability this balance is (null only for the central bank's own). */
  readonly bankTicker: string | null;
  balanceLocal: number;
}
