/**
 * DER1 — interest-rate swaps, and the first cross-market basis this model can produce.
 *
 * Why this market first: its two-sided demand already exists and is measurable off books the
 * model already keeps. A bank carries a FIXED-rate sovereign book funded by liabilities that
 * reprice with policy, so a rise in rates costs it capital and it pays fixed to stop that. A
 * corporate with FLOATING debt has an interest bill that moves against its own earnings, and pays
 * fixed when the move would break its coverage. On the other side, an insurer or a pension fund
 * has a long, fixed claim to match and never enough duration to match it, so it receives fixed.
 *
 * Nothing here is a new preference. Each participant's SIZE is the exposure its own balance sheet
 * cannot absorb, and each RESERVATION is the alternative it already has: a receiver will not take
 * less fixed than the government bond of the same tenor pays it, and a payer will not pay more
 * than carrying the risk unhedged would cost. The cleared par rate minus the sovereign zero is
 * the SWAP SPREAD — a price this model has never had, and the first test that two of its markets
 * agree with each other.
 */

import { RegionId } from './geography';
import { DerivativeParty, derivativePartyKey } from './derivatives';

export type SwapTenorKey = 's2' | 's5' | 's10';

export const SWAP_TENOR_YEARS: Record<SwapTenorKey, number> = { s2: 2, s5: 5, s10: 10 };
export const SWAP_TENORS: SwapTenorKey[] = ['s2', 's5', 's10'];

/** Which point of the cleared sovereign curve each swap tenor is measured against. */
export const SWAP_TENOR_ZERO_FIELD: Record<SwapTenorKey, 'tenor2Y' | 'tenor5Y' | 'tenor10Y'> = {
  s2: 'tenor2Y', s5: 'tenor5Y', s10: 'tenor10Y',
};

/** DRV — one party encoding for every derivative book; the per-class union died with it. */
export type SwapParty = DerivativeParty;

export interface SwapContract {
  id: string;
  regionId: RegionId;
  tenorKey: SwapTenorKey;
  /** Pays the fixed rate, receives floating. */
  payer: SwapParty;
  /** Receives the fixed rate, pays floating. */
  receiver: SwapParty;
  notionalUSD: number;
  /** The par rate the swap was struck at, annualised decimal (rule 9). */
  fixedRateAnnual: number;
  struckWeek: number;
  maturityWeek: number;
}

export const swapPartyKey = derivativePartyKey;

/**
 * One week's net settlement on a swap, positive when the RECEIVER is owed.
 *
 * The floating leg pays the policy rate the week actually printed; the fixed leg pays what the
 * swap was struck at. So a payer of fixed gains when rates rise above its strike, which is
 * exactly the hedge it entered the swap for.
 */
export function swapWeeklyNetToReceiverUSD(c: SwapContract, floatingRateAnnual: number): number {
  return (c.notionalUSD * (c.fixedRateAnnual - floatingRateAnnual)) / 52;
}

/** Net notional a party is paying fixed on (negative when it is a net receiver). */
export function netPayFixedUSD(book: SwapContract[], party: SwapParty): number {
  const key = swapPartyKey(party);
  return book.reduce((a, c) =>
    a + (swapPartyKey(c.payer) === key ? c.notionalUSD : 0)
      - (swapPartyKey(c.receiver) === key ? c.notionalUSD : 0), 0);
}

/**
 * The DV01-equivalent loss a fixed-rate book suffers on a two-sigma weekly repricing — what an
 * owner has to decide whether it can absorb. Duration times the move, on the notional.
 */
export function repricingLossUSD(bookUSD: number, durationYears: number, moveBps: number): number {
  return Math.max(0, bookUSD) * Math.max(0, durationYears) * (Math.max(0, moveBps) / 10000);
}
