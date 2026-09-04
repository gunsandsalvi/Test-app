/**
 * §3.13 — THE CLEARED PRICE STORE. One price per instrument, written only by its market.
 *
 * Step 13's structural claim is that a position is `(asset, units)` and value is a FUNCTION,
 * `units × price(asset)`. That needs somewhere for the price to LIVE: today every book computes a
 * price, uses it for one cash leg and throws it away, so next week nothing can re-mark the paper
 * because the number that valued it no longer exists (`goods-ledger.ts:setOutputStock` is the same
 * defect one asset class over — it multiplies by a unit price and keeps only the product).
 *
 * This is that place. It is deliberately keyed by INSTRUMENT and not by asset class: a tranche, a
 * share, a sub-unit of a good are all "one thing with one cleared price this week", and a store
 * per class would be the same object written three times (rule 4).
 *
 * ONE WRITER PER INSTRUMENT, and it is the auction that cleared it. A reader that finds no price
 * is being told something true — nobody traded this — and must say what it does about that rather
 * than assume par (rule 3, and §3.21's rule that a bracket can never be a print).
 *
 * Money is the one degenerate case and it is not in here: a dollar's price is 1 by definition,
 * which is what "1$ is 1$" means and the only place a hard-coded 1 belongs.
 */

import { V2World, internInstrument, instrumentRefOf } from './world';
import { InstrumentId } from '../domain/ids';

export interface PriceStore {
  /** Interned instrument id → what ONE UNIT of it last cleared at, in the instrument's own money.
   *  The unit is the asset registry's `countedIn`: a dollar of face for credit, a share for
   *  equity. Absent = no market has ever printed this instrument. */
  byIdRef: Map<number, number>;
  /** The print BEFORE that one. A market writes each instrument once a session, so this is last
   *  session's price by construction — which is what a realised weekly move is measured off
   *  (`prime-brokerage`'s haircuts, an underwriter's price risk). Kept beside the price rather
   *  than as a ring because one week back is all any consumer asks for. */
  prevByIdRef: Map<number, number>;
}

export function newPriceStore(): PriceStore {
  return { byIdRef: new Map(), prevByIdRef: new Map() };
}

/** The market's print. Only a clearing adapter calls this, and only for what it cleared. */
export function setClearedPrice(v2: V2World, instrumentId: InstrumentId, pricePerUnit: number): void {
  if (!Number.isFinite(pricePerUnit)) return;
  const ref = internInstrument(v2, instrumentId);
  const prior = v2.prices.byIdRef.get(ref);
  if (prior !== undefined) v2.prices.prevByIdRef.set(ref, prior);
  v2.prices.byIdRef.set(ref, pricePerUnit);
}

/** What it printed at the session before — undefined until it has printed twice. */
export function priorClearedPriceOf(v2: V2World, instrumentId: InstrumentId): number | undefined {
  const ref = instrumentRefOf(v2, instrumentId);
  return ref < 0 ? undefined : v2.prices.prevByIdRef.get(ref);
}

/** The move this instrument's own price made in the last session, as a fraction of where it
 *  stood — what a haircut and an underwriter's price risk are both measured off. Undefined
 *  where there is no history yet, which is a fact about week one and not a zero. */
export function weeklyPriceMoveOf(v2: V2World, instrumentId: InstrumentId): number | undefined {
  const now = clearedPriceOf(v2, instrumentId);
  const before = priorClearedPriceOf(v2, instrumentId);
  if (now === undefined || before === undefined || !(before > 0)) return undefined;
  return Math.abs(now - before) / before;
}

/**
 * What one unit of this instrument last cleared at, or undefined if no market has printed it.
 * A READ, so it never interns: interning mutates the id table, and ids are addressing for the
 * lot, holding and account stores (see `stringRef`).
 */
export function clearedPriceOf(v2: V2World, instrumentId: InstrumentId): number | undefined {
  const ref = instrumentRefOf(v2, instrumentId);
  return ref < 0 ? undefined : v2.prices.byIdRef.get(ref);
}

/** The instrument ceased to exist, so its price is no longer a fact about anything. Called by the
 *  store that frees the row, so a price outlives its paper by exactly nothing. */
export function forgetClearedPrice(v2: V2World, idRef: number): void {
  v2.prices.byIdRef.delete(idRef);
  v2.prices.prevByIdRef.delete(idRef);
}
