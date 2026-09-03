/**
 * THE ONE GOV INSTRUMENT-ID FORMAT (§7.241).
 *
 * Sovereign paper has ONE id shape, and it names a tranche:
 *   `${region}-GOV-B${weeks}-${issueWeek}`            (bills)
 *   `${region}-GOV-${years}Y-${issueWeek|INIT}`       (bonds)
 *
 * §3.13-SOV row 3 deleted the second shape — `${region}-GOV-${bucketKey}`, a position in a TENOR
 * BUCKET. Two shapes under one prefix is what let a site slice a tranche id to `B13-41`, fail a
 * case-sensitive `startsWith('b')`, and drop the holding out of whatever it was sizing (the defect
 * class 11-fiscal's own comment records: "a desk kept a claim on paper that had matured"). With
 * one shape there is nothing to tell apart: every holder's row names the paper it holds, and what
 * the paper IS — bill or bond, how long it has left — is asked of the ladder
 * (`government.ts:sovereignLadderIndex`), never parsed out of the id.
 */

import { RegionId } from './geography';

export const GOV_ID_INFIX = '-GOV-';

/** The id of one issued bill tranche. */
export const govBillTrancheId = (region: RegionId, weeks: number, issueWeek: number): string =>
  `${region}${GOV_ID_INFIX}B${weeks}-${issueWeek}`;

/** The id of one issued bond tranche; the seed uses 'INIT' as its issue tag. */
export const govBondTrancheId = (region: RegionId, tenorYears: number, issueTag: number | 'INIT'): string =>
  `${region}${GOV_ID_INFIX}${tenorYears}Y-${issueTag}`;
