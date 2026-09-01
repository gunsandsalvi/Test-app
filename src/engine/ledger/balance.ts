/**
 * §5-STRUCT step 1 — THE ONE PLACE A BALANCE IS WRITTEN.
 *
 * The audit that produced this module (§7.229) found **43 direct writes to a money field across 15
 * files**, and two mechanisms whose entire job is to absorb the damage: 02b's reconcile, which
 * INVENTS reserves for any balance a stage moved without a payment instruction (14.3B a week), and
 * the `Math.max(0, cashUSD)` overdraft clamp, which destroys negative balances and so creates the
 * money that was overspent (6.0B a week). `unbackedBankCashUSD` ran 213B to 585B in seventeen weeks.
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

import { WeeklyStepContext } from '../simulation/stages/context';
import { PartyRef } from './party';

/**
 * THE END-STATE NOUN, STATED AS A TYPE (§5-STRUCT Tier 2's target). Today a balance is a
 * differently-named field on five types resolved by a kind-switch — `cash` on a Company,
 * `cashUSD` on an entity, `cashReservesUSD` / four deposit lines on a bank sheet, `cashUSD` on a
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
  balanceUSD: number;
}

/** What an unbacked credit was for, and how much of it there was — the boundary, made countable. */
export interface UnbackedLedger {
  totalUSD: number;
  byReason: Record<string, number>;
}

export function newUnbackedLedger(): UnbackedLedger {
  return { totalUSD: 0, byReason: {} };
}

/**
 * Move a holder's own balance. **This is the only function in the engine that may do so** — see
 * `check-hygiene.sh`, which fails the build on an assignment to a money field anywhere else.
 *
 * It writes the HOLDER's side only. The banking-system side (whose deposits, whose reserves) is the
 * settlement stage's, because it nets a whole week before it touches a bank. Callers that want a
 * conserved movement call `post()` instead and never see this.
 *
 * Returns false when the party could not be resolved, so the caller can report it rather than
 * silently lose the money — the one behaviour this module exists to prevent.
 */
export function creditHolderBalance(
  ctx: WeeklyStepContext,
  party: PartyRef,
  deltaUSD: number
): boolean {
  if (!isFinite(deltaUSD) || deltaUSD === 0) return true;
  switch (party.kind) {
    case 'COMPANY': {
      const comp = ctx.updatedCompanies.find((c) => c.ticker === party.ticker);
      if (!comp) return false;
      comp.cash += deltaUSD;
      return true;
    }
    case 'INSTITUTION': {
      const entity = ctx.updatedInstitutionalEntities.find((e) => e.id === party.id);
      if (!entity) return false;
      entity.cashUSD = (entity.cashUSD ?? 0) + deltaUSD;
      return true;
    }
    case 'SEGMENT': {
      const seg = ctx.updatedRegions[party.region]?.smePools?.find((s) => s.industry === party.industry);
      if (!seg) return false;
      seg.cashUSD = (seg.cashUSD ?? 0) + deltaUSD;
      return true;
    }
    case 'HOUSEHOLD': {
      const hs = ctx.updatedRegions[party.region]?.householdState;
      if (!hs) return false;
      hs.depositsUSD = (hs.depositsUSD ?? 0) + deltaUSD;
      return true;
    }
    // A bank's own reserves, the treasury account and the central bank's book are not holder
    // balances: they are the banking system's own lines, and settlement owns them because it is
    // the pass that knows the week's net. Nothing else may move them.
    default:
      return false;
  }
}

/**
 * A movement with no counterparty named yet. **This is a defect with a name, not an escape hatch.**
 *
 * It exists so a migration can proceed one stage at a time without either (a) leaving direct writes
 * in place, or (b) inventing a counterparty that is not real. Every call lands in a counter the
 * harness prints by reason, exactly like `BOUNDARY_FRONTIERS` — so the number is a to-do list that
 * has to go down, and an unbacked movement can never again be indistinguishable from a payment.
 *
 * If you are adding a call to this, you are recording that you do not yet know who paid. Say so in
 * the reason string, because that string is what someone will read when they come to close it.
 */
export function creditUnbacked(
  ctx: WeeklyStepContext,
  party: PartyRef,
  deltaUSD: number,
  reason: string
): void {
  if (!isFinite(deltaUSD) || deltaUSD === 0) return;
  const ok = creditHolderBalance(ctx, party, deltaUSD);
  const ledger = ctx.unbackedLedger;
  if (!ledger) return;
  const key = ok ? reason : `${reason} (party unresolved)`;
  ledger.totalUSD += Math.abs(deltaUSD);
  ledger.byReason[key] = (ledger.byReason[key] ?? 0) + deltaUSD;
}

