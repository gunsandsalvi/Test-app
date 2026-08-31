/**
 * §5-STRUCT step 3 — THE GOVERNMENT, AS AN OBJECT.
 *
 * Before this there was no `Government` anywhere in the model: `domain/government.ts` held twelve
 * free functions over hand-assembled argument bags, and the state they operate on was ~25 fields
 * spread across `Region`. So there was no single place to ask "what does this government owe, what
 * can it spend, and is it inside its own budget" — which is precisely why §6.1's "EUR outlays
 * exceed its budget" row has never closed. Nothing owned the question.
 *
 * This is a FAÇADE, deliberately. It reads the fields where they are today and owns the RULES; the
 * storage migrates off `Region` afterwards without touching a single caller. That ordering is what
 * makes the change safe to ship one stage at a time (§5-STRUCT, strangler fig).
 *
 * Columnar constraint (§7.228): it holds a region ID and a reference it does not own, never a copy.
 * When the region's fields become typed-array columns, only the accessors below change.
 */

import { RegionId } from './geography';
import {
  decomposeGovernmentSpending, governmentOutlaysUSD, weeklyInterestExpenseUSD,
  weeklyBillDiscountAccrualUSD,
} from './government';
import { GovDebtTranche } from './region-macro';
import { GOV_PROCUREMENT_SHARE_OF_SPENDING } from '../engine/bootstrap/national-accounts';

/** The government's own lines, as they sit on `Region` today. Narrowed so the object cannot reach
 *  the rest of the region — the point of extracting it. */
export interface GovernmentFields {
  governmentRevenueUSD: number;
  governmentSpendingUSD: number;
  governmentInterestWeeklyUSD?: number;
  governmentBillDiscountAccrualUSD?: number;
  governmentPayrollWeeklyUSD?: number;
  governmentTransfersWeeklyUSD?: number;
  governmentProcurementBudgetByCategory?: Record<string, number>;
  governmentProcurementSpentUSD?: number;
  governmentOutlaysUSD?: number;
  fiscalStanceScore: number;
  govDebtTranches: GovDebtTranche[];
}

/** What a week of this government's finances looks like, in one shape rather than four call sites. */
export interface FiscalWeek {
  /** Contractual, paid in full: the coupon bill and the staff. */
  interestUSD: number;
  payrollUSD: number;
  /** Discretionary, what is left after the contractual lines. */
  procurementBudgetUSD: number;
  transfersUSD: number;
  /** What the budget actually permits this week. */
  budgetUSD: number;
  /** What was actually paid out. */
  outlaysUSD: number;
  /** Positive = spending beyond the stance's allowance. THE §6.1 row, as a number on the object
   *  rather than a violation discovered forty weeks downstream. */
  overrunUSD: number;
}

export class Government {
  constructor(
    readonly regionId: RegionId,
    private readonly f: GovernmentFields
  ) {}

  /** The coupon bill on the real debt stack, plus what the discount bills accrete. */
  interestWeeklyUSD(): number {
    return weeklyInterestExpenseUSD(this.f.govDebtTranches)
      + weeklyBillDiscountAccrualUSD(this.f.govDebtTranches);
  }

  payrollWeeklyUSD(): number {
    return Math.max(0, this.f.governmentPayrollWeeklyUSD ?? 0);
  }

  /**
   * THE ONE DECOMPOSITION. Every caller that used to assemble its own argument bag for
   * `decomposeGovernmentSpending` — four stages, the two bootstraps and the harness — asks here
   * instead, so they cannot disagree about what the fiscal stance does or which lines come off
   * the top.
   */
  week(): FiscalWeek {
    const parts = decomposeGovernmentSpending(
      this.f.governmentSpendingUSD,
      this.interestWeeklyUSD(),
      GOV_PROCUREMENT_SHARE_OF_SPENDING,
      this.f.fiscalStanceScore,
      this.payrollWeeklyUSD(),
    );
    const budgetUSD = parts.interestUSD + parts.payrollUSD + parts.procurementBudgetUSD + parts.transfersUSD;
    const outlaysUSD = governmentOutlaysUSD({
      interestUSD: parts.interestUSD,
      payrollUSD: parts.payrollUSD,
      transfersUSD: this.f.governmentTransfersWeeklyUSD ?? parts.transfersUSD,
      procurementSpentUSD: this.f.governmentProcurementSpentUSD ?? 0,
    });
    return { ...parts, budgetUSD, outlaysUSD, overrunUSD: Math.max(0, outlaysUSD - budgetUSD) };
  }

  /** The deficit this week: what it spent less what it took. */
  deficitWeeklyUSD(): number {
    return this.week().outlaysUSD - this.f.governmentRevenueUSD;
  }

  /**
   * IS THIS GOVERNMENT INSIDE ITS OWN BUDGET? §6.1's EUR row asks exactly this and nothing could
   * answer it, because the budget was computed in one stage and the outlays in another and no
   * object held both. A caller that wants to know now asks; a harness check that wants to fail on
   * it reads the same number the engine used.
   *
   * Interest and payroll are contractual (PUB1e) and are never the overrun: an outlay above budget
   * means a DISCRETIONARY line grew past what the stance allows, so the answer names which.
   */
  overrun(): { overrunUSD: number; contractualUSD: number; discretionaryUSD: number } {
    const w = this.week();
    return {
      overrunUSD: w.overrunUSD,
      contractualUSD: w.interestUSD + w.payrollUSD,
      discretionaryUSD: w.outlaysUSD - w.interestUSD - w.payrollUSD,
    };
  }

  /** Total debt outstanding — the stack, not a stated level. */
  debtOutstandingUSD(): number {
    return (this.f.govDebtTranches ?? []).reduce((a, t) => a + Math.max(0, t.principalUSD ?? 0), 0);
  }
}

/** Build the object over a region. The cast is the façade's whole cost, and it goes away when the
 *  fields move off `Region` into their own record. */
export function governmentOf(regionId: RegionId, region: unknown): Government {
  return new Government(regionId, region as GovernmentFields);
}
