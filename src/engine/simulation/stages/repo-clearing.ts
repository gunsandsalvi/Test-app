/**
 * The overnight general-collateral repo market (one per region, weekly session).
 *
 * What it is. A bank whose week closes short of its own operating cash buffer sells government
 * paper overnight under an agreement to repurchase — cash against collateral, re-struck every
 * week. The cash comes from whoever closed the prior week with idle balances: another bank's
 * surplus, an institution's uninvested cash, and — only when the private book cannot fund the
 * need — the central bank's standing facility, which is a posted-rate seat IN this auction
 * rather than a fallback around it.
 *
 * Why the corridor holds without a clamp: every
 * participant's reservation is its own administered outside option. A bank lender will not
 * accept less than the policy rate its reserves already earn (floor-system IOR); a non-bank
 * lender will not accept less than the ON RRP rate its idle cash can always earn; and no
 * borrower pays more than policyRate + SRF_SPREAD_BPS because the standing facility sits in
 * the book with unlimited size at exactly that level. The cleared print can therefore only
 * live inside [policy − ON_RRP_SPREAD, policy + SRF_SPREAD] — asserted weekly by the
 * invariants harness, produced by nothing but the participants' schedules.
 *
 * Every quantity here is derived, not posted (discipline — the administered rates are
 * rule 3's single sanctioned exception):
 *  the HAIRCUT on each bond is the lender's real protection: the repricing that bond's own
 *    cleared yield could plausibly suffer before the collateral could be sold —
 *    duration × two standard deviations of its own observed weekly yield changes
 *    (historicalZeroCurves). It tightens borrowing capacity exactly when the curve turns
 *    volatile, which a posted percentage cannot do.
 *  a BORROWER's size is its real shortfall to its own buffer, capped by unencumbered
 *    collateral × (1 − haircut).
 *  a LENDER's size is the cash its own week genuinely closed with: a bank's cash above its
 *    buffer; an institution's overnight half of its cash sleeve (the same split WS5's bill
 *    sleeve already uses — G6 derives the split from real liability liquidity needs and
 *    retires the shared constant).
 *
 * Positions are overnight at weekly resolution: struck here, matured at the start of the NEXT
 * week's session — banks inside evolveBankingSector's maturation flows, institutions here,
 * before new positions are struck. Interest is real money moving between named books: borrower
 * banks pay it (their equity and cash), private lenders receive it, and the SRF/RRP legs cross
 * the central-bank boundary exactly like the IOR on reserves (G9 makes the CB a real
 * counterparty and closes that boundary).
 */

import { bankReservesOf, householdDepositsAt } from '../../ledger/accounts';
import { bankSovereignFaceByBond } from '../../sovereign-register';
import type { EntityId } from '../../../domain/ids';
import { buildEntityIndex } from '../../ledger/entity-index';
import { bankParty, bankPartyOf, bankSecuritiesParty, bankSecuritiesPartyOf } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { RegionId, Region } from '../../../types';
import { overPledgedByBond } from '../../../domain/collateral';
import { sovereignTenorResolver } from '../../../domain/government';
import { materializeGovLadder } from '../../../engine2/tranches';
import { BankingSector } from '../../../domain/banking';
import {
  RepoContract, RepoPledge, RepoParty, repoInterestToMaturityLocal,
  repoBorrowedLocal, repoLentLocal, srfBorrowedLocal, encumberedFaceByBond,
} from '../../../domain/repo';
import { WeeklyStepContext, updateBankSheet } from './context';
import { pay, PartyRef, pendingSettlementLocal, institutionSpendableLocal } from './settlement';
import {
  clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand,
  YIELD_LIKE_MIN_WEEKLY_MOVE_BPS,
} from './financial-clearing-engine';
import { SRF_SPREAD_BPS, ON_RRP_SPREAD_BPS, MIN_CASH_BUFFER_RATIO } from '../../macro/banking';

import { repoOvernightInstrumentId, repoTermInstrumentId } from '../../../domain/instrument-keys';
import { registerBook } from '../../ledger/instrument-ledger';
import { type InstrumentId, asEntityId } from '../../../domain/ids';
import { bankParticipantId, bankTickerOfParticipant, repoInstitutionSeatId, repoInstitutionIdOfSeat } from '../../../domain/participant-keys';
import type { Ticker } from '../../../domain/ids';
/** The zero curve's own points, at the tenors they are quoted for — a curve HAS points, and this
 *  is the one place that says where they sit. Not a grouping of holdings: nothing is keyed by it. */
const CURVE_POINT_YEARS: [('tenor3M' | 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y'), number][] = [
  ['tenor3M', 0.25], ['tenor2Y', 2], ['tenor5Y', 5], ['tenor10Y', 10], ['tenor30Y', 30],
];

/**
 * Derived GC haircuts: duration × the observed weekly yield repricing risk at that tenor
 * (2σ of weekly changes in the nearest curve point's cleared yield). With too little history
 * to estimate a standard deviation (a genuinely mathematical bound — σ needs at least two
 * observations), the engine's own minimum weekly repricing allowance stands in: the smallest
 * move the clearing damper will always permit is the smallest move a lender must assume.
 */
/**
 * §3.13-SOV row 3 — A HAIRCUT IS THE BOND'S, BECAUSE DURATION IS THE BOND'S.
 *
 * The haircut has always been `duration x the weekly repricing volatility at that tenor` — a real
 * mechanism. It was keyed by tenor bucket only because the duration came from a bucket table, and
 * every reader then wrote `haircuts[key] ?? haircuts.t5 ?? 0.05`: a key it could not find got
 * the FIVE-YEAR haircut, and failing that a flat 5%. With holdings keyed by bond, that fallback
 * would have quietly given a thirty-year bond a five-year haircut on every pledge.
 *
 * It returns a function of the bond now, and a bond that is not on the ladder returns undefined —
 * the caller skips it rather than pledging it at a guessed value.
 */
export function computeSovereignRepoHaircuts(
  reg: Region,
  tenorYearsOf: (bondId: string) => number | undefined
): (bondId: string) => number | undefined {
  const hist = reg.historicalZeroCurves || [];
  /** The weekly repricing volatility at a tenor, from the nearest curve point's own history. */
  const repricingBpsAt = (years: number): number => {
    const field = nearestCurvePoint(years);
    const series = hist.map((h) => h[field]).filter((v) => Number.isFinite(v));
    const diffsBps: number[] = [];
    for (let i = 1; i < series.length; i++) diffsBps.push((series[i] - series[i - 1]) * 10000);
    if (diffsBps.length < 2) return YIELD_LIKE_MIN_WEEKLY_MOVE_BPS;
    const mean = diffsBps.reduce((a, b) => a + b, 0) / diffsBps.length;
    const variance = diffsBps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (diffsBps.length - 1);
    return Math.max(YIELD_LIKE_MIN_WEEKLY_MOVE_BPS, 2 * Math.sqrt(variance));
  };
  const cache = new Map<string, number>();
  return (bondId: string) => {
    const cached = cache.get(bondId);
    if (cached !== undefined) return cached;
    const years = tenorYearsOf(bondId);
    if (years === undefined) return undefined;
    // Duration is the bond's own remaining life; a long bond is a worse pledge than a short one
    // because it moves more, which is what a haircut is FOR.
    const h = Math.min(1, years * (repricingBpsAt(years) / 10000));
    cache.set(bondId, h);
    return h;
  };
}

/** Which curve point's history best describes a tenor's week-to-week move. */
function nearestCurvePoint(years: number): 'tenor3M' | 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y' {
  let best = CURVE_POINT_YEARS[0][0], bestGap = Infinity;
  for (const [field, at] of CURVE_POINT_YEARS) {
    const gap = Math.abs(at - years);
    if (gap < bestGap) { bestGap = gap; best = field; }
  }
  return best;
}

/** A bank's total repo-able collateral value net of haircuts, and its face total. */
export function collateralCapacityLocal(
  heldByBond: ReadonlyMap<InstrumentId, number>,
  haircutOf: (bondId: string) => number | undefined
): { faceLocal: number; capacityLocal: number } {
  let faceLocal = 0; let capacityLocal = 0;
  // §3.13-BOOK d3b: the bank's book is its register rows, handed in as face by bond.
  heldByBond.forEach((usd, bondId) => {
    if (usd <= 0) return;
    // §3.13-SOV row 3: a bond whose haircut cannot be computed is not pledgeable collateral.
    // It is not pledged at a guessed one.
    const haircut = haircutOf(bondId);
    if (haircut === undefined) return;
    faceLocal += usd;
    capacityLocal += usd * (1 - haircut);
  });
  return { faceLocal, capacityLocal };
}

/**
 * What this bank could still raise, bond by bond, against paper it has not already
 * pledged. Encumbrance is now a property of the specific paper (domain/repo.ts), so pledging
 * thirty-year bonds no longer withholds the two-year book from the auction that prices it, and
 * the cash a pledge raises is that bond's own haircut rather than a blended average.
 */
export function unencumberedByBond(
  heldByBond: ReadonlyMap<InstrumentId, number>,
  encumberedFace: Map<InstrumentId, number>
): Map<InstrumentId, number> {
  const free = new Map<InstrumentId, number>();
  heldByBond.forEach((v, key) => {
    const freeLocal = Math.max(0, v - (encumberedFace.get(key) ?? 0));
    if (freeLocal > 0) free.set(key, freeLocal);
  });
  return free;
}

/**
 * The funding a bank can still raise against paper it has not already pledged — the real bound
 * on both its repo borrowing here and its bond-buying budget in 07c/07f. Already-pledged
 * collateral (repo + SRF) is excluded; the fraction is by value, applied at the pool's blended
 * haircut.
 */
export function unencumberedBorrowingCapacityLocal(
  sheet: BankingSector,
  /** §3.13-BOOK d3b: the bank's own sovereign rows, face by bond (`bankSovereignFaceByBond`). */
  heldByBond: ReadonlyMap<InstrumentId, number>,
  haircutOf: (bondId: string) => number | undefined,
  /** What this bank has already pledged, by bond. Omitted falls back to the sheet's
   *  derived scalar, for the callers that have no book to hand. */
  encumberedFace?: Map<InstrumentId, number>
): number {
  if (encumberedFace) {
    let capacityLocal = 0;
    unencumberedByBond(heldByBond, encumberedFace).forEach((freeLocal, bondId) => {
      const haircut = haircutOf(bondId);
      if (haircut === undefined) return;
      capacityLocal += freeLocal * (1 - haircut);
    });
    return Math.max(0, capacityLocal);
  }
  const { faceLocal, capacityLocal } = collateralCapacityLocal(heldByBond, haircutOf);
  if (faceLocal <= 0) return 0;
  const encumberedFaceLocal = Math.min(faceLocal, sheet.repoEncumberedCollateralLocal ?? 0);
  const unencumberedShare = (faceLocal - encumberedFaceLocal) / faceLocal;
  return Math.max(0, capacityLocal * unencumberedShare);
}

/**
 * Which paper a borrower actually pledges, and how much of it.
 *
 * LONGEST FIRST, and the reason is the whole point of holding the short end. A bank's bills are
 * its liquidity buffer: they are what the coverage ratio counts and what it must be able to SELL
 * in the week it is short. Its long bonds are an investment book, and financing an investment
 * book is exactly what secured funding is for. Pledging by lowest haircut instead — which looks
 * like cheapest-to-deliver — puts the entire pledge into bills, encumbers the buffer, and then
 * the bill auction has to sell paper the repo book says cannot move: measured immediately, banks
 * pledging 6.1B of 13-week bills against 1.0B they still held by the end of the week.
 */
export function selectCollateral(
  free: Map<InstrumentId, number>,
  haircutOf: (bondId: InstrumentId) => number | undefined,
  targetCashLocal: number
): { pledges: RepoPledge[]; raisedLocal: number } {
  // Longest paper first: a bank pledges what it least wants to sell and keeps its short, liquid
  // paper free. The haircut is `duration × repricing volatility`, monotone in duration within a
  // region, so it IS that ordering — no second table of tenors to disagree with the first.
  const free_ = Array.from(free.entries())
    .sort((a, b) => (haircutOf(b[0]) ?? 0) - (haircutOf(a[0]) ?? 0));
  const pledges: RepoPledge[] = [];
  let raisedLocal = 0;
  for (const [bondId, freeFaceLocal] of free_) {
    const perDollarHaircut = haircutOf(bondId);
    if (perDollarHaircut === undefined) continue;
    if (raisedLocal >= targetCashLocal - 1) break;
    const perDollar = 1 - perDollarHaircut;
    if (perDollar <= 0) continue;
    const wantedFaceLocal = (targetCashLocal - raisedLocal) / perDollar;
    const faceLocal = Math.min(freeFaceLocal, wantedFaceLocal);
    if (faceLocal <= 0) continue;
    pledges.push({ bondId, faceLocal });
    raisedLocal += faceLocal * perDollar;
  }
  return { pledges, raisedLocal };
}

/** The overnight half of an institution's cash sleeve — the split WS5's bill program already
 * uses (07f's CASH_SLEEVE_BILL_SHARE takes the term half). G6 derives this from real
 * liability liquidity needs and retires the shared constant. */
export const CASH_SLEEVE_OVERNIGHT_SHARE = 0.5;

/** Who a contract's lender is, as a settlement party: a bank lends from its securities account;
 *  an institution and the central bank's window are the parties they are. */
const repoLenderParty = (lender: RepoParty): PartyRef =>
  lender.kind === 'BANK' ? bankSecuritiesParty(lender) : lender;

const CB_SRF_SEAT_ID = 'CB-SRF';
/** The term book's maturity — one quarter, the tenor the curve's own front point prices,
 *  so a lender's outside option over it is something the model already publishes. */
export const REPO_TERM_WEEKS = 13;
/** A perfectly elastic window stands at full size AT its posted rate; the numerical step that
 *  represents that vertical schedule sits just below it. See the seat's comment in runBook. */
const SRF_SEAT_STEP_BPS = 1;

export interface RepoSessionResult {
  repoRateAnnual: number;
  sheetByTicker: Map<string, BankingSector>;
  /** GUARD — what a borrower could actually fund this week: its shortfall to the buffer bounded
   *  by its unencumbered collateral. Zero means there was nothing to clear, which is a quiet
   *  week; positive with `clearedVolumeLocal` at zero means a market with a real borrower and real
   *  lenders transacted nothing, which is a defect (: the corridor assertion passed
   *  VACUOUSLY for eight commits because the early return prints the floor as a literal). */
  fundableNeedLocal: number;
  /** What the session actually lent — market repo plus the window. */
  clearedVolumeLocal: number;
}

/**
 * One region's weekly money-market session. `sheetByTicker` arrives carrying this week's
 * post-evolution sheets (bank repo maturations already flowed inside evolveBankingSector) and
 * leaves carrying the new overnight positions, cash and encumbrance. Institutional maturation
 * and re-lending happen here, on ctx.updatedInstitutionalEntities.
 */
export function runRegionalRepoSession(
  regionId: RegionId,
  reg: Region,
  banks: { id: EntityId; ticker: Ticker; region: RegionId }[],
  sheetByTicker: Map<string, BankingSector>,
  ctx: WeeklyStepContext
): RepoSessionResult {
  const week = ctx.nextWeek;
  // §3.13-BOOK (c-then-3b): the auction's SEATS are participant ids that embed a ticker
  // (`participant-keys.ts`), while a contract names its parties by entity id — so the crossing
  // back is one map, built once, rather than a scan per fill.
  const bankIdByTicker = new Map(banks.map((b) => [b.ticker, b.id]));
  const tickerOfBankId = new Map(banks.map((b) => [b.id, b.ticker]));
  const priorRepoRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
  const policyBps = reg.policyRate * 10000;
  // The window's interest income this week, remitted by the central-bank stage.
  if (reg.centralBankSheet) reg.centralBankSheet.lastStandingFacilityInterestLocal = 0;
  const rrpBps = Math.max(0, policyBps - ON_RRP_SPREAD_BPS);
  const srfBps = policyBps + SRF_SPREAD_BPS;
  const corridorWidthBps = Math.max(1, srfBps - rrpBps);
  const onInstrumentId = repoOvernightInstrumentId(regionId);
  const termInstrumentId = repoTermInstrumentId(regionId);
  // §3.13-BOOK dII: the two books are declared on the instrument index where they are built.
  registerBook(ctx.v2, onInstrumentId, 'REPO', currencyOf(regionId));
  registerBook(ctx.v2, termInstrumentId, 'REPO', currencyOf(regionId));
  // §3.13-SOV row 3: haircuts are per BOND, off this region's ladder.
  const haircuts = computeSovereignRepoHaircuts(reg, sovereignTenorResolver(materializeGovLadder(ctx.v2, regionId), ctx.nextWeek));

  // ---- REPO1: last week's contracts. What matured has settled (bank legs inside
  // evolveBankingSector, institutional legs below); what has not matured is still outstanding
  // and still encumbers its own collateral. ----
  const priorBook = reg.repoBook ?? [];
  const maturedNow = priorBook.filter((c) => c.maturityWeek <= week);
  const carriedBook = priorBook.filter((c) => c.maturityWeek > week);

  // ---- Mature the institutional lenders' legs: principal plus the interest their contract
  // actually promised, at the rate IT was struck at and over the term IT ran. (The paying side
  // flowed in evolveBankingSector, so the money arrives here having genuinely left a borrower.)
  // CASH: every matured contract repays through the settlement layer, from the named borrower to
  // the named lender. Principal and interest both move as reserves (`BANK_SECURITIES`) because
  // the P&L for both sides is booked where it is computed — the borrower's interest expense and a
  // bank lender's interest income in `evolveBankingSector`, an institution's in its own income
  // line. Equity where the accrual is; cash through the ledger.
  maturedNow.forEach((c) => {
    const dueLocal = c.principalLocal + repoInterestToMaturityLocal(c);
    if (!(dueLocal > 0)) return;
    if (c.lender.kind === 'CENTRAL_BANK' && reg.centralBankSheet) {
      reg.centralBankSheet.lastStandingFacilityInterestLocal = (reg.centralBankSheet.lastStandingFacilityInterestLocal ?? 0) + repoInterestToMaturityLocal(c);
    }
    pay(ctx, {
      payer: bankSecuritiesPartyOf(c.borrowerId),
      payee: repoLenderParty(c.lender),
      amount: dueLocal,
      currency: currencyOf(regionId),
      reason: 'repo maturity',
    });
  });

  // What each bank still has pledged against contracts that did NOT mature.
  const encumberedByTicker = new Map<Ticker, Map<InstrumentId, number>>();
  banks.forEach((b) => encumberedByTicker.set(b.ticker, encumberedFaceByBond(carriedBook, b.id)));

  // ---- Borrowers: real shortfall to the buffer, bounded by unencumbered collateral. ----
  // The need splits by how long it has already lasted. Money a bank has needed every
  // week — the part of this week's need that is simply ROLLING a contract that just matured —
  // is structural funding and belongs at term; the increment on top of it is this week's cash
  // dip and belongs overnight. A treasury that funds a permanent book overnight is running the
  // maturity mismatch a funding squeeze is made of, and this is what lets it.
  const rolledByTicker = new Map<EntityId, number>();
  maturedNow.forEach((c) => rolledByTicker.set(c.borrowerId, (rolledByTicker.get(c.borrowerId) ?? 0) + c.principalLocal));

  const needByTicker = new Map<EntityId, { onLocal: number; termLocal: number }>();
  let totalOnNeedLocal = 0;
  let totalTermNeedLocal = 0;
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    // CASH: reserves plus what this week's already-posted legs will settle — the maturity it has
    // just been billed for is real money leaving, and a bank that cannot see it cannot know it is
    // short. The same read 07c makes before it bids.
    const settledCashLocal = bankReservesOf(ctx.v2, bank.id)
      + pendingSettlementLocal(ctx, bankSecuritiesParty(bank));
    const shortfallLocal = householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)) * MIN_CASH_BUFFER_RATIO - settledCashLocal;
    if (shortfallLocal <= 0) return;
    const capacityLocal = unencumberedBorrowingCapacityLocal(sheet, bankSovereignFaceByBond(ctx.v2, bank.id), haircuts, encumberedByTicker.get(bank.ticker));
    const needLocal = Math.min(shortfallLocal, capacityLocal);
    if (needLocal <= 0) return;
    const termLocal = Math.min(needLocal, rolledByTicker.get(bank.id) ?? 0);
    const onLocal = needLocal - termLocal;
    needByTicker.set(bank.id, { onLocal, termLocal });
    totalOnNeedLocal += onLocal;
    totalTermNeedLocal += termLocal;
  });
  const totalNeedLocal = totalOnNeedLocal + totalTermNeedLocal;

  // ---- Lenders (whether or not there is need this week, their idle overnight cash earns the
  // administered floor: an institution's unlent overnight sleeve is implicitly parked at the
  // RRP window, the same real posted-rate facility that anchors its reservation below). ----
  // What was parked at the window last week comes back first, so the sleeve below is measured
  // against the whole balance and not against a book that is still a week out the door.
  returnParkedCash(ctx, regionId);
  const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId && !e.isDefaulted);
  const overnightSleeveByEntity = new Map<string, number>();
  regionEntities.forEach((e) => {
    // Its balance plus what its own matured contracts are about to pay it back.
    const availableLocal = institutionSpendableLocal(ctx, e);
    const sleeveLocal = availableLocal * CASH_SLEEVE_OVERNIGHT_SHARE;
    if (sleeveLocal > 0) overnightSleeveByEntity.set(e.id, sleeveLocal);
  });

  const finish = (book: RepoContract[], onRateAnnual: number, termRateAnnual: number | undefined,
                  clearedVolumeLocal: number): RepoSessionResult => {
    reg.repoBook = book;
    // C5: the window's lending is the central bank's ASSET, derived from the same book.
    if (reg.centralBankSheet) reg.centralBankSheet.standingFacilityLentLocal = Math.round(repoLentLocal(book, { kind: 'CENTRAL_BANK', region: regionId }));
    reg.repoTermRateAnnual = termRateAnnual === undefined ? undefined : Number(termRateAnnual.toFixed(6));
    // Every scalar the sheets carried is now DERIVED from the book — the G2 pattern.
    banks.forEach((bank) => {
      const sheet = sheetByTicker.get(bank.ticker);
      if (!sheet) return;
      sheetByTicker.set(bank.ticker, {
        ...sheet,
        repoBorrowedLocal: Math.round((repoBorrowedLocal(book, bank.id) - srfBorrowedLocal(book, bank.id))),
        srfBorrowingLocal: Math.round(srfBorrowedLocal(book, bank.id)),
        repoLentLocal: Math.round(repoLentLocal(book, bankParty(bank))),
        repoEncumberedCollateralLocal: Number(
          Array.from(encumberedFaceByBond(book, bank.id).values()).reduce((a, b) => a + b, 0).toFixed(0)
        ),
      });
    });
    const lentByEntityId = new Map<string, number>();
    book.forEach((c) => {
      if (c.lender.kind !== 'INSTITUTION') return;
      lentByEntityId.set(c.lender.id, (lentByEntityId.get(c.lender.id) ?? 0) + c.principalLocal);
    });
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) =>
      e.region === regionId ? { ...e, repoLentLocal: Math.round((lentByEntityId.get(e.id) ?? 0)) } : e
    );
    return { repoRateAnnual: onRateAnnual, sheetByTicker, fundableNeedLocal: totalNeedLocal, clearedVolumeLocal };
  };

  if (!(totalNeedLocal > 0)) {
    // No borrower: nothing clears, the overnight complex sits at its floor, and the sleeves
    // earn the RRP rate there.
    parkUnlentSleevesAtTheWindow(ctx, regionId, overnightSleeveByEntity, new Map(), rrpBps);
    return finish(carriedBook, rrpBps / 10000, undefined, 0);
  }

  const lenderSchedule = (reservationBps: number, maxHoldingLocal: number): ParticipantDemand => ({
    reservationStat: reservationBps,
    maxHoldingLocal,
    // A lender is fully committed by the top of the corridor: past the SRF rate its
    // counterparty funds at the window instead, so there is nothing above it to be paid for.
    fullSizeStatRange: corridorWidthBps,
  });

  /** Available lender cash this session, decremented as each book takes it. */
  const bankSurplusLocal = new Map<Ticker, number>();
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    const surplusLocal = bankReservesOf(ctx.v2, bank.id)
      + pendingSettlementLocal(ctx, bankSecuritiesParty(bank))
      - householdDepositsAt(ctx.v2, bank.ticker, currencyOf(bank.region)) * MIN_CASH_BUFFER_RATIO;
    if (surplusLocal > 0) bankSurplusLocal.set(bank.ticker, surplusLocal);
  });
  const entitySleeveLocal = new Map(overnightSleeveByEntity);

  /**
   * One book's session. `reservationOf` is each lender's own outside option over THIS book's
   * term — the whole reason the corridor holds without a clamp, now asked at two maturities.
   */
  const runBook = (args: {
    instrumentId: InstrumentId;
    needLocal: number;
    currentBps: number;
    bankReservationBps: number;
    instReservationBps: number;
    withWindow: boolean;
  }) => {
    const instrument: ClearingInstrument = {
      id: args.instrumentId,
      outstandingLocal: args.needLocal,
      tradableFloatLocal: args.needLocal,
      currentStat: args.currentBps,
      statKind: 'YIELD_LIKE',
      durationYears: 1 / 52,
    };
    const participants: ClearingParticipant[] = [];
    bankSurplusLocal.forEach((surplusLocal, ticker) => {
      if (surplusLocal <= 0) return;
      participants.push({
        id: bankParticipantId(ticker),
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[args.instrumentId, lenderSchedule(args.bankReservationBps, surplusLocal)]]),
      });
    });
    entitySleeveLocal.forEach((sleeveLocal, entityId) => {
      if (sleeveLocal <= 0) return;
      participants.push({
        id: repoInstitutionSeatId(entityId),
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[args.instrumentId, lenderSchedule(args.instReservationBps, sleeveLocal)]]),
      });
    });
    if (args.withWindow) {
      // The standing repo facility: a posted rate with unlimited quantity response — a real seat
      // in the book (rule 3's administered exception), which is what makes the ceiling a market
      // outcome instead of a clamp. A perfectly elastic window stands at FULL size exactly AT its
      // posted rate, so the one-basis-point numerical step that represents the vertical schedule
      // sits just BELOW it — a seat whose step straddled the posted rate cleared up to 1bp above
      // the window, which no borrower with window access would ever pay (measured as 16
      // corridor-ceiling breaches in the first 60-week run).
      participants.push({
        id: CB_SRF_SEAT_ID,
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[args.instrumentId, {
          reservationStat: srfBps - SRF_SEAT_STEP_BPS,
          maxHoldingLocal: args.needLocal,
          fullSizeStatRange: SRF_SEAT_STEP_BPS,
        }]]),
      });
    }
    if (participants.length === 0) return { clearedBps: args.currentBps, lentByParty: new Map<string, number>(), totalLentLocal: 0 };

    const result = clearFinancialAsset([instrument], participants, {
      // Bilateral GC at one rate — no desk in the middle taking a spread out of it.
      dealerSpreadBps: 0,
      // Overnight money reprices to the corridor the week policy moves; the corridor — the
      // participants' own posted outside options — is the real bound. The damper is set so wide
      // it cannot be the thing that prints (the harness asserts the corridor every week, so a
      // damper-bound print would be caught as a violation, per damper-diagnostic doctrine).
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `repo:${id}`));
    const clearedBps = result.newStatById.get(args.instrumentId) ?? args.currentBps;
    const lentByParty = new Map<string, number>();
    let totalLentLocal = 0;
    result.newParticipantHoldings.forEach((byInstrument, pid) => {
      const lentLocal = byInstrument.get(args.instrumentId) ?? 0;
      if (lentLocal <= 0) return;
      lentByParty.set(pid, lentLocal);
      totalLentLocal += lentLocal;
      // The cash is committed: it cannot fund the other book too.
      const seatBank = bankTickerOfParticipant(pid);
      const seatInst = repoInstitutionIdOfSeat(pid);
      if (seatBank !== undefined) {
        const t = seatBank;
        bankSurplusLocal.set(t, Math.max(0, (bankSurplusLocal.get(t) ?? 0) - lentLocal));
      } else if (seatInst !== undefined) {
        const id = seatInst;
        entitySleeveLocal.set(id, Math.max(0, (entitySleeveLocal.get(id) ?? 0) - lentLocal));
      }
    });
    return { clearedBps, lentByParty, totalLentLocal };
  };

  // ---- REPO3: term first. A lender's outside option over a quarter is the three-month zero
  // its own money could earn instead, which is exactly what the curve prints; the window does
  // NOT sit in this book, because the standing facility is overnight — so a term need the
  // private market will not fund simply is not funded, and falls back to overnight below. That
  // is a funding squeeze, and it could not previously happen.
  const termBps = Math.max(0, (reg.zeroRates?.tenor3M ?? reg.policyRate) * 10000);
  const term = totalTermNeedLocal > 0
    ? runBook({
        instrumentId: termInstrumentId,
        needLocal: totalTermNeedLocal,
        currentBps: (reg.repoTermRateAnnual ?? reg.policyRate) * 10000,
        bankReservationBps: termBps,
        instReservationBps: Math.max(0, termBps - ON_RRP_SPREAD_BPS),
        withWindow: false,
      })
    : { clearedBps: termBps, lentByParty: new Map<string, number>(), totalLentLocal: 0 };

  // Whatever term did not fund still has to be funded today.
  const onNeedLocal = totalOnNeedLocal + Math.max(0, totalTermNeedLocal - term.totalLentLocal);
  const overnight = onNeedLocal > 0
    ? runBook({
        instrumentId: onInstrumentId,
        needLocal: onNeedLocal,
        currentBps: priorRepoRateAnnual * 10000,
        bankReservationBps: policyBps,
        instReservationBps: rrpBps,
        withWindow: true,
      })
    : { clearedBps: rrpBps, lentByParty: new Map<string, number>(), totalLentLocal: 0 };

  // ---- Settle. Every dollar becomes a CONTRACT with both parties named: at one cleared rate a
  // lender's cash is fungible, so each borrower draws from each lender in proportion to what
  // that lender put into the book — which is what "general collateral" means. ----
  const newContracts: RepoContract[] = [];
  const encumberedWorking = new Map<string, Map<InstrumentId, number>>();
  banks.forEach((b) => encumberedWorking.set(b.ticker, new Map(encumberedByTicker.get(b.ticker) ?? new Map())));
  let contractSeq = 0;

  const strike = (
    lentByParty: Map<string, number>,
    totalLentLocal: number,
    rateAnnual: number,
    termWeeks: number,
    needOf: (bankId: EntityId) => number,
    totalNeedForBookLocal: number
  ) => {
    if (totalLentLocal <= 0 || totalNeedForBookLocal <= 0) return 0;
    const fundedShare = Math.min(1, totalLentLocal / totalNeedForBookLocal);
    let struckLocal = 0;
    needByTicker.forEach((_need, bankId) => {
      const ticker = tickerOfBankId.get(bankId)!;
      const wantLocal = needOf(bankId) * fundedShare;
      if (wantLocal <= 0) return;
      const worked = encumberedWorking.get(ticker)!;
      lentByParty.forEach((lentLocal, pid) => {
        const shareLocal = wantLocal * (lentLocal / totalLentLocal);
        if (shareLocal <= 1) return;
        const free = unencumberedByBond(bankSovereignFaceByBond(ctx.v2, bankId), worked);
        const { pledges, raisedLocal } = selectCollateral(free, haircuts, shareLocal);
        if (raisedLocal <= 1) return;
        const principalLocal = Math.min(shareLocal, raisedLocal);
        pledges.forEach((pl) => worked.set(pl.bondId, (worked.get(pl.bondId) ?? 0) + pl.faceLocal));
        const lenderBankTicker = bankTickerOfParticipant(pid);
        const lenderBank = lenderBankTicker !== undefined ? bankIdByTicker.get(lenderBankTicker) : undefined;
        const lender: RepoParty = pid === CB_SRF_SEAT_ID
          ? { kind: 'CENTRAL_BANK', region: regionId }
          : lenderBank !== undefined
            ? bankPartyOf(lenderBank)
            // §3.13-BOOK (c2b): the seat's tail IS the entity id — `repoInstitutionSeatId`
            // wrote it from one; a seat that parses as neither is the CB's, handled above.
            : { kind: 'INSTITUTION', id: asEntityId(repoInstitutionIdOfSeat(pid) ?? pid) };
        newContracts.push({
          id: `${regionId}-REPO-${week}-${contractSeq++}`,
          regionId,
          lender,
          borrowerId: bankId,
          principalLocal: Math.round(principalLocal),
          rateAnnual,
          struckWeek: week,
          maturityWeek: week + termWeeks,
          collateral: pledges.map((pl) => ({ bondId: pl.bondId, faceLocal: Math.round(pl.faceLocal) })),
        });
        struckLocal += principalLocal;
      });
    });
    return struckLocal;
  };

  const termStruckLocal = strike(
    term.lentByParty, term.totalLentLocal, term.clearedBps / 10000, REPO_TERM_WEEKS,
    (t) => needByTicker.get(t)?.termLocal ?? 0, totalTermNeedLocal
  );
  const unfundedTermLocal = Math.max(0, totalTermNeedLocal - termStruckLocal);
  const onStruckLocal = strike(
    overnight.lentByParty, overnight.totalLentLocal, overnight.clearedBps / 10000, 1,
    (t) => {
      const n = needByTicker.get(t);
      if (!n) return 0;
      // A bank whose term leg went unfunded carries that need overnight too.
      const shortTermLocal = totalTermNeedLocal > 0 ? unfundedTermLocal * (n.termLocal / totalTermNeedLocal) : 0;
      return n.onLocal + shortTermLocal;
    },
    onNeedLocal
  );

  // CASH: the lender's money reaches the borrower through the settlement layer, named on both
  // sides. It used to be four direct mutations that cancelled — and cancelling is not the same
  // as being recorded, which is the whole reason the ledger exists.
  const lentByEntity = new Map<string, number>();
  newContracts.forEach((c) => {
    if (!(c.principalLocal > 0)) return;
    if (c.lender.kind === 'INSTITUTION') {
      lentByEntity.set(c.lender.id, (lentByEntity.get(c.lender.id) ?? 0) + c.principalLocal);
    }
    pay(ctx, {
      payer: repoLenderParty(c.lender),
      payee: bankSecuritiesPartyOf(c.borrowerId),
      amount: c.principalLocal,
      currency: currencyOf(regionId),
      reason: 'repo drawdown',
    });
  });
  parkUnlentSleevesAtTheWindow(ctx, regionId, overnightSleeveByEntity, lentByEntity, rrpBps);

  return finish(
    [...carriedBook, ...newContracts],
    overnight.clearedBps / 10000,
    term.clearedBps / 10000,
    termStruckLocal + onStruckLocal
  );
}

/**
 * THE REVERSE REPO WINDOW IS A REAL POSITION, not a rate paid on a phantom balance.
 *
 * The unlent remainder of an institution's overnight sleeve is parked at the central bank at the
 * administered floor — the same posted rate that is its reservation in the auction above. The
 * money LEAVES its account: that is what makes the floor a floor, and it is the only reason a
 * posted rate belongs in a model where every price clears. Paid interest on a balance booked
 * nowhere, the same dollar earned the administered rate and stayed spendable in every other book
 * the same week.
 *
 * The cash returns with its interest at the start of the next session (`returnParkedCash`), so
 * the position is genuinely overnight and the rate it was struck at travels with it.
 */
function parkUnlentSleevesAtTheWindow(
  ctx: WeeklyStepContext,
  regionId: RegionId,
  sleeveByEntity: Map<string, number>,
  lentByEntity: Map<string, number>,
  rrpBps: number
): void {
  if (rrpBps <= 0 || sleeveByEntity.size === 0) return;
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.region !== regionId) return;
    const wantLocal = (sleeveByEntity.get(e.id) ?? 0) - (lentByEntity.get(e.id) ?? 0);
    if (wantLocal > 0) ctx.rrpIntendedByEntity.set(e.id, wantLocal);
  });
  ctx.rrpRateAnnualByRegion.set(regionId, rrpBps / 10000);
}

/**
 * The window takes what is left at the CLOSE. It is an end-of-day facility: the money is in the
 * institution's hands all week and goes to the central bank overnight, so taking it here rather
 * than in the money-market session is what keeps every book's budget the same as the cash it
 * actually had while it was trading.
 */
export function drawReverseRepoAtTheClose(ctx: WeeklyStepContext): void {
  const parkedByRegion = new Map<string, number>();
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    const wantLocal = ctx.rrpIntendedByEntity.get(e.id) ?? 0;
    const rateAnnual = ctx.rrpRateAnnualByRegion.get(e.region) ?? 0;
    if (!(wantLocal > 0) || !(rateAnnual > 0)) return e;
    // Only money it can actually spare: what its account holds NET of everything the week has
    // already committed it to pay. Parked against the raw balance, a fund that still owes the
    // close its trades ends the week overdrawn.
    const parkedLocal = Math.min(wantLocal, institutionSpendableLocal(ctx, e));
    if (!(parkedLocal > 0)) return e;
    parkedByRegion.set(e.region, (parkedByRegion.get(e.region) ?? 0) + parkedLocal);
    pay(ctx, {
      payer: { kind: 'INSTITUTION', id: e.id },
      payee: { kind: 'CENTRAL_BANK', region: e.region },
      amount: parkedLocal,
      currency: currencyOf(e.region),
      reason: 'reverse repo drawdown',
    });
    return { ...e, rrpLentLocal: parkedLocal, rrpRateAnnual: rateAnnual };
  });
  parkedByRegion.forEach((usd, regionId) => {
    const cb = ctx.updatedRegions[regionId as RegionId]?.centralBankSheet;
    if (cb) cb.reverseRepoBorrowedLocal = (cb.reverseRepoBorrowedLocal ?? 0) + usd;
  });
  ctx.rrpIntendedByEntity.clear();
}

/** Last week's parked cash, back with the interest it earned at the rate it was struck at. */
function returnParkedCash(ctx: WeeklyStepContext, regionId: RegionId): void {
  const cb = ctx.updatedRegions[regionId]?.centralBankSheet;
  if (cb) cb.lastReverseRepoInterestLocal = 0;
  let returnedLocal = 0;
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.region !== regionId || !(e.rrpLentLocal ?? 0)) return e;
    const principalLocal = e.rrpLentLocal!;
    const interestLocal = (principalLocal * (e.rrpRateAnnual ?? 0)) / 52;
    returnedLocal += principalLocal;
    if (cb && interestLocal > 0) cb.lastReverseRepoInterestLocal = (cb.lastReverseRepoInterestLocal ?? 0) + interestLocal;
    pay(ctx, {
      payer: { kind: 'CENTRAL_BANK', region: regionId },
      payee: { kind: 'INSTITUTION', id: e.id },
      amount: principalLocal + interestLocal,
      currency: currencyOf(regionId),
      reason: 'reverse repo returned with interest',
    });
    return { ...e, rrpLentLocal: 0, rrpRateAnnual: undefined };
  });
  if (cb) cb.reverseRepoBorrowedLocal = Math.max(0, (cb.reverseRepoBorrowedLocal ?? 0) - returnedLocal);
}

/**
 * A MARGIN CALL ON THE COLLATERAL. A pledge is a claim on specific paper, and the auctions
 * that price that paper run after the repo session: a bank whose pledge is rationed down can end
 * the week holding less of it than it pledged. The floor 07c and 07f post is what should stop
 * that, and it does when the book is deep enough to honour every mandated core — but the engine
 * rations cores pro rata when the float cannot cover them, and a rationed bank is one that had to
 * sell paper the repo book says cannot move.
 *
 * The honest answer is not to widen the floor: it is that the pledge FOLLOWS the paper. Collateral
 * that no longer exists is called, the contracts it secured shrink, and the borrower repays the
 * cash it raised against it — which is what a margin call is, and it is a real mechanism this
 * model could not previously have.
 */
export function reconcileRepoPledges(ctx: WeeklyStepContext): void {
  // §3.13-BOOK (c-then-3b): a repo borrower is named by its entity id.
  const repoIndex = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const book = reg?.repoBook;
    if (!reg || !book || book.length === 0) return;
    const borrowers = new Set(book.map((c) => c.borrowerId));
    borrowers.forEach((bankId) => {
      // §3.13-BOOK (c-then-3b): a repo borrower is named by its ENTITY id; a lookup, not a scan.
      const company = repoIndex.companyById.get(bankId);
      if (!company?.bankBalanceSheet) return;
      const ticker = company.ticker;
      const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? company.bankBalanceSheet;
      // step 3 — one definition of "over-pledged" (domain/collateral.ts). This used a
      // 1-dollar tolerance and the harness used 1e6, so a bank could be a million dollars
      // over-pledged, pass this reconcile, and fail the check in the same week — which is most of
      // why row survived two attempts at it.
      const pledged = encumberedFaceByBond(book, bankId);
      const shortfallByBond = overPledgedByBond({
        pledgedByBond: pledged,
        heldByBond: bankSovereignFaceByBond(ctx.v2, bankId),
      });
      if (shortfallByBond.size === 0) return;

      let repaidLocal = 0;
      book.forEach((c) => {
        if (c.borrowerId !== bankId || c.principalLocal <= 0) return;
        let releasedFaceLocal = 0;
        let pledgedFaceLocal = 0;
        c.collateral = c.collateral.map((p) => {
          pledgedFaceLocal += p.faceLocal;
          const shortfall = shortfallByBond.get(p.bondId) ?? 0;
          if (shortfall <= 0) return p;
          const totalPledged = pledged.get(p.bondId) ?? 1;
          const takeLocal = Math.min(p.faceLocal, shortfall * (p.faceLocal / totalPledged));
          releasedFaceLocal += takeLocal;
          return { ...p, faceLocal: p.faceLocal - takeLocal };
        }).filter((p) => p.faceLocal > 1);
        if (releasedFaceLocal <= 0 || pledgedFaceLocal <= 0) return;
        // The loan shrinks by the share of its collateral that is gone.
        const callLocal = Math.min(c.principalLocal, c.principalLocal * (releasedFaceLocal / pledgedFaceLocal));
        c.principalLocal -= callLocal;
        repaidLocal += callLocal;
        const payee: PartyRef = repoLenderParty(c.lender);
        pay(ctx, {
          payer: bankSecuritiesPartyOf(bankId),
          payee,
          amount: callLocal,
          currency: currencyOf(regionId),
          reason: 'repo collateral call',
        });
      });
      if (repaidLocal <= 0) return;
      updateBankSheet(ctx, ticker, {
        ...sheet,
        repoBorrowedLocal: Math.round((repoBorrowedLocal(book, bankId) - srfBorrowedLocal(book, bankId))),
        srfBorrowingLocal: Math.round(srfBorrowedLocal(book, bankId)),
        repoEncumberedCollateralLocal: Number(
          Array.from(encumberedFaceByBond(book, bankId).values()).reduce((a, b) => a + b, 0).toFixed(0)
        ),
      });
    });
    reg.repoBook = book.filter((c) => c.principalLocal > 1);
    if (reg.centralBankSheet) reg.centralBankSheet.standingFacilityLentLocal = Math.round(repoLentLocal(reg.repoBook, { kind: 'CENTRAL_BANK', region: regionId }));
  });
}
