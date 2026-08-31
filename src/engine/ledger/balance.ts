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

/**
 * §5-STRUCT step 1 — ONE BANK ABSORBS ANOTHER'S BOOK.
 *
 * Not a payment: no money moves and nothing is created. Every line of the target's balance sheet
 * becomes the acquirer's, and the target's is emptied so the same dollar is never counted on two
 * sheets. It lives here rather than in `10-mergers.ts` for the reason the whole module exists — a
 * balance-sheet line has ONE writer, and "the acquirer's deposits go up" is exactly the kind of
 * rule that ends up inline in a stage and is then invisible when it goes wrong (§7.229).
 *
 * The caller still owns everything that is NOT a balance: the shell, the tickers, the news.
 */
export function absorbBankBook(
  acquirer: { depositsUSD: number; wholesaleFundingUSD?: number; cashReservesUSD: number;
    corporateDepositsUSD?: number; institutionalDepositsUSD?: number; smeDepositsUSD?: number },
  target: { depositsUSD: number; wholesaleFundingUSD?: number; cashReservesUSD: number;
    corporateDepositsUSD?: number; institutionalDepositsUSD?: number; smeDepositsUSD?: number }
): void {
  acquirer.depositsUSD += target.depositsUSD;
  acquirer.wholesaleFundingUSD = (acquirer.wholesaleFundingUSD ?? 0) + (target.wholesaleFundingUSD ?? 0);
  acquirer.cashReservesUSD += target.cashReservesUSD;
  acquirer.corporateDepositsUSD = (acquirer.corporateDepositsUSD ?? 0) + (target.corporateDepositsUSD ?? 0);
  acquirer.institutionalDepositsUSD = (acquirer.institutionalDepositsUSD ?? 0) + (target.institutionalDepositsUSD ?? 0);
  acquirer.smeDepositsUSD = (acquirer.smeDepositsUSD ?? 0) + (target.smeDepositsUSD ?? 0);
  target.depositsUSD = 0;
  target.wholesaleFundingUSD = 0;
  target.cashReservesUSD = 0;
  target.corporateDepositsUSD = 0;
  target.institutionalDepositsUSD = 0;
  target.smeDepositsUSD = 0;
}
