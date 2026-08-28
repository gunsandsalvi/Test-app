/**
 * G2 — itemized bank lending and endogenous money.
 *
 * The business loan book stops being a formula scalar and becomes what it is in reality: a
 * list of real loans to named borrowers on named banks' books. Two borrower classes exist
 * before MS brings households:
 *
 *   - **SME pools** — the private-sector segments. The seed scalar (`debtUSD = 2 × revenue`,
 *     ~17.8x EBITDA — §6's unpriced-primitive row) is recalibrated at migration to what is
 *     REAL twice over: no more than the pool's EBITDA can service at a covenant-style 3x, and
 *     no more than the banks' equity can carry at a working capital ratio — measured USA:
 *     79.9B serviceable vs 21.2B capital-carriable, so the pools migrate SMALL and the book
 *     GROWS toward the serviceable ceiling through weekly origination. That growth is the
 *     monetary transmission G1b item 2 says is missing: originations create deposits, a
 *     policy hike raises quoted margins and slows them, and the goods demand the segments
 *     fund follows.
 *   - **Corporate bank facilities** — revolver draws and maintenance bridges (tranches
 *     flagged `isBankFacility`). These were the §6 double-count: the same floating principal
 *     sat on the banks' aggregate book AND in the institutions' 07d holdings, expensed once
 *     and received twice. Facilities now live ONLY here; the securities markets skip them
 *     the way they skip CP.
 *
 * **Origination is a priced decision** (slice 3): the borrower's house bank quotes
 * policy + margin from the same arithmetic the bond market prices — expected loss plus the
 * capital the loan consumes times the return the bank needs on it — and DECLINES when its
 * capital ratio would breach the regulatory floor. A declined borrower is a real credit
 * crunch, not an index.
 *
 * **Loans create deposits** (slice 4): an origination credits the borrower's money and the
 * bank's loan book together — no reserves move, which is the actual mechanism of endogenous
 * money. Repayment destroys both sides. Corporate deposits are a DERIVED VIEW of the S5 cash
 * ledger (each company's cash IS its deposit at its house bank), reconciled weekly with a
 * real reserve-settlement flow for the money that moved between banks.
 */

import { Company, Region, RegionId } from '../../../types';
import { BankingSector, BankLoan } from '../../../domain/banking';
import { PrivateSectorSegment } from '../../../domain/region-macro';
import { WeeklyStepContext } from './context';
import { computeAnnualDefaultProbability, CREDIT_RECOVERY_RATE } from './shared-helpers';

/** Covenant-style ceiling on SME pool leverage — the same real lending constraint the bond
 * market's covenant ladder expresses (§5-RV's "lenders do not fund unlimited leverage"). */
export const SME_SERVICEABLE_LEVERAGE = 3.0;
/** The capital ratio a bank's treasury actually RUNS at — the buffer above the 8% floor that
 * real supervision demands and real banks keep. Origination prices against consuming it;
 * breaching the floor itself is where the bank declines outright. */
export const BANK_WORKING_CAPITAL_RATIO = 0.11;
const BANK_MIN_CAPITAL_RATIO = 0.08;
/** Return the bank needs on the equity a loan consumes — a structural primitive like the
 * institutional hurdles (G6 derives those from real liabilities; a bank's from its own cost
 * of equity once its stock clears in 07e post-G2). */
export const BANK_TARGET_ROE = 0.12;
/** Share of the gap to the serviceable ceiling the SME pools seek to borrow each week when
 * credit is free — the pace of a real investment pipeline (MS/BP make segment investment
 * demand fully real; this is its flow rate, not its price test). */
const SME_WEEKLY_DEMAND_TAKEUP = 0.01;

/** One margin quote for any borrower: expected loss + capital cost, in bps over policy. */
export function quoteLoanMarginBps(params: {
  annualDefaultProbability: number;
  /** Risk weight of the exposure (1.0 business). */
  riskWeight: number;
}): number {
  const expectedLossBps = params.annualDefaultProbability * (1 - CREDIT_RECOVERY_RATE) * 10000;
  const capitalCostBps = params.riskWeight * BANK_WORKING_CAPITAL_RATIO * BANK_TARGET_ROE * 10000;
  return Math.max(25, Math.round(expectedLossBps + capitalCostBps));
}

const smePoolId = (regionId: RegionId, segmentType: string) => `${regionId}_SEG_${segmentType}`;

/** The pool's PD from its own real default experience — the segment's annual default rate. */
function smePoolAnnualPd(seg: PrivateSectorSegment): number {
  return Math.max(0.002, Math.min(0.25, seg.defaultRateAnnualPct));
}

export function bankRwaUSD(sheet: BankingSector): number {
  return sheet.businessLoanBookUSD * 1.0 + sheet.consumerLoanBookUSD * 0.75;
}

/**
 * SEED MIGRATION (§7.4: the cold start opens in the engine's shape). Recalibrates each
 * region's SME debt to min(serviceable, capital-carriable), itemizes it onto the named banks
 * by deposit share and across segments by EBITDA share, and re-derives the funding side so
 * every sheet still balances. The remainder of the old `debtUSD = 2 × revenue` scalar is
 * DELETED — it never had a lender, never serviced interest, and priced nothing (the §6
 * recalibration row, executed).
 */
export function migrateSmeDebtAtSeed(
  regionId: RegionId,
  reg: Region,
  banks: Company[]
): void {
  const segs = reg.privateSectorSegments || [];
  const segEbitdaUSD = segs.map((s) => Math.max(0, s.annualRevenueUSD * s.marginPct));
  const totalEbitdaUSD = segEbitdaUSD.reduce((a, b) => a + b, 0);
  if (!(totalEbitdaUSD > 0) || banks.length === 0) return;

  const serviceableUSD = totalEbitdaUSD * SME_SERVICEABLE_LEVERAGE;
  const totalEquityUSD = banks.reduce((a, b) => a + b.bankBalanceSheet!.bankEquityUSD, 0);
  const usedRwaUSD = banks.reduce((a, b) => a + bankRwaUSD(b.bankBalanceSheet!), 0)
    // the old scalar's corporate-floating content leaves the bank book below; exclude it here
    - banks.reduce((a, b) => a + b.bankBalanceSheet!.businessLoanBookUSD, 0);
  const carriableUSD = Math.max(0, totalEquityUSD / BANK_WORKING_CAPITAL_RATIO - usedRwaUSD);
  const migratedUSD = Math.min(serviceableUSD, carriableUSD);

  const totalDepositsUSD = banks.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0) || 1;
  banks.forEach((bank) => {
    const sheet = bank.bankBalanceSheet!;
    const bankShare = sheet.depositsUSD / totalDepositsUSD;
    const loans: BankLoan[] = [];
    segs.forEach((seg, i) => {
      const principalUSD = Math.round(migratedUSD * bankShare * (segEbitdaUSD[i] / totalEbitdaUSD));
      if (principalUSD <= 0) return;
      loans.push({
        id: `${bank.ticker}-SME-${seg.segmentType}`,
        borrowerId: smePoolId(regionId, seg.segmentType),
        borrowerKind: 'SME_POOL',
        principalUSD,
        marginBps: quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0 }),
        originationWeek: 0,
        termWeeks: 52 * 5,
        status: 'PERFORMING',
      });
    });
    sheet.businessLoans = loans;
    // The book becomes the sum of its loans — the old scalar's corporate-floating content
    // (07d's market, the double-count) leaves the bank sheet entirely.
    sheet.businessLoanBookUSD = loans.reduce((a, l) => a + l.principalUSD, 0);
    // Funding side re-derived so the sheet still balances (same discipline as the WS6 seed).
    const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    sheet.depositsUSD = Number((
      sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD + sheet.cashReservesUSD - sheet.bankEquityUSD
    ).toFixed(0));
  });

  // The segments' recorded debt becomes the loans that actually exist.
  const migratedBySegment = new Map<string, number>();
  banks.forEach((bank) => bank.bankBalanceSheet!.businessLoans.forEach((l) => {
    migratedBySegment.set(l.borrowerId, (migratedBySegment.get(l.borrowerId) ?? 0) + l.principalUSD);
  }));
  segs.forEach((seg) => {
    seg.debtUSD = migratedBySegment.get(smePoolId(regionId, seg.segmentType)) ?? 0;
  });
}

export interface WeeklyLendingResult {
  sheet: BankingSector;
  /** Real interest the bank earned on its itemized book this week (cash + equity legs are the
   * caller's to post — evolve's income line carries it so NIM stays one statistic). */
  loanInterestWeeklyUSD: number;
  /** Real write-offs this week (loan − and equity − legs applied here). */
  loanLossWeeklyUSD: number;
  declinedOriginationUSD: number;
  /** Net facility money created (+) / destroyed (−) this week — excluded from the reserve
   * settlement of the corporate-deposit view. */
  facilityNetOriginationUSD: number;
}

/**
 * One bank's weekly loan-book operations: interest accrual at each loan's own real terms, SME
 * pool losses at the pool's own real default rate, SME origination as a PRICED decision under
 * the bank's real capital constraint, and facility reconciliation against the borrowers' real
 * tranche ladders (companies create/retire facilities in stage 08; the bank's book mirrors
 * them 1:1 — one loan per facility tranche, never two representations).
 */
export function runBankWeeklyLending(
  bank: Company,
  sheet: BankingSector,
  reg: Region,
  regionId: RegionId,
  facilityTranchesByBank: Map<string, { companyId: string; trancheId: string; principalUSD: number; marginBps: number; originationWeek: number; maturityWeek: number }[]>,
  nextWeek: number
): WeeklyLendingResult {
  const policyRate = reg.policyRate;
  let loans = [...(sheet.businessLoans || [])];

  // ---- Facility reconciliation: the bank's records mirror the borrowers' real ladders. The
  // NET origination is returned so the corporate-deposit settlement (slice 4) can exclude
  // created/destroyed money from interbank reserve movement — endogenous money does not move
  // reserves; only money CHANGING banks does. ----
  const facilities = facilityTranchesByBank.get(bank.ticker) ?? [];
  const facilityIds = new Set(facilities.map((f) => f.trancheId));
  let facilityNetOriginationUSD = 0;
  loans = loans.filter((l) => {
    if (l.borrowerKind !== 'COMPANY_FACILITY') return true;
    if (facilityIds.has(l.id)) return true;
    facilityNetOriginationUSD -= l.principalUSD; // repaid/retired: money destroyed
    return false;
  });
  const existingIds = new Set(loans.map((l) => l.id));
  facilities.forEach((f) => {
    if (existingIds.has(f.trancheId)) {
      const l = loans.find((x) => x.id === f.trancheId)!;
      facilityNetOriginationUSD += f.principalUSD - l.principalUSD;
      l.principalUSD = f.principalUSD;
      return;
    }
    facilityNetOriginationUSD += f.principalUSD;
    loans.push({
      id: f.trancheId,
      borrowerId: f.companyId,
      borrowerKind: 'COMPANY_FACILITY',
      principalUSD: f.principalUSD,
      marginBps: f.marginBps,
      originationWeek: f.originationWeek,
      termWeeks: f.maturityWeek - f.originationWeek,
      status: 'PERFORMING',
    });
  });

  // ---- Interest at each loan's own terms. The corporate side is already expensed through the
  // borrowers' S5 ledgers (facility tranches); the SME side's payer is the segment P&L, a
  // recorded boundary until MS/BP close it. ----
  let loanInterestWeeklyUSD = 0;
  loans.forEach((l) => {
    if (l.status !== 'PERFORMING') return;
    loanInterestWeeklyUSD += (l.principalUSD * (policyRate + l.marginBps / 10000)) / 52;
  });

  // ---- SME losses at the pool's own real default rate — the bank's measured loss experience,
  // replacing the contagion formula for the itemized book. ----
  let loanLossWeeklyUSD = 0;
  const segByPool = new Map((reg.privateSectorSegments || []).map((s) => [smePoolId(regionId, s.segmentType), s]));
  loans = loans.map((l) => {
    if (l.borrowerKind !== 'SME_POOL') return l;
    const seg = segByPool.get(l.borrowerId);
    if (!seg) return l;
    const lossUSD = (l.principalUSD * smePoolAnnualPd(seg) * (1 - CREDIT_RECOVERY_RATE)) / 52;
    loanLossWeeklyUSD += lossUSD;
    return { ...l, principalUSD: l.principalUSD - lossUSD };
  });

  // ---- SME origination: priced, capital-gated. Demand is a slow reach toward the pool's
  // serviceable ceiling; supply is whatever keeps the bank above its regulatory floor. ----
  let declinedOriginationUSD = 0;
  let smeOriginationUSD = 0;
  const equityUSD = sheet.bankEquityUSD;
  (reg.privateSectorSegments || []).forEach((seg) => {
    const poolId = smePoolId(regionId, seg.segmentType);
    const poolLoan = loans.find((l) => l.borrowerId === poolId && l.borrowerKind === 'SME_POOL');
    const ebitdaUSD = Math.max(0, seg.annualRevenueUSD * seg.marginPct);
    const ceilingUSD = ebitdaUSD * SME_SERVICEABLE_LEVERAGE;
    // this bank's share of the pool's demand ≈ its share of the pool's existing loans
    const bankPoolUSD = poolLoan?.principalUSD ?? 0;
    const totalPoolDebtUSD = seg.debtUSD || 1;
    const bankShare = totalPoolDebtUSD > 0 ? Math.min(1, bankPoolUSD / totalPoolDebtUSD) : 0;
    // The BORROWER's own hurdle — the price half of the demand curve, and the transmission
    // channel G1b item 2 says is missing. A pool does not borrow at 12% to earn 9%: demand
    // scales with how far the all-in cost sits below the return the pool actually makes on
    // what it sells (its own measured EBITDA margin). Without this term the schedule was a
    // pure quantity target and a +300bp hike moved origination 0.5% — priced but inert.
    const allInRateAnnual = policyRate + quoteLoanMarginBps({
      annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0,
    }) / 10000;
    const poolReturnAnnual = Math.max(0.001, seg.marginPct);
    const appetite = Math.max(0, Math.min(1, (poolReturnAnnual - allInRateAnnual) / poolReturnAnnual));
    const demandUSD = Math.max(0, (ceilingUSD - totalPoolDebtUSD) * SME_WEEKLY_DEMAND_TAKEUP * appetite * (bankShare || 0.25));
    if (demandUSD <= 0) return;

    const currentRwaUSD = loans.reduce((a, l) => a + l.principalUSD, 0) + sheet.consumerLoanBookUSD * 0.75;
    const headroomUSD = Math.max(0, equityUSD / BANK_MIN_CAPITAL_RATIO - currentRwaUSD);
    const grantedUSD = Math.min(demandUSD, headroomUSD);
    declinedOriginationUSD += demandUSD - grantedUSD;
    if (grantedUSD <= 0) return;

    smeOriginationUSD += grantedUSD;
    const marginBps = quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0 });
    if (poolLoan) {
      poolLoan.principalUSD += grantedUSD;
      // the pool's blended margin drifts toward the new quote as new money joins the book
      poolLoan.marginBps = Math.round((poolLoan.marginBps * (poolLoan.principalUSD - grantedUSD) + marginBps * grantedUSD) / Math.max(1, poolLoan.principalUSD));
    } else {
      loans.push({
        id: `${bank.ticker}-SME-${seg.segmentType}`,
        borrowerId: poolId, borrowerKind: 'SME_POOL', principalUSD: grantedUSD,
        marginBps, originationWeek: nextWeek, termWeeks: 52 * 5, status: 'PERFORMING',
      });
    }
    // Loans create deposits: the pool's money and the bank's loan appear together. The pool's
    // deposit sits in the bank's household/SME funding line (segments are not yet cash-ledger
    // actors — MS's item); no reserves move, which is the point.
    seg.debtUSD += grantedUSD;
    // And the pool SPENDS it. This is the last link in the transmission chain: borrowed money
    // funds real capex, which stage 05 turns into real bids in the capital-goods markets, so a
    // policy hike reaches the goods market through the credit it suppresses rather than
    // stopping at a debt number nobody spends. (Annualised: capexUSD is an annual figure and
    // grantedUSD is one week's origination — rule 9.)
    seg.capexUSD += grantedUSD * 52;
  });

  const businessLoanBookUSD = Number(loans.reduce((a, l) => a + l.principalUSD, 0).toFixed(0));
  return {
    sheet: {
      ...sheet,
      businessLoans: loans,
      businessLoanBookUSD,
      bankEquityUSD: sheet.bankEquityUSD - loanLossWeeklyUSD,
      // Loans create deposits: an SME origination puts the pool's new money on the bank's own
      // funding line the same moment the loan appears — no reserves move, which is endogenous
      // money (the pools bank here; they have no cash ledger of their own until MS).
      depositsUSD: sheet.depositsUSD + smeOriginationUSD,
      // A corporate FACILITY is different in this model: the borrower's cash lives in its own
      // S5 ledger, outside the banking system, so drawing one is a real cash outflow from the
      // bank and a repayment is an inflow. Loan +X / reserves −X keeps the sheet balanced;
      // when MS makes company cash settle through banks this becomes deposit creation too.
      cashReservesUSD: sheet.cashReservesUSD - facilityNetOriginationUSD,
    },
    loanInterestWeeklyUSD,
    loanLossWeeklyUSD,
    declinedOriginationUSD,
    facilityNetOriginationUSD,
  };
}
