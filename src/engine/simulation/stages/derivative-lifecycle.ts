/**
 * DRV — THE ONE DERIVATIVE LIFECYCLE. Every class's contracts live in one book and pass through
 * this module once a week, at the point where that class's prints are fresh — the one derivative
 * stage (derivatives.ts) settles each class before or after its market, in the phase its market
 * declares. The market modules (derivative-markets/) keep only what is genuinely theirs —
 * measuring who needs the hedge and clearing it — and strike into the book through
 * `strikeDerivatives`; what they ask of the standing book they ask the index (`standingBookOf`).
 *
 * What runs here for every class, written once (rule 15 — nothing below switches on the class):
 *  1. EVENT termination the profile detects (a credit event, a reference that stopped existing)
 *     — final leg, contract gone.
 *  2. MATURITY — the final leg (rate classes: the last period; mark classes: the mark at its
 *     settlement print), contract gone.
 *  3. COUNTERPARTY DEATH — the close-out that no book had (rule 5/G5): a defaulted party's
 *     contracts settle at replacement value through its account (the estate's account IS the
 *     debtor's); a party that has simply ceased to exist ends the contract flat.
 *  4. LIVE legs — the periodic leg and/or the mark DELTA (the change since last settled,
 *     never the whole mark), `settledMarkLocal` advanced.
 */

import { GameState, RegionId } from '../../../types';
import { derivativesBookOf, strikeDerivatives, keepDerivatives } from '../../ledger/contract-ledger';
import { bankSecuritiesParty } from '../../../domain/party';

import { isActiveCompany, isInvestmentGradeRating, CreditRating } from '../../../domain/company';
import { DerivativeClassId, DerivativeContract, DerivativeParty, derivativePartyKey, bankPartyKey } from '../../../domain/derivatives/contract';
import { DerivativeMarketView } from '../../../domain/derivatives/profile';
import { derivativeProfile, initialMarginLocal, initialMarginAtStrike } from '../../../domain/derivatives/registry';
import { StandingBook } from '../../../domain/derivatives/standing-book';
import { WeeklyStepContext } from './context';
import { buildEntityIndex, companyOfParty } from '../../ledger/entity-index';
import { pay } from './settlement';
import { creditRecoveryRate } from './shared-helpers';
import type { EntityId } from '../../../domain/ids';


/** Legs under a dollar are dust; every book skipped them and the ledger need not carry them. */
const MIN_LEG_LOCAL = 1;

/** The live book: the week's working copy, initialised from state on first touch. */
// §3.13-BOOK d4b: the book's reads and writes are the contract ledger's; re-exported so the
// lifecycle's readers keep one import.
export { derivativesBookOf, strikeDerivatives };


/**
 * THE STANDING BOOK, INDEXED: what every market asks of the live book — a party's
 * cover on one side of one class, a party's PFE charge — answered from ONE walk. The index is
 * the book array's: a contract leaves only when the lifecycle (or a resolution's re-key)
 * REPLACES the array, which is when the next call rebuilds; a strike appends and the index
 * follows. The reference grade it charges CDS at is read when it is built, so a book indexed
 * after stage 08 charges at this week's ratings, exactly as the per-call map did.
 */
export function standingBookOf(ctx: WeeklyStepContext, state: GameState): StandingBook {
  const book = derivativesBookOf(ctx);
  const memo = ctx.derivativeStanding;
  if (memo && memo.book === book) { memo.index.extend(book); return memo.index; }
  // §3.13-BOOK (c-then-1): the same private-firm fold, and the same no-op — see
  // `buildDerivativeMarketView` for the read that proves `updatedCompanies` is the whole store.
  const ratingById = new Map<string, CreditRating>();
  for (const c of ctx.updatedCompanies) ratingById.set(c.id, c.creditRating);
  const index = new StandingBook(ctx.nextWeek, (issuerId) => isInvestmentGradeRating(ratingById.get(issuerId)));
  index.extend(book);
  ctx.derivativeStanding = { book, index };
  return index;
}

/** A desk's standing PFE charge against the one budget, off the live book (registry.ts). */
export function deskStandingPfeChargeLocal(ctx: WeeklyStepContext, state: GameState, bankId: EntityId): number {
  return standingBookOf(ctx, state).pfeChargeLocal(bankPartyKey(bankId));
}

type PartyState = 'ALIVE' | 'DEFAULTED' | 'GONE';

/** The view the lifecycle and the markets share for one phase of the week. */
export type DerivativeLifecycleView = ReturnType<typeof buildDerivativeMarketView>;

/**
 * The flat view every profile prices off, built once per settle call from the live context.
 *
 * §3.13-BOOK (c-then-1) — ONE INDEX, AND THE PRIVATE-FIRM PASS WAS ALWAYS A NO-OP. This built
 * three maps of its own and then walked `prevActivePrivateFirms` to fold in "companies the working
 * copy might not hold". It holds all of them: `context.ts:432` opens the week as
 * `updatedCompanies: [...state.companies]` and every writer that reassigns it does so through a
 * length-preserving `.map`, so `prevActivePrivateFirms` — itself a `state.companies` FILTER
 * (`context.ts:401`) — is a strict subset and the `if (!has(id))` guard could never fire. Deleted
 * against that read (rule 19), not against a run. What it was protecting against is real, though,
 * and the comment it carried said so: a CDS reference can be a private firm, and `prevActiveFirms`
 * is the public-only array most stages see. The index below is neither — it is the whole store.
 */
export function buildDerivativeMarketView(ctx: WeeklyStepContext): DerivativeMarketView & { partyState(p: DerivativeParty): PartyState } {
  const entities = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  const { companyById } = entities;
  const commodityById = new Map(ctx.updatedCommodities.map((c) => [c.id, c]));
  const region = (id: RegionId) => ctx.updatedRegions[id];

  return {
    week: ctx.nextWeek,
    partyState: (p) => {
      if (p.kind === 'INSTITUTION') {
        const e = entities.institutionById.get(p.id);
        return !e ? 'GONE' : e.isDefaulted ? 'DEFAULTED' : 'ALIVE';
      }
      // `DerivativeParty` is `PartyRef`'s COMPANY / BANK / INSTITUTION arms and nothing else — a
      // second party union beside the ledger's, which is what (c-then-3) ends.
      const c = companyOfParty(entities, p);
      return !c ? 'GONE' : (c.isDefaulted || !isActiveCompany(c)) ? 'DEFAULTED' : 'ALIVE';
    },
    // §3.13-BOOK dIIb: a contract's reference is typed by class, so the credit accessors take
    // the issuer's ENTITY id and nothing is cast.
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
    isInvestmentGrade: (issuerId) => isInvestmentGradeRating(companyById.get(issuerId)?.creditRating),
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
  if (!(Math.abs(usdToB) > MIN_LEG_LOCAL)) return;
  const payer = usdToB > 0 ? c.a : c.b;
  const payee = usdToB > 0 ? c.b : c.a;
  // §3.13c: the contract says what it settles in; `currencyOf(c.regionId)` was a proxy.
  pay(ctx, { payer, payee, amount: Math.abs(usdToB), currency: c.currency, reason });
  const pk = derivativePartyKey(payer);
  const ek = derivativePartyKey(payee);
  net.set(pk, (net.get(pk) ?? 0) - Math.abs(usdToB));
  net.set(ek, (net.get(ek) ?? 0) + Math.abs(usdToB));
}

/**
 * A PARTY'S DEATH CLOSES OUT EVERY CONTRACT IT STANDS ON, the week it
 * dies: the settle's DEFAULTED branch, for every class at once, paid through the estate's
 * account (a claim on it or a payment from it, like any other). Before this a class whose market
 * had already run that week carried the dead party's contracts to its next settle, and the
 * audit saw a contract with a dead party at every such week's end (O5).
 */
export function closeOutDerivativesOfParty(ctx: WeeklyStepContext, state: GameState, party: DerivativeParty): number {
  const book = derivativesBookOf(ctx);
  const key = derivativePartyKey(party);
  const view = buildDerivativeMarketView(ctx);
  const net = new Map<string, number>();
  const kept: DerivativeContract[] = [];
  let closed = 0;
  for (const c of book) {
    const onA = derivativePartyKey(c.a) === key;
    if (!onA && derivativePartyKey(c.b) !== key) { kept.push(c); continue; }
    closed++;
    // A counterparty that has ceased to exist leaves nobody to pay or be paid: flat.
    if (view.partyState(onA ? c.b : c.a) === 'GONE') continue;
    const profile = derivativeProfile(c.classId);
    const markLocal = profile.markToMarketUSDToA(c, view);
    if (markLocal !== null) payToB(ctx, c, -(markLocal - (c.settledMarkLocal ?? 0)), 'derivative close-out', net);
    else payToB(ctx, c, profile.closeOutUSDToB(c, view), 'derivative close-out', net);
  }
  if (closed > 0) keepDerivatives(ctx, kept);
  return closed;
}

/**
 * THE MARGIN GOES BACK WHEN THE CONTRACT DOES. Initial margin is the A side's own cash, held by
 * the B side for as long as the contract lives, so a contract that matures, terminates on an
 * event or is closed out has no margin left to require.
 *
 * Nothing ever released it. The tree had exactly ONE margin payment — the posting — and no second
 * one anywhere, so every dollar a client ever posted stayed with the desk for good and the desk's
 * margin liability only ever grew. It was found by following the wires behind M6: the money stock
 * moved by the week's margin with no creator that could explain it.
 */
/**
 * §3.17-i — THE POSTING, in one place for every class. Initial margin is the CLIENT'S money
 * sitting with the desk: A pays it to the dealer's securities account, reserves move and equity
 * does not, and the ledger holds it as a lien on that account for the contract's life
 * (`contract-ledger.ts:syncMarginLiens`) until `releaseInitialMargin` returns it. Only a bank on
 * the B side holds margin; a contract with none to post posts none.
 */
export function postInitialMargin(ctx: WeeklyStepContext, c: DerivativeContract): void {
  const marginLocal = initialMarginLocal(c);
  if (!(marginLocal > MIN_LEG_LOCAL) || c.b.kind !== 'BANK') return;
  pay(ctx, { payer: c.a, payee: bankSecuritiesParty(c.b), amount: marginLocal, currency: c.currency, reason: 'initial margin posted' });
}

function releaseInitialMargin(ctx: WeeklyStepContext, c: DerivativeContract, view: DerivativeLifecycleView): void {
  const marginLocal = initialMarginLocal(c);
  // Held on the desk's own securities account, which is where the posting put it; a party that
  // has ceased to exist has nowhere to receive it, the same rule the close-out legs follow.
  if (!(marginLocal > MIN_LEG_LOCAL) || c.b.kind !== 'BANK' || view.partyState(c.a) === 'GONE') return;
  pay(ctx, {
    payer: bankSecuritiesParty(c.b),
    payee: c.a,
    amount: marginLocal,
    currency: c.currency,
    reason: 'initial margin returned',
  });
}

/**
 * Settle one class's contracts for the week. Returns each party's net cash settled here
 * (positive = received), which a market stage's budget test reads before it strikes more.
 */
export function settleDerivativeClass(
  ctx: WeeklyStepContext,
  state: GameState,
  classId: DerivativeClassId,
  view: DerivativeLifecycleView
): Map<string, number> {
  const book = derivativesBookOf(ctx);
  const profile = derivativeProfile(classId);
  const net = new Map<string, number>();
  const kept: DerivativeContract[] = [];

  /** The mark leg: value to A now, less what was already settled, signed to B. */
  const settleMark = (c: DerivativeContract, reason: string): void => {
    const markLocal = profile.markToMarketUSDToA(c, view);
    if (markLocal === null) return;
    const deltaToA = markLocal - (c.settledMarkLocal ?? 0);
    payToB(ctx, c, -deltaToA, reason, net);
    c.settledMarkLocal = markLocal;
  };

  for (const c of book) {
    if (c.classId !== classId) { kept.push(c); continue; }

    const event = profile.eventTermination(c, view);
    if (event) { payToB(ctx, c, event.usdToB, event.reason, net); releaseInitialMargin(ctx, c, view); continue; }

    if (c.maturityWeek <= view.week) {
      const leg = profile.periodicLegUSDToB(c, view);
      if (leg) payToB(ctx, c, leg.usdToB, leg.reason, net);
      settleMark(c, profile.markReasonFinal ?? 'derivative settled');
      releaseInitialMargin(ctx, c, view);
      continue;
    }

    const aState = view.partyState(c.a);
    const bState = view.partyState(c.b);
    if (aState !== 'ALIVE' || bState !== 'ALIVE') {
      // A party that has ceased to exist leaves nobody to pay or be paid: the contract ends
      // flat. A DEFAULTED party still has an account (its estate's), and settles replacement
      // value through it like any other claim on the estate.
      if (aState !== 'GONE' && bState !== 'GONE') {
        const markLocal = profile.markToMarketUSDToA(c, view);
        if (markLocal !== null) payToB(ctx, c, -(markLocal - (c.settledMarkLocal ?? 0)), 'derivative close-out', net);
        else payToB(ctx, c, profile.closeOutUSDToB(c, view), 'derivative close-out', net);
      }
      releaseInitialMargin(ctx, c, view);
      continue;
    }

    const leg = profile.periodicLegUSDToB(c, view);
    if (leg) payToB(ctx, c, leg.usdToB, leg.reason, net);
    settleMark(c, profile.markReasonLive ?? 'derivative variation margin');
    kept.push(c);
  }

  keepDerivatives(ctx, kept);
  return net;
}

// §3.13-BOOK d5c / §3.17-i: the margin a contract carries (`registry.ts:initialMarginLocal`), and
// what a strike posts (`initialMarginAtStrike`).
export { initialMarginLocal, initialMarginAtStrike };
