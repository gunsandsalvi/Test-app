/**
 * THE ONE GOV INSTRUMENT-ID FORMAT (§7.241).
 *
 * Sovereign paper lives under two id shapes that share one prefix:
 *   bucket ids   `${region}-GOV-${bucketKey}`   (bucketKey: 'b13'|'b26'|'b52'|'t2'|'t5'|'t10'|'t30')
 *   tranche ids  `${region}-GOV-B${weeks}-${issueWeek}` (bills) and
 *                `${region}-GOV-${years}Y-${issueWeek|INIT}` (bonds)
 *
 * Before this module, the build was inlined at three sites and the parse at ~15, each a
 * `replace(`${region}-GOV-`, '')` that could not tell the two shapes apart: a tranche id sliced
 * to `B13-41`, failed a CASE-SENSITIVE `startsWith('b')`, and the holding silently dropped out of
 * whatever the site was sizing — the defect class 11-fiscal's own comment records ("a desk kept a
 * claim on paper that had matured"). One builder, one parser; a malformed id is an explicit
 * `undefined`, never a full id masquerading as a tenor key.
 */

import { RegionId } from './geography';

export const GOV_ID_INFIX = '-GOV-';

/** The id of a tenor BUCKET position (what holdings rows and desk inventories carry). */
export const govBucketId = (region: RegionId, bucketKey: string): string =>
  `${region}${GOV_ID_INFIX}${bucketKey}`;

/** The id of one issued bill tranche. */
export const govBillTrancheId = (region: RegionId, weeks: number, issueWeek: number): string =>
  `${region}${GOV_ID_INFIX}B${weeks}-${issueWeek}`;

/** The id of one issued bond tranche; the seed uses 'INIT' as its issue tag. */
export const govBondTrancheId = (region: RegionId, tenorYears: number, issueTag: number | 'INIT'): string =>
  `${region}${GOV_ID_INFIX}${tenorYears}Y-${issueTag}`;

/**
 * The bucket key inside a BUCKET id of this region — `undefined` for tranche ids, other regions'
 * paper, and anything malformed. Callers that can also meet tranche ids resolve those through
 * their tranche→bucket map, EXPLICITLY, instead of a sliced tranche id failing a lowercase test.
 */
export function govBucketKeyOf(id: string, region: RegionId): string | undefined {
  const prefix = region + GOV_ID_INFIX;
  if (!id.startsWith(prefix)) return undefined;
  const rest = id.slice(prefix.length);
  return /^[bt]\d+$/.test(rest) ? rest : undefined;
}

/** Is this bucket key a bill bucket ('b13'/'b26'/'b52') rather than a bond tenor ('t2'…)? */
export const isBillBucketKey = (bucketKey: string): boolean => bucketKey.charCodeAt(0) === 98; // 'b'
