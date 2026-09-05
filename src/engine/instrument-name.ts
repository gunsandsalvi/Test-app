/**
 * §3.14 — AN INSTRUMENT'S NAME, off the store. `domain/instruments.ts:instrumentDisplayName` is the
 * one grammar; this is the one read of the store that feeds it — the tranche's row, its issuer's
 * ticker (a company's) or region (a treasury's), and whether a sovereign rung is a bill. An id
 * that is not a tranche (an equity, a fund share, a book) is named by the caller's own rule.
 */
import { V2World } from '../engine2/world';
import { trancheRowOf, materializeTranche, issuerIdOf } from '../engine2/tranches';
import { instrumentDisplayName } from '../domain/instruments';
import { regionOfGovernmentEntity } from '../domain/entity-keys';
import { isDiscountBill } from '../domain/government';
import type { EntityId } from '../domain/ids';

export function instrumentNameOf(
  v2: V2World,
  instrumentId: string,
  /** A company issuer's ticker; a treasury's issuer is named by its region here. */
  tickerOf: (issuerId: EntityId) => string | undefined,
  yearOfWeek: (week: number) => number,
): string | undefined {
  const r = trancheRowOf(v2, instrumentId);
  if (r === undefined) return undefined;
  const t = materializeTranche(v2, r);
  const issuerId = issuerIdOf(v2, instrumentId);
  const region = regionOfGovernmentEntity(issuerId);
  const issuer = region ?? tickerOf(issuerId);
  if (issuer === undefined) return undefined;
  const isBill = region !== undefined && isDiscountBill((t.maturityWeek - t.originationWeek) / 52);
  return instrumentDisplayName(issuer, { ...t, isBill }, yearOfWeek);
}
