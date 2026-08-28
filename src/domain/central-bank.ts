/**
 * PUB2 — the central bank as a real counterparty, and the Treasury General Account.
 *
 * Replaces two scalars that stood in for a balance sheet: `centralBankReservesUSD` (seeded at a
 * phantom 1e12 and drifted by a stance multiplier, sitting beside real per-bank cash) and
 * `centralBankBalanceSheet` (a GDP ratio drifting on the same stance).
 *
 * The TGA is the point. A treasury account is a LIABILITY OF THE CENTRAL BANK, not a number on
 * the government — so every dollar moving into it comes out of bank reserves, and every dollar
 * the government spends puts one back. That is why tax dates and heavy issuance weeks tighten
 * money markets, and it is a mechanism this model can feel because WS6's repo market exists.
 *
 * The CB is the one balance sheet allowed to be special: no capital constraint, never defaults.
 */

import { RegionId } from './geography';

export interface CentralBank {
  region: RegionId;
  /** Assets: the real sovereign book, by tenor bucket. Clears in 07c like any other holder. */
  sovereignHoldingsByTenor: Record<string, number>;
  /** Liability: the government's account. Drains reserves when it fills. */
  treasuryAccountUSD: number;
  /** Liability: notes in circulation — the slow, non-operational part of the balance sheet. */
  currencyInCirculationUSD: number;
  /** Last week's remittance to the treasury: coupon income less interest paid on reserves. */
  lastRemittanceUSD: number;
  /** Last week's net reserve movement caused by TGA flows (negative = drained from banks). */
  lastReserveDrainUSD: number;
  /**
   * Bank cash the central bank's assets do not back. In reality reserves EXIST because the CB
   * bought something; here a bank's `cashReservesUSD` also grows from deposits and lending, so
   * the two are not the same quantity and the identity does not close on its own. Named rather
   * than forced: it shrinks as PUB2b's QE grows the asset side.
   */
  unbackedBankCashUSD: number;
}

/** Share of the sovereign stock the central bank holds at seed. */
export const CENTRAL_BANK_SOVEREIGN_SHARE = 0.15;
/** Weeks of government spending the treasury keeps on hand — its operating balance. */
export const TGA_TARGET_WEEKS_OF_SPENDING = 4;

/** Total CB assets: the sovereign book. */
export function centralBankAssetsUSD(cb: CentralBank): number {
  return Object.values(cb.sovereignHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

/**
 * The identity every week: assets = reserves + TGA + currency. Reserves are the banks' own cash,
 * which is a DERIVED input here rather than a stored liability — one representation of one
 * balance. Currency is the residual that closes it, which is what makes the CB special: it can
 * always issue the liability that balances its own book.
 */
export function centralBankCurrencyResidualUSD(cb: CentralBank, bankReservesUSD: number): number {
  return Math.max(0, centralBankAssetsUSD(cb) - bankReservesUSD - cb.treasuryAccountUSD);
}

/** The part of bank cash the asset side cannot back — see `unbackedBankCashUSD`. */
export function unbackedBankCashUSD(cb: CentralBank, bankReservesUSD: number): number {
  return Math.max(0, bankReservesUSD + cb.treasuryAccountUSD - centralBankAssetsUSD(cb));
}

/**
 * Remittance: what the CB earns on its portfolio less what it pays on reserves, returned to the
 * treasury. Negative when the policy rate exceeds the portfolio's yield — the real and famous
 * phenomenon of a central bank remitting nothing after a hiking cycle, which this reproduces for
 * free rather than modelling separately.
 */
export function remittanceUSD(
  couponIncomeWeeklyUSD: number,
  bankReservesUSD: number,
  policyRate: number
): number {
  return couponIncomeWeeklyUSD - (bankReservesUSD * policyRate) / 52;
}
