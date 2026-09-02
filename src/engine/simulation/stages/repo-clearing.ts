/**
 * WS6 — the overnight general-collateral repo market (one per region, weekly session).
 *
 * What it is. A bank whose week closes short of its own operating cash buffer sells government
 * paper overnight under an agreement to repurchase — cash against collateral, re-struck every
 * week. The cash comes from whoever closed the prior week with idle balances: another bank's
 * surplus, an institution's uninvested cash, and — only when the private book cannot fund the
 * need — the central bank's standing facility, which is a posted-rate seat IN this auction
 * rather than a fallback around it.
 *
 * Why the corridor holds without a clamp (§5-WS6's design, now mechanical fact): every
 * participant's reservation is its own administered outside option. A bank lender will not
 * accept less than the policy rate its reserves already earn (floor-system IOR); a non-bank
 * lender will not accept less than the ON RRP rate its idle cash can always earn; and no
 * borrower pays more than policyRate + SRF_SPREAD_BPS because the standing facility sits in
 * the book with unlimited size at exactly that level. The cleared print can therefore only
 * live inside [policy − ON_RRP_SPREAD, policy + SRF_SPREAD] — asserted weekly by the
 * invariants harness, produced by nothing but the participants' schedules.
 *
 * Every quantity here is derived, not posted (§7.24's discipline — the administered rates are
 * rule 1's single sanctioned exception):
 *  - the HAIRCUT per collateral bucket is the lender's real protection: the repricing the
 *    bucket's own cleared yield could plausibly suffer before the collateral could be sold —
 *    duration × two standard deviations of its own observed weekly yield changes
 *    (historicalZeroCurves). It tightens borrowing capacity exactly when the curve turns
 *    volatile, which a posted percentage cannot do.
 *  - a BORROWER's size is its real shortfall to its own buffer, capped by unencumbered
 *    collateral × (1 − haircut).
 *  - a LENDER's size is the cash its own week genuinely closed with: a bank's cash above its
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

import { RegionId, Region, InstitutionalEntity } from '../../../types';
import { overPledgedByBucket } from '../../../domain/collateral';
import { BankingSector } from '../../../domain/banking';
import {
  RepoContract, RepoPledge, RepoParty, repoPartyKey, repoInterestToMaturityUSD,
  repoBorrowedUSD, repoLentUSD, srfBorrowedUSD, encumberedFaceByBucket,
} from '../../../domain/repo';
import { WeeklyStepContext, updateBankSheet } from './context';
import { pay, PartyRef, pendingSettlementUSD, institutionSpendableUSD } from './settlement';
import {
  clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand,
  YIELD_LIKE_MIN_WEEKLY_MOVE_BPS,
} from './financial-clearing-engine';
import { SRF_SPREAD_BPS, ON_RRP_SPREAD_BPS, MIN_CASH_BUFFER_RATIO } from '../../macro/banking';

/** The codebase's duration convention for the sovereign buckets (07c uses bucket years as the
 * instrument's durationYears; kept identical here so the two never disagree). */
const BUCKET_DURATION_YEARS: Record<string, number> = {
  b13: 0.25, b26: 0.5, b52: 1, t2: 2, t5: 5, t10: 10, t30: 30,
};
const BUCKET_TENOR_FIELD: Record<string, 'tenor3M' | 'tenor2Y' | 'tenor5Y' | 'tenor10Y' | 'tenor30Y'> = {
  b13: 'tenor3M', b26: 'tenor3M', b52: 'tenor2Y', t2: 'tenor2Y', t5: 'tenor5Y', t10: 'tenor10Y', t30: 'tenor30Y',
};

/**
 * Derived per-bucket GC haircuts: duration × the bucket's own observed weekly yield
 * repricing risk (2σ of weekly changes in ITS tenor's cleared yield). With too little history
 * to estimate a standard deviation (a genuinely mathematical bound — σ needs at least two
 * observations), the engine's own minimum weekly repricing allowance stands in: the smallest
 * move the clearing damper will always permit is the smallest move a lender must assume.
 */
export function computeSovereignRepoHaircuts(reg: Region): Record<string, number> {
  const hist = reg.historicalZeroCurves || [];
  const haircuts: Record<string, number> = {};
  Object.entries(BUCKET_DURATION_YEARS).forEach(([key, durationYears]) => {
    const field = BUCKET_TENOR_FIELD[key];
    const series = hist.map((h) => h[field]).filter((v) => Number.isFinite(v));
    const diffsBps: number[] = [];
    for (let i = 1; i < series.length; i++) diffsBps.push((series[i] - series[i - 1]) * 10000);
    let repricingBps = YIELD_LIKE_MIN_WEEKLY_MOVE_BPS;
    if (diffsBps.length >= 2) {
      const mean = diffsBps.reduce((a, b) => a + b, 0) / diffsBps.length;
      const variance = diffsBps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (diffsBps.length - 1);
      repricingBps = Math.max(YIELD_LIKE_MIN_WEEKLY_MOVE_BPS, 2 * Math.sqrt(variance));
    }
    haircuts[key] = Math.min(1, durationYears * (repricingBps / 10000));
  });
  return haircuts;
}

/** A bank's total repo-able collateral value net of haircuts, and its face total. */
export function collateralCapacityUSD(
  sheet: BankingSector,
  haircuts: Record<string, number>
): { faceUSD: number; capacityUSD: number } {
  let faceUSD = 0; let capacityUSD = 0;
  Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
    const usd = Number(v) || 0;
    if (usd <= 0) return;
    faceUSD += usd;
    capacityUSD += usd * (1 - (haircuts[key] ?? haircuts.t5 ?? 0.05));
  });
  return { faceUSD, capacityUSD };
}

/**
 * REPO2 — what this bank could still raise, bucket by bucket, against paper it has not already
 * pledged. Encumbrance is now a property of the specific paper (domain/repo.ts), so pledging
 * thirty-year bonds no longer withholds the two-year book from the auction that prices it, and
 * the cash a pledge raises is that bucket's own haircut rather than a blended average.
 */
export function unencumberedByBucket(
  sheet: BankingSector,
  encumberedFace: Map<string, number>
): Map<string, number> {
  const free = new Map<string, number>();
  Object.entries(sheet.sovereignBondHoldingsByTenor || {}).forEach(([key, v]) => {
    const freeUSD = Math.max(0, (Number(v) || 0) - (encumberedFace.get(key) ?? 0));
    if (freeUSD > 0) free.set(key, freeUSD);
  });
  return free;
}

/**
 * The funding a bank can still raise against paper it has not already pledged — the real bound
 * on both its repo borrowing here and its bond-buying budget in 07c/07f. Already-pledged
 * collateral (repo + SRF) is excluded; the fraction is by value, applied at the pool's blended
 * haircut.
 */
export function unencumberedBorrowingCapacityUSD(
  sheet: BankingSector,
  haircuts: Record<string, number>,
  /** REPO2: what this bank has already pledged, by bucket. Omitted falls back to the sheet's
   *  derived scalar, for the callers that have no book to hand. */
  encumberedFace?: Map<string, number>
): number {
  if (encumberedFace) {
    let capacityUSD = 0;
    unencumberedByBucket(sheet, encumberedFace).forEach((freeUSD, key) => {
      capacityUSD += freeUSD * (1 - (haircuts[key] ?? haircuts.t5 ?? 0.05));
    });
    return Math.max(0, capacityUSD);
  }
  const { faceUSD, capacityUSD } = collateralCapacityUSD(sheet, haircuts);
  if (faceUSD <= 0) return 0;
  const encumberedFaceUSD = Math.min(faceUSD, sheet.repoEncumberedCollateralUSD ?? 0);
  const unencumberedShare = (faceUSD - encumberedFaceUSD) / faceUSD;
  return Math.max(0, capacityUSD * unencumberedShare);
}

/**
 * REPO2 — which paper a borrower actually pledges, and how much of it.
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
  free: Map<string, number>,
  haircuts: Record<string, number>,
  targetCashUSD: number
): { pledges: RepoPledge[]; raisedUSD: number } {
  const buckets = Array.from(free.entries())
    .sort((a, b) => (BUCKET_DURATION_YEARS[b[0]] ?? 0) - (BUCKET_DURATION_YEARS[a[0]] ?? 0));
  const pledges: RepoPledge[] = [];
  let raisedUSD = 0;
  for (const [bucketKey, freeFaceUSD] of buckets) {
    if (raisedUSD >= targetCashUSD - 1) break;
    const perDollar = 1 - (haircuts[bucketKey] ?? haircuts.t5 ?? 0.05);
    if (perDollar <= 0) continue;
    const wantedFaceUSD = (targetCashUSD - raisedUSD) / perDollar;
    const faceUSD = Math.min(freeFaceUSD, wantedFaceUSD);
    if (faceUSD <= 0) continue;
    pledges.push({ bucketKey, faceUSD });
    raisedUSD += faceUSD * perDollar;
  }
  return { pledges, raisedUSD };
}

/** The overnight half of an institution's cash sleeve — the split WS5's bill program already
 * uses (07f's CASH_SLEEVE_BILL_SHARE takes the term half). G6 derives this from real
 * liability liquidity needs and retires the shared constant. */
export const CASH_SLEEVE_OVERNIGHT_SHARE = 0.5;

/** Who a contract's lender is, as a settlement party: a bank's reserves, an institution's
 *  balance, or the central bank's window. */
const repoLenderParty = (lender: RepoParty, regionId: RegionId): PartyRef =>
  lender.kind === 'BANK' ? { kind: 'BANK_SECURITIES', ticker: lender.ticker }
    : lender.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: lender.id }
      : { kind: 'CENTRAL_BANK', region: regionId };

const repoInstrumentId = (regionId: RegionId) => `${regionId}-REPO-ON`;
const repoTermInstrumentId = (regionId: RegionId) => `${regionId}-REPO-TERM`;
const CB_SRF_SEAT_ID = 'CB-SRF';
/** REPO3: the term book's maturity — one quarter, the tenor the curve's own front point prices,
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
   *  week; positive with `clearedVolumeUSD` at zero means a market with a real borrower and real
   *  lenders transacted nothing, which is a defect (§7.102: the corridor assertion passed
   *  VACUOUSLY for eight commits because the early return prints the floor as a literal). */
  fundableNeedUSD: number;
  /** What the session actually lent — market repo plus the window. */
  clearedVolumeUSD: number;
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
  banks: { ticker: string }[],
  sheetByTicker: Map<string, BankingSector>,
  ctx: WeeklyStepContext
): RepoSessionResult {
  const week = ctx.nextWeek;
  const priorRepoRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
  const policyBps = reg.policyRate * 10000;
  const rrpBps = Math.max(0, policyBps - ON_RRP_SPREAD_BPS);
  const srfBps = policyBps + SRF_SPREAD_BPS;
  const corridorWidthBps = Math.max(1, srfBps - rrpBps);
  const onInstrumentId = repoInstrumentId(regionId);
  const termInstrumentId = repoTermInstrumentId(regionId);
  const haircuts = computeSovereignRepoHaircuts(reg);

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
    const dueUSD = c.principalUSD + repoInterestToMaturityUSD(c);
    if (!(dueUSD > 0)) return;
    pay(ctx, {
      payer: { kind: 'BANK_SECURITIES', ticker: c.borrowerTicker },
      payee: repoLenderParty(c.lender, regionId),
      amountUSD: dueUSD,
      reason: 'repo maturity',
    });
  });

  // What each bank still has pledged against contracts that did NOT mature.
  const encumberedByTicker = new Map<string, Map<string, number>>();
  banks.forEach((b) => encumberedByTicker.set(b.ticker, encumberedFaceByBucket(carriedBook, b.ticker)));

  // ---- Borrowers: real shortfall to the buffer, bounded by unencumbered collateral. ----
  // REPO3: the need splits by how long it has already lasted. Money a bank has needed every
  // week — the part of this week's need that is simply ROLLING a contract that just matured —
  // is structural funding and belongs at term; the increment on top of it is this week's cash
  // dip and belongs overnight. A treasury that funds a permanent book overnight is running the
  // maturity mismatch a funding squeeze is made of, and this is what lets it.
  const rolledByTicker = new Map<string, number>();
  maturedNow.forEach((c) => rolledByTicker.set(c.borrowerTicker, (rolledByTicker.get(c.borrowerTicker) ?? 0) + c.principalUSD));

  const needByTicker = new Map<string, { onUSD: number; termUSD: number }>();
  let totalOnNeedUSD = 0;
  let totalTermNeedUSD = 0;
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    // CASH: reserves plus what this week's already-posted legs will settle — the maturity it has
    // just been billed for is real money leaving, and a bank that cannot see it cannot know it is
    // short. The same read 07c makes before it bids.
    const settledCashUSD = sheet.cashReservesUSD
      + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker });
    const shortfallUSD = sheet.depositsUSD * MIN_CASH_BUFFER_RATIO - settledCashUSD;
    if (shortfallUSD <= 0) return;
    const capacityUSD = unencumberedBorrowingCapacityUSD(sheet, haircuts, encumberedByTicker.get(bank.ticker));
    const needUSD = Math.min(shortfallUSD, capacityUSD);
    if (needUSD <= 0) return;
    const termUSD = Math.min(needUSD, rolledByTicker.get(bank.ticker) ?? 0);
    const onUSD = needUSD - termUSD;
    needByTicker.set(bank.ticker, { onUSD, termUSD });
    totalOnNeedUSD += onUSD;
    totalTermNeedUSD += termUSD;
  });
  const totalNeedUSD = totalOnNeedUSD + totalTermNeedUSD;

  // ---- Lenders (whether or not there is need this week, their idle overnight cash earns the
  // administered floor: an institution's unlent overnight sleeve is implicitly parked at the
  // RRP window, the same real posted-rate facility that anchors its reservation below). ----
  const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId && !e.isDefaulted);
  const overnightSleeveByEntity = new Map<string, number>();
  regionEntities.forEach((e) => {
    // Its balance plus what its own matured contracts are about to pay it back.
    const availableUSD = institutionSpendableUSD(ctx, e);
    const sleeveUSD = availableUSD * CASH_SLEEVE_OVERNIGHT_SHARE;
    if (sleeveUSD > 0) overnightSleeveByEntity.set(e.id, sleeveUSD);
  });

  const finish = (book: RepoContract[], onRateAnnual: number, termRateAnnual: number | undefined,
                  clearedVolumeUSD: number): RepoSessionResult => {
    reg.repoBook = book;
    reg.repoTermRateAnnual = termRateAnnual === undefined ? undefined : Number(termRateAnnual.toFixed(6));
    // REPO1: every scalar the sheets carried is now DERIVED from the book — the G2 pattern.
    banks.forEach((bank) => {
      const sheet = sheetByTicker.get(bank.ticker);
      if (!sheet) return;
      sheetByTicker.set(bank.ticker, {
        ...sheet,
        repoBorrowedUSD: Math.round((repoBorrowedUSD(book, bank.ticker) - srfBorrowedUSD(book, bank.ticker))),
        srfBorrowingUSD: Math.round(srfBorrowedUSD(book, bank.ticker)),
        repoLentUSD: Math.round(repoLentUSD(book, { kind: 'BANK', ticker: bank.ticker })),
        repoEncumberedCollateralUSD: Number(
          Array.from(encumberedFaceByBucket(book, bank.ticker).values()).reduce((a, b) => a + b, 0).toFixed(0)
        ),
      });
    });
    const lentByEntityId = new Map<string, number>();
    book.forEach((c) => {
      if (c.lender.kind !== 'INSTITUTION') return;
      lentByEntityId.set(c.lender.id, (lentByEntityId.get(c.lender.id) ?? 0) + c.principalUSD);
    });
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) =>
      e.region === regionId ? { ...e, repoLentUSD: Math.round((lentByEntityId.get(e.id) ?? 0)) } : e
    );
    return { repoRateAnnual: onRateAnnual, sheetByTicker, fundableNeedUSD: totalNeedUSD, clearedVolumeUSD };
  };

  if (!(totalNeedUSD > 0)) {
    // No borrower: nothing clears, the overnight complex sits at its floor, and the sleeves
    // earn the RRP rate there.
    creditRrpOnUnlentSleeves(ctx, regionId, overnightSleeveByEntity, new Map(), rrpBps);
    return finish(carriedBook, rrpBps / 10000, undefined, 0);
  }

  const lenderSchedule = (reservationBps: number, maxHoldingUSD: number): ParticipantDemand => ({
    reservationStat: reservationBps,
    maxHoldingUSD,
    // A lender is fully committed by the top of the corridor: past the SRF rate its
    // counterparty funds at the window instead, so there is nothing above it to be paid for.
    fullSizeStatRange: corridorWidthBps,
  });

  /** Available lender cash this session, decremented as each book takes it. */
  const bankSurplusUSD = new Map<string, number>();
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    const surplusUSD = sheet.cashReservesUSD
      + pendingSettlementUSD(ctx, { kind: 'BANK_SECURITIES', ticker: bank.ticker })
      - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO;
    if (surplusUSD > 0) bankSurplusUSD.set(bank.ticker, surplusUSD);
  });
  const entitySleeveUSD = new Map(overnightSleeveByEntity);

  /**
   * One book's session. `reservationOf` is each lender's own outside option over THIS book's
   * term — the whole reason the corridor holds without a clamp, now asked at two maturities.
   */
  const runBook = (args: {
    instrumentId: string;
    needUSD: number;
    currentBps: number;
    bankReservationBps: number;
    instReservationBps: number;
    withWindow: boolean;
  }) => {
    const instrument: ClearingInstrument = {
      id: args.instrumentId,
      outstandingUSD: args.needUSD,
      tradableFloatUSD: args.needUSD,
      currentStat: args.currentBps,
      statKind: 'YIELD_LIKE',
      durationYears: 1 / 52,
    };
    const participants: ClearingParticipant[] = [];
    bankSurplusUSD.forEach((surplusUSD, ticker) => {
      if (surplusUSD <= 0) return;
      participants.push({
        id: `BANK-${ticker}`,
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[args.instrumentId, lenderSchedule(args.bankReservationBps, surplusUSD)]]),
      });
    });
    entitySleeveUSD.forEach((sleeveUSD, entityId) => {
      if (sleeveUSD <= 0) return;
      participants.push({
        id: `INST-${entityId}`,
        currentHoldingsByInstrumentId: new Map(),
        demandByInstrumentId: new Map([[args.instrumentId, lenderSchedule(args.instReservationBps, sleeveUSD)]]),
      });
    });
    if (args.withWindow) {
      // The standing repo facility: a posted rate with unlimited quantity response — a real seat
      // in the book (rule 1's administered exception), which is what makes the ceiling a market
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
          maxHoldingUSD: args.needUSD,
          fullSizeStatRange: SRF_SEAT_STEP_BPS,
        }]]),
      });
    }
    if (participants.length === 0) return { clearedBps: args.currentBps, lentByParty: new Map<string, number>(), totalLentUSD: 0 };

    const result = clearFinancialAsset([instrument], participants, new Map(), {
      // Bilateral GC at one rate — no desk in the middle taking a spread out of it.
      dealerSpreadBps: 0,
      // Overnight money reprices to the corridor the week policy moves; the corridor — the
      // participants' own posted outside options — is the real bound. The damper is set so wide
      // it cannot be the thing that prints (the harness asserts the corridor every week, so a
      // damper-bound print would be caught as a violation, per §6's damper-diagnostic doctrine).
      maxWeeklyStatMovePct: 1000,
    });
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds.map((id) => `repo:${id}`));
    const clearedBps = result.newStatById.get(args.instrumentId) ?? args.currentBps;
    const lentByParty = new Map<string, number>();
    let totalLentUSD = 0;
    result.newParticipantHoldings.forEach((byInstrument, pid) => {
      const lentUSD = byInstrument.get(args.instrumentId) ?? 0;
      if (lentUSD <= 0) return;
      lentByParty.set(pid, lentUSD);
      totalLentUSD += lentUSD;
      // The cash is committed: it cannot fund the other book too.
      if (pid.startsWith('BANK-')) {
        const t = pid.replace('BANK-', '');
        bankSurplusUSD.set(t, Math.max(0, (bankSurplusUSD.get(t) ?? 0) - lentUSD));
      } else if (pid.startsWith('INST-')) {
        const id = pid.replace('INST-', '');
        entitySleeveUSD.set(id, Math.max(0, (entitySleeveUSD.get(id) ?? 0) - lentUSD));
      }
    });
    return { clearedBps, lentByParty, totalLentUSD };
  };

  // ---- REPO3: term first. A lender's outside option over a quarter is the three-month zero
  // its own money could earn instead, which is exactly what the curve prints; the window does
  // NOT sit in this book, because the standing facility is overnight — so a term need the
  // private market will not fund simply is not funded, and falls back to overnight below. That
  // is a funding squeeze, and it could not previously happen.
  const termBps = Math.max(0, (reg.zeroRates?.tenor3M ?? reg.policyRate) * 10000);
  const term = totalTermNeedUSD > 0
    ? runBook({
        instrumentId: termInstrumentId,
        needUSD: totalTermNeedUSD,
        currentBps: (reg.repoTermRateAnnual ?? reg.policyRate) * 10000,
        bankReservationBps: termBps,
        instReservationBps: Math.max(0, termBps - ON_RRP_SPREAD_BPS),
        withWindow: false,
      })
    : { clearedBps: termBps, lentByParty: new Map<string, number>(), totalLentUSD: 0 };

  // Whatever term did not fund still has to be funded today.
  const onNeedUSD = totalOnNeedUSD + Math.max(0, totalTermNeedUSD - term.totalLentUSD);
  const overnight = onNeedUSD > 0
    ? runBook({
        instrumentId: onInstrumentId,
        needUSD: onNeedUSD,
        currentBps: priorRepoRateAnnual * 10000,
        bankReservationBps: policyBps,
        instReservationBps: rrpBps,
        withWindow: true,
      })
    : { clearedBps: rrpBps, lentByParty: new Map<string, number>(), totalLentUSD: 0 };

  // ---- Settle. Every dollar becomes a CONTRACT with both parties named: at one cleared rate a
  // lender's cash is fungible, so each borrower draws from each lender in proportion to what
  // that lender put into the book — which is what "general collateral" means. ----
  const newContracts: RepoContract[] = [];
  const encumberedWorking = new Map<string, Map<string, number>>();
  banks.forEach((b) => encumberedWorking.set(b.ticker, new Map(encumberedByTicker.get(b.ticker) ?? new Map())));
  let contractSeq = 0;

  const strike = (
    lentByParty: Map<string, number>,
    totalLentUSD: number,
    rateAnnual: number,
    termWeeks: number,
    needOf: (t: string) => number,
    totalNeedForBookUSD: number
  ) => {
    if (totalLentUSD <= 0 || totalNeedForBookUSD <= 0) return 0;
    const fundedShare = Math.min(1, totalLentUSD / totalNeedForBookUSD);
    let struckUSD = 0;
    needByTicker.forEach((_need, ticker) => {
      const wantUSD = needOf(ticker) * fundedShare;
      if (wantUSD <= 0) return;
      const sheet = sheetByTicker.get(ticker)!;
      const worked = encumberedWorking.get(ticker)!;
      lentByParty.forEach((lentUSD, pid) => {
        const shareUSD = wantUSD * (lentUSD / totalLentUSD);
        if (shareUSD <= 1) return;
        const free = unencumberedByBucket(sheet, worked);
        const { pledges, raisedUSD } = selectCollateral(free, haircuts, shareUSD);
        if (raisedUSD <= 1) return;
        const principalUSD = Math.min(shareUSD, raisedUSD);
        pledges.forEach((pl) => worked.set(pl.bucketKey, (worked.get(pl.bucketKey) ?? 0) + pl.faceUSD));
        const lender: RepoParty = pid === CB_SRF_SEAT_ID
          ? { kind: 'CENTRAL_BANK' }
          : pid.startsWith('BANK-')
            ? { kind: 'BANK', ticker: pid.replace('BANK-', '') }
            : { kind: 'INSTITUTION', id: pid.replace('INST-', '') };
        newContracts.push({
          id: `${regionId}-REPO-${week}-${contractSeq++}`,
          regionId,
          lender,
          borrowerTicker: ticker,
          principalUSD: Math.round(principalUSD),
          rateAnnual,
          struckWeek: week,
          maturityWeek: week + termWeeks,
          collateral: pledges.map((pl) => ({ bucketKey: pl.bucketKey, faceUSD: Math.round(pl.faceUSD) })),
        });
        struckUSD += principalUSD;
      });
    });
    return struckUSD;
  };

  const termStruckUSD = strike(
    term.lentByParty, term.totalLentUSD, term.clearedBps / 10000, REPO_TERM_WEEKS,
    (t) => needByTicker.get(t)?.termUSD ?? 0, totalTermNeedUSD
  );
  const unfundedTermUSD = Math.max(0, totalTermNeedUSD - termStruckUSD);
  const onStruckUSD = strike(
    overnight.lentByParty, overnight.totalLentUSD, overnight.clearedBps / 10000, 1,
    (t) => {
      const n = needByTicker.get(t);
      if (!n) return 0;
      // A bank whose term leg went unfunded carries that need overnight too.
      const shortTermUSD = totalTermNeedUSD > 0 ? unfundedTermUSD * (n.termUSD / totalTermNeedUSD) : 0;
      return n.onUSD + shortTermUSD;
    },
    onNeedUSD
  );

  // CASH: the lender's money reaches the borrower through the settlement layer, named on both
  // sides. It used to be four direct mutations that cancelled — and cancelling is not the same
  // as being recorded, which is the whole reason the ledger exists.
  const lentByEntity = new Map<string, number>();
  newContracts.forEach((c) => {
    if (!(c.principalUSD > 0)) return;
    if (c.lender.kind === 'INSTITUTION') {
      lentByEntity.set(c.lender.id, (lentByEntity.get(c.lender.id) ?? 0) + c.principalUSD);
    }
    pay(ctx, {
      payer: repoLenderParty(c.lender, regionId),
      payee: { kind: 'BANK_SECURITIES', ticker: c.borrowerTicker },
      amountUSD: c.principalUSD,
      reason: 'repo drawdown',
    });
  });
  creditRrpOnUnlentSleeves(ctx, regionId, overnightSleeveByEntity, lentByEntity, rrpBps);

  return finish(
    [...carriedBook, ...newContracts],
    overnight.clearedBps / 10000,
    term.clearedBps / 10000,
    termStruckUSD + onStruckUSD
  );
}

/**
 * The unlent remainder of each institution's overnight sleeve earns the RRP rate — the posted
 * facility that is also its reservation in the auction above. The income is real interest from
 * the central-bank boundary, the exact non-bank mirror of the IOR banks earn on reserves; G9
 * gives both a real paying balance sheet.
 */
function creditRrpOnUnlentSleeves(
  ctx: WeeklyStepContext,
  regionId: RegionId,
  sleeveByEntity: Map<string, number>,
  lentByEntity: Map<string, number>,
  rrpBps: number
): void {
  if (rrpBps <= 0 || sleeveByEntity.size === 0) return;
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.region !== regionId) return;
    const parkedUSD = (sleeveByEntity.get(e.id) ?? 0) - (lentByEntity.get(e.id) ?? 0);
    if (parkedUSD <= 0) return;
    const interestUSD = (parkedUSD * (rrpBps / 10000)) / 52;
    if (!(interestUSD > 0)) return;
    // The window pays it, and now says so: the non-bank mirror of the IOR banks earn.
    pay(ctx, {
      payer: { kind: 'CENTRAL_BANK', region: regionId },
      payee: { kind: 'INSTITUTION', id: e.id },
      amountUSD: interestUSD,
      reason: 'reverse repo interest',
    });
  });
}

/**
 * REPO2 — A MARGIN CALL ON THE COLLATERAL. A pledge is a claim on specific paper, and the auctions
 * that price that paper run after the repo session: a bank whose bucket is rationed down can end
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
  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const book = reg?.repoBook;
    if (!reg || !book || book.length === 0) return;
    const borrowers = new Set(book.map((c) => c.borrowerTicker));
    borrowers.forEach((ticker) => {
      const company = ctx.updatedCompanies.find((c) => c.ticker === ticker && c.bankBalanceSheet);
      if (!company) return;
      const sheet = ctx.companyUpdates[ticker]?.bankBalanceSheet ?? company.bankBalanceSheet!;
      // §5-STRUCT step 3 — one definition of "over-pledged" (domain/collateral.ts). This used a
      // 1-dollar tolerance and the harness used 1e6, so a bank could be a million dollars
      // over-pledged, pass this reconcile, and fail the check in the same week — which is most of
      // why §6.1's row survived two attempts at it (§7.226).
      const pledged = encumberedFaceByBucket(book, ticker);
      const shortfallByBucket = overPledgedByBucket({
        pledgedByBucket: pledged,
        heldByBucket: new Map(Object.entries(sheet.sovereignBondHoldingsByTenor ?? {})
          .map(([k, v]) => [k, Number(v) || 0])),
      });
      if (shortfallByBucket.size === 0) return;

      let repaidUSD = 0;
      book.forEach((c) => {
        if (c.borrowerTicker !== ticker || c.principalUSD <= 0) return;
        let releasedFaceUSD = 0;
        let pledgedFaceUSD = 0;
        c.collateral = c.collateral.map((p) => {
          pledgedFaceUSD += p.faceUSD;
          const shortfall = shortfallByBucket.get(p.bucketKey) ?? 0;
          if (shortfall <= 0) return p;
          const totalPledged = pledged.get(p.bucketKey) ?? 1;
          const takeUSD = Math.min(p.faceUSD, shortfall * (p.faceUSD / totalPledged));
          releasedFaceUSD += takeUSD;
          return { ...p, faceUSD: p.faceUSD - takeUSD };
        }).filter((p) => p.faceUSD > 1);
        if (releasedFaceUSD <= 0 || pledgedFaceUSD <= 0) return;
        // The loan shrinks by the share of its collateral that is gone.
        const callUSD = Math.min(c.principalUSD, c.principalUSD * (releasedFaceUSD / pledgedFaceUSD));
        c.principalUSD -= callUSD;
        repaidUSD += callUSD;
        const payee: PartyRef = c.lender.kind === 'BANK' ? { kind: 'BANK_SECURITIES', ticker: c.lender.ticker }
          : c.lender.kind === 'INSTITUTION' ? { kind: 'INSTITUTION', id: c.lender.id }
            : { kind: 'CENTRAL_BANK', region: regionId };
        pay(ctx, {
          payer: { kind: 'BANK_SECURITIES', ticker },
          payee,
          amountUSD: callUSD,
          reason: 'repo collateral call',
        });
      });
      if (repaidUSD <= 0) return;
      updateBankSheet(ctx, ticker, {
        ...sheet,
        repoBorrowedUSD: Math.round((repoBorrowedUSD(book, ticker) - srfBorrowedUSD(book, ticker))),
        srfBorrowingUSD: Math.round(srfBorrowedUSD(book, ticker)),
        repoEncumberedCollateralUSD: Number(
          Array.from(encumberedFaceByBucket(book, ticker).values()).reduce((a, b) => a + b, 0).toFixed(0)
        ),
      });
    });
    reg.repoBook = book.filter((c) => c.principalUSD > 1);
  });
}
