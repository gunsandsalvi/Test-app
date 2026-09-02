/**
 * §5-FINALIZATION R — THE REGISTRY OF EVERY STATED NUMBER (rule 19).
 *
 * A number is a legitimate primitive only if no mechanism in the model can produce it:
 * TECHNOLOGY (what a process physically takes), PREFERENCE (time and risk), POLICY (what an
 * institution chooses). Everything else is an OUTCOME, and a stated value for it is a defect with
 * a scheduled death — a SHAPE (a claim about the answer) or a RESOLUTION (a numerical choice whose
 * test is invariance). This file is where such a number is DECLARED: with its owner (the module
 * that reads it), the reason it is stated rather than measured, and the measurement that would
 * replace it. The scoreboard (audit/index.ts) prints the registry's count every run; §5-DIST-P
 * holds the count, and it may fall and never rise.
 *
 * The hygiene ratchet on fractional literals in the engine (scripts/check-hygiene.sh) is the
 * enforcement: a fraction typed into a stage is one more literal against a budget that only
 * falls; the way to add one is to declare it here, where the literal is not counted because it
 * is owned.
 */

import { defect } from './defect';

export type StatedKind = 'TECHNOLOGY' | 'PREFERENCE' | 'POLICY' | 'SHAPE' | 'RESOLUTION';

export interface StatedNumber {
  /** Stable id, `<area>.<name>` — what the scoreboard and the plan refer to it by. */
  readonly id: string;
  readonly value: number;
  readonly kind: StatedKind;
  /** The module that reads it (its one owner, rule 1.3). */
  readonly owner: string;
  /** Why it is stated: the mechanism that is missing, or the primitive it is. */
  readonly reason: string;
  /** The measurement that would replace it — its scheduled death; 'none' for a true primitive. */
  readonly replacedBy: string;
}

const REGISTRY = new Map<string, StatedNumber>();

/** Declare a stated number once; its value comes back so the declaration IS the constant. */
export function stated(entry: StatedNumber): number {
  const prior = REGISTRY.get(entry.id);
  if (prior) {
    if (prior.value !== entry.value) return defect(`stated number ${entry.id} declared twice with different values (${prior.value}, ${entry.value})`);
    return prior.value;
  }
  REGISTRY.set(entry.id, entry);
  return entry.value;
}

/** The registry, in declaration order. */
export function statedRegistry(): StatedNumber[] { return [...REGISTRY.values()]; }

/** The count by kind — the scoreboard's line. */
export function statedCounts(): Record<StatedKind, number> {
  const out: Record<StatedKind, number> = { TECHNOLOGY: 0, PREFERENCE: 0, POLICY: 0, SHAPE: 0, RESOLUTION: 0 };
  REGISTRY.forEach((s) => { out[s.kind]++; });
  return out;
}

// ---------------------------------------------------------------------------------------------
// THE DECLARATIONS. One block per area; each reads as a sentence the plan can quote.
// ---------------------------------------------------------------------------------------------

// --- The seed's bank books (macro/initialization `seedLoanBookUSD`) ---
/** The seed's opening business loan book as a share of GDP. */
export const SEED_BUSINESS_LOAN_BOOK_TO_GDP = stated({
  id: 'seed.businessLoanBookToGdp', value: 0.040, kind: 'SHAPE',
  owner: 'engine/macro/initialization.ts seedLoanBookUSD',
  reason: 'the seed has no lending history to open a book from; the ratio sizes the SME pools\' migrated debt and a bank\'s opening revenue',
  replacedBy: 'a burn-in in which the banks lend under their own capital constraint and the book is what they wrote (§7.345 burn-in)',
});
/** The seed's opening consumer loan book as a share of GDP. */
export const SEED_CONSUMER_LOAN_BOOK_TO_GDP = stated({
  id: 'seed.consumerLoanBookToGdp', value: 0.070, kind: 'SHAPE',
  owner: 'engine/macro/initialization.ts seedLoanBookUSD',
  reason: 'the household pools HH3 seeds replace this scalar; it still stands in the seed\'s capital arithmetic until the pools exist',
  replacedBy: 'the household books the banks originate week by week (bank-lending.ts runBankHouseholdLending)',
});

// --- The seed's firm-size curve (bootstrap/firms.ts) ---
/** The rank-to-rank decay of the seed's cohort sizes: bank market shares, the insurers' and
 *  managers' slices of the institutional pool are `decay^rank`, normalised. */
export const SEED_FIRM_CONCENTRATION_DECAY = stated({
  id: 'seed.firmConcentrationDecay', value: 0.80, kind: 'SHAPE',
  owner: 'engine/bootstrap/firms.ts',
  reason: 'the seed has no competition history to size a cohort from; a geometric rank curve stands in for the concentration a market produces',
  replacedBy: 'the shares the firms win — a bank\'s deposits by the accounts that bank there, an insurer\'s by the policies it writes',
});
/** The insurers' share of the region's institutional asset pool, split across them on the curve above. */
export const SEED_INSURER_INSTITUTIONAL_SHARE = stated({
  id: 'seed.insurerInstitutionalShare', value: 0.42, kind: 'SHAPE',
  owner: 'engine/bootstrap/firms.ts',
  reason: 'the insurers\' liabilities are not yet the policies households and firms buy; their assets are stated as a slice of the pool',
  replacedBy: 'premiums written against the real exposures (§5-INS): the insurer\'s book is what it insures',
});

// --- The brains (domain/preferences.ts, §5-BRAINS / §5-DIST-P) — the two PREFERENCE ranges ---
/** Patience as a horizon in weeks, log-uniform on [a month, a year]. */
export const PREFERENCE_PATIENCE_WEEKS_MIN = stated({
  id: 'preference.patienceWeeksMin', value: 4, kind: 'PREFERENCE',
  owner: 'domain/preferences.ts', reason: 'the shortest horizon a management runs on — the calendar month', replacedBy: 'none (a true primitive)',
});
export const PREFERENCE_PATIENCE_WEEKS_MAX = stated({
  id: 'preference.patienceWeeksMax', value: 52, kind: 'PREFERENCE',
  owner: 'domain/preferences.ts', reason: 'the longest — the measured year (§7.138)', replacedBy: 'none (a true primitive)',
});
/** Risk aversion relative to 1, log-uniform on [half, double]. */
export const PREFERENCE_RISK_AVERSION_MIN = stated({
  id: 'preference.riskAversionMin', value: 0.5, kind: 'PREFERENCE',
  owner: 'domain/preferences.ts', reason: 'the least risk-averse management, relative to the median rule', replacedBy: 'none (a true primitive)',
});
export const PREFERENCE_RISK_AVERSION_MAX = stated({
  id: 'preference.riskAversionMax', value: 2.0, kind: 'PREFERENCE',
  owner: 'domain/preferences.ts', reason: 'the most risk-averse, relative to the median rule', replacedBy: 'none (a true primitive)',
});
