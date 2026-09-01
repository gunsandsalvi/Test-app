/**
 * DRV — THE DERIVATIVE REGISTRY: the dispatch table the lifecycle runs on (rule 17), and the
 * ONE desk-capacity rule for every class.
 *
 * Adding a derivative class: write its profile module under `classes/`, add the member to
 * `DerivativeClassId`, and name it here. The lifecycle, the book, the merger re-key, the
 * close-out, the capacity charge and the margin path all pick it up with no further wiring —
 * the compile-loud completeness check below refuses to build until the registry names it.
 */

import { DerivativeClassId, DerivativeContract, derivativePartyKey } from './contract';
import { DerivativeClassProfile } from './profile';
import { IRS_PROFILE } from './classes/irs';
import { CDS_PROFILE } from './classes/cds';
import { COMMODITY_FUTURE_PROFILE } from './classes/commodity-future';
import { FX_FORWARD_PROFILE } from './classes/fx-forward';

export const DERIVATIVE_CLASSES: Record<DerivativeClassId, DerivativeClassProfile> = {
  IRS: IRS_PROFILE,
  CDS: CDS_PROFILE,
  COMMODITY_FUTURE: COMMODITY_FUTURE_PROFILE,
  FX_FORWARD: FX_FORWARD_PROFILE,
};

export const derivativeProfile = (id: DerivativeClassId): DerivativeClassProfile =>
  DERIVATIVE_CLASSES[id];

/**
 * ONE BALANCE SHEET, ONE BUDGET. Share of its leverage headroom a desk commits to derivative
 * potential-future-exposure before it stops quoting — across EVERY class it writes, because the
 * leverage ratio does not care which book consumed it. This closes the question
 * dealer-derivatives.ts recorded ("whether the two decisions are really one"): the FX book, the
 * CDS desk and the storage desk were three capacity formulas on one balance sheet; they are one
 * budget now, consumed in pipeline order, which is the order the desk's week actually happens.
 * (Deliberately still separate from the CASH desks' commitment — a bond consumes headroom
 * one-for-one, a derivative through its add-on; one number covering both would mean two things.)
 */
export const DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM = 0.25;

/**
 * The PFE a party's standing derivative book already charges against that budget: every live
 * contract it stands on, at its class's add-on. Charged on EITHER side — a hedger's leverage is
 * consumed by its hedges exactly as a writer's is by what it wrote.
 */
export function standingPfeChargeUSD(
  book: DerivativeContract[],
  partyKey: string,
  week: number
): number {
  let usd = 0;
  for (const c of book) {
    if (c.maturityWeek <= week) continue;
    if (derivativePartyKey(c.a) === partyKey || derivativePartyKey(c.b) === partyKey) {
      usd += c.notionalUSD * DERIVATIVE_CLASSES[c.classId].pfeAddOnRate;
    }
  }
  return usd;
}

/**
 * What a desk can still write of ONE class, in notional: its remaining PFE budget through that
 * class's add-on. Zero when the budget is spent — a desk at zero is why a hedge can be
 * unavailable at any price, which no formula-priced hedge can express.
 */
export function deskNotionalCapacityUSD(
  leverageHeadroomUSD: number,
  standingChargeUSD: number,
  classId: DerivativeClassId
): number {
  const budgetUSD = Math.max(0, leverageHeadroomUSD) * DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM;
  return Math.max(0, budgetUSD - Math.max(0, standingChargeUSD))
    / DERIVATIVE_CLASSES[classId].pfeAddOnRate;
}
