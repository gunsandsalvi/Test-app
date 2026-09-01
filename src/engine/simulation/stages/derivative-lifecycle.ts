/**
 * DRV — THE ONE DERIVATIVE LIFECYCLE. Every class's contracts live in one book and pass through
 * this module once a week, at the pipeline point where that class's prints are fresh (07g for
 * swaps, 07h for CDS, the end of 07i for futures, fx-hedging for forwards). The market stages
 * keep only what is genuinely theirs — measuring who needs the hedge and clearing it — and
 * strike into the book through `strikeDerivatives`.
 *
 * What runs here for every class, written once (rule 17 — nothing below switches on the class):
 *  1. EVENT termination the profile detects (a credit event, a reference that stopped existing)
 *     — final leg, contract gone.
 *  2. MATURITY — the final leg (rate classes: the last period; mark classes: the mark at its
 *     settlement print), contract gone.
 *  3. COUNTERPARTY DEATH — the close-out that no book had (rule 14/G5): a defaulted party's
 *     contracts settle at replacement value through its account (the estate's account IS the
 *     debtor's, §7.286); a party that has simply ceased to exist ends the contract flat.
 *  4. LIVE legs — the periodic leg and/or the mark DELTA (§7.241: the change since last settled,
 *     never the whole mark), `settledMarkUSD` advanced.
 */

import { GameState, RegionId } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import {
  DerivativeClassId, DerivativeContract, DerivativeParty, derivativePartyKey,
} from '../../../domain/derivatives/contract';
import { DerivativeMarketView } from '../../../domain/derivatives/profile';
import { derivativeProfile, standingPfeChargeUSD } from '../../../domain/derivatives/registry';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import { creditRecoveryRate } from './shared-helpers';

/** Legs under a dollar are dust; every book skipped them and the ledger need not carry them. */
const MIN_LEG_USD = 1;

/** The live book: the week's working copy, initialised from state on first touch. */
export function derivativesBookOf(ctx: WeeklyStepContext, state: GameState): DerivativeContract[] {
  if (!ctx.derivativesBook) ctx.derivativesBook = [...(state.derivativesBook ?? [])];
  return ctx.derivativesBook;
}

export function strikeDerivatives(ctx: WeeklyStepContext, state: GameState, struck: DerivativeContract[]): void {
  if (struck.length === 0) return;
  derivativesBookOf(ctx, state).push(...struck);
}

/** A desk's standing PFE charge against the one budget, off the live book (registry.ts). */
export function deskStandingPfeChargeUSD(ctx: WeeklyStepContext, state: GameState, ticker: string): number {
  return standingPfeChargeUSD(derivativesBookOf(ctx, state), `BANK:${ticker}`, ctx.nextWeek);
}

type PartyState = 'ALIVE' | 'DEFAULTED' | 'GONE';

/**
 * The flat view every profile prices off, built once per settle call from the live context.
 * Companies are looked up across public AND private firms: a CDS reference can be either, and
 * "absent" is a default for a reference and a vanishing for a party.
 */
export function buildDerivativeMarketView(ctx: WeeklyStepContext): DerivativeMarketView & { partyState(p: DerivativeParty): PartyState } {
  const companyByTicker = new Map<string, { isDefaulted?: boolean; isActive: boolean; cdsSpreadBps?: number }>();
  const companyById = new Map<string, { isDefaulted?: boolean; cdsSpreadBps?: number }>();
  for (const c of ctx.updatedCompanies) {
    companyByTicker.set(c.ticker, { isDefaulted: c.isDefaulted, isActive: isActiveCompany(c), cdsSpreadBps: c.cdsSpreadBps });
    companyById.set(c.id, { isDefaulted: c.isDefaulted, cdsSpreadBps: c.cdsSpreadBps });
  }
  for (const c of ctx.prevActivePrivateFirms) {
    if (!companyById.has(c.id)) companyById.set(c.id, { isDefaulted: c.isDefaulted, cdsSpreadBps: c.cdsSpreadBps });
  }
  const entityById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));
  const commodityById = new Map(ctx.updatedCommodities.map((c) => [c.id, c]));
  const region = (id: RegionId) => ctx.updatedRegions[id];

  return {
    week: ctx.nextWeek,
    partyState: (p) => {
      if (p.kind === 'INSTITUTION') {
        const e = entityById.get(p.id);
        return !e ? 'GONE' : e.isDefaulted ? 'DEFAULTED' : 'ALIVE';
      }
      const c = companyByTicker.get(p.ticker);
      return !c ? 'GONE' : (c.isDefaulted || !c.isActive) ? 'DEFAULTED' : 'ALIVE';
    },
    isIssuerDefaulted: (issuerId) => {
      const c = companyById.get(issuerId);
      return !c || !!c.isDefaulted;
    },
    overnightRateAnnual: (r) => { const reg = region(r); return reg?.repoRateAnnual ?? reg?.policyRate ?? 0; },
    parRateAnnual: (r, termKey) => {
      const v = region(r)?.swapParRateByTenor?.[termKey];
      return typeof v === 'number' ? v : Number.NaN;
    },
    cdsSpreadBps: (issuerId) => {
      const v = companyById.get(issuerId)?.cdsSpreadBps;
      return typeof v === 'number' && v > 0 ? v : Number.NaN;
    },
    recoveryRate: (r) => creditRecoveryRate(region(r)),
    commodityPrint: (commodityId, termKey) => {
      const comm = commodityById.get(commodityId);
      if (!comm) return Number.NaN;
      const px = termKey === '1M' ? comm.futures1M : termKey === '3M' ? comm.futures3M : termKey === '6M' ? comm.futures6M : Number.NaN;
      return px > 0 ? px : Number.NaN;
    },
    commoditySpot: (commodityId) => {
      const comm = commodityById.get(commodityId);
      return comm && comm.spotPrice > 0 ? comm.spotPrice : Number.NaN;
    },
    fxToUsd: (r) => ctx.getFxToUsd(r),
  };
}

function payToB(ctx: WeeklyStepContext, c: DerivativeContract, usdToB: number, reason: string, net: Map<string, number>): void {
  if (!(Math.abs(usdToB) > MIN_LEG_USD)) return;
  const payer = usdToB > 0 ? c.a : c.b;
  const payee = usdToB > 0 ? c.b : c.a;
  pay(ctx, { payer, payee, amountUSD: Math.abs(usdToB), reason });
  const pk = derivativePartyKey(payer);
  const ek = derivativePartyKey(payee);
  net.set(pk, (net.get(pk) ?? 0) - Math.abs(usdToB));
  net.set(ek, (net.get(ek) ?? 0) + Math.abs(usdToB));
}

/**
 * Settle one class's contracts for the week. Returns each party's net cash settled here
 * (positive = received), which a market stage's budget test reads before it strikes more.
 */
export function settleDerivativeClass(
  ctx: WeeklyStepContext,
  state: GameState,
  classId: DerivativeClassId,
  view: ReturnType<typeof buildDerivativeMarketView>
): Map<string, number> {
  const book = derivativesBookOf(ctx, state);
  const profile = derivativeProfile(classId);
  const net = new Map<string, number>();
  const kept: DerivativeContract[] = [];

  /** The mark leg: value to A now, less what was already settled, signed to B. */
  const settleMark = (c: DerivativeContract, reason: string): void => {
    const markUSD = profile.markToMarketUSDToA(c, view);
    if (markUSD === null) return;
    const deltaToA = markUSD - (c.settledMarkUSD ?? 0);
    payToB(ctx, c, -deltaToA, reason, net);
    c.settledMarkUSD = markUSD;
  };

  for (const c of book) {
    if (c.classId !== classId) { kept.push(c); continue; }

    const event = profile.eventTermination(c, view);
    if (event) { payToB(ctx, c, event.usdToB, event.reason, net); continue; }

    if (c.maturityWeek <= view.week) {
      const leg = profile.periodicLegUSDToB(c, view);
      if (leg) payToB(ctx, c, leg.usdToB, leg.reason, net);
      settleMark(c, profile.markReasonFinal ?? 'derivative settled');
      continue;
    }

    const aState = view.partyState(c.a);
    const bState = view.partyState(c.b);
    if (aState !== 'ALIVE' || bState !== 'ALIVE') {
      // A party that has ceased to exist leaves nobody to pay or be paid: the contract ends
      // flat. A DEFAULTED party still has an account (its estate's), and settles replacement
      // value through it like any other claim on the estate.
      if (aState !== 'GONE' && bState !== 'GONE') {
        const markUSD = profile.markToMarketUSDToA(c, view);
        if (markUSD !== null) payToB(ctx, c, -(markUSD - (c.settledMarkUSD ?? 0)), 'derivative close-out', net);
        else payToB(ctx, c, profile.closeOutUSDToB(c, view), 'derivative close-out', net);
      }
      continue;
    }

    const leg = profile.periodicLegUSDToB(c, view);
    if (leg) payToB(ctx, c, leg.usdToB, leg.reason, net);
    settleMark(c, profile.markReasonLive ?? 'derivative variation margin');
    kept.push(c);
  }

  ctx.derivativesBook = kept;
  return net;
}

/** Initial margin on a contract about to be struck: the A side's cash, held by the B side. */
export function initialMarginUSD(c: Pick<DerivativeContract, 'classId' | 'notionalUSD'>): number {
  return c.notionalUSD * derivativeProfile(c.classId).initialMarginRate;
}
