/**
 * DRV — WHAT A DERIVATIVE CLASS IS, AS BEHAVIOR. The one lifecycle
 * (stages/derivative-lifecycle.ts) runs every class through this interface; a class states its
 * legs and nothing else. The same split as `domain/company-week/` and the institution profiles:
 * the machinery may not switch on the class (rule 15) — everything per-class is a profile method
 * or a profile fact.
 *
 * Two leg families cover every bilateral derivative this model has, and every one on the
 * add-next list (options premium/exercise, TRS, XCS all decompose into them):
 *  - a PERIODIC leg: a rate on the notional exchanged on schedule (swap net, CDS premium);
 *  - a MARK leg: the contract's current value settled as the CHANGE since last settled
 *    (variation margin; §7.241's delta rule, owned by the lifecycle). §3.17-iii: EVERY class
 *    marks — a swap and protection carry both legs, the periodic one being the cash the
 *    contract exchanges and the mark being what the legs still to come are worth.
 * Early termination is an EVENT the profile detects (a CDS credit event, a dead reference); a
 * dead COUNTERPARTY is the lifecycle's own close-out and no profile's business.
 */

import { RegionId, CurrencyCode } from '../geography';
import { DerivativeClassId, DerivativeContract } from './contract';
import type { EntityId } from '../ids';
import type { CreditIndexSeries } from './classes/cds-index';

export type IssuerWorkout = { state: 'OPEN' } | { state: 'CLOSED'; recovery: number };

/** Flat market inputs the lifecycle hands a profile — everything a leg may price off.
 *  Party LIVENESS is deliberately absent: a dead counterparty is the lifecycle's own close-out,
 *  detected once for every class, never a profile's business. */
export interface DerivativeMarketView {
  week: number;
  /** CDS reference entities: absent counts as defaulted, exactly as the book always read it. */
  isIssuerDefaulted(issuerId: EntityId): boolean;
  /** The cleared GC repo print — the floating leg's index (OIS, §7.194). */
  overnightRateAnnual(regionId: RegionId): number;
  /** Last cleared swap par rate for a tenor; NaN when none has printed. */
  parRateAnnual(regionId: RegionId, termKey: string): number;
  /** Last cleared CDS spread for an issuer; NaN when none has printed. */
  cdsSpreadBps(issuerId: EntityId): number;
  /** Whether the reference is investment grade this week — the CEM add-on's one split. */
  isInvestmentGrade(issuerId: EntityId): boolean;
  recoveryRate(regionId: RegionId): number;
  /**
   * §3.17-vi — THE REFERENCE'S OWN WORKOUT. `OPEN` while its estate is still selling and paying
   * (the payoff waits for the auction); `CLOSED` with what the unsecured class actually got back
   * (`estate.ts:realisedUnsecuredRecoveryRate`); undefined when the issuer left no estate to
   * wait for, and then the region's average (`recoveryRate`) is the stated fallback.
   */
  issuerWorkout(issuerId: EntityId): IssuerWorkout | undefined;
  /** This week's futures print for (commodity, tenor bucket); NaN when the book did not clear. */
  commodityPrint(commodityId: string, termKey: string): number;
  /** Spot for a commodity; NaN when the commodity no longer exists. */
  commoditySpot(commodityId: string): number;
  fxToUsd(regionId: RegionId): number;
  // §3.17-ii — THE REFERENCE'S OWN MOVE over one session, measured off the world's own prints
  // (`domain/volatility.ts`); undefined while there is nothing to measure. Initial margin is
  // sized from these and nothing else.
  /** A commodity's weekly move as a fraction of its level. */
  commodityWeeklyMove(commodityId: string): number | undefined;
  /** A pair's weekly move as a fraction of the rate, for the region's currency against the numéraire. */
  fxWeeklyMove(regionId: RegionId): number | undefined;
  /** The weekly move of the region's rate at a swap tenor, in bps. */
  rateWeeklyMoveBps(regionId: RegionId, termKey: string): number | undefined;
  /** The weekly move of an issuer's protection spread, in bps. */
  cdsSpreadWeeklyMoveBps(issuerId: EntityId): number | undefined;
  // §3.17b-i — THE EQUITY an option is on: its print, its realised volatility (the name's own,
  // its region's index before the name can estimate one — the same read stage 12 made), and its
  // weekly move for margin.
  /** The issuer's share price; NaN when the issuer has none. */
  equityPrice(issuerId: EntityId): number;
  /** Annualised realised volatility of the shares; undefined with nothing to estimate from. */
  equityAnnualVol(issuerId: EntityId): number | undefined;
  /** The shares' weekly move as a fraction of the price. */
  equityWeeklyMove(issuerId: EntityId): number | undefined;
  // §3.17b-iii — THE INDEX an option is on: the region's composite level, its volatility (the
  // IMPLIED one the options book cleared when it has, its realised one before), its weekly move.
  indexLevel(regionId: RegionId): number;
  indexAnnualVol(regionId: RegionId): number | undefined;
  indexWeeklyMove(regionId: RegionId): number | undefined;
  // §3.17d-i — THE BASKET a credit index is on: its series (names fixed at the roll, events
  // settled once for the line), its last print, its weekly move for margin.
  creditIndexSeries(regionId: RegionId, seriesId: string): CreditIndexSeries | undefined;
  /** Last cleared spread of the series; NaN when none has printed. */
  creditIndexSpreadBps(regionId: RegionId, seriesId: string): number;
  creditIndexWeeklyMoveBps(regionId: RegionId, seriesId: string): number | undefined;
}

export interface DerivativeLeg {
  usdToB: number;
  reason: string;
  /** §3.17b-iv — the money this leg is in, where it is not the contract's: a cross-currency swap's
   *  home leg. The lifecycle pays it through the house of THAT money. Absent = the contract's. */
  currency?: CurrencyCode;
}
/** A profile's legs for the week: one, several (a two-currency exchange), or none. */
export type DerivativeLegs = DerivativeLeg | DerivativeLeg[] | null;

export interface DerivativeClassProfile {
  id: DerivativeClassId;
  /** What the two sides ARE, so a contract reads without the class's stage open. */
  roleA: string;
  roleB: string;
  /**
   * Potential-future-exposure add-on per dollar of notional — the leverage-ratio charge a desk
   * pays for carrying this class (Basel CEM's per-class table; a regulatory POLICY primitive,
   * rule 2). The one capacity rule in registry.ts consumes it for every class alike.
   */
  pfeAddOnRate: number;
  /** A class whose add-on depends on the CONTRACT (CDS: 5% investment-grade / 10% below, CEM's
   *  credit-derivative row) states it here; the flat rate above is the class's default and its
   *  capacity denominator. */
  pfeAddOnRateFor?(c: DerivativeContract, isInvestmentGrade: boolean): number;
  /**
   * §3.17-ii — THE MOVE A POSITION CAN MAKE BEFORE IT CAN BE CLOSED, as a fraction of notional:
   * the reference's own measured move over one session (the model's clock is the close-out
   * horizon), on the contract's own sensitivity to it. Initial margin is notional × this
   * (`registry.ts:initialMarginAtStrike`). Undefined while the reference has no move to measure
   * — a first print — and then nothing is posted, which is a stated reason (F2), not a rate.
   */
  closeOutMoveOf(c: DerivativeContract, m: DerivativeMarketView): number | undefined;
  /** The week's periodic exchange on a live contract, signed to B. Null for mark-leg classes. */
  periodicLegUSDToB(c: DerivativeContract, m: DerivativeMarketView): DerivativeLegs;
  /**
   * The contract's cumulative value to A at current prints. The lifecycle settles the delta
   * against `settledMarkLocal` and owns the delta rule. Null: no marking this week (no fresh
   * print). §3.17-iii: every class marks — a periodic-leg class values the legs still to come.
   */
  markToMarketUSDToA(c: DerivativeContract, m: DerivativeMarketView): number | null;
  /** Ledger labels for the mark leg, so a trace still says what the flow is. */
  markReasonLive?: string;
  markReasonFinal?: string;
  /**
   * An event that ends the contract THIS week (credit event; a reference that stopped existing).
   * Non-null = final leg then gone; null = no event. Counterparty death is NOT detected here.
   */
  eventTermination(c: DerivativeContract, m: DerivativeMarketView): DerivativeLegs;
  /**
   * §3.17d-i — an event that settles PART of the contract and leaves the line standing (one
   * name's weight of a credit index). The legs are paid, the contract's `units` become
   * `unitsAfter` — the profile's own count of what it has settled — and `done` ends it.
   * Absent: a class has no partial events.
   */
  eventSettlement?(c: DerivativeContract, m: DerivativeMarketView): { legs: DerivativeLegs; unitsAfter: number; done: boolean } | null;
  /**
   * Replacement value to B at current prints — what a dead counterparty's estate settles
   * (rate-leg classes; mark-leg classes close out at the mark, which the lifecycle owns).
   */
  closeOutUSDToB(c: DerivativeContract, m: DerivativeMarketView): number;
  /**
   * §3.17-vi — a contract that has an event pending settles the event, not its maturity: the
   * lifecycle holds it past `maturityWeek` while this says so (a credit event awaiting the
   * reference's workout). Absent: maturity is final, as for every class before.
   */
  holdsPastMaturity?(c: DerivativeContract, m: DerivativeMarketView): boolean;
}
