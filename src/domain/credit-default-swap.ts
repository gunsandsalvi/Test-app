/**
 * CRD/DER2 — single-name credit default swaps, and the second cross-market basis this model can
 * produce.
 *
 * **What this replaces.** `comp.cdsSpreadBps` was `oasSpreadBps + a random draw in [-4, +4]`,
 * bounded to [10, 5000]. Not a price — a decoration on another price, with a clamp on each end
 * (rule 1 and rule 15 in three lines). Nothing traded it, nobody was on either side of it, and a
 * bank could not hedge a credit exposure at all: the only way to reduce a concentration was to
 * stop lending. The whole point of the instrument is that it separates WHO CARRIES the credit
 * risk from WHO FUNDED the loan, and none of that existed.
 *
 * **The market, framed the way every other book in this model is framed.** The position being
 * priced is SELLING protection — which is a long in the issuer's credit that nobody funded. So:
 *
 *  - **The float is the protection somebody NEEDS.** A bank whose exposure to one name exceeds
 *    what its capital lets it carry against a single counterparty has to lay the excess off; that
 *    excess is a measurement of its own book against the large-exposure limit, not a preference.
 *    This is the consumer `09-concentration-risk.ts` has never had (§5-CRD: it computes those
 *    flags every week at 8.5% of run time and nothing prices off them).
 *  - **The participants are the sellers** — the banks' derivative desks and the credit funds that
 *    want the exposure without funding it. A seller's reservation is what the same credit costs it
 *    to carry: its expected loss plus the capital the position consumes at its own required
 *    return, which is the identical arithmetic the corporate bond book already uses, because it is
 *    the identical risk.
 *  - **The cleared spread minus the issuer's cleared cash OAS is the CDS BASIS.** It is an
 *    OUTCOME, and it is the second test that two of this model's markets agree with each other
 *    (the swap spread was the first, DER1). A basis that goes persistently negative means the cash
 *    market is paying more for the same default risk than the synthetic one, which is a real and
 *    diagnostic thing for a model to be able to say.
 *
 * **What the contract does.** The buyer pays the struck spread on the notional, weekly, for the
 * life of the trade. If the reference issuer defaults, the seller pays `(1 − recovery) × notional`
 * and the contract terminates — with the recovery being the one G5's estates actually realise
 * (§7.192), so protection pays what the workout says it should rather than a stated fraction.
 */

import { RegionId } from './geography';

export type CdsParty =
  | { kind: 'BANK'; ticker: string }
  | { kind: 'INSTITUTION'; id: string };

export interface CdsContract {
  id: string;
  regionId: RegionId;
  /** The reference entity — a company id, the same key the bond book prices. */
  referenceIssuerId: string;
  /** Pays the premium, is made whole on default. */
  buyer: CdsParty;
  /** Receives the premium, pays on default. */
  seller: CdsParty;
  notionalUSD: number;
  /** The spread the contract was struck at, in bps of notional per year (rule 9). */
  spreadBps: number;
  struckWeek: number;
  maturityWeek: number;
}

/**
 * The standard tenor. Five years is where single-name CDS liquidity actually sits, and a tenor has
 * to be SOME length for the premium leg to have a horizon; this is a market-convention primitive
 * of the same kind as the repo book's overnight default.
 */
export const CDS_TENOR_WEEKS = 5 * 52;

/**
 * The large-exposure limit: how much of its own capital a bank will carry against ONE name before
 * it has to lay the rest off.
 *
 * A real regulatory primitive (rule 4 allows those, and this model already carries the leverage
 * floor and the risk weights beside it). It is what turns `09-concentration-risk.ts`'s measurement
 * into a decision: exposure above this is not a preference to hedge, it is a position the bank is
 * not allowed to keep.
 */
export const LARGE_EXPOSURE_LIMIT_OF_CAPITAL = 0.25;

/** What one week's premium costs the buyer of protection. */
export function cdsWeeklyPremiumUSD(c: CdsContract): number {
  return (c.notionalUSD * (c.spreadBps / 10000)) / 52;
}

/** What the seller owes when the reference entity defaults: par less what the workout recovers. */
export function cdsDefaultPayoutUSD(c: CdsContract, recoveryRate: number): number {
  return c.notionalUSD * Math.max(0, 1 - Math.max(0, Math.min(1, recoveryRate)));
}

export function cdsPartyKey(p: CdsParty): string {
  return `${p.kind}:${p.kind === 'INSTITUTION' ? p.id : p.ticker}`;
}

/** Protection outstanding on one name, by whoever bought or sold it. */
export function cdsNetProtectionBoughtUSD(book: CdsContract[], party: CdsParty, issuerId: string): number {
  const key = cdsPartyKey(party);
  return book.reduce((a, c) => {
    if (c.referenceIssuerId !== issuerId) return a;
    if (cdsPartyKey(c.buyer) === key) return a + c.notionalUSD;
    if (cdsPartyKey(c.seller) === key) return a - c.notionalUSD;
    return a;
  }, 0);
}

/**
 * What a lender must lay off: the exposure to one name beyond what its capital lets it carry,
 * net of protection it has already bought. A measurement of the bank's own book, not a view.
 */
export function protectionNeedUSD(args: {
  exposureUSD: number;
  bankEquityUSD: number;
  alreadyHedgedUSD: number;
}): number {
  const carryableUSD = Math.max(0, args.bankEquityUSD) * LARGE_EXPOSURE_LIMIT_OF_CAPITAL;
  return Math.max(0, args.exposureUSD - carryableUSD - Math.max(0, args.alreadyHedgedUSD));
}
