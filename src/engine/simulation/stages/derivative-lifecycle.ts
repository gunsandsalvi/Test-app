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
import { derivativesBookOf, strikeDerivatives, keepDerivatives, reseatDerivative } from '../../ledger/contract-ledger';
import { planOffsets } from '../../../domain/derivatives/netting';
import { ccpOfContract, ccpOfMoney, memberMarginAccount, runWaterfall, writeDownSurvivors, ccpOwnCapitalLocal, memberMarginCapacityLocal, admittedShareOf, scaledContract, type WaterfallRound } from '../../../domain/clearing-house';
import { ccpFundOf, publishCcpFund, ccpSheetAt, memberMarginPostedLocal } from '../../ledger/contract-ledger';
import { bankReservesOf, cashOf, obligationCurrencyOf } from '../../ledger/accounts';
import { institutionSpendableLocal } from './settlement';
import { convert } from '../../../domain/currency';
import { pendingSettlementLocal } from './settlement';
import type { CurrencyCode } from '../../../domain/geography';
import { bookPnL } from '../../ledger/bank-book';
import { ccpParty } from '../../../domain/party';

import { isActiveCompany, isInvestmentGradeRating, CreditRating } from '../../../domain/company';
import { DerivativeClassId, DerivativeContract, DerivativeParty, derivativePartyKey, bankPartyKey } from '../../../domain/derivatives/contract';
import { DerivativeMarketView, DerivativeLeg, DerivativeLegs } from '../../../domain/derivatives/profile';
import { derivativeProfile, initialMarginLocal, initialMarginAtStrike, withInitialMargin } from '../../../domain/derivatives/registry';
import { measuredWeeklyMove, measuredWeeklyBpsMove, realizedAnnualVol } from '../../../domain/volatility';
import { ringFill } from '../../../engine2/world';
import { regionIndexOf } from '../../macro/indices';
import { SWAP_TENOR_ZERO_FIELD, SwapTenorKey } from '../../../domain/derivatives/classes/irs';
import { StandingBook } from '../../../domain/derivatives/standing-book';
import { WeeklyStepContext } from './context';
import { buildEntityIndex, companyOfParty } from '../../ledger/entity-index';
import { pay } from './settlement';
import { currencyOf } from '../../../domain/geography';
import { creditRecoveryRate } from './shared-helpers';
import { realisedUnsecuredRecoveryRate } from '../../../domain/estate';
import type { EntityId } from '../../../domain/ids';
import { trancheClearedPricePerFace } from '../../credit-price';
import { materializeGovLadder } from '../../../engine2/tranches';
import { bondFutureInstrumentId } from '../../../domain/instrument-keys';


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
    // §3.17d-iii: the curve's store is the region's print history per name and tenor; the
    // company's one quoted spread is the benchmark tenor's last print.
    cdsSpreadBps: (issuerId, termKey) => {
      const c = companyById.get(issuerId);
      const hist = c ? region(c.region)?.cdsSpreadHistoryByIssuer?.[issuerId]?.[termKey] : undefined;
      const v = hist?.[hist.length - 1];
      return typeof v === 'number' && v > 0 ? v : Number.NaN;
    },
    isInvestmentGrade: (issuerId) => isInvestmentGradeRating(companyById.get(issuerId)?.creditRating),
    recoveryRate: (r) => creditRecoveryRate(region(r)),
    // §3.17-vi: the reference's own workout — the estate the resolution stage keeps for it, open
    // or closed (a closed one stays readable for a few weeks, which is the window this reads in).
    issuerWorkout: (issuerId) => {
      const estate = ctx.estates.find((e) => e.companyId === issuerId);
      if (!estate) return undefined;
      if (estate.closedWeek === undefined) return { state: 'OPEN' };
      const recovery = realisedUnsecuredRecoveryRate(estate);
      return recovery === undefined ? undefined : { state: 'CLOSED', recovery };
    },
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
    // §3.17-ii — the reference's own move, off the world's own prints.
    commodityWeeklyMove: (commodityId) => {
      const comm = commodityById.get(commodityId);
      if (!comm) return undefined;
      // The realised move of its prints; before it has printed enough, the sigma its own path runs on.
      return measuredWeeklyMove(comm.historicalPrices) ?? (comm.volatility > 0 ? comm.volatility / Math.sqrt(52) : undefined);
    },
    fxWeeklyMove: (r) => {
      if (r === 'USA') return undefined;
      const pair = ctx.updatedFxPairs.find((p) => (p.base === r && p.quote === 'USA') || (p.base === 'USA' && p.quote === r));
      return measuredWeeklyMove(pair?.historicalRates);
    },
    rateWeeklyMoveBps: (r, termKey) => {
      const field = Object.hasOwn(SWAP_TENOR_ZERO_FIELD, termKey) ? SWAP_TENOR_ZERO_FIELD[termKey as SwapTenorKey] : undefined;
      const curves = region(r).historicalZeroCurves;
      if (!field) return undefined;
      return measuredWeeklyBpsMove(curves.map((z) => z[field] * 10000));
    },
    cdsSpreadWeeklyMoveBps: (issuerId, termKey) => {
      const c = companyById.get(issuerId);
      return measuredWeeklyBpsMove(c ? region(c.region)?.cdsSpreadHistoryByIssuer?.[issuerId]?.[termKey] : undefined);
    },
    // §3.17b-i — the shares an option is on: the print, the realised vol (the name's own off its
    // price ring, its region's index before it can estimate one), the weekly move.
    equityPrice: (issuerId) => { const px = companyById.get(issuerId)?.stockPrice; return px !== undefined && px > 0 ? px : Number.NaN; },
    equityAnnualVol: (issuerId) => {
      const c = companyById.get(issuerId);
      if (!c) return undefined;
      return realizedAnnualVol(priceSeriesOf(ctx, c.id), VOL_WINDOW_WEEKS)
        ?? realizedAnnualVol(regionIndexOf(ctx.updatedCompositeIndices, c.region).historical, VOL_WINDOW_WEEKS);
    },
    equityWeeklyMove: (issuerId) => measuredWeeklyMove(priceSeriesOf(ctx, issuerId)),
    // §3.17b-iii — the region's composite index: its level (last computed — stage 12 recomputes
    // it after this phase, so a strike is at the latest published level), the IMPLIED vol its
    // option book cleared when it has one and the realised vol before, and its weekly move.
    indexLevel: (r) => { const v = regionIndexOf(ctx.updatedCompositeIndices, r).value; return v > 0 ? v : Number.NaN; },
    indexAnnualVol: (r) => region(r)?.indexImpliedVol ?? realizedAnnualVol(regionIndexOf(ctx.updatedCompositeIndices, r).historical, VOL_WINDOW_WEEKS),
    indexWeeklyMove: (r) => measuredWeeklyMove(regionIndexOf(ctx.updatedCompositeIndices, r).historical),
    // §3.17d-i — the basket a credit index is on, off the region that rolled it.
    creditIndexSeries: (r, seriesId) => region(r)?.creditIndexSeries?.[seriesId],
    creditIndexSpreadBps: (r, seriesId) => {
      const hist = region(r)?.creditIndexSpreadHistoryBySeries?.[seriesId];
      const v = hist?.[hist.length - 1];
      return typeof v === 'number' && v > 0 ? v : Number.NaN;
    },
    creditIndexWeeklyMoveBps: (r, seriesId) => measuredWeeklyBpsMove(region(r)?.creditIndexSpreadHistoryBySeries?.[seriesId]),
    // §3.17e-i — the deliverable: its cleared cash price and its terms off the sovereign ladder.
    sovereignBondPrice: (_r, bondId) => trancheClearedPricePerFace(ctx.v2, bondId) ?? Number.NaN,
    sovereignBondTerms: (r, bondId) => {
      const rung = materializeGovLadder(ctx.v2, r).find((t) => t.id === bondId);
      return rung ? { couponRate: rung.couponRate, maturityWeek: rung.maturityWeek } : undefined;
    },
    bondFuturePrint: (r, _termKey, deliveryWeek) => {
      const hist = region(r)?.bondFuturesPriceHistory?.[bondFutureInstrumentId(r, deliveryWeek)];
      const v = hist?.[hist.length - 1];
      return typeof v === 'number' && v > 0 ? v : Number.NaN;
    },
  };
}

/** The window stage 12 estimates a name's realised volatility over. */
const VOL_WINDOW_WEEKS = 26;
const priceScratch: number[] = [];
/** A name's price series off the ring — a READ: a name the ring does not hold has none. */
function priceSeriesOf(ctx: WeeklyStepContext, companyId: string): number[] | undefined {
  const row = ctx.v2.rowById.get(companyId);
  return row === undefined ? undefined : ringFill(ctx.v2.priceRing, row, priceScratch).slice();
}

/** A member that can still pay and be paid. The default says every member stands. */
type Stands = (p: DerivativeParty) => boolean;
const everyoneStands: Stands = () => true;

/**
 * §3.17-iv-b — EVERY LEG GOES THROUGH THE HOUSE. A contract's two members never pay each other:
 * the paying side pays the clearing house of the contract's money and the house pays the other
 * side, so each member faces the house and the house is flat on every leg by construction. A
 * member that has ceased to exist pays nothing and is paid nothing — its leg is simply not
 * written — and the house's leg to the OTHER side stands regardless, which is the point of a
 * CCP: the survivor is paid, and what the house cannot recover from a departed member is the
 * waterfall's to fund (17-iv-c; until then it is the house's cash, and `O15` shows it short).
 * Returns nothing; `net` keeps each member's cash settled here for the markets' budget tests.
 */
export function payThroughHouse(ctx: WeeklyStepContext, c: DerivativeContract, usdToB: number, reason: string, net: Map<string, number>, stands: Stands = everyoneStands, /** §3.17b-iv: a leg in another money goes through the house of THAT money. */ currency: CurrencyCode = c.currency): void {
  const amount = Math.abs(usdToB);
  if (!(amount > MIN_LEG_LOCAL)) return;
  const payer = usdToB > 0 ? c.a : c.b;
  const payee = usdToB > 0 ? c.b : c.a;
  const house = ccpOfMoney(currency);
  // §3.13c: the contract says what it settles in; `currencyOf(c.regionId)` was a proxy. The net
  // each member settled here is kept in the contract's money.
  const netAmount = currency === c.currency ? amount : convert(amount, currency, c.currency, ctx.v2.fx);
  if (stands(payer)) {
    pay(ctx, { payer, payee: house, amount, currency, reason });
    const pk = derivativePartyKey(payer);
    net.set(pk, (net.get(pk) ?? 0) - netAmount);
  }
  if (stands(payee)) {
    pay(ctx, { payer: house, payee, amount, currency, reason });
    const ek = derivativePartyKey(payee);
    net.set(ek, (net.get(ek) ?? 0) + netAmount);
  }
}

/** A profile's legs for the week, as a list. */
const asLegs = (legs: DerivativeLegs): DerivativeLeg[] => (legs === null ? [] : Array.isArray(legs) ? legs : [legs]);

/**
 * A PARTY'S DEATH CLOSES OUT EVERY CONTRACT IT STANDS ON, the week it
 * dies: the settle's DEFAULTED branch, for every class at once, paid through the estate's
 * account (a claim on it or a payment from it, like any other). Before this a class whose market
 * had already run that week carried the dead party's contracts to its next settle, and the
 * audit saw a contract with a dead party at every such week's end (O5).
 */
export function closeOutDerivativesOfParty(ctx: WeeklyStepContext, state: GameState, party: DerivativeParty): WaterfallRound[] {
  const book = derivativesBookOf(ctx);
  const key = derivativePartyKey(party);
  const view = buildDerivativeMarketView(ctx);
  const net = new Map<string, number>();
  const kept: DerivativeContract[] = [];
  const closing: DerivativeContract[] = [];
  for (const c of book) {
    if (derivativePartyKey(c.a) === key || derivativePartyKey(c.b) === key) closing.push(c); else kept.push(c);
  }
  if (closing.length === 0) return [];
  const rounds = resolveMemberDefault(ctx, view, party, closing, net);
  keepDerivatives(ctx, kept);
  return rounds;
}

/**
 * §3.17-iv-c-ii — A MEMBER'S DEFAULT IS THE HOUSE'S WATERFALL. Its contracts close out at the
 * mark: the house pays every survivor in full and writes nothing for the defaulter, and what the
 * defaulter owed the house NET across its contracts at each house is the loss the stack absorbs
 * in order (`clearing-house.ts:runWaterfall`): the defaulter's margin, which the house kept
 * rather than returned; its fund contribution; the house's own capital; the survivors'
 * contributions, written down pro rata (a bank survivor books the write-down against equity —
 * its asset at the house shrank with no cash moving); and past the end, nothing — the house is
 * short, which `O15` reports and the news tells. What the defaulter's own money did not cover is
 * the house's UNSECURED claim on its estate, returned here for the estate to rank. A defaulter
 * that was owed money net is paid it, and any margin or contribution the round did not consume
 * goes back to it: the house takes what it is owed and no more. One round per house the member
 * cleared at, recorded on the region (`Region.lastWaterfall`).
 */
export function resolveMemberDefault(ctx: WeeklyStepContext, view: DerivativeLifecycleView, member: DerivativeParty, contracts: readonly DerivativeContract[], net: Map<string, number>): WaterfallRound[] {
  const memberKey = derivativePartyKey(member);
  const isMember = (p: DerivativeParty) => derivativePartyKey(p) === memberKey;
  const memberStands = view.partyState(member) !== 'GONE';
  const stands: Stands = (p) => !isMember(p) && view.partyState(p) !== 'GONE';
  const byHouse = new Map<RegionId, DerivativeContract[]>();
  contracts.forEach((c) => { const r = ccpOfContract(c).region; byHouse.set(r, [...(byHouse.get(r) ?? []), c]); });
  const rounds: WaterfallRound[] = [];
  byHouse.forEach((list, region) => {
    const house = ccpParty(region);
    const money = currencyOf(region);
    // The house's own capital BEFORE the round, the week's pending legs included.
    const sheet = ccpSheetAt(ctx.v2, region);
    const capitalLocal = ccpOwnCapitalLocal(sheet) + pendingSettlementLocal(ctx, house);
    let owedLocal = 0, marginLocal = 0;
    list.forEach((c) => {
      const profile = derivativeProfile(c.classId);
      const markLocal = profile.markToMarketUSDToA(c, view);
      const usdToB = markLocal !== null ? -(markLocal - (c.settledMarkLocal ?? 0)) : profile.closeOutUSDToB(c, view);
      // The survivor's leg is written; the defaulter's is the house's claim, netted below.
      payThroughHouse(ctx, c, usdToB, 'derivative close-out', net, stands);
      const memberIsB = isMember(c.b);
      owedLocal += memberIsB ? -usdToB : usdToB;
      marginLocal += initialMarginLocal(c);
      // The survivor's margin goes back; the defaulter's is the first line of the stack.
      [c.a, c.b].forEach((p) => {
        if (isMember(p) || view.partyState(p) === 'GONE' || !(initialMarginLocal(c) > MIN_LEG_LOCAL)) return;
        pay(ctx, { payer: house, payee: memberMarginAccount(p), amount: initialMarginLocal(c), currency: c.currency, reason: 'initial margin returned' });
      });
    });
    const fund = ccpFundOf(ctx.v2, region);
    const fundLocal = fund.filter((f) => isMember(f.member)).reduce((a, f) => a + f.amountLocal, 0);
    const survivorsFundLocal = fund.reduce((a, f) => a + f.amountLocal, 0) - fundLocal;
    const round = runWaterfall(owedLocal, { marginLocal, fundLocal, capitalLocal, survivorsFundLocal });
    if (memberStands) {
      // Owed money net: paid. Margin and contribution the round did not consume: returned.
      if (-owedLocal > MIN_LEG_LOCAL) pay(ctx, { payer: house, payee: member, amount: -owedLocal, currency: money, reason: 'derivative close-out' });
      const marginBack = marginLocal - round.fromMarginLocal;
      if (marginBack > MIN_LEG_LOCAL) pay(ctx, { payer: house, payee: memberMarginAccount(member), amount: marginBack, currency: money, reason: 'initial margin returned' });
      const fundBack = fundLocal - round.fromFundLocal;
      if (fundBack > MIN_LEG_LOCAL) pay(ctx, { payer: house, payee: memberMarginAccount(member), amount: fundBack, currency: money, reason: 'default fund refunded' });
    }
    // The survivors' contributions, written down pro rata; a bank's equity says so.
    const { kept, writtenDownByMember } = writeDownSurvivors(fund, isMember, round.fromSurvivorsLocal);
    publishCcpFund(ctx.v2, region, kept);
    if (writtenDownByMember.size > 0) {
      const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
      writtenDownByMember.forEach((down, p) => {
        if (p.kind !== 'BANK') return;
        const bank = companyById.get(p.id);
        if (bank?.bankBalanceSheet) bank.bankBalanceSheet = bookPnL(bank.bankBalanceSheet, -down, 'default fund written down', bank.ticker);
      });
    }
    const record: WaterfallRound = { week: view.week, regionId: region, member, ...round };
    const reg = ctx.updatedRegions[region];
    reg.lastWaterfall = record;
    rounds.push(record);
  });
  return rounds;
}

/**
 * THE MARGIN GOES BACK WHEN THE CONTRACT DOES. Initial margin is the A side's own cash, held for
 * as long as the contract lives, so a contract that matures, terminates on an event or is closed
 * out has no margin left to require.
 *
 * Nothing ever released it. The tree had exactly ONE margin payment — the posting — and no second
 * one anywhere, so every dollar a client ever posted stayed with the desk for good and the desk's
 * margin liability only ever grew. It was found by following the wires behind M6: the money stock
 * moved by the week's margin with no creator that could explain it.
 */
/**
 * §3.17-i — THE POSTING, in one place for every class. §3.17-iv-a — POSTED TO THE CLEARING
 * HOUSE: A pays its margin to the CCP of the contract's money (`clearing-house.ts:ccpOfContract`),
 * whose cash it is until `releaseInitialMargin` returns it; the CCP's rows at the banks carry it
 * (`accounts.ts:ccpDepositsAt`) and `O15` holds them to the contracts. Whoever the B side is: the
 * dealer no longer holds a client's margin, so a contract between two non-banks posts too. A
 * contract with none to post posts none. (B's own margin comes with the novation, 17-iv-b.)
 */
export function postInitialMargin(ctx: WeeklyStepContext, c: DerivativeContract): void {
  // §3.17-iv-b: BOTH members post — each faces the house, and the house is exposed to each. A
  // bank posts from its securities account and carries the margin as an asset
  // (`clearing-house.ts:memberMarginAccount`).
  [c.a, c.b].forEach((member) => postMemberMargin(ctx, c, member));
}
/** §3.17e-iv: one member's posting — the seat that changes hands on a netted slice posts alone. */
function postMemberMargin(ctx: WeeklyStepContext, c: DerivativeContract, member: DerivativeParty): void {
  const marginLocal = initialMarginLocal(c);
  if (!(marginLocal > MIN_LEG_LOCAL)) return;
  pay(ctx, { payer: memberMarginAccount(member), payee: ccpOfContract(c), amount: marginLocal, currency: c.currency, reason: 'initial margin posted' });
}

function releaseInitialMargin(ctx: WeeklyStepContext, c: DerivativeContract, view: DerivativeLifecycleView): void {
  [c.a, c.b].forEach((member) => releaseMemberMargin(ctx, c, member, view));
}
/** Held by the clearing house, which is where the posting put it, and returned to a member that
 *  still exists; one that has ceased to exist has nowhere to receive it, the same rule the legs
 *  follow — the house keeps it, and it is the first resource the waterfall (17-iv-c) draws on. */
function releaseMemberMargin(ctx: WeeklyStepContext, c: DerivativeContract, member: DerivativeParty, view: DerivativeLifecycleView): void {
  const marginLocal = initialMarginLocal(c);
  if (!(marginLocal > MIN_LEG_LOCAL)) return;
  if (view.partyState(member) === 'GONE') return;
  pay(ctx, { payer: ccpOfContract(c), payee: memberMarginAccount(member), amount: marginLocal, currency: c.currency, reason: 'initial margin returned' });
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
  const stands: Stands = (p) => view.partyState(p) !== 'GONE';
  /** §3.17-iv-c-ii: a dead member's contracts, gathered for its waterfall after the walk. */
  const deadByMember = new Map<string, { member: DerivativeParty; contracts: DerivativeContract[] }>();

  /** The mark leg: value to A now, less what was already settled, signed to B. */
  const settleMark = (c: DerivativeContract, reason: string): void => {
    const markLocal = profile.markToMarketUSDToA(c, view);
    if (markLocal === null) return;
    const deltaToA = markLocal - (c.settledMarkLocal ?? 0);
    payThroughHouse(ctx, c, -deltaToA, reason, net, stands);
    c.settledMarkLocal = markLocal;
  };

  for (const c of book) {
    if (c.classId !== classId) { kept.push(c); continue; }

    const event = profile.eventTermination(c, view);
    if (event) { asLegs(event).forEach((l) => payThroughHouse(ctx, c, l.usdToB, l.reason, net, stands, l.currency)); releaseInitialMargin(ctx, c, view); continue; }

    // §3.17d-i: a partial event — one name's weight of a basket — settles and the line stands.
    const partial = profile.eventSettlement?.(c, view);
    if (partial) {
      asLegs(partial.legs).forEach((l) => payThroughHouse(ctx, c, l.usdToB, l.reason, net, stands, l.currency));
      c.units = partial.unitsAfter;
      if (partial.done) { settleMark(c, profile.markReasonFinal ?? 'derivative settled'); releaseInitialMargin(ctx, c, view); continue; }
    }

    // §3.17-vi: a contract with an event pending outlives its maturity until the event settles.
    if (c.maturityWeek <= view.week && !profile.holdsPastMaturity?.(c, view)) {
      asLegs(profile.periodicLegUSDToB(c, view)).forEach((l) => payThroughHouse(ctx, c, l.usdToB, l.reason, net, stands, l.currency));
      settleMark(c, profile.markReasonFinal ?? 'derivative settled');
      releaseInitialMargin(ctx, c, view);
      continue;
    }

    const aState = view.partyState(c.a);
    const bState = view.partyState(c.b);
    if (aState !== 'ALIVE' || bState !== 'ALIVE') {
      // §3.17-iv-c-ii: the house closes a dead member's contracts out through its waterfall —
      // every contract of the member at once, after the walk (`resolveMemberDefault`).
      const dead = aState !== 'ALIVE' ? c.a : c.b;
      const key = derivativePartyKey(dead);
      const entry = deadByMember.get(key) ?? { member: dead, contracts: [] };
      entry.contracts.push(c);
      deadByMember.set(key, entry);
      continue;
    }

    asLegs(profile.periodicLegUSDToB(c, view)).forEach((l) => payThroughHouse(ctx, c, l.usdToB, l.reason, net, stands, l.currency));
    settleMark(c, profile.markReasonLive ?? 'derivative variation margin');
    kept.push(c);
  }

  deadByMember.forEach(({ member, contracts }) => resolveMemberDefault(ctx, view, member, contracts, net));
  keepDerivatives(ctx, kept);
  return net;
}

/**
 * §3.17-v-i — THE HOUSE ADMITS WHAT ITS MEMBERS CAN MARGIN. Each member's remaining capacity
 * (`clearing-house.ts:memberMarginCapacityLocal`) is opened once per market from its liquid cash
 * — a bank's reserves, a fund's spendable cash net of the collateral it holds, a firm's cash, each
 * with the week's pending legs — less the margin it has at the houses from EARLIER weeks (this
 * week's postings already left its pending cash), and drawn down by every contract admitted.
 * A contract is cut to the smaller of its two members' admitted shares; one that fits nothing
 * is refused. What was cut is the region's `ccpRefusedNotionalLocal`, reset each week.
 */
interface MemberCapacity { remainingByKey: Map<string, number> }
export const openMemberCapacity = (): MemberCapacity => ({ remainingByKey: new Map() });

function memberLiquidCashLocal(ctx: WeeklyStepContext, p: DerivativeParty): number {
  if (p.kind === 'INSTITUTION') return institutionSpendableLocal(ctx, p);
  const own = p.kind === 'BANK' ? bankReservesOf(ctx.v2, p.id) : cashOf(ctx.v2, { id: p.id });
  return Math.max(0, own + pendingSettlementLocal(ctx, p));
}

function remainingCapacityOf(ctx: WeeklyStepContext, cap: MemberCapacity, p: DerivativeParty, home: CurrencyCode): number {
  const key = derivativePartyKey(p);
  const known = cap.remainingByKey.get(key);
  if (known !== undefined) return known;
  const opened = memberMarginCapacityLocal(memberLiquidCashLocal(ctx, p), memberMarginPostedLocal(ctx.v2, p, home, ctx.nextWeek));
  cap.remainingByKey.set(key, opened);
  return opened;
}

/** A share below this is dust, not a position: the contract is refused whole. */
const MIN_ADMITTED_SHARE = 1e-3;

export function admitContract(ctx: WeeklyStepContext, cap: MemberCapacity, c: DerivativeContract): DerivativeContract | undefined {
  const marginLocal = initialMarginLocal(c);
  if (!(marginLocal > MIN_LEG_LOCAL)) return c;
  const sides = [c.a, c.b].map((p) => {
    const home = obligationCurrencyOf(ctx.v2, p);
    const marginHome = convert(marginLocal, c.currency, home, ctx.v2.fx);
    return { key: derivativePartyKey(p), marginHome, remaining: remainingCapacityOf(ctx, cap, p, home) };
  });
  const share = Math.min(1, ...sides.map((s) => admittedShareOf(s.marginHome, s.remaining)));
  const refusedLocal = c.notional * (1 - (share < MIN_ADMITTED_SHARE ? 0 : share));
  if (refusedLocal > 0) {
    const reg = ctx.updatedRegions[c.regionId];
    reg.ccpRefusedNotionalLocal = (reg.ccpRefusedNotionalLocal ?? 0) + refusedLocal;
  }
  if (share < MIN_ADMITTED_SHARE) return undefined;
  sides.forEach((s) => cap.remainingByKey.set(s.key, Math.max(0, s.remaining - s.marginHome * share)));
  return share < 1 ? scaledContract(c, share) : c;
}

/**
 * §3.17-v-iii — WHAT A MEMBER CAN STILL CARRY of a strike at this margin rate, in the contract's
 * money: its remaining capacity through the rate (`registry.ts:initialMarginRateOf`). Unbounded
 * where the strike posts nothing. A market sizes a party's demand and a desk's supply with it
 * BEFORE the print, and reserves what it sized (`reserveMemberCapacity`) so a party's second
 * hedge this week is sized against what its first will post; the strike's own admission then
 * finds the contract fits, and the house's cut is the exception.
 */
export function memberNotionalCapacityLocal(ctx: WeeklyStepContext, cap: MemberCapacity, party: DerivativeParty, currency: CurrencyCode, marginRate: number): number {
  if (!(marginRate > 0)) return Number.POSITIVE_INFINITY;
  const home = obligationCurrencyOf(ctx.v2, party);
  return convert(remainingCapacityOf(ctx, cap, party, home), home, currency, ctx.v2.fx) / marginRate;
}
export function reserveMemberCapacity(ctx: WeeklyStepContext, cap: MemberCapacity, party: DerivativeParty, currency: CurrencyCode, marginLocal: number): void {
  if (!(marginLocal > 0)) return;
  const home = obligationCurrencyOf(ctx.v2, party);
  const key = derivativePartyKey(party);
  cap.remainingByKey.set(key, Math.max(0, remainingCapacityOf(ctx, cap, party, home) - convert(marginLocal, currency, home, ctx.v2.fx)));
}

/** A market's whole strike: §3.17e-iv netted against the standing book first, then admitted
 *  contract by contract against one capacity read. */
export function admitToHouse(ctx: WeeklyStepContext, struck: readonly DerivativeContract[], view: DerivativeLifecycleView): DerivativeContract[] {
  const cap = openMemberCapacity();
  const admitted: DerivativeContract[] = [];
  netAgainstStanding(ctx, view, struck).forEach((c) => { const a = admitContract(ctx, cap, c); if (a) admitted.push(a); });
  return admitted;
}

/**
 * §3.17e-iv — OFFSETTING LINES NET AT THE HOUSE. For each new contract, the slices of standing
 * contracts on the SAME line where a member of the new one holds the opposite seat
 * (`netting.ts:planOffsets`, oldest first): the slice settles at the print — its mark since it
 * was last settled, to or from the member leaving, through the house — the leaving member's
 * margin on the slice comes back, the new counterparty takes the seat and posts the slice's
 * margin, and the slice's settled mark restarts at the print so the incoming member holds it as
 * if struck there. Only what the standing book does not absorb stands as a new contract. A line
 * with no print this week nets nothing: there is no price to close at.
 */
function netAgainstStanding(ctx: WeeklyStepContext, view: DerivativeLifecycleView, struck: readonly DerivativeContract[]): DerivativeContract[] {
  const out: DerivativeContract[] = [];
  const net = new Map<string, number>();
  const drawn = new Set<string>();
  struck.forEach((c) => {
    const profile = derivativeProfile(c.classId);
    const { offsets, remainingNotional } = planOffsets(c, derivativesBookOf(ctx), drawn);
    let netted = 0;
    offsets.forEach((o) => {
      const s = derivativesBookOf(ctx).find((x) => x.id === o.standingId);
      if (!s) return;
      const mark = profile.markToMarketUSDToA(s, view);
      if (mark === null) return;
      drawn.add(s.id);
      netted += o.notional;
      const share = o.notional / s.notional;
      const leaving = o.seat === 'b' ? s.b : s.a;
      const slice = { ...scaledContract(s, share), settledMarkLocal: (s.settledMarkLocal ?? 0) * share };
      // The slice closes at the print for the member leaving: what it is owed or owes since the
      // last settlement, through the house.
      payThroughHouse(ctx, slice, -(mark * share - slice.settledMarkLocal), 'position netted at the house', net);
      releaseMemberMargin(ctx, slice, leaving, view);
      postMemberMargin(ctx, slice, o.incoming);
      const seatA = o.seat === 'a' ? o.incoming : s.a;
      const seatB = o.seat === 'b' ? o.incoming : s.b;
      if (share >= 1 - 1e-12) {
        reseatDerivative(ctx, s, { a: seatA, b: seatB, notional: s.notional, units: s.units, initialMarginLocal: s.initialMarginLocal, settledMarkLocal: mark });
      } else {
        // The remainder stands as it was, smaller; the slice stands re-seated as its own contract.
        const rest = 1 - share;
        reseatDerivative(ctx, s, { a: s.a, b: s.b, notional: s.notional * rest, units: s.units === undefined ? undefined : s.units * rest, initialMarginLocal: s.initialMarginLocal * rest, settledMarkLocal: (s.settledMarkLocal ?? 0) * rest });
        strikeDerivatives(ctx, [{ ...slice, id: `${s.id}-N${c.struckWeek}`, a: seatA, b: seatB, settledMarkLocal: mark * share }]);
      }
    });
    if (netted <= 0) { out.push(c); return; }
    if (remainingNotional > MIN_LEG_LOCAL && netted < c.notional) out.push(scaledContract(c, (c.notional - netted) / c.notional));
  });
  return out;
}

// §3.13-BOOK d5c / §3.17-i, ii: the margin a contract carries (`registry.ts:initialMarginLocal`),
// and what a strike posts (`initialMarginAtStrike`, `withInitialMargin`).
export { initialMarginLocal, initialMarginAtStrike, withInitialMargin };
