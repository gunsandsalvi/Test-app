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
import { BankingSector, householdBookRwaUSD, businessLoanBookOf } from './banking';

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

/** The bank's risk-weighted book — what the capital ratio and every capital charge divide by. */
export function bankRwaUSD(sheet: BankingSector): number {
  // HH3: the household book's weight is per-kind (a secured mortgage consumes less capital
  // than a card balance). §5-WIRES D: both books are read off the rows.
  return businessLoanBookOf(sheet) * 1.0 + householdBookRwaUSD(sheet.householdLoans);
}

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
  // §7.341 — ONE curve. A region with no measured tier books used to get a second curve of its
  // own (`min(0.09, (u − 4.5%) × 1.4)`), which is the "two consumer loss curves in one function"
  // row: the mix is the only thing a missing measurement leaves unknown, so it takes the tier
  // ladder's seed shares and the same curve.
  const share = (tier: string, fallback: number) =>
    creditTierBooks?.find((t) => t.tier === tier)?.shareOfHouseholds ?? fallback;
  const weightedMultiplier =
    share('SUPER_PRIME', 0.25) * 0.2 + share('PRIME', 0.50) * 1.0 +
    share('NEAR_PRIME', 0.15) * 3.0 + share('SUBPRIME', 0.10) * 10.0;
  return base * weightedMultiplier;
}

/** An instalment loan loses half of what a revolving balance does on the same borrower: it
 *  amortises, so the exposure at default is smaller and the borrower who stops paying is
 *  further into the schedule. One owner for the ratio the seed quote and the weekly book share. */
export const CONSUMER_TERM_LOSS_SHARE_OF_CARD = 0.5;
export function consumerTermAnnualLossRate(cardAnnualLossRate: number): number {
  return cardAnnualLossRate * CONSUMER_TERM_LOSS_SHARE_OF_CARD;
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
