/**
 * step 3 — THE GOVERNMENT, AS AN OBJECT.
 *
 * Before this there was no `Government` anywhere in the model: `domain/government.ts` held twelve
 * free functions over hand-assembled argument bags, and the state they operate on was ~25 fields
 * spread across `Region`. So there was no single place to ask "what does this government owe, what
 * can it spend, and is it inside its own budget" — which is precisely why "EUR outlays
 * exceed its budget" row has never closed. Nothing owned the question.
 *
 * This is a FAÇADE, deliberately. It reads the fields where they are today and owns the RULES; the
 * storage migrates off `Region` afterwards without touching a single caller. That ordering is what
 * makes the change safe to ship one stage at a time.
 *
 * Columnar constraint: it holds a region ID and a reference it does not own, never a copy.
 * When the region's fields become typed-array columns, only the accessors below change.
 */

import { RegionId } from './geography';
import {
  decomposeGovernmentSpending, governmentOutlaysLocal, weeklyInterestExpenseLocal,
} from './government';
import { GovDebtTrancheView } from './region-macro';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../engine/bootstrap/national-accounts';

/** The government's own lines, as they sit on `Region` today. Narrowed so the object cannot reach
 *  the rest of the region — the point of extracting it. */
export interface GovernmentFields {
  governmentRevenueLocal: number;
  governmentSpendingWeeklyLocal: number;
  governmentInterestWeeklyLocal?: number;
  governmentBillDiscountAccrualLocal?: number;
  governmentPayrollWeeklyLocal?: number;
  governmentTransfersWeeklyLocal?: number;
  governmentProcurementBudgetByCategory?: Record<string, number>;
  governmentProcurementSpentLocal?: number;
  governmentOutlaysLocal?: number;
  fiscalStanceScore: number;
}

/** What a week of this government's finances looks like, in one shape rather than four call sites. */
interface FiscalWeek {
  /** Contractual, paid in full: the coupon bill and the staff. */
  interestLocal: number;
  payrollLocal: number;
  /** Discretionary, what is left after the contractual lines. */
  procurementBudgetLocal: number;
  transfersLocal: number;
  /** What the budget actually permits this week. */
  budgetLocal: number;
  /** What was actually paid out. */
  outlaysLocal: number;
  /** Positive = spending beyond the stance's allowance. THE row, as a number on the object
   *  rather than a violation discovered forty weeks downstream. */
  overrunLocal: number;
}

export class Government {
  constructor(
    readonly regionId: RegionId,
    private readonly f: GovernmentFields,
    /** §3.13-SOV row 2: the ladder is the STORE's, read by the caller and passed in — this
     *  module sees fields, never the world. */
    private readonly ladder: readonly GovDebtTrancheView[],
  ) {}

  /**
   * The coupon bill on the real debt stack, and only that. The discount the bills accrete is a
   * statistic, not a debit: their cost lands in the redemption leg, so charging it here as well
   * is the double count `weeklyBillDiscountAccrualLocal` documents. Bills are about a fifth of the
   * stack, so the inflated figure shrank the primary budget every reader of this object saw —
   * and it is what the fiscal red line tests a region against, biasing every one of them toward
   * consolidation. Stage 11 always used the coupon alone; now they agree.
   */
  interestWeeklyLocal(): number {
    return weeklyInterestExpenseLocal(this.ladder);
  }

  payrollWeeklyLocal(): number {
    return Math.max(0, this.f.governmentPayrollWeeklyLocal ?? 0);
  }

  /**
   * THE ONE DECOMPOSITION. Every caller that used to assemble its own argument bag for
   * `decomposeGovernmentSpending` — four stages, the two bootstraps and the harness — asks here
   * instead, so they cannot disagree about what the fiscal stance does or which lines come off
   * the top.
   */
  week(): FiscalWeek {
    const parts = decomposeGovernmentSpending(
      this.f.governmentSpendingWeeklyLocal,
      this.interestWeeklyLocal(),
      GOV_PROCUREMENT_SHARE_OF_SPENDING,
      this.f.fiscalStanceScore,
      this.payrollWeeklyLocal(),
    );
    const budgetLocal = parts.interestLocal + parts.payrollLocal + parts.procurementBudgetLocal + parts.transfersLocal;
    const outlaysLocal = governmentOutlaysLocal({
      interestLocal: parts.interestLocal,
      payrollLocal: parts.payrollLocal,
      transfersLocal: this.f.governmentTransfersWeeklyLocal ?? parts.transfersLocal,
      procurementSpentLocal: this.f.governmentProcurementSpentLocal ?? 0,
    });
    return { ...parts, budgetLocal, outlaysLocal, overrunLocal: Math.max(0, outlaysLocal - budgetLocal) };
  }

  /** The deficit this week: what it spent less what it took. */
  deficitWeeklyLocal(): number {
    return this.week().outlaysLocal - this.f.governmentRevenueLocal;
  }

  /**
   * IS THIS GOVERNMENT INSIDE ITS OWN BUDGET? EUR row asks exactly this and nothing could
   * answer it, because the budget was computed in one stage and the outlays in another and no
   * object held both. A caller that wants to know now asks; a harness check that wants to fail on
   * it reads the same number the engine used.
   *
   * Interest and payroll are contractual (PUB1e) and are never the overrun: an outlay above budget
   * means a DISCRETIONARY line grew past what the stance allows, so the answer names which.
   */
  overrun(): { overrunLocal: number; contractualLocal: number; discretionaryLocal: number } {
    const w = this.week();
    return {
      overrunLocal: w.overrunLocal,
      contractualLocal: w.interestLocal + w.payrollLocal,
      discretionaryLocal: w.outlaysLocal - w.interestLocal - w.payrollLocal,
    };
  }

  /** Total debt outstanding — the stack, not a stated level. */
  debtOutstandingLocal(): number {
    return this.ladder.reduce((a, t) => a + Math.max(0, t.principalLocal), 0);
  }
}

/** Build the object over a region and its ladder. The cast is the façade's whole cost, and it goes
 *  away when the fields move off `Region` into their own record. */
export function governmentOf(regionId: RegionId, region: unknown, ladder: readonly GovDebtTrancheView[]): Government {
  return new Government(regionId, region as GovernmentFields, ladder);
}
