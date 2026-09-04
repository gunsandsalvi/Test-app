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
 *    (variation margin — futures, FX forwards; §7.241's delta rule, owned by the lifecycle).
 * Early termination is an EVENT the profile detects (a CDS credit event, a dead reference); a
 * dead COUNTERPARTY is the lifecycle's own close-out and no profile's business.
 */

import { RegionId } from '../geography';
import { DerivativeClassId, DerivativeContract } from './contract';

/** Flat market inputs the lifecycle hands a profile — everything a leg may price off.
 *  Party LIVENESS is deliberately absent: a dead counterparty is the lifecycle's own close-out,
 *  detected once for every class, never a profile's business. */
export interface DerivativeMarketView {
  week: number;
  /** CDS reference entities: absent counts as defaulted, exactly as the book always read it. */
  isIssuerDefaulted(issuerId: string): boolean;
  /** The cleared GC repo print — the floating leg's index (OIS, §7.194). */
  overnightRateAnnual(regionId: RegionId): number;
  /** Last cleared swap par rate for a tenor; NaN when none has printed. */
  parRateAnnual(regionId: RegionId, termKey: string): number;
  /** Last cleared CDS spread for an issuer; NaN when none has printed. */
  cdsSpreadBps(issuerId: string): number;
  /** Whether the reference is investment grade this week — the CEM add-on's one split. */
  isInvestmentGrade(issuerId: string): boolean;
  recoveryRate(regionId: RegionId): number;
  /** This week's futures print for (commodity, tenor bucket); NaN when the book did not clear. */
  commodityPrint(commodityId: string, termKey: string): number;
  /** Spot for a commodity; NaN when the commodity no longer exists. */
  commoditySpot(commodityId: string): number;
  fxToUsd(regionId: RegionId): number;
}

export interface DerivativeLeg {
  usdToB: number;
  reason: string;
}

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
  /** Initial margin the A side posts to the B side at inception. 0 = uncollateralized today;
   *  turning margin on for a class is this one number, because the strike path is shared. */
  initialMarginRate: number;
  /** The week's periodic exchange on a live contract, signed to B. Null for mark-leg classes. */
  periodicLegUSDToB(c: DerivativeContract, m: DerivativeMarketView): DerivativeLeg | null;
  /**
   * The contract's cumulative value to A at current prints (mark-leg classes). The lifecycle
   * settles the delta against `settledMarkLocal` and owns the delta rule. Null: no marking this
   * week (no fresh print) — for rate-leg classes, always null.
   */
  markToMarketUSDToA(c: DerivativeContract, m: DerivativeMarketView): number | null;
  /** Ledger labels for the mark leg, so a trace still says what the flow is. */
  markReasonLive?: string;
  markReasonFinal?: string;
  /**
   * An event that ends the contract THIS week (credit event; a reference that stopped existing).
   * Non-null = final leg then gone; null = no event. Counterparty death is NOT detected here.
   */
  eventTermination(c: DerivativeContract, m: DerivativeMarketView): DerivativeLeg | null;
  /**
   * Replacement value to B at current prints — what a dead counterparty's estate settles
   * (rate-leg classes; mark-leg classes close out at the mark, which the lifecycle owns).
   */
  closeOutUSDToB(c: DerivativeContract, m: DerivativeMarketView): number;
}
