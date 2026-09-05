/**
 * DRV — THE DERIVATIVE REGISTRY: the dispatch table the lifecycle runs on (rule 15), and the
 * ONE desk-capacity rule for every class.
 *
 * Adding a derivative class: write its profile module under `classes/`, add the member to
 * `DerivativeClassId`, and name it here. The lifecycle, the book, the merger re-key, the
 * close-out, the capacity charge and the margin path all pick it up with no further wiring —
 * the compile-loud completeness check below refuses to build until the registry names it.
 */

import { DerivativeClassId, DerivativeContract, derivativePartyKey } from './contract';
import { issuerReferenceOf } from './contract';
import type { EntityId } from '../ids';
import { DerivativeClassProfile, DerivativeMarketView } from './profile';
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

/** Initial margin on a contract: the A side's cash, held by the B side for the contract's life.
 *  §3.13-BOOK d5c: the ledger writes it as a lien on the dealer's account. §3.17-i: it is the
 *  amount POSTED, a fact of the contract, read here — never re-derived from a rate on a read. */
export function initialMarginLocal(c: Pick<DerivativeContract, 'initialMarginLocal'>): number {
  return c.initialMarginLocal;
}

/**
 * §3.17-ii — WHAT A STRIKE POSTS: the reference's own move over one session, on the notional
 * (`profile.closeOutMoveOf`) — the move the position can make before it can be closed. Called
 * once, at strike, by the market that writes the contract; from then on the contract carries the
 * number. A reference with no move to measure yet posts nothing, and that is the stated reason.
 */
export function initialMarginAtStrike(c: Omit<DerivativeContract, 'initialMarginLocal'>, m: DerivativeMarketView): number {
  const move = derivativeProfile(c.classId).closeOutMoveOf(c as DerivativeContract, m);
  return move !== undefined && move > 0 ? c.notional * move : 0;
}

/** The contract as the market wrote it, with the margin its strike posts. */
export function withInitialMargin(c: Omit<DerivativeContract, 'initialMarginLocal'>, m: DerivativeMarketView): DerivativeContract {
  return { ...c, initialMarginLocal: initialMarginAtStrike(c, m) };
}

/** The registry's order is the order the one derivative stage runs the classes within a phase of
 *  the week (stages/derivatives.ts): swaps, then protection, then futures, then forwards. A new
 *  class takes its place here and nowhere else. */
export const DERIVATIVE_CLASS_IDS = Object.keys(DERIVATIVE_CLASSES) as DerivativeClassId[];

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
export function standingPfeChargeLocal(
  book: DerivativeContract[],
  partyKey: string,
  week: number,
  /** The reference's grade this week; absent, every class charges its flat rate. */
  isInvestmentGrade?: (issuerId: EntityId) => boolean
): number {
  let usd = 0;
  for (const c of book) {
    if (c.maturityWeek <= week) continue;
    if (derivativePartyKey(c.a) === partyKey || derivativePartyKey(c.b) === partyKey) {
      usd += c.notional * pfeAddOnRateOf(c, isInvestmentGrade);
    }
  }
  return usd;
}

/** One contract's add-on rate: the class's contract-level rule when it has one, else its flat rate. */
export function pfeAddOnRateOf(c: DerivativeContract, isInvestmentGrade?: (issuerId: EntityId) => boolean): number {
  const profile = DERIVATIVE_CLASSES[c.classId];
  // The contract-level rule is the credit one, whose reference is an issuer (dIIb: typed).
  if (profile.pfeAddOnRateFor && isInvestmentGrade) return profile.pfeAddOnRateFor(c, isInvestmentGrade(issuerReferenceOf(c)));
  return profile.pfeAddOnRate;
}

/**
 * What a desk can still write of ONE class, in notional: its remaining PFE budget through that
 * class's add-on. Zero when the budget is spent — a desk at zero is why a hedge can be
 * unavailable at any price, which no formula-priced hedge can express.
 */
export function deskNotionalCapacityLocal(
  leverageHeadroomLocal: number,
  standingChargeLocal: number,
  classId: DerivativeClassId
): number {
  const budgetLocal = Math.max(0, leverageHeadroomLocal) * DESK_DERIVATIVE_PFE_SHARE_OF_HEADROOM;
  return Math.max(0, budgetLocal - Math.max(0, standingChargeLocal))
    / DERIVATIVE_CLASSES[classId].pfeAddOnRate;
}
