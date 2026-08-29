/**
 * Financial-statement profiles (BP1c) — rule 17's behavior half.
 *
 * How a firm's weekly P&L is built varies by WHAT KIND of firm it is, and that variation used to
 * be a four-arm `if (financialStatementProfile === ...)` chain inside stage 08. Under rule 17 a
 * stage may not switch on a kind: it keys the kind once and calls the profile. Adding a profile —
 * a new lender type, a different revenue recognition, a fund with its own fee mechanics — is a
 * new module plus one registry line, with no stage edited.
 *
 * The OPERATING path (goods producers) stays inline in stage 08 for now and is named here as the
 * default: IND2 (revenue mechanisms) and IND3 (cost shapes) decompose it into profiles as their
 * own work, so extracting it now only to re-cut it there would be wasted motion.
 *
 * **What a profile may NOT vary (IND-R1).** Payroll is common: every firm has staff the labor
 * market hired, and it owes them whatever kind of firm it is. It is computed once before the
 * dispatch and handed in below. A profile chooses only how its COST SHAPE absorbs it. Capex and
 * input purchases join it as IND2/IND3 decompose the operating path.
 */

import { GameState, Region, Company, InstitutionalEntity } from '../../../../types';
import { WeeklyStepContext } from '../context';

export interface ProfileInput {
  comp: Company;
  reg: Region;
  state: GameState;
  ctx: WeeklyStepContext;
  entityById: Map<string, InstitutionalEntity>;
  annualInterest: number;
  taxRate: number;
  perShare: (amountUSD: number) => number;
  /** IND-R1: the firm's real weekly wage bill, computed once for every firm before the dispatch.
   *  A profile decides how its cost shape absorbs it — in full, or only the deviation below. */
  weeklyPayrollUSD: number;
  /** The part of that payroll a STATED margin does not already contain (annualised). A profile
   *  built on a stated margin charges this; one that builds its costs up charges the full bill. */
  payrollAboveBaselineAnnualUSD: number;
}

/** Everything a profile decides. Profile-specific book fields are written onto `comp` directly,
 * exactly as the branches did (an insurer's reserves, a manager's AUM, a carrier's fleet marks). */
export interface ProfilePnl {
  newRevenue: number;
  newEbitdaMargin: number;
  newEbitda: number;
  newEbit: number;
  newNetIncome: number;
  newEps: number;
}

export type ProfileModule = (input: ProfileInput) => ProfilePnl;

/** The one place a kind is read. `sector === 'Banks'` is the historical alias for an unlabelled
 * bank and lives here rather than in a stage condition. */
export function profileKeyOf(comp: Company): string {
  if (comp.financialStatementProfile === 'BANK' || comp.sector === 'Banks') return 'BANK';
  return comp.financialStatementProfile ?? 'OPERATING';
}
