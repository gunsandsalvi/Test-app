/**
 * G5 — a default resolves. What it replaces is not a formula but an ABSENCE.
 *
 * Until now a defaulted issuer simply stopped being priced: it leaves `isActiveCompany`, so no
 * book ever quotes its paper again, and its holders keep the position at its last mark forever.
 * The claim outlives the borrower — the last conservation violation the harness reports, and the
 * one thing OWN7 could not close from the ownership side, because nothing was ever going to take
 * the paper off.
 *
 * So a default opens an ESTATE: the issuer's real assets, and the real claims on them. The assets
 * are sold at the rate the markets that would buy them actually absorb them — cash at once,
 * receivables on their own terms, inventory at the company's own turnover, plant to peers at the
 * rate the region buys capital goods — and the proceeds waterfall by real seniority: secured
 * lenders, then bondholders, then whatever is left for equity, which is usually nothing. What is
 * recovered is paid to the named holders and what is not is written off their books.
 *
 * **Recovery becomes an OUTPUT.** The realised rate calibrates the priced one: `CREDIT_RECOVERY_RATE`
 * was the last stated number in the loss-given-default half of the credit model, and a rolling
 * average of what workouts actually produced replaces it — which completes the one-default-model
 * unification whose hazard side landed in §7.20.
 */

import { RegionId } from './geography';
import { EstateClaimType } from './assets';
import type { EntityId } from './ids';

/** Where a claim sits in the waterfall. Lower is paid first. */
export const CLAIM_SENIORITY = {
  SECURED: 1,
  UNSECURED: 2,
  EQUITY: 3,
} as const;

export type ClaimHolder =
  | { kind: 'INSTITUTION'; id: EntityId }
  | { kind: 'BANK'; ticker: string }
  | { kind: 'COMPANY'; ticker: string };

export interface EstateClaim {
  holder: ClaimHolder;
  /** What kind of paper this holder owned — decides where it sits in the waterfall. */
  instrumentType: EstateClaimType;
  seniority: number;
  principalLocal: number;
  recoveredLocal: number;
}

export interface EstateAssets {
  cashLocal: number;
  receivablesLocal: number;
  inventoryLocal: number;
  ppeLocal: number;
}

export interface Estate {
  /** §3.13-BOOK (c2b): the firm whose estate this is. */
  companyId: EntityId;
  ticker: string;
  regionId: RegionId;
  openedWeek: number;
  assets: EstateAssets;
  claims: EstateClaim[];
  /** What has been paid out so far — the waterfall's own running total. */
  distributedLocal: number;
  /** Set when the assets are exhausted and the residual claims are written off. */
  closedWeek?: number;
}

export function estateAssetsLocal(a: EstateAssets): number {
  return Math.max(0, a.cashLocal) + Math.max(0, a.receivablesLocal)
    + Math.max(0, a.inventoryLocal) + Math.max(0, a.ppeLocal);
}

export function claimsAtSeniority(estate: Estate, seniority: number): EstateClaim[] {
  return estate.claims.filter((c) => c.seniority === seniority);
}

/** What a class is still owed after everything paid to it so far. */
export function outstandingLocal(claims: EstateClaim[]): number {
  return claims.reduce((a, c) => a + Math.max(0, c.principalLocal - c.recoveredLocal), 0);
}

/**
 * The realised recovery on the DEBT of a resolved estate: what secured and unsecured lenders got
 * back, against what they were owed. This is the number that calibrates the priced one.
 */
export function realisedDebtRecoveryRate(estate: Estate): number | undefined {
  const debt = estate.claims.filter((c) => c.seniority < CLAIM_SENIORITY.EQUITY);
  const owedLocal = debt.reduce((a, c) => a + c.principalLocal, 0);
  if (!(owedLocal > 0)) return undefined;
  return Math.max(0, Math.min(1, debt.reduce((a, c) => a + c.recoveredLocal, 0) / owedLocal));
}
