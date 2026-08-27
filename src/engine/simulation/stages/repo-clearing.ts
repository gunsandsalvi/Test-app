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
import { BankingSector } from '../../../domain/banking';
import { WeeklyStepContext } from './context';
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
 * The funding a bank can still raise against paper it has not already pledged — the real bound
 * on both its repo borrowing here and its bond-buying budget in 07c/07f. Already-pledged
 * collateral (repo + SRF) is excluded; the fraction is by value, applied at the pool's blended
 * haircut.
 */
export function unencumberedBorrowingCapacityUSD(
  sheet: BankingSector,
  haircuts: Record<string, number>
): number {
  const { faceUSD, capacityUSD } = collateralCapacityUSD(sheet, haircuts);
  if (faceUSD <= 0) return 0;
  const encumberedFaceUSD = Math.min(faceUSD, sheet.repoEncumberedCollateralUSD ?? 0);
  const unencumberedShare = (faceUSD - encumberedFaceUSD) / faceUSD;
  return Math.max(0, capacityUSD * unencumberedShare);
}

/** The overnight half of an institution's cash sleeve — the split WS5's bill program already
 * uses (07f's CASH_SLEEVE_BILL_SHARE takes the term half). G6 derives this from real
 * liability liquidity needs and retires the shared constant. */
export const CASH_SLEEVE_OVERNIGHT_SHARE = 0.5;

const repoInstrumentId = (regionId: RegionId) => `${regionId}-REPO-ON`;
const CB_SRF_SEAT_ID = 'CB-SRF';

export interface RepoSessionResult {
  repoRateAnnual: number;
  sheetByTicker: Map<string, BankingSector>;
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
  const priorRepoRateAnnual = reg.repoRateAnnual ?? reg.policyRate;
  const policyBps = reg.policyRate * 10000;
  const rrpBps = Math.max(0, policyBps - ON_RRP_SPREAD_BPS);
  const srfBps = policyBps + SRF_SPREAD_BPS;
  const corridorWidthBps = Math.max(1, srfBps - rrpBps);
  const instrumentId = repoInstrumentId(regionId);
  const haircuts = computeSovereignRepoHaircuts(reg);

  // ---- Mature last week's institutional positions: principal plus interest at the rate the
  // position was struck at. (Bank maturations already flowed in evolveBankingSector step 1;
  // the paying side of THIS interest flowed there too, so the money arrives here having
  // genuinely left the borrowers.) ----
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.region !== regionId) return e;
    const lentUSD = e.repoLentUSD ?? 0;
    if (lentUSD <= 0) return e;
    return {
      ...e,
      cashUSD: (e.cashUSD ?? 0) + lentUSD + (lentUSD * priorRepoRateAnnual) / 52,
      repoLentUSD: 0,
    };
  });

  // ---- Borrowers: real shortfall to the buffer, bounded by unencumbered collateral. ----
  const borrowNeedByTicker = new Map<string, number>();
  let totalNeedUSD = 0;
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    const shortfallUSD = sheet.depositsUSD * MIN_CASH_BUFFER_RATIO - sheet.cashReservesUSD;
    if (shortfallUSD <= 0) return;
    const needUSD = Math.min(shortfallUSD, unencumberedBorrowingCapacityUSD(sheet, haircuts));
    if (needUSD <= 0) return;
    borrowNeedByTicker.set(bank.ticker, needUSD);
    totalNeedUSD += needUSD;
  });

  // ---- Lenders (whether or not there is need this week, their idle overnight cash earns the
  // administered floor: an institution's unlent overnight sleeve is implicitly parked at the
  // RRP window, the same real posted-rate facility that anchors its reservation below). ----
  const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId && !e.isDefaulted);
  const overnightSleeveByEntity = new Map<string, number>();
  regionEntities.forEach((e) => {
    const sleeveUSD = Math.max(0, e.cashUSD ?? 0) * CASH_SLEEVE_OVERNIGHT_SHARE;
    if (sleeveUSD > 0) overnightSleeveByEntity.set(e.id, sleeveUSD);
  });

  if (!(totalNeedUSD > 0)) {
    // No borrower: nothing clears, the overnight complex sits at its floor, and the sleeves
    // earn the RRP rate there.
    creditRrpOnUnlentSleeves(ctx, regionId, overnightSleeveByEntity, new Map(), rrpBps);
    return { repoRateAnnual: rrpBps / 10000, sheetByTicker };
  }

  const instrument: ClearingInstrument = {
    id: instrumentId,
    outstandingUSD: totalNeedUSD,
    tradableFloatUSD: totalNeedUSD,
    currentStat: priorRepoRateAnnual * 10000,
    statKind: 'YIELD_LIKE',
    durationYears: 1 / 52,
  };

  const participants: ClearingParticipant[] = [];
  const lenderSchedule = (reservationBps: number, maxHoldingUSD: number): ParticipantDemand => ({
    reservationStat: reservationBps,
    maxHoldingUSD,
    // A lender is fully committed by the top of the corridor: past the SRF rate its
    // counterparty funds at the window instead, so there is nothing above it to be paid for.
    fullSizeStatRange: corridorWidthBps,
  });

  // Surplus banks: reservation is the policy rate their reserves already earn (IOR).
  banks.forEach((bank) => {
    const sheet = sheetByTicker.get(bank.ticker);
    if (!sheet) return;
    const surplusUSD = sheet.cashReservesUSD - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO;
    if (surplusUSD <= 0) return;
    participants.push({
      id: `BANK-${bank.ticker}`,
      currentHoldingsByInstrumentId: new Map(),
      demandByInstrumentId: new Map([[instrumentId, lenderSchedule(policyBps, surplusUSD)]]),
    });
  });

  // Institutions: reservation is the RRP rate their idle cash earns at the window.
  overnightSleeveByEntity.forEach((sleeveUSD, entityId) => {
    participants.push({
      id: `INST-${entityId}`,
      currentHoldingsByInstrumentId: new Map(),
      demandByInstrumentId: new Map([[instrumentId, lenderSchedule(rrpBps, sleeveUSD)]]),
    });
  });

  // The standing repo facility: a posted rate with unlimited quantity response — a real seat
  // in the book (rule 1's administered exception), which is what makes the ceiling a market
  // outcome instead of a clamp. A perfectly elastic window stands at FULL size exactly AT its
  // posted rate, so the one-basis-point numerical step that represents the vertical schedule
  // sits just BELOW it — a seat whose step straddled the posted rate cleared up to 1bp above
  // the window, which no borrower with window access would ever pay (measured as 16
  // corridor-ceiling breaches in the first 60-week run).
  const SRF_SEAT_STEP_BPS = 1;
  participants.push({
    id: CB_SRF_SEAT_ID,
    currentHoldingsByInstrumentId: new Map(),
    demandByInstrumentId: new Map([[instrumentId, {
      reservationStat: srfBps - SRF_SEAT_STEP_BPS,
      maxHoldingUSD: totalNeedUSD,
      fullSizeStatRange: SRF_SEAT_STEP_BPS,
    }]]),
  });

  const result = clearFinancialAsset([instrument], participants, new Map(), {
    // Bilateral GC at one rate — no desk in the middle taking a spread out of it.
    dealerSpreadBps: 0,
    // Overnight money reprices to the corridor the week policy moves; the corridor — the
    // participants' own posted outside options — is the real bound. The damper is set so wide
    // it cannot be the thing that prints (the harness asserts the corridor every week, so a
    // damper-bound print would be caught as a violation, per §6's damper-diagnostic doctrine).
    maxWeeklyStatMovePct: 1000,
  });

  ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);
  const clearedBps = result.newStatById.get(instrumentId) ?? priorRepoRateAnnual * 10000;
  const repoRateAnnual = clearedBps / 10000;

  // ---- Settle lenders. ----
  const lentByEntity = new Map<string, number>();
  let privateLentUSD = 0;
  let srfLentUSD = 0;
  result.newParticipantHoldings.forEach((byInstrument, pid) => {
    const lentUSD = byInstrument.get(instrumentId) ?? 0;
    if (lentUSD <= 0) return;
    if (pid === CB_SRF_SEAT_ID) { srfLentUSD += lentUSD; return; }
    privateLentUSD += lentUSD;
    if (pid.startsWith('BANK-')) {
      const ticker = pid.replace('BANK-', '');
      const sheet = sheetByTicker.get(ticker)!;
      sheetByTicker.set(ticker, {
        ...sheet,
        cashReservesUSD: sheet.cashReservesUSD - lentUSD,
        repoLentUSD: lentUSD,
      });
    } else {
      lentByEntity.set(pid.replace('INST-', ''), lentUSD);
    }
  });
  if (lentByEntity.size > 0) {
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
      const lentUSD = lentByEntity.get(e.id);
      if (!lentUSD) return e;
      return { ...e, cashUSD: (e.cashUSD ?? 0) - lentUSD, repoLentUSD: lentUSD };
    });
  }
  creditRrpOnUnlentSleeves(ctx, regionId, overnightSleeveByEntity, lentByEntity, rrpBps);

  // ---- Settle borrowers: one GC rate for everyone; when the book is short the shortfall is
  // shared pro rata to need, and the same shares decide how much of each borrower's funding is
  // market repo versus the window. Collateral for both legs is encumbered at face implied by
  // the blended haircut actually applied. ----
  const totalLentUSD = privateLentUSD + srfLentUSD;
  const fundedShare = Math.min(1, totalLentUSD / totalNeedUSD);
  const privateShare = totalLentUSD > 0 ? privateLentUSD / totalLentUSD : 0;
  borrowNeedByTicker.forEach((needUSD, ticker) => {
    const sheet = sheetByTicker.get(ticker)!;
    const fundedUSD = needUSD * fundedShare;
    const repoBorrowedUSD = fundedUSD * privateShare;
    const srfBorrowingUSD = fundedUSD - repoBorrowedUSD;
    const { faceUSD, capacityUSD } = collateralCapacityUSD(sheet, haircuts);
    const blendedHaircutFactor = faceUSD > 0 ? capacityUSD / faceUSD : 1;
    const pledgedFaceUSD = blendedHaircutFactor > 0 ? fundedUSD / blendedHaircutFactor : fundedUSD;
    sheetByTicker.set(ticker, {
      ...sheet,
      cashReservesUSD: sheet.cashReservesUSD + fundedUSD,
      repoBorrowedUSD: Number(repoBorrowedUSD.toFixed(0)),
      srfBorrowingUSD: Number(srfBorrowingUSD.toFixed(0)),
      repoEncumberedCollateralUSD: Number(Math.min(faceUSD, (sheet.repoEncumberedCollateralUSD ?? 0) + pledgedFaceUSD).toFixed(0)),
    });
  });

  return { repoRateAnnual, sheetByTicker };
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
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => {
    if (e.region !== regionId) return e;
    const parkedUSD = (sleeveByEntity.get(e.id) ?? 0) - (lentByEntity.get(e.id) ?? 0);
    if (parkedUSD <= 0) return e;
    return { ...e, cashUSD: (e.cashUSD ?? 0) + (parkedUSD * (rrpBps / 10000)) / 52 };
  });
}
