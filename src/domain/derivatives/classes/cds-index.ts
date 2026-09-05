/**
 * §3.17d-i — THE CREDIT INDEX CLASS. A CDX is a fixed BASKET of names traded as one line: the
 * buyer pays one running spread on the notional and is paid par less recovery on each name's
 * weight as that name fails, and the line runs on with the survivors. That is how broad credit
 * risk is actually bought and sold, and it is the instrument for a holder that wants the asset
 * class rather than the name.
 *
 * THE SERIES IS THE THING. A basket is struck as a SERIES — its names fixed at the roll, its
 * events settled once for every contract on it (the index auction settles one name's weight for
 * the whole market, never contract by contract) — and it lives on the region
 * (`Region.creditIndexSeries`), where the market that rolls it writes it. A contract names its
 * series (`reference: { kind: 'BASKET' }`) and carries, as its `units`, how many of the series'
 * events it has settled; the series' event list is append-only, so what a contract still owes is
 * the tail past that count. strike: the spread struck, in bps of notional per year (rule 8).
 * termKey: ''.
 */

import { DerivativeClassProfile, DerivativeMarketView } from '../profile';
import type { DerivativeContract } from '../contract';
import { basketReferenceOf } from '../contract';
import { annuityFactor } from '../../pricing';
import type { RegionId } from '../../geography';
import type { EntityId } from '../../ids';

/** The standard tenor, the same five years the single-name book's liquidity sits at. */
export const CDS_INDEX_TENOR_WEEKS = 5 * 52;

/** A series rolls twice a year: the market convention, so a basket's names stay fixed long
 *  enough to be a line and refresh often enough to be the region's credit. */
export const CDX_ROLL_WEEKS = 26;

/** A basket has to be a basket: fewer names than this is a single-name book wearing a series. */
const CDX_MIN_NAMES = 2;

/** One constituent's credit event, settled for the series: at what its workout paid. */
interface CreditIndexEvent { issuerId: EntityId; week: number; recovery: number }

export interface CreditIndexSeries {
  seriesId: string;
  struckWeek: number;
  /** The names, fixed at the roll; a name that fails stays in the list and its event is recorded. */
  constituents: EntityId[];
  /** The events settled so far, in the order they were settled — append-only. */
  events: CreditIndexEvent[];
}

export const creditIndexSeriesId = (regionId: RegionId, n: number): string => `${regionId}-CDX-${n}`;

/** A new series off the names the market makes this week: equal-weighted, fixed until the roll. */
export function rollCreditIndex(regionId: RegionId, n: number, week: number, names: readonly EntityId[]): CreditIndexSeries | undefined {
  if (names.length < CDX_MIN_NAMES) return undefined;
  return { seriesId: creditIndexSeriesId(regionId, n), struckWeek: week, constituents: [...names], events: [] };
}

/** Whether a series is due to roll: none yet, or the roll interval has passed. */
export const creditIndexRollDue = (current: CreditIndexSeries | undefined, week: number): boolean =>
  current === undefined || week - current.struckWeek >= CDX_ROLL_WEEKS;

/** The share of the basket still paying premium: the names that have not failed. */
export function survivingShareOf(series: CreditIndexSeries, isDefaulted: (issuerId: EntityId) => boolean): number {
  const alive = series.constituents.filter((id) => !isDefaulted(id)).length;
  return alive / Math.max(1, series.constituents.length);
}

/** What a contract still owes on the series' events: the tail past what it has settled. */
export function pendingEventsOf(c: { units?: number }, series: CreditIndexSeries): CreditIndexEvent[] {
  return series.events.slice(Math.max(0, c.units ?? 0));
}

/** One name's weight of the notional, paid at par less its recovery. */
export const eventPayoutLocal = (notional: number, names: number, recovery: number): number =>
  (notional / Math.max(1, names)) * Math.max(0, 1 - Math.max(0, Math.min(1, recovery)));

/**
 * §3.17d-ii — A REAL-MONEY HOLDER'S QUOTE ON THE LINE, from its target gap. Over its target it
 * BUYS protection for the excess where the print is tighter than its own cost of the risk (it
 * lays the class off for less than the class costs it to carry); under it, it WRITES for the gap
 * above that cost (the asset class without funding it). One side each, stated to the engine as
 * the two-way quote is: a buyer opens holding its excess and sells it down below the reservation.
 */
export function indexHolderQuote(args: { reservationBps: number; rangeBps: number; gapLocal: number }): {
  reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number;
} {
  const range = Math.max(1e-9, args.rangeBps);
  if (args.gapLocal >= 0) return { reservationStat: args.reservationBps, fullSizeStatRange: range, maxHoldingLocal: args.gapLocal, currentHoldingLocal: 0 };
  const excess = -args.gapLocal;
  return { reservationStat: args.reservationBps - range, fullSizeStatRange: range, maxHoldingLocal: excess, currentHoldingLocal: excess };
}

/** §3.17d-ii — THE INDEX-VERSUS-SINGLE-NAME BASIS: the line's print against the equal-weighted
 *  mean of its constituents' own prints; undefined until the names have printed. Measured, never
 *  set — a comparable for the relative-value book (§3 step 17f). */
export function indexBasisBps(indexPrintBps: number, singleNamePrintsBps: readonly number[]): number | undefined {
  const printed = singleNamePrintsBps.filter((b) => b > 0);
  if (printed.length === 0) return undefined;
  return Number((indexPrintBps - printed.reduce((a, b) => a + b, 0) / printed.length).toFixed(1));
}

const seriesOf = (c: DerivativeContract, m: DerivativeMarketView): CreditIndexSeries | undefined => {
  const ref = basketReferenceOf(c);
  return m.creditIndexSeries(ref.regionId, ref.seriesId);
};

export const CDS_INDEX_PROFILE: DerivativeClassProfile = {
  id: 'CDS_INDEX',
  roleA: 'PROTECTION_BUYER',
  roleB: 'PROTECTION_SELLER',
  // Basel CEM credit-derivative add-on on a qualifying reference: a basket of the region's made
  // names, with no single grade to split on.
  pfeAddOnRate: 0.05,
  /** The series' own weekly print move on the protection's remaining life. */
  closeOutMoveOf: (c, m) => {
    const ref = basketReferenceOf(c);
    const bps = m.creditIndexWeeklyMoveBps(ref.regionId, ref.seriesId);
    if (bps === undefined) return undefined;
    return (bps / 10000) * Math.max(0, c.maturityWeek - m.week) / 52;
  },
  /** The buyer pays the struck spread on the SURVIVING share of the notional, weekly: a name's
   *  premium stops at its event, as the single name's does. */
  periodicLegUSDToB: (c, m) => {
    const series = seriesOf(c, m);
    if (!series) return null;
    const share = survivingShareOf(series, (id) => m.isIssuerDefaulted(id));
    if (share <= 0) return null;
    return { usdToB: (c.notional * share * (c.strike / 10000)) / 52, reason: 'CDS index premium' };
  },
  /**
   * The mark: the spread move on the surviving share as a risky annuity — the single name's
   * arithmetic at the series' own print and hazard — plus, for a failed name whose event the
   * series has not yet settled, its expected payoff (its workout's recovery once closed, the
   * region's average while open), so variation margin moves the bulk at the event and the event
   * settlement is the true-up. A series with no print does not mark.
   */
  markToMarketUSDToA: (c, m) => {
    const series = seriesOf(c, m);
    if (!series) return null;
    const ref = basketReferenceOf(c);
    const current = m.creditIndexSpreadBps(ref.regionId, ref.seriesId);
    if (!Number.isFinite(current)) return null;
    const names = series.constituents.length;
    const settled = new Set(series.events.slice(0, Math.max(0, c.units ?? 0)).map((e) => e.issuerId));
    let pendingLocal = 0;
    series.constituents.forEach((id) => {
      if (settled.has(id) || !m.isIssuerDefaulted(id)) return;
      const w = m.issuerWorkout(id);
      const recovery = w?.state === 'CLOSED' ? w.recovery : m.recoveryRate(c.regionId);
      pendingLocal += eventPayoutLocal(c.notional, names, recovery);
    });
    const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
    if (remainingWeeks === 0) return pendingLocal;
    const share = survivingShareOf(series, (id) => m.isIssuerDefaulted(id));
    const recovery = Math.max(0, Math.min(1, m.recoveryRate(c.regionId)));
    const hazardWeekly = (Math.max(0, current) / 10000) / Math.max(1e-9, 1 - recovery) / 52;
    const rateWeekly = m.overnightRateAnnual(c.regionId) / 52;
    return pendingLocal + (c.notional * share * (current - c.strike) / 10000 / 52) * annuityFactor(rateWeekly + hazardWeekly, remainingWeeks);
  },
  markReasonLive: 'CDS index variation margin',
  markReasonFinal: 'CDS index settled',
  /** A name's event settles its WEIGHT and the line runs on: par less what the workout paid, on
   *  the name's share of the notional, for every event the series has settled that this contract
   *  has not. The contract is done when every name has settled. */
  eventSettlement: (c, m) => {
    const series = seriesOf(c, m);
    if (!series) return null;
    const pending = pendingEventsOf(c, series);
    if (pending.length === 0) return null;
    const payoutLocal = pending.reduce((a, e) => a + eventPayoutLocal(c.notional, series.constituents.length, e.recovery), 0);
    return {
      legs: { usdToB: -payoutLocal, reason: 'CDS index credit event settled' },
      unitsAfter: series.events.length,
      done: series.events.length >= series.constituents.length,
    };
  },
  /** A series that stopped existing — a region with no such basket — ends the contract flat:
   *  nothing is owed on a reference nobody can observe. */
  eventTermination: (c, m) => (seriesOf(c, m) ? null : { usdToB: 0, reason: 'CDS index reference gone' }),
  /** A failed name whose event the series has not yet settled holds the line past its maturity. */
  holdsPastMaturity: (c, m) => {
    const series = seriesOf(c, m);
    if (!series) return false;
    const settled = new Set(series.events.slice(0, Math.max(0, c.units ?? 0)).map((e) => e.issuerId));
    return series.constituents.some((id) => !settled.has(id) && m.isIssuerDefaulted(id));
  },
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};
