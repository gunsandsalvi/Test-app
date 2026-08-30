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
import { EQUITY_RISK_PREMIUM } from '../../equity-valuation';
import {
  BankingSector, BankLoan, HouseholdLoanPool, HouseholdLoanKind,
  MORTGAGE_RISK_WEIGHT, CONSUMER_CREDIT_RISK_WEIGHT, householdBookRwaUSD, annuityWeeklyPrincipalUSD,
  MORTGAGE_TERM_WEEKS, MORTGAGE_SEED_WAM_WEEKS, CONSUMER_TERM_WEEKS, CONSUMER_TERM_SEED_WAM_WEEKS,
  MORTGAGE_SEED_VINTAGE_COHORTS, MortgageVintage, bookMortgageSeverity, vintageCurrentLtv,
  MORTGAGE_FIXED_PERIOD_WEEKS, MORTGAGE_DSTI_LIMIT,
  mortgageSeverityAtLtv,
  MORTGAGE_SPREAD_OVER_10Y_BPS, CARD_POOL_PAYMENT_RATE_WEEKLY, CARD_MIN_PRINCIPAL_RATE_WEEKLY,
  CARD_OPERATING_COST_BPS,
  CONSUMER_TERM_OPERATING_COST_BPS, HOUSING_TURNOVER_RATE_ANNUAL, MORTGAGE_LTV_AT_ORIGINATION,
  FORECLOSURE_COST_SHARE, MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER, MORTGAGE_MIN_LOSS_SEVERITY,
} from '../../../domain/banking';
import { CreditTierBook, AVERAGE_HOUSEHOLD_SIZE } from '../../../domain/region-macro';
import { SmePool } from '../../../domain/region-macro';
import { WeeklyStepContext } from './context';
import { computeAnnualDefaultProbability, CREDIT_RECOVERY_RATE, creditRecoveryRate } from './shared-helpers';

/** Covenant-style ceiling on SME pool leverage — the same real lending constraint the bond
 * market's covenant ladder expresses (§5-RV's "lenders do not fund unlimited leverage"). */
export const SME_SERVICEABLE_LEVERAGE = 3.0;
/** The capital ratio a bank's treasury actually RUNS at — the buffer above the 8% floor that
 * real supervision demands and real banks keep. Origination prices against consuming it;
 * breaching the floor itself is where the bank declines outright. */
export const BANK_WORKING_CAPITAL_RATIO = 0.11;
const BANK_MIN_CAPITAL_RATIO = 0.08;
/**
 * Return the bank needs on the equity a loan consumes — and therefore, through
 * `quoteLoanMarginBps`, the price of every loan it writes.
 *
 * G3c met this file's own stated exit condition: bank stock clears in 07e, so the hurdle is the
 * bank's own cost of equity — risk-free plus its measured beta times the equity risk premium,
 * `bankRequiredReturnAnnual` below. Two banks with different betas now price the same loan
 * differently, which is what a cost of capital IS. The constant survives as the fallback for a
 * quote made where no particular bank is lending (the household aggregate's average rate) and
 * for a bank with no beta yet.
 */
export const BANK_TARGET_ROE = 0.12;

/**
 * THIS bank's cost of equity: the risk-free rate its own region prints, plus its own measured
 * beta against the equity risk premium. The price of every loan it writes rides on it.
 */
export function bankRequiredReturnAnnual(bank: { beta?: number }, reg: Region): number {
  return Math.max(0.01, (reg.zeroRates?.tenor10Y ?? reg.policyRate) + (bank.beta ?? 1) * EQUITY_RISK_PREMIUM);
}
/** Share of the gap to the serviceable ceiling the SME pools seek to borrow each week when
 * credit is free — the pace of a real investment pipeline (MS/BP make segment investment
 * demand fully real; this is its flow rate, not its price test). */
const SME_WEEKLY_DEMAND_TAKEUP = 0.01;

/** One margin quote for any borrower: expected loss + capital cost, in bps over policy. */
export function quoteLoanMarginBps(params: {
  annualDefaultProbability: number;
  /** Risk weight of the exposure (1.0 business). */
  riskWeight: number;
  /** G3c: the quoting bank's own cost of equity. Omitted only where no one bank is quoting. */
  requiredReturnAnnual?: number;
  /** G5: what this region's workouts have actually recovered. Omitted falls back to the prior. */
  recoveryRate?: number;
}): number {
  const expectedLossBps = params.annualDefaultProbability * (1 - (params.recoveryRate ?? CREDIT_RECOVERY_RATE)) * 10000;
  const capitalCostBps = params.riskWeight * BANK_WORKING_CAPITAL_RATIO
    * (params.requiredReturnAnnual ?? BANK_TARGET_ROE) * 10000;
  return Math.max(25, Math.round(expectedLossBps + capitalCostBps));
}

export const smePoolId = (regionId: RegionId, industry: string) => `${regionId}_SEG_${industry}`;

/** The pool's PD from its own real default experience — the segment's annual default rate. */
function smePoolAnnualPd(seg: SmePool): number {
  return Math.max(0.002, Math.min(0.25, seg.defaultRateAnnualPct));
}

export function bankRwaUSD(sheet: BankingSector): number {
  // HH3: the household book's weight is per-kind (a secured mortgage consumes less capital
  // than a card balance); the flat 0.75 remains only as the fallback for a sheet whose pools
  // predate itemization.
  const householdRwa = (sheet.householdLoans && sheet.householdLoans.length > 0)
    ? householdBookRwaUSD(sheet.householdLoans)
    : sheet.consumerLoanBookUSD * CONSUMER_CREDIT_RISK_WEIGHT;
  return sheet.businessLoanBookUSD * 1.0 + householdRwa;
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
  const segs = reg.smePools || [];
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
    const bankHurdle = bankRequiredReturnAnnual(bank, reg);
    const bankShare = sheet.depositsUSD / totalDepositsUSD;
    const loans: BankLoan[] = [];
    segs.forEach((seg, i) => {
      const principalUSD = Math.round(migratedUSD * bankShare * (segEbitdaUSD[i] / totalEbitdaUSD));
      if (principalUSD <= 0) return;
      loans.push({
        id: `${bank.ticker}-SME-${seg.industry}`,
        borrowerId: smePoolId(regionId, seg.industry),
        borrowerKind: 'SME_POOL',
        principalUSD,
        marginBps: quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: bankHurdle, recoveryRate: creditRecoveryRate(reg) }),
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
    seg.debtUSD = migratedBySegment.get(smePoolId(regionId, seg.industry)) ?? 0;
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
  /** SEG2e — this week's SME origination per industry. The caller (02b) books the deposit
   * half through settlement (BANK_CREDIT → SEGMENT), so the pool's new money lands on its own
   * line with no reserve move; the loan half was already written in place here. */
  smeOriginationBySegment: Map<string, number>;
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
  // G3c: every price this bank quotes below rides on ITS OWN cost of equity.
  const bankHurdle = bankRequiredReturnAnnual(bank, reg);
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
  const segByPool = new Map((reg.smePools || []).map((s) => [smePoolId(regionId, s.industry), s]));
  loans = loans.map((l) => {
    if (l.borrowerKind !== 'SME_POOL') return l;
    const seg = segByPool.get(l.borrowerId);
    if (!seg) return l;
    const lossUSD = (l.principalUSD * smePoolAnnualPd(seg) * (1 - creditRecoveryRate(reg))) / 52;
    loanLossWeeklyUSD += lossUSD;
    return { ...l, principalUSD: l.principalUSD - lossUSD };
  });

  // ---- SME origination: priced, capital-gated. Demand is a slow reach toward the pool's
  // serviceable ceiling; supply is whatever keeps the bank above its regulatory floor. ----
  let declinedOriginationUSD = 0;
  const smeOriginationBySegment = new Map<string, number>();
  const equityUSD = sheet.bankEquityUSD;
  (reg.smePools || []).forEach((seg) => {
    const poolId = smePoolId(regionId, seg.industry);
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
      annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: bankHurdle,
      recoveryRate: creditRecoveryRate(reg),
    }) / 10000;
    const poolReturnAnnual = Math.max(0.001, seg.marginPct);
    const appetite = Math.max(0, Math.min(1, (poolReturnAnnual - allInRateAnnual) / poolReturnAnnual));
    const demandUSD = Math.max(0, (ceilingUSD - totalPoolDebtUSD) * SME_WEEKLY_DEMAND_TAKEUP * appetite * (bankShare || 0.25));
    if (demandUSD <= 0) return;

    const currentRwaUSD = loans.reduce((a, l) => a + l.principalUSD, 0)
      + ((sheet.householdLoans && sheet.householdLoans.length > 0)
        ? householdBookRwaUSD(sheet.householdLoans)
        : sheet.consumerLoanBookUSD * CONSUMER_CREDIT_RISK_WEIGHT);
    const headroomUSD = Math.max(0, equityUSD / BANK_MIN_CAPITAL_RATIO - currentRwaUSD);
    const grantedUSD = Math.min(demandUSD, headroomUSD);
    declinedOriginationUSD += demandUSD - grantedUSD;
    if (grantedUSD <= 0) return;

    smeOriginationBySegment.set(seg.industry, (smeOriginationBySegment.get(seg.industry) ?? 0) + grantedUSD);
    const marginBps = quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: bankHurdle, recoveryRate: creditRecoveryRate(reg) });
    if (poolLoan) {
      poolLoan.principalUSD += grantedUSD;
      // the pool's blended margin drifts toward the new quote as new money joins the book
      poolLoan.marginBps = Math.round((poolLoan.marginBps * (poolLoan.principalUSD - grantedUSD) + marginBps * grantedUSD) / Math.max(1, poolLoan.principalUSD));
    } else {
      loans.push({
        id: `${bank.ticker}-SME-${seg.industry}`,
        borrowerId: poolId, borrowerKind: 'SME_POOL', principalUSD: grantedUSD,
        marginBps, originationWeek: nextWeek, termWeeks: 52 * 5, status: 'PERFORMING',
      });
    }
    // Loans create deposits: the pool's money and the bank's loan appear together. The pool's
    // deposit sits in the bank's household/SME funding line (segments are not yet cash-ledger
    // actors — MS's item); no reserves move, which is the point.
    seg.debtUSD += grantedUSD;
    // SEG-D: the pool SPENDS it — but through its BOOK, not by having its capex number
    // incremented here. The origination arrives as a real deposit (the BANK_CREDIT payment 02b
    // issues), which raises the pool's cash, which raises what the SME-pool stage will let it
    // invest. Same transmission chain, now with a budget constraint in the middle: a pool that
    // is short of payroll spends the money on payroll instead, which is what a real small firm
    // does with a credit line when it is squeezed.
  });

  const businessLoanBookUSD = Number(loans.reduce((a, l) => a + l.principalUSD, 0).toFixed(0));
  return {
    sheet: {
      ...sheet,
      businessLoans: loans,
      businessLoanBookUSD,
      bankEquityUSD: sheet.bankEquityUSD - loanLossWeeklyUSD,
      // SEG2e: loans still create deposits, but the pool's new money now lands on ITS OWN line
      // through settlement — the caller pays BANK_CREDIT → SEGMENT with the per-segment map
      // below, so the deposit appears on `smeDepositsUSD` (and the pool's cash) with no reserve
      // move, instead of being quietly folded into the household deposit line here.
      depositsUSD: sheet.depositsUSD,
      // SETL2b: a facility is DEPOSIT CREATION, and both halves happen in one statement at
      // settlement — the loan is booked there in the same week the borrower draws it, so no
      // reserve moves and nothing is left for this reconciliation to fund. What remains here is
      // the sync itself, which is level-based: a tranche settlement already booked is found with
      // its principal matching and contributes nothing. `facilityNetOriginationUSD` is therefore
      // the residue of anything settlement did NOT see (a merger moving a book, a default), and
      // that residue still moves reserves because it is a change with no payment behind it.
      cashReservesUSD: sheet.cashReservesUSD - facilityNetOriginationUSD,
    },
    loanInterestWeeklyUSD,
    loanLossWeeklyUSD,
    declinedOriginationUSD,
    facilityNetOriginationUSD,
    smeOriginationBySegment,
  };
}

// ============================== HH3 — the household books ==============================

/**
 * The unsecured book's annual loss rate from the tier mix and the real unemployment print —
 * moved here from evolveBankingSector so the loss lands on the itemized pool that bears it.
 */
export function consumerAnnualLossRate(
  unemploymentRate: number,
  creditTierBooks: CreditTierBook[] | undefined
): number {
  const base = Math.max(0.005, Math.min(0.12, Math.max(0, unemploymentRate - 0.03) * 1.2));
  if (!creditTierBooks || creditTierBooks.length === 0) {
    return Math.min(0.09, Math.max(0, unemploymentRate - 0.045) * 1.4);
  }
  const share = (tier: string, fallback: number) =>
    creditTierBooks.find((t) => t.tier === tier)?.shareOfHouseholds ?? fallback;
  const weightedMultiplier =
    share('SUPER_PRIME', 0.25) * 0.2 + share('PRIME', 0.50) * 1.0 +
    share('NEAR_PRIME', 0.15) * 3.0 + share('SUBPRIME', 0.10) * 10.0;
  return base * weightedMultiplier;
}

/** One margin quote for unsecured household credit: measured loss + capital + operating cost. */
export function quoteHouseholdMarginBps(params: {
  annualLossRate: number;
  riskWeight: number;
  operatingCostBps: number;
  /** G3c: the quoting bank's own cost of equity. Omitted only where no one bank is quoting. */
  requiredReturnAnnual?: number;
}): number {
  // The measured loss rate is already frequency x severity, so it IS the expected-loss term.
  const expectedLossBps = params.annualLossRate * 10000;
  const capitalCostBps = params.riskWeight * BANK_WORKING_CAPITAL_RATIO
    * (params.requiredReturnAnnual ?? BANK_TARGET_ROE) * 10000;
  return Math.max(50, Math.round(expectedLossBps + capitalCostBps + params.operatingCostBps));
}

/** The current primary mortgage rate: the cleared 10Y plus the real origination spread. */
export function currentMortgageRateAnnual(reg: Region): number {
  return Math.max(0.005, (reg.zeroRates?.tenor10Y ?? 0.04) + MORTGAGE_SPREAD_OVER_10Y_BPS / 10000);
}

/**
 * SEED MIGRATION (§7.4 again): the household debt the region already carries becomes real
 * pools on the named banks, split by deposit share — and the consumer scalar the banks used
 * to carry (a 0.070-of-GDP line covering 11.67% of the same debt) is REPLACED by them, not
 * added to. Bank equity is topped up in proportion to the risk the new books add, at each
 * bank's own pre-migration capital ratio, and deposits re-derive as the balancing funding —
 * the same discipline as the SME and sovereign seed reconciliations. The equity and funding
 * appear at seed because seeds construct the opening world; from week 1 every dollar of these
 * books moves only through the lending pass below.
 */
export function migrateHouseholdDebtAtSeed(
  regionId: RegionId,
  reg: Region,
  banks: Company[]
): void {
  const hs = reg.householdState;
  if (!hs || banks.length === 0) return;
  const mortgageRate = currentMortgageRateAnnual(reg);
  const lossRate = consumerAnnualLossRate(reg.unemploymentRate, hs.creditTierBooks);
  // G3c: the seed's quote is made by the banks that will carry the book, at their own average
  // cost of equity — one migration, every lender in it.
  const seedHurdle = banks.reduce((a, b) => a + bankRequiredReturnAnnual(b, reg), 0) / banks.length;
  const cardMarginBps = quoteHouseholdMarginBps({
    annualLossRate: lossRate, riskWeight: CONSUMER_CREDIT_RISK_WEIGHT, operatingCostBps: CARD_OPERATING_COST_BPS,
    requiredReturnAnnual: seedHurdle,
  });
  const termMarginBps = quoteHouseholdMarginBps({
    annualLossRate: lossRate * 0.5, riskWeight: CONSUMER_CREDIT_RISK_WEIGHT, operatingCostBps: CONSUMER_TERM_OPERATING_COST_BPS,
    requiredReturnAnnual: seedHurdle,
  });

  const totalDepositsUSD = banks.reduce((a, b) => a + b.bankBalanceSheet!.depositsUSD, 0) || 1;
  banks.forEach((bank) => {
    const sheet = bank.bankBalanceSheet!;
    const share = sheet.depositsUSD / totalDepositsUSD;
    const pools: HouseholdLoanPool[] = ([
      // DIST/HSG — THE BOOK IS SEEDED AS VINTAGES, NOT AS ONE AVERAGE LOAN.
      //
      // A real mortgage book is decades of lending stacked up: loans written at different prices,
      // at different rates, at different points through their term. Seeding one blended loan at
      // one LTV is what put the whole book on the flat part of the severity curve (§6.1). The
      // spread here is not a stated LTV distribution — it is the ARITHMETIC of a book in steady
      // state: a vintage written `age` years ago at `MORTGAGE_LTV_AT_ORIGINATION` has amortised
      // for `age` years and its collateral has been marked for `age` years, and both of those
      // this seed knows. What comes out is a cross-section, and it comes out rather than being
      // put in.
      (() => {
        const bookUSD = Math.round((hs.mortgageDebtUSD ?? 0) * share);
        const priceNowUSD = Math.max(1, reg.housingMarket?.medianHomePriceUSD ?? 1);
        const cohorts = MORTGAGE_SEED_VINTAGE_COHORTS;
        const raw: MortgageVintage[] = [];
        for (let i = 0; i < cohorts; i++) {
          // Evenly through the term: the oldest vintage is nearly repaid, the newest just written.
          const ageWeeks = Math.round(((i + 0.5) / cohorts) * MORTGAGE_TERM_WEEKS);
          const remainingWeeks = Math.max(1, MORTGAGE_TERM_WEEKS - ageWeeks);
          // What an equal-instalment loan has left after `ageWeeks` of its term, as a share of
          // what it started at. Straight annuity arithmetic at the seed rate.
          const r = Math.max(0.0001, mortgageRate) / 52;
          const remainingShare =
            (Math.pow(1 + r, MORTGAGE_TERM_WEEKS) - Math.pow(1 + r, ageWeeks))
            / (Math.pow(1 + r, MORTGAGE_TERM_WEEKS) - 1);
          // EVERY COHORT LENT THE SAME AMOUNT AGAINST THE SAME HOUSE. What differs is how much
          // of it has been PAID OFF, and that is the whole cross-section: collateral stays at
          // what the home was worth, principal walks down the annuity. So an old vintage sits at
          // a low LTV and a new one at the origination LTV — which is what a real book looks
          // like, and it is arithmetic rather than a stated spread.
          //
          // Scaling the collateral by the REMAINING principal instead would hold every cohort at
          // the origination LTV forever, which is the bug this replaced: 156 vintages all reading
          // 0.78, a cross-section with no cross-section in it.
          raw.push({
            principalUSD: Math.max(0, remainingShare),
            originationCollateralUSD: 1 / MORTGAGE_LTV_AT_ORIGINATION,
            originationHomePriceUSD: priceNowUSD,
            rateAnnual: Number(mortgageRate.toFixed(4)),
            wamWeeks: remainingWeeks,
            // Where each cohort sits in its own fix cycle. A book written continuously has its
            // resets spread continuously, so some share comes due every week rather than the
            // whole book repricing on one day.
            fixedForWeeks: Math.max(1, MORTGAGE_FIXED_PERIOD_WEEKS - (ageWeeks % MORTGAGE_FIXED_PERIOD_WEEKS)),
            originatedWeek: -ageWeeks,
          });
        }
        // One scale factor for the whole cohort set, applied to BOTH legs so the loan-to-value
        // each vintage was written at survives the scaling.
        const rawTotal = raw.reduce((a, v) => a + v.principalUSD, 0) || 1;
        const scale = bookUSD / rawTotal;
        const vintages = raw.map((v) => ({
          ...v,
          principalUSD: v.principalUSD * scale,
          originationCollateralUSD: v.originationCollateralUSD * scale,
        }));
        return {
          kind: 'MORTGAGE' as const,
          principalUSD: bookUSD,
          vintages,
          wacAnnual: Number(mortgageRate.toFixed(4)),
          wamWeeks: MORTGAGE_SEED_WAM_WEEKS,
        };
      })(),
      {
        kind: 'CREDIT_CARD',
        principalUSD: Math.round((hs.creditCardDebtUSD ?? 0) * share),
        marginBps: cardMarginBps,
      },
      {
        kind: 'CONSUMER_TERM',
        principalUSD: Math.round((hs.otherConsumerLoanDebtUSD ?? 0) * share),
        marginBps: termMarginBps,
        wamWeeks: CONSUMER_TERM_SEED_WAM_WEEKS,
      },
    ] as HouseholdLoanPool[]).filter((pl) => pl.principalUSD > 0);

    const priorRwaUSD = bankRwaUSD(sheet);
    const priorRatio = priorRwaUSD > 0 ? sheet.bankEquityUSD / priorRwaUSD : BANK_WORKING_CAPITAL_RATIO;
    const newHouseholdRwaUSD = householdBookRwaUSD(pools);
    const replacedRwaUSD = sheet.consumerLoanBookUSD * CONSUMER_CREDIT_RISK_WEIGHT;
    sheet.householdLoans = pools;
    sheet.consumerLoanBookUSD = pools.reduce((a, pl) => a + pl.principalUSD, 0);
    // Equity scales with the risk the books add, at the ratio this bank already ran — no new
    // constant, and the opening capital ratio is preserved by construction.
    sheet.bankEquityUSD = Number((sheet.bankEquityUSD + Math.max(0, newHouseholdRwaUSD - replacedRwaUSD) * priorRatio).toFixed(0));
    const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
    const fundingNeedUSD = Number((
      sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD + sheet.cashReservesUSD - sheet.bankEquityUSD
    ).toFixed(0));
    applyBankFundingSplit(sheet, Math.round((hs.depositsUSD ?? 0) * share));
    sheet.bankCapitalRatio = Number((sheet.bankEquityUSD / Math.max(1, bankRwaUSD(sheet))).toFixed(4));
  });

  // The household lines become the derived sums they will be every week from here on, and the
  // seed carries the flows the books imply so week 1 opens in the engine's shape, not at zero.
  const sumKind = (kind: HouseholdLoanKind) => banks.reduce(
    (a, b) => a + (b.bankBalanceSheet!.householdLoans || []).filter((pl) => pl.kind === kind).reduce((x, pl) => x + pl.principalUSD, 0),
    0
  );
  hs.mortgageDebtUSD = sumKind('MORTGAGE');
  hs.creditCardDebtUSD = sumKind('CREDIT_CARD');
  hs.otherConsumerLoanDebtUSD = sumKind('CONSUMER_TERM');
  hs.priorMortgageDebtUSD = hs.mortgageDebtUSD;
  const policyRate = reg.policyRate;
  hs.weeklyDebtServiceUSD = Number((
    (hs.mortgageDebtUSD * mortgageRate
      + hs.creditCardDebtUSD * (policyRate + cardMarginBps / 10000)
      + hs.otherConsumerLoanDebtUSD * (policyRate + termMarginBps / 10000)) / 52
    + annuityWeeklyPrincipalUSD(hs.mortgageDebtUSD, mortgageRate, MORTGAGE_SEED_WAM_WEEKS)
    + annuityWeeklyPrincipalUSD(hs.otherConsumerLoanDebtUSD, policyRate + termMarginBps / 10000, CONSUMER_TERM_SEED_WAM_WEEKS)
    + hs.creditCardDebtUSD * CARD_MIN_PRINCIPAL_RATE_WEEKLY
  ).toFixed(0));
  const housingStockUSD = hs.housingStockUSD && hs.housingStockUSD > 0
    ? hs.housingStockUSD
    : (reg.housingMarket
      ? (Math.max(0, reg.totalPopulation) / AVERAGE_HOUSEHOLD_SIZE) * Math.max(0, reg.housingMarket.ownershipRatePct) * Math.max(0, reg.housingMarket.medianHomePriceUSD)
      : 0);
  // Seeded as the engine's own shape: NET mortgage credit — buyers' new loans at the
  // origination LTV minus sellers' remaining loans (at the book's average LTV) the sales retire.
  const seedAvgLtv = housingStockUSD > 0 ? Math.min(2, hs.mortgageDebtUSD / housingStockUSD) : 1;
  hs.weeklyMortgageOriginationUSD = Number((
    (housingStockUSD * HOUSING_TURNOVER_RATE_ANNUAL / 52) * Math.max(0, MORTGAGE_LTV_AT_ORIGINATION - seedAvgLtv)
  ).toFixed(0));
  hs.weeklyNewConsumerCreditUSD = Number((
    hs.creditCardDebtUSD * CARD_POOL_PAYMENT_RATE_WEEKLY
    + annuityWeeklyPrincipalUSD(hs.otherConsumerLoanDebtUSD, policyRate + termMarginBps / 10000, CONSUMER_TERM_SEED_WAM_WEEKS)
  ).toFixed(0));
}

export interface HouseholdLendingResult {
  sheet: BankingSector;
  /** Interest accrued at the pools' own terms — REPORT ONLY (the caller passes the prior-book
   * accrual to evolveBankingSector, which posts it; posting here too would double-count). */
  interestWeeklyUSD: number;
  /** ALL principal retired from income this week (annuity arithmetic + revolving turnover). */
  principalWeeklyUSD: number;
  /** The REQUIRED slice of that principal — annuity schedules plus card minimums. Turnover a
   * transactor cycles through a card is spending already counted in consumption, not burden. */
  debtServicePrincipalWeeklyUSD: number;
  /** Sellers' remaining mortgages repaid out of sale proceeds — funded by the buyers' new
   * loans, so the household sector's net deposit gain is origination minus this. */
  mortgageDischargeUSD: number;
  /** Real write-offs this week (loan − and equity − applied here). */
  lossWeeklyUSD: number;
  mortgageOriginationUSD: number;
  consumerCreditOriginationUSD: number;
  declinedOriginationUSD: number;
}

/**
 * One bank's weekly household lending: interest at each pool's own terms, scheduled principal
 * DERIVED from those terms, losses at the measured tier/equity-severity rates, and origination
 * as a priced, capital-gated decision — the same shape as the business pass above.
 *
 * The flow postings and their payers:
 *  - Interest and scheduled principal are paid FROM HOUSEHOLD INCOME, which enters the bank as
 *    cash the way the savings inflow does (income is not yet a cash ledger — HH4 names the
 *    payer cohort by cohort). Interest is P&L (cash +, equity +); principal shrinks the loan
 *    (cash +, loan −).
 *  - A mortgage origination is endogenous money that STAYS in the household sector: the buyer's
 *    debt is the seller's deposit (loan +, deposits +).
 *  - Card/term origination is spent into the goods market at once: the money leaves to
 *    merchants (loan +, cash −), and next week's consumption boost reads the same flow on the
 *    household side.
 *  - A write-off is a write-down (loan −, equity −), never a cash event.
 */
export function runBankHouseholdLending(
  bank: Company,
  sheet: BankingSector,
  reg: Region,
  adjustedUnemploymentRate: number,
  /** DIST/HSG — stamped on each new mortgage vintage, so a cohort knows its own age. */
  currentWeek: number
): HouseholdLendingResult {
  const policyRate = reg.policyRate;
  // G3c: this bank's own cost of equity prices the consumer credit it writes.
  const bankHurdle = bankRequiredReturnAnnual(bank, reg);
  const hs = reg.householdState;
  const pools: HouseholdLoanPool[] = (sheet.householdLoans || []).map((pl) => ({ ...pl }));

  let interestWeeklyUSD = 0;
  let principalWeeklyUSD = 0;
  let debtServicePrincipalWeeklyUSD = 0;
  let lossWeeklyUSD = 0;
  let mortgageOriginationUSD = 0;
  let mortgageDischargeUSD = 0;
  let consumerCreditOriginationUSD = 0;
  let declinedOriginationUSD = 0;

  // Borrowing appetite: confident households lever up, a policy rate above neutral cools it —
  // the same behavioural form the household aggregate used, now the demand half of a priced,
  // capital-gated origination decision instead of a multiplier on the book's own drift.
  const cci = reg.householdState?.consumerConfidence ?? 100;
  const neutralRate = reg.neutralRate ?? policyRate;
  const appetite = Math.max(0, Math.min(2,
    1.0 + ((cci - 100) / 100) * 0.5 - (policyRate - neutralRate) * 4
  ));

  const unsecuredLossRateAnnual = consumerAnnualLossRate(adjustedUnemploymentRate, hs?.creditTierBooks);
  // Mortgage severity reads the sector's REAL home equity (HH2): foreclosure recovers the house
  // less the cost of selling it, against the loan — deep equity means small severity, and a
  // price crash walks severity up as LTV approaches 1.
  const housingStockUSD = Math.max(0, hs?.housingStockUSD ?? 0);
  const mortgageBookUSD = Math.max(1, hs?.mortgageDebtUSD ?? 1);
  // DIST/HSG — SEVERITY IS `E[f(LTV)]` NOW, NOT `f(E[LTV])`.
  //
  // It used to read one average LTV for the whole region — measured at 0.340 — into a curve that
  // is flat at its floor below 0.75. So `MORTGAGE_MIN_LOSS_SEVERITY` was 100% of mortgage loss
  // severity in every region in every week, the comment promising that "a price crash walks
  // severity up" described something that needed a 55% fall to begin, and the model could not
  // produce a mortgage credit event at all (§6.1). The book is vintages now, each marked against
  // the price it was written at, so the losses come from the part of the distribution that is
  // actually above the kink — which is where every dollar of real mortgage loss comes from.
  const medianHomePriceUSD = Math.max(0, reg.housingMarket?.medianHomePriceUSD ?? 0);
  const marketMortgageRate = currentMortgageRateAnnual(reg);
  const mortgagePool = pools.find((p) => p.kind === 'MORTGAGE');
  const mortgageSeverity = bookMortgageSeverity(mortgagePool?.vintages, medianHomePriceUSD);
  const mortgageLossRateAnnual = unsecuredLossRateAnnual * MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER * mortgageSeverity;

  const equityUSD = sheet.bankEquityUSD;
  const otherRwaUSD = (sheet.businessLoans || []).reduce((a, l) => a + l.principalUSD, 0);
  const headroomUSD = () => Math.max(0, equityUSD / 0.08 - (otherRwaUSD + householdBookRwaUSD(pools)));

  // This bank's share of the region's household demand ≈ its share of the existing books.
  const regionBookUSD = Math.max(1,
    (hs?.mortgageDebtUSD ?? 0) + (hs?.creditCardDebtUSD ?? 0) + (hs?.otherConsumerLoanDebtUSD ?? 0));
  const bankBookUSD = pools.reduce((a, pl) => a + pl.principalUSD, 0);
  const bankShare = Math.min(1, bankBookUSD / regionBookUSD) || 0.25;

  pools.forEach((pl) => {
    if (pl.kind === 'MORTGAGE') {
      // DIST/HSG — EVERY LOAN IS SERVICED ON ITS OWN TERMS. Each vintage pays interest at the
      // rate IT was written at and amortises on its OWN clock, so a book of old cheap loans and
      // new expensive ones behaves like one — which is what makes a mortgage book slow to
      // reprice, and what the single blended WAC could only approximate.
      const vintages = pl.vintages ?? [];
      let resetPrincipalUSD = 0;
      let interestUSD = 0;
      let scheduledUSD = 0;
      let lossUSD = 0;
      vintages.forEach((v) => {
        if (!(v.principalUSD > 0)) return;
        const vInterestUSD = (v.principalUSD * v.rateAnnual) / 52;
        const vScheduledUSD = Math.min(
          v.principalUSD,
          annuityWeeklyPrincipalUSD(v.principalUSD, v.rateAnnual, v.wamWeeks));
        // Losses fall on a vintage at ITS OWN severity: the underwater cohorts carry them, which
        // is the entire reason the book is cut this way.
        const vSeverity = mortgageSeverityAtLtv(vintageCurrentLtv(v, medianHomePriceUSD));
        // HSG — AND AT ITS OWN FREQUENCY. What makes a borrower default is the payment against
        // the income, so a cohort paying above the market rate it could get today is under more
        // strain than one paying below it. That is how a reset turns into a delinquency instead
        // of only into a cash-flow line, and it is measured off the vintage's own coupon rather
        // than stated.
        const vBurden = Math.max(0.25, Math.min(4, v.rateAnnual / Math.max(0.005, marketMortgageRate)));
        const vLossUSD = (v.principalUSD
          * unsecuredLossRateAnnual * MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER * vBurden * vSeverity) / 52;
        interestUSD += vInterestUSD;
        scheduledUSD += vScheduledUSD;
        lossUSD += vLossUSD;
        v.principalUSD = Math.max(0, v.principalUSD - vScheduledUSD - vLossUSD);
        v.wamWeeks = Math.max(0, v.wamWeeks - 1);

        // HSG — THE RESET. A fix runs out and the loan reprices to whatever the market is now.
        // This is the mechanism the model had none of: before it, a borrower only ever paid the
        // rate it agreed to, no existing household was ever reached by a rate rise, and
        // "difficulty refinancing when rates are high" could not happen to anyone (§6.1). A
        // household that borrowed at 3% now owes payments at 7%, its debt service jumps, and
        // that lands in consumption and in its own default risk below.
        v.fixedForWeeks -= 1;
        if (v.fixedForWeeks <= 0) {
          v.rateAnnual = Number(currentMortgageRateAnnual(reg).toFixed(4));
          v.fixedForWeeks = MORTGAGE_FIXED_PERIOD_WEEKS;
          resetPrincipalUSD += v.principalUSD;
        }
      });
      interestWeeklyUSD += interestUSD;
      principalWeeklyUSD += scheduledUSD;
      debtServicePrincipalWeeklyUSD += scheduledUSD;
      lossWeeklyUSD += lossUSD;

      // A sale discharges the seller's remaining loan out of the buyer's proceeds — the churn
      // that keeps gross origination from reading as pure net money creation. It retires whole
      // loans from across the book, so it comes off the vintages pro rata.
      const bookBeforeUSD = vintages.reduce((a, v) => a + v.principalUSD, 0);
      const salesVolumeUSD = (housingStockUSD * HOUSING_TURNOVER_RATE_ANNUAL / 52) * bankShare;
      const bookLtv = housingStockUSD > 0 ? Math.min(2, bookBeforeUSD / (housingStockUSD * bankShare)) : 1;
      const dischargeUSD = Math.min(bookBeforeUSD, salesVolumeUSD * bookLtv);
      if (dischargeUSD > 0 && bookBeforeUSD > 0) {
        const keep = 1 - dischargeUSD / bookBeforeUSD;
        vintages.forEach((v) => { v.principalUSD *= keep; });
      }
      mortgageDischargeUSD += dischargeUSD;

      // HSG — WHAT A BORROWER CAN AFFORD, AND THEREFORE WHAT IT BORROWS.
      //
      // Origination was `turnover x LTV x bank appetite` with the mortgage rate NOWHERE IN IT:
      // the rate was computed on the line above and used only to set the coupon, so the same
      // volume of houses changed hands at 3% and at 12%, and the only thing that could ever
      // decline a household was the BANK's capital position — a lender constraint wearing a
      // borrower's clothes (§6.1).
      //
      // What is constrained in reality is the PAYMENT, so borrowing capacity is the loan whose
      // annuity payment fits inside the lending standard: `DSTI x income / annuity factor`. The
      // annuity factor rises with the rate, so the same household borrows less at 7% than at 3%,
      // against the same house. That is how policy reaches a housing market.
      const newRate = marketMortgageRate;
      const householdsCount = Math.max(1, (reg.totalPopulation ?? 0) / AVERAGE_HOUSEHOLD_SIZE);
      const weeklyIncomePerHouseholdUSD = Math.max(0, reg.estimatedHouseholdIncomeUSD) / 52 / householdsCount;
      const affordablePaymentUSD = weeklyIncomePerHouseholdUSD * MORTGAGE_DSTI_LIMIT;
      // Invert the annuity: the principal whose weekly payment is exactly what is affordable.
      const rWeekly = Math.max(0.00001, newRate / 52);
      const annuityFactor = rWeekly / (1 - Math.pow(1 + rWeekly, -MORTGAGE_TERM_WEEKS));
      const affordableLoanUSD = affordablePaymentUSD / annuityFactor;
      const affordableLtv = medianHomePriceUSD > 0 ? affordableLoanUSD / medianHomePriceUSD : MORTGAGE_LTV_AT_ORIGINATION;
      // A buyer borrows the lesser of what the lending standard allows on LTV and what its own
      // income supports. When affordability binds, the deal is smaller.
      const bindingLtv = Math.max(0, Math.min(MORTGAGE_LTV_AT_ORIGINATION, affordableLtv));
      // ...and when it binds hard enough, the deal does not happen at all: a buyer who cannot
      // raise the loan does not complete, so TRANSACTIONS fall too, not just loan sizes. This is
      // the half of `HOUSING_TURNOVER_RATE_ANNUAL`'s constancy that belongs to the borrower.
      const affordabilityGate = Math.max(0, Math.min(1, affordableLtv / Math.max(0.01, MORTGAGE_LTV_AT_ORIGINATION)));
      const demandUSD = (housingStockUSD * HOUSING_TURNOVER_RATE_ANNUAL / 52)
        * bindingLtv * affordabilityGate * appetite * bankShare;
      const grantedUSD = Math.min(demandUSD, headroomUSD() / Math.max(0.01, MORTGAGE_RISK_WEIGHT));
      declinedOriginationUSD += demandUSD - grantedUSD;
      if (grantedUSD > 0) {
        // DIST/HSG — A NEW VINTAGE, WRITTEN AGAINST TODAY'S HOUSES AT TODAY'S RATE. It used to
        // blend into a single WAC and WAM, which is exactly how a book of distinguishable loans
        // became one average loan. Now it joins the cross-section and stays distinguishable: it
        // is this cohort that is underwater if prices fall next year, and the twenty-year-old
        // one that is not.
        vintages.push({
          principalUSD: grantedUSD,
          originationCollateralUSD: grantedUSD / MORTGAGE_LTV_AT_ORIGINATION,
          originationHomePriceUSD: Math.max(1, medianHomePriceUSD),
          rateAnnual: Number(newRate.toFixed(4)),
          wamWeeks: MORTGAGE_TERM_WEEKS,
          fixedForWeeks: MORTGAGE_FIXED_PERIOD_WEEKS,
          originatedWeek: currentWeek,
        });
        mortgageOriginationUSD += grantedUSD;
      }
      // Vintages that have amortised away leave the book rather than lingering at zero.
      pl.vintages = vintages.filter((v) => v.principalUSD > 1);
      // `principalUSD`, `wacAnnual` and `wamWeeks` are MEASUREMENTS of the vintages now — kept
      // so every existing reader still finds the one number it expects (rule 3).
      const bookUSD = pl.vintages.reduce((a, v) => a + v.principalUSD, 0);
      pl.principalUSD = bookUSD;
      pl.wacAnnual = bookUSD > 0
        ? Number((pl.vintages.reduce((a, v) => a + v.principalUSD * v.rateAnnual, 0) / bookUSD).toFixed(4))
        : Number(newRate.toFixed(4));
      pl.wamWeeks = bookUSD > 0
        ? Math.round(pl.vintages.reduce((a, v) => a + v.principalUSD * v.wamWeeks, 0) / bookUSD)
        : MORTGAGE_TERM_WEEKS;
    } else if (pl.kind === 'CREDIT_CARD') {
      const rate = policyRate + (pl.marginBps ?? 1000) / 10000;
      const interestUSD = (pl.principalUSD * rate) / 52;
      const paydownUSD = pl.principalUSD * CARD_POOL_PAYMENT_RATE_WEEKLY;
      const lossUSD = (pl.principalUSD * unsecuredLossRateAnnual) / 52;
      interestWeeklyUSD += interestUSD;
      principalWeeklyUSD += paydownUSD;
      debtServicePrincipalWeeklyUSD += pl.principalUSD * CARD_MIN_PRINCIPAL_RATE_WEEKLY;
      lossWeeklyUSD += lossUSD;
      pl.principalUSD -= paydownUSD + lossUSD;

      // The pool re-borrows what it paid down, scaled by appetite — the revolving turnover.
      const demandUSD = paydownUSD * appetite;
      const grantedUSD = Math.min(demandUSD, headroomUSD() / CONSUMER_CREDIT_RISK_WEIGHT);
      declinedOriginationUSD += demandUSD - grantedUSD;
      if (grantedUSD > 0) {
        pl.marginBps = quoteHouseholdMarginBps({
          annualLossRate: unsecuredLossRateAnnual, riskWeight: CONSUMER_CREDIT_RISK_WEIGHT,
          operatingCostBps: CARD_OPERATING_COST_BPS,
        });
        pl.principalUSD += grantedUSD;
        consumerCreditOriginationUSD += grantedUSD;
      }
    } else {
      const rate = policyRate + (pl.marginBps ?? 500) / 10000;
      const interestUSD = (pl.principalUSD * rate) / 52;
      const scheduledUSD = annuityWeeklyPrincipalUSD(pl.principalUSD, rate, pl.wamWeeks ?? CONSUMER_TERM_SEED_WAM_WEEKS);
      const lossUSD = (pl.principalUSD * unsecuredLossRateAnnual * 0.5) / 52;
      interestWeeklyUSD += interestUSD;
      principalWeeklyUSD += scheduledUSD;
      debtServicePrincipalWeeklyUSD += scheduledUSD;
      lossWeeklyUSD += lossUSD;
      pl.principalUSD -= scheduledUSD + lossUSD;

      const demandUSD = scheduledUSD * appetite;
      const grantedUSD = Math.min(demandUSD, headroomUSD() / CONSUMER_CREDIT_RISK_WEIGHT);
      declinedOriginationUSD += demandUSD - grantedUSD;
      if (grantedUSD > 0) {
        const total = pl.principalUSD + grantedUSD;
        pl.marginBps = quoteHouseholdMarginBps({
          annualLossRate: unsecuredLossRateAnnual * 0.5, riskWeight: CONSUMER_CREDIT_RISK_WEIGHT,
          operatingCostBps: CONSUMER_TERM_OPERATING_COST_BPS, requiredReturnAnnual: bankHurdle,
        });
        pl.wamWeeks = Math.round((((pl.wamWeeks ?? CONSUMER_TERM_SEED_WAM_WEEKS) - 1) * pl.principalUSD + CONSUMER_TERM_WEEKS * grantedUSD) / Math.max(1, total));
        pl.principalUSD = total;
        consumerCreditOriginationUSD += grantedUSD;
      } else if (pl.wamWeeks) {
        pl.wamWeeks = Math.max(1, pl.wamWeeks - 1);
      }
    }
    pl.principalUSD = Math.max(0, Number(pl.principalUSD.toFixed(0)));
  });

  const consumerLoanBookUSD = Number(pools.reduce((a, pl) => a + pl.principalUSD, 0).toFixed(0));
  return {
    sheet: {
      ...sheet,
      householdLoans: pools,
      consumerLoanBookUSD,
      // Interest is NOT posted here: it accrues on the PRIOR book and evolveBankingSector
      // posts it (cash +, equity +, and the NIM statistic) exactly as the business book's —
      // the caller passes the accrual in. Principal comes home from household income as cash
      // (boundary in, like the savings inflow); card/term origination leaves at once to
      // merchants.
      cashReservesUSD: sheet.cashReservesUSD + principalWeeklyUSD - consumerCreditOriginationUSD,
      bankEquityUSD: sheet.bankEquityUSD - lossWeeklyUSD,
      // The buyer's new debt is the seller's new deposit, net of the seller's own loan the
      // sale proceeds retire — deposits grow with NET mortgage credit, not gross churn.
      depositsUSD: sheet.depositsUSD + mortgageOriginationUSD - mortgageDischargeUSD,
    },
    interestWeeklyUSD,
    principalWeeklyUSD,
    debtServicePrincipalWeeklyUSD,
    lossWeeklyUSD,
    mortgageOriginationUSD,
    mortgageDischargeUSD,
    consumerCreditOriginationUSD,
    declinedOriginationUSD,
  };
}


/**
 * Who funds this bank's assets, in the order reality fills them: real household deposits, then
 * real corporate deposits, and wholesale money for whatever is still uncovered.
 *
 * SETL2: corporate deposits fund the bank like any other real balance — company payments settle
 * through bank books now, so the line has reserves behind it.
 *
 * Idempotent: derived from the assets and equity actually present, so re-applying is safe.
 */
export function applyBankFundingSplit(sheet: BankingSector, householdDepositsUSD: number): void {
  const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {}).reduce((a: number, v) => a + (Number(v) || 0), 0);
  const fundingNeedUSD = Number((
    sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD + sheet.cashReservesUSD - sheet.bankEquityUSD
  ).toFixed(0));
  sheet.depositsUSD = Math.min(fundingNeedUSD, Math.max(0, householdDepositsUSD));
  const afterHouseholdUSD = Math.max(0, fundingNeedUSD - sheet.depositsUSD);
  const realDepositsUSD = Math.max(0, sheet.corporateDepositsUSD ?? 0)
    + Math.max(0, sheet.institutionalDepositsUSD ?? 0)
    + Math.max(0, sheet.unmodeledDepositsUSD ?? 0)
    + Math.max(0, sheet.smeDepositsUSD ?? 0);
  const otherDepositsUSD = Math.min(afterHouseholdUSD, realDepositsUSD);
  sheet.wholesaleFundingUSD = Math.max(0, afterHouseholdUSD - otherDepositsUSD);
}
