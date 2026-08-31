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
   *  Charged in full by the shared code — a profile never sees it as a choice. */
  weeklyPayrollUSD: number;
  /** §7.122 step 4: the real annual cost of what this firm consumed — its products' recipe lots
   *  if it makes anything, its profile's input basket if it does not. Charged in full, shared. */
  inputCostAnnualUSD: number;
}

/**
 * Everything a profile decides — **and a margin is not on the list (§7.122 step 3).**
 *
 * It used to return `newEbitdaMargin` and `newEbitda`, which was permission to STATE a margin,
 * and three of the four did: a bank 0.40, an asset manager 0.35, an insurer 0.15. Meanwhile the
 * operating path built EBITDA up from real costs (IND3), so what a margin MEANT depended on which
 * arm of the dispatch a firm went down — the §7.115 drift, one level up from the code path that
 * caused it.
 *
 * Now a profile returns only what is genuinely its own: how it EARNS, and the costs no other kind
 * of firm has. Payroll, inputs and general opex are common and charged by the caller, which is
 * the only place EBITDA is computed. Profile-specific book fields are still written onto `comp`
 * directly (an insurer's reserves, a manager's AUM, a carrier's fleet marks).
 */
export interface ProfilePnl {
  newRevenue: number;
  /** Annualised costs only this kind of firm has: a bank's credit losses, an insurer's claims.
   *  NEVER payroll, inputs or general opex — those are common and the caller charges them. */
  profileCostsAnnualUSD: number;
  /** Annualised income earned outside revenue — an insurer's investment return on its float. */
  otherIncomeAnnualUSD?: number;
}

export type ProfileModule = (input: ProfileInput) => ProfilePnl;

/** The one place a kind is read. `sector === 'Banks'` is the historical alias for an unlabelled
 * bank and lives here rather than in a stage condition. Returns the UNION, not string (§7.241):
 * the old `'OPERATING'` return was a key outside the union that missed the registry by accident;
 * an unlabelled firm IS a STANDARD_OPERATING one, and now the registry lookup type-checks. */
export function profileKeyOf(comp: Company): import('../../../../domain/company').FinancialStatementProfile {
  if (comp.financialStatementProfile === 'BANK' || comp.sector === 'Banks') return 'BANK';
  return comp.financialStatementProfile ?? 'STANDARD_OPERATING';
}
