/**
 * THE ENGINE'S READ OF A TRANCHE'S PRICE — the one adapter between the world's stores and
 * `domain/pricing`, so the stage that MARKS the register and the check that TESTS the mark cannot
 * disagree about what the price is.
 *
 * Everything world-shaped happens here: find the tranche's row, find its issuer, find that
 * issuer's region's cleared curve and the spread its own book cleared. The arithmetic is the
 * domain's and reads nothing.
 */
import { V2World } from '../engine2/world';
import { trancheRowOf, issuerIdOf, TR_FLOATING, TR_CP } from '../engine2/tranches';
import { pricePerFace } from '../domain/pricing';
import type { ZeroCurve } from '../domain/pricing';

export interface CreditPriceWorld {
  /** The issuer's own cleared spreads and its region. */
  issuerById: (id: string) => {
    region: string; oasSpreadBps?: number; leveragedLoan?: { discountMarginBps: number };
  } | undefined;
  /** The region's cleared curve and its reference rate. */
  regionById: (region: string) => { zeroRates?: ZeroCurve; policyRate?: number } | undefined;
}

export function trancheClearedPricePerFace(
  world: CreditPriceWorld, v2: V2World, instrumentId: string, week: number
): number | undefined {
  const row = trancheRowOf(v2, instrumentId);
  if (row === undefined) return undefined;
  const comp = world.issuerById(issuerIdOf(v2, instrumentId));
  if (!comp) return undefined;
  const reg = world.regionById(comp.region);
  if (!reg?.zeroRates) return undefined;
  const S = v2.tranches;
  const isFloating = (S.flags[row] & TR_FLOATING) !== 0;
  const floatingMarginBps = Number.isNaN(S.floatingMarginBps[row]) ? 0 : S.floatingMarginBps[row];
  return pricePerFace({
    isFloating,
    couponRate: Number.isNaN(S.couponRate[row]) ? 0 : S.couponRate[row],
    floatingMarginBps,
    paysOnlyAtMaturity: (S.flags[row] & TR_CP) !== 0,
    weeksToMaturity: S.maturityWeek[row] - week,
    policyRate: reg.policyRate ?? 0,
    clearedSpreadBps: isFloating
      ? (comp.leveragedLoan?.discountMarginBps ?? floatingMarginBps)
      : (comp.oasSpreadBps ?? 0),
  }, reg.zeroRates);
}
