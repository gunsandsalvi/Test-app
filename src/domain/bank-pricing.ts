/**
 * §5-STRUCT step 2 — HOW A BANK PRICES CREDIT, as pure rules over flat inputs.
 *
 * Extracted from `stages/bank-lending.ts` so the quotes a bank makes — the price of every loan
 * it writes — can be asked a question without running a world. The G2 transmission (§7.40:
 * +300bp policy → quoted margin 582 → 857bp → SME origination −51%) rides entirely on these
 * functions; a defect in them fails a test now rather than surfacing forty weeks downstream as
 * a NIM number.
 */

import { CreditTierBook } from './region-macro';

/** The workout prior: what a defaulted credit recovers before this region has measured its own
 *  experience (G5 displaces it with the realized rate, one resolution at a time — §7.192). */
export const CREDIT_RECOVERY_RATE = 0.4;

/** The capital ratio a bank's treasury actually RUNS at — the buffer above the 8% floor that
 *  real supervision demands and real banks keep. Origination prices against consuming it;
 *  breaching the floor itself is where the bank declines outright. */
export const BANK_WORKING_CAPITAL_RATIO = 0.11;
export const BANK_MIN_CAPITAL_RATIO = 0.08;

/** The fallback hurdle for a quote made where no particular bank is lending (the household
 *  aggregate's average rate) or by a bank with no measured beta yet. G3c met the stated exit
 *  condition: a named bank's hurdle is its OWN cost of equity (`bankRequiredReturnAnnual`,
 *  which stays beside the equity-risk-premium owner in the engine). */
export const BANK_TARGET_ROE = 0.12;

/** One margin quote for any borrower: expected loss + capital cost, in bps over policy. */
export function quoteLoanMarginBps(params: {
  annualDefaultProbability: number;
  /** Risk weight of the exposure (1.0 business). */
  riskWeight: number;
  /** G3c: the quoting bank's own cost of equity. Omitted only where no one bank is quoting. */
  requiredReturnAnnual?: number;
  /** G5: what this region's workouts have actually recovered. Omitted falls back to the prior. */
  recoveryRate?: number;
}): number {
  const expectedLossBps = params.annualDefaultProbability * (1 - (params.recoveryRate ?? CREDIT_RECOVERY_RATE)) * 10000;
  const capitalCostBps = params.riskWeight * BANK_WORKING_CAPITAL_RATIO
    * (params.requiredReturnAnnual ?? BANK_TARGET_ROE) * 10000;
  return Math.max(25, Math.round(expectedLossBps + capitalCostBps));
}

/**
 * The consumer book's annual loss rate: the region's own unemployment through the measured
 * credit-tier mix — a subprime-heavy book loses a multiple of a super-prime one on the SAME
 * regional print (§7.205 put the tiers on the buffer axis; the multipliers are the tiers' own
 * delinquency ladder, not per-region choices).
 */
export function consumerAnnualLossRate(
  unemploymentRate: number,
  creditTierBooks: CreditTierBook[] | undefined
): number {
  const base = Math.max(0.005, Math.min(0.12, Math.max(0, unemploymentRate - 0.03) * 1.2));
  if (!creditTierBooks || creditTierBooks.length === 0) {
    return Math.min(0.09, Math.max(0, unemploymentRate - 0.045) * 1.4);
  }
  const share = (tier: string, fallback: number) =>
    creditTierBooks.find((t) => t.tier === tier)?.shareOfHouseholds ?? fallback;
  const weightedMultiplier =
    share('SUPER_PRIME', 0.25) * 0.2 + share('PRIME', 0.50) * 1.0 +
    share('NEAR_PRIME', 0.15) * 3.0 + share('SUBPRIME', 0.10) * 10.0;
  return base * weightedMultiplier;
}

/** One margin quote for unsecured household credit: measured loss + capital + operating cost. */
export function quoteHouseholdMarginBps(params: {
  annualLossRate: number;
  riskWeight: number;
  operatingCostBps: number;
  /** G3c: the quoting bank's own cost of equity. Omitted only where no one bank is quoting. */
  requiredReturnAnnual?: number;
}): number {
  // The measured loss rate is already frequency x severity, so it IS the expected-loss term.
  const expectedLossBps = params.annualLossRate * 10000;
  const capitalCostBps = params.riskWeight * BANK_WORKING_CAPITAL_RATIO
    * (params.requiredReturnAnnual ?? BANK_TARGET_ROE) * 10000;
  return Math.max(50, Math.round(expectedLossBps + capitalCostBps + params.operatingCostBps));
}
