import { levelPaymentFactor } from '../../../domain/pricing';
import { defect } from '../../../domain/defect';
import { housingStockValueLocal } from '../../../domain/housing';
import type { Ticker } from '../../../domain/ids';
import { openingCashOf, stashSeedHouseholdLine, seedHouseholdLineOf, seedBankBookLocalOf } from '../../ledger/accounts';
/**
 * G2 — itemized bank lending and endogenous money.
 *
 * The business loan book stops being a formula scalar and becomes what it is in reality: a
 * list of real loans to named borrowers on named banks' books. Two borrower classes exist
 * before MS brings households:
 *
 *   - **SME pools** — the private-sector segments. The seed scalar (`debtLocal = 2 × revenue`,
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

import { Preferences } from '../../../domain/preferences';
import { Company, Region, RegionId } from '../../../types';
import { costOfCapitalOf, riskFreeRateOf } from '../../../domain/company-week/cost-of-capital';
import { BankingSector, BankLoan, HouseholdLoanPool, HouseholdLoanKind,
  MORTGAGE_RISK_WEIGHT, CONSUMER_CREDIT_RISK_WEIGHT, householdBookRwaLocal, annuityWeeklyPrincipalLocal,
  MORTGAGE_TERM_WEEKS, MORTGAGE_SEED_WAM_WEEKS, CONSUMER_TERM_WEEKS, CONSUMER_TERM_SEED_WAM_WEEKS,
  MORTGAGE_SEED_VINTAGE_COHORTS, MortgageVintage, bookMortgageSeverity, vintageCurrentLtv,
  MORTGAGE_FIXED_PERIOD_WEEKS, MORTGAGE_DSTI_LIMIT,
  mortgageSeverityAtLtv,
  MORTGAGE_SEED_SPREAD_OVER_10Y_BPS, MORTGAGE_OPERATING_COST_BPS, CARD_POOL_PAYMENT_RATE_WEEKLY, CARD_MIN_PRINCIPAL_RATE_WEEKLY,
  CARD_OPERATING_COST_BPS,
  CONSUMER_TERM_OPERATING_COST_BPS, HOUSING_TURNOVER_SEED_RATE_ANNUAL, housingTurnoverAnnual, MORTGAGE_LTV_AT_ORIGINATION,
  MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER, bankRunsOffItsBook } from '../../../domain/banking';
import { AVERAGE_HOUSEHOLD_SIZE } from '../../../domain/region-macro';
import { SmePool } from '../../../domain/region-macro';
import { bookPnL } from '../../ledger/bank-book';
import { remainingLifeExpectancyYears, medianAdultAgeYears } from '../../bootstrap/population';
import { creditRecoveryRate, computeAnnualDefaultProbability } from './shared-helpers';
import { V2World } from '../../../engine2/world';
import { MIN_CASH_BUFFER_RATIO } from '../../macro/banking';
import { facilityBookOf } from '../../../engine2/tranches';

/** Covenant-style ceiling on SME pool leverage — the same real lending constraint the bond
 * market's covenant ladder expresses (§5-RV's "lenders do not fund unlimited leverage"). */
const SME_SERVICEABLE_LEVERAGE = 3.0;
// The pricing rules and their capital constants live in domain/bank-pricing.ts (§5-STRUCT
// step 2), where their tests are; re-exported here so no call site moved.
export {
  BANK_WORKING_CAPITAL_RATIO, BANK_TARGET_ROE,
  quoteLoanMarginBps, quoteHouseholdMarginBps, consumerAnnualLossRate, consumerTermAnnualLossRate,
} from '../../../domain/bank-pricing';
import {
  BANK_WORKING_CAPITAL_RATIO, BANK_MIN_CAPITAL_RATIO,
  quoteLoanMarginBps, quoteHouseholdMarginBps, consumerAnnualLossRate, consumerTermAnnualLossRate,
} from '../../../domain/bank-pricing';
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
/**
 * THIS bank's cost of equity: the risk-free rate its own region prints, plus its own measured
 * beta against the equity risk premium. The price of every loan it writes rides on it.
 */
export function bankRequiredReturnAnnual(bank: { beta?: number; management?: Preferences }, reg: Region): number {
  // §5-BRAINS — the premium weighted by this bank's own risk aversion: a cautious bank prices
  // every loan off a higher hurdle. The median bank prices off the stated premium.
  // §3.26-d: one owner of the number (`domain/company-week/cost-of-capital.ts`); the 1% floor it
  // carried was a bound where the rate itself is the answer (rule 6).
  return costOfCapitalOf(bank, riskFreeRateOf(reg));
}
/** Share of the gap to the serviceable ceiling the SME pools seek to borrow each week when
 * credit is free — the pace of a real investment pipeline (MS/BP make segment investment
 * demand fully real; this is its flow rate, not its price test). */
const SME_WEEKLY_DEMAND_TAKEUP = 0.01;

export const smePoolId = (regionId: RegionId, industry: string) => `${regionId}_SEG_${industry}`;

/** The pool's PD from its own real default experience — the segment's annual default rate. */
function smePoolAnnualPd(seg: SmePool): number {
  return Math.max(0.002, Math.min(0.25, seg.defaultRateAnnualPct));
}

export { bankRwaLocal } from '../../../domain/bank-pricing';
import { bankRwaLocal } from '../../../domain/bank-pricing';
import { businessLoanBookOf } from '../../../domain/banking';
import { seedLoanBookLocal } from '../../macro/initialization';

/**
 * SEED MIGRATION (§7.4: the cold start opens in the engine's shape). Recalibrates each
 * region's SME debt to min(serviceable, capital-carriable), itemizes it onto the named banks
 * by deposit share and across segments by EBITDA share, and re-derives the funding side so
 * every sheet still balances. The remainder of the old `debtLocal = 2 × revenue` scalar is
 * DELETED — it never had a lender, never serviced interest, and priced nothing (the §6
 * recalibration row, executed).
 */
/** §5-WIRES D — the seed's STATED loan book, this bank's share of it (the generator's split by
 *  market share). Read by the seed's own sizing arithmetic (the opening funding side, the
 *  consumer book HH3's real pools replace); never stored on a sheet. */
export function seedLoanBookShareLocal(reg: Region, bank: Company, book: 'business' | 'consumer'): number {
  return seedLoanBookLocal(reg.lastWeekNominalGdpLocal, book) * (bank.bankMarketShare ?? 0.25);
}
function seedConsumerLoanBookLocal(reg: Region, bank: Company): number { return seedLoanBookShareLocal(reg, bank, 'consumer'); }
function seedConsumerRwaLocal(reg: Region, bank: Company): number {
  return seedConsumerLoanBookLocal(reg, bank) * CONSUMER_CREDIT_RISK_WEIGHT;
}

export function migrateSmeDebtAtSeed(
  /** Step 10: the seed's world — a bank's facility book is its rows on the borrowers' ladders. */
  v2: V2World,
  regionId: RegionId,
  reg: Region,
  banks: Company[]
): void {
  const segs = reg.smePools;
  const segEbitdaLocal = segs.map((s) => Math.max(0, s.annualRevenueLocal * s.marginPct));
  const totalEbitdaLocal = segEbitdaLocal.reduce((a, b) => a + b, 0);
  if (!(totalEbitdaLocal > 0) || banks.length === 0) return;

  const serviceableLocal = totalEbitdaLocal * SME_SERVICEABLE_LEVERAGE;
  const totalEquityLocal = banks.reduce((a, b) => a + b.bankBalanceSheet!.bankEquityLocal, 0);
  // §5-WIRES D: the sheets carry no loan-book scalar; what the seed's stated consumer book
  // still occupies of each bank's capital (until HH3 replaces it with real pools) is counted
  // through the same stated number HH3 replaces — the two migrations read one seed.
  const usedRwaLocal = banks.reduce((a, b) => a + bankRwaLocal(b.bankBalanceSheet!, facilityBookOf(v2, b.id)) + seedConsumerRwaLocal(reg, b), 0);
  const carriableLocal = Math.max(0, totalEquityLocal / BANK_WORKING_CAPITAL_RATIO - usedRwaLocal);
  const migratedLocal = Math.min(serviceableLocal, carriableLocal);

  const totalDepositsLocal = banks.reduce((a, b) => a + seedHouseholdLineOf(b.bankBalanceSheet!), 0) || 1;
  banks.forEach((bank) => {
    const sheet = bank.bankBalanceSheet!;
    const bankHurdle = bankRequiredReturnAnnual(bank, reg);
    const bankShare = seedHouseholdLineOf(sheet) / totalDepositsLocal;
    const loans: BankLoan[] = [];
    segs.forEach((seg, i) => {
      const principalLocal = Math.round(migratedLocal * bankShare * (segEbitdaLocal[i] / totalEbitdaLocal));
      if (principalLocal <= 0) return;
      loans.push({
        id: `${bank.ticker}-SME-${seg.industry}`,
        borrowerId: smePoolId(regionId, seg.industry),
        borrowerKind: 'SME_POOL',
        principalLocal,
        marginBps: quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: bankHurdle, recoveryRate: creditRecoveryRate(reg) }),
        originationWeek: 0,
        termWeeks: 52 * 5,
        status: 'PERFORMING',
      });
    });
    sheet.businessLoans = loans;
    // The book IS its loans — the old scalar's corporate-floating content (07d's market, the
    // double-count) leaves the bank sheet entirely. Funding side re-derived so the sheet still
    // balances (same discipline as the WS6 seed); the consumer side is the seed's stated book
    // until HH3 seeds the real pools and re-derives this again.
    const sovLocal = seedBankBookLocalOf(sheet); // §3.13-BOOK d3b: the seed's stash, issued by wire at `openSeededBooks`
    stashSeedHouseholdLine(sheet, Math.round((
      businessLoanBookOf(sheet, facilityBookOf(v2, bank.id)) + seedConsumerLoanBookLocal(reg, bank) + sovLocal + openingCashOf(sheet) - sheet.bankEquityLocal
    )));
  });

  // The segments' recorded debt becomes the loans that actually exist.
  const migratedBySegment = new Map<string, number>();
  banks.forEach((bank) => bank.bankBalanceSheet!.businessLoans.forEach((l) => {
    migratedBySegment.set(l.borrowerId, (migratedBySegment.get(l.borrowerId) ?? 0) + l.principalLocal);
  }));
  segs.forEach((seg) => {
    seg.debtLocal = migratedBySegment.get(smePoolId(regionId, seg.industry)) ?? 0;
  });
}

interface WeeklyLendingResult {
  sheet: BankingSector;
  /** Real interest the bank earned on its itemized book this week (cash + equity legs are the
   * caller's to post — evolve's income line carries it so NIM stays one statistic). */
  loanInterestWeeklyLocal: number;
  /** Real write-offs this week (loan − and equity − legs applied here). */
  loanLossWeeklyLocal: number;
  declinedOriginationLocal: number;
  /** SEG2e — this week's SME origination per industry. The caller (02b) books the deposit
   * half through settlement (BANK_CREDIT → SEGMENT), so the pool's new money lands on its own
   * line with no reserve move; the loan half was already written in place here. */
  smeOriginationBySegment: Map<string, number>;
}

/**
 * One bank's weekly loan-book operations on its SME rows: interest accrual at each pool's own
 * real terms, pool losses at the pool's own real default rate, and SME origination as a PRICED
 * decision under the bank's real capital constraint.
 *
 * §5-FINALIZATION step 10: the corporate facilities are NOT rows here. A facility is the tranche
 * on the borrower's ladder, and the lender's book is a read of those rows (`facilityBookOf`,
 * engine2/tranches.ts) — one ledger, so the weekly sync that mirrored the ladders into loan
 * rows (and drifted between syncs: O4 lived on that drift) is gone with the rows.
 */
/**
 * §3.20c-ii — THE BORROWER SHOPS. A pool's week of demand used to be split across the region's
 * banks by each bank's share of the pool's EXISTING loans, so a bank that quoted wide lost no
 * volume to one that quoted tight and a bank running its book off handed its share to nobody.
 * Now the region plans the week once: every bank that is lending quotes each pool its all-in
 * rate (its own hurdle through the one loan price), the pool's demand at a quote is its own
 * hurdle test against that quote (`appetite`), and the banks are walked KEENEST FIRST — each
 * takes what the pool still wants at its price, up to the capital headroom it has left across
 * every pool. A wide quote is a lost loan; the price of credit is the keenest bank's; what no
 * bank's headroom covers at any quote the pool wanted is declined. Housing already shops this
 * way (`currentMortgageRateAnnual`); the business book now does the same.
 */
export function planSmeShopping(
  offers: readonly { bank: Company; sheet: BankingSector }[],
  reg: Region,
  regionId: RegionId
): { grantedByBankTicker: Map<Ticker, Map<string, number>>; declinedLocal: number } {
  const policyRate = reg.policyRateAnnual;
  const grantedByBankTicker = new Map<Ticker, Map<string, number>>();
  let declinedLocal = 0;
  const lenders = offers
    .filter(({ sheet }) => !bankRunsOffItsBook(sheet))
    .map(({ bank, sheet }) => ({
      bank,
      hurdle: bankRequiredReturnAnnual(bank, reg),
      headroomLocal: Math.max(0, sheet.bankEquityLocal / BANK_MIN_CAPITAL_RATIO
        - (sheet.businessLoans.reduce((a, l) => a + l.principalLocal, 0) + householdBookRwaLocal(sheet.householdLoans))),
    }));
  reg.smePools.forEach((seg) => {
    const ebitdaLocal = Math.max(0, seg.annualRevenueLocal * seg.marginPct);
    const ceilingLocal = ebitdaLocal * SME_SERVICEABLE_LEVERAGE;
    const weekDemandLocal = Math.max(0, ceilingLocal - (seg.debtLocal || 0)) * SME_WEEKLY_DEMAND_TAKEUP;
    if (weekDemandLocal <= 0) return;
    const poolReturnAnnual = Math.max(0.001, seg.marginPct);
    const quotes = lenders.map((l) => {
      const allInRateAnnual = policyRate + quoteLoanMarginBps({
        annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: l.hurdle,
        recoveryRate: creditRecoveryRate(reg),
      }) / 10000;
      // The borrower's own hurdle: it does not borrow at 12% to earn 9%.
      const appetite = Math.max(0, Math.min(1, (poolReturnAnnual - allInRateAnnual) / poolReturnAnnual));
      return { lender: l, allInRateAnnual, appetite };
    }).sort((a, b) => a.allInRateAnnual - b.allInRateAnnual || (a.lender.bank.ticker < b.lender.bank.ticker ? -1 : 1));
    let takenLocal = 0;
    quotes.forEach((q) => {
      const wantLocal = Math.max(0, weekDemandLocal * q.appetite - takenLocal);
      const grantLocal = Math.min(wantLocal, q.lender.headroomLocal);
      if (grantLocal <= 0) return;
      q.lender.headroomLocal -= grantLocal;
      takenLocal += grantLocal;
      let byPool = grantedByBankTicker.get(q.lender.bank.ticker);
      if (!byPool) { byPool = new Map(); grantedByBankTicker.set(q.lender.bank.ticker, byPool); }
      byPool.set(seg.industry, (byPool.get(seg.industry) ?? 0) + grantLocal);
    });
    // What the pool wanted at the keenest quote it was given; a pool nobody quoted wanted it all.
    const wantedLocal = quotes.length > 0 ? weekDemandLocal * quotes[0].appetite : weekDemandLocal;
    declinedLocal += Math.max(0, wantedLocal - takenLocal);
  });
  return { grantedByBankTicker, declinedLocal };
}

export function runBankWeeklyLending(
  bank: Company,
  sheet: BankingSector,
  reg: Region,
  regionId: RegionId,
  nextWeek: number,
  /** §3.20c-ii: what the region's shopping plan sent this bank, per industry. */
  shoppedByIndustry: ReadonlyMap<string, number>
): WeeklyLendingResult {
  const policyRate = reg.policyRateAnnual;
  // G3c: every price this bank quotes below rides on ITS OWN cost of equity.
  const bankHurdle = bankRequiredReturnAnnual(bank, reg);
  let loans = [...sheet.businessLoans];

  // ---- Interest at each pool's own terms; the payer is the pool's own account (02b pays it
  // SEGMENT → BANK through settlement). ----
  let loanInterestWeeklyLocal = 0;
  loans.forEach((l) => {
    if (l.status !== 'PERFORMING') return;
    loanInterestWeeklyLocal += (l.principalLocal * (policyRate + l.marginBps / 10000)) / 52;
  });

  // ---- SME losses at the pool's own real default rate — the bank's measured loss experience,
  // replacing the contagion formula for the itemized book. ----
  let loanLossWeeklyLocal = 0;
  const segByPool = new Map(reg.smePools.map((s) => [smePoolId(regionId, s.industry), s]));
  loans = loans.map((l) => {
    const seg = segByPool.get(l.borrowerId);
    if (!seg) return l;
    const lossLocal = (l.principalLocal * smePoolAnnualPd(seg) * (1 - creditRecoveryRate(reg))) / 52;
    loanLossWeeklyLocal += lossLocal;
    return { ...l, principalLocal: l.principalLocal - lossLocal };
  });

  // ---- SME origination: priced, capital-gated, and SHOPPED (§3.20c-ii) — the region's plan
  // decided which bank writes what at whose quote; this books what came to this bank. The
  // declined demand is the plan's, counted once by the caller. §3.20c-i's run-off is the
  // plan's too: a bank whose book loses money quoted nothing. ----
  const declinedOriginationLocal = 0;
  const smeOriginationBySegment = new Map<string, number>();
  reg.smePools.forEach((seg) => {
    const poolId = smePoolId(regionId, seg.industry);
    const poolLoan = loans.find((l) => l.borrowerId === poolId);
    const grantedLocal = shoppedByIndustry.get(seg.industry) ?? 0;
    if (grantedLocal <= 0) return;

    smeOriginationBySegment.set(seg.industry, (smeOriginationBySegment.get(seg.industry) ?? 0) + grantedLocal);
    const marginBps = quoteLoanMarginBps({ annualDefaultProbability: smePoolAnnualPd(seg), riskWeight: 1.0, requiredReturnAnnual: bankHurdle, recoveryRate: creditRecoveryRate(reg) });
    if (poolLoan) {
      poolLoan.principalLocal += grantedLocal;
      // the pool's blended margin drifts toward the new quote as new money joins the book
      poolLoan.marginBps = Math.round((poolLoan.marginBps * (poolLoan.principalLocal - grantedLocal) + marginBps * grantedLocal) / Math.max(1, poolLoan.principalLocal));
    } else {
      loans.push({
        id: `${bank.ticker}-SME-${seg.industry}`,
        borrowerId: poolId, borrowerKind: 'SME_POOL', principalLocal: grantedLocal,
        marginBps, originationWeek: nextWeek, termWeeks: 52 * 5, status: 'PERFORMING',
      });
    }
    // Loans create deposits: the pool's money and the bank's loan appear together. The pool's
    // deposit sits in the bank's household/SME funding line (segments are not yet cash-ledger
    // actors — MS's item); no reserves move, which is the point.
    seg.debtLocal += grantedLocal;
    // SEG-D: the pool SPENDS it — but through its BOOK, not by having its capex number
    // incremented here. The origination arrives as a real deposit (the BANK_CREDIT payment 02b
    // issues), which raises the pool's cash, which raises what the SME-pool stage will let it
    // invest. Same transmission chain, now with a budget constraint in the middle: a pool that
    // is short of payroll spends the money on payroll instead, which is what a real small firm
    // does with a credit line when it is squeezed.
  });

  return {
    sheet: {
      ...bookPnL(sheet, -loanLossWeeklyLocal, 'business loan losses', bank.ticker),
      businessLoans: loans,
      // SEG2e: loans still create deposits, but the pool's new money lands on ITS OWN account
      // through settlement — the caller pays BANK_CREDIT → SEGMENT with the per-segment map
      // below (the pool's row at this bank IS the bank's SME line), with no reserve move.
      // Step 10: a facility draw is the same deposit creation, and its asset half is the ladder
      // row the borrower's stage wrote — nothing here books, syncs or writes it off; a facility
      // that leaves a ladder leaves the lender's book in the same write (an estate's write-off
      // moves the lender's equity there, a merger or resolution wires the lender).
    },
    loanInterestWeeklyLocal,
    loanLossWeeklyLocal,
    declinedOriginationLocal,
    smeOriginationBySegment,
  };
}

// ============================== HH3 — the household books ==============================

/**
 * The unsecured book's annual loss rate from the tier mix and the real unemployment print —
 * moved here from evolveBankingSector so the loss lands on the itemized pool that bears it.
 */
/**
 * HSG — the going mortgage rate: the KEENEST quote in the region, because a borrower shops.
 *
 * It was the cleared 10Y plus a flat 170bp that every bank charged every borrower. The banks
 * quote their own books now — own loss experience, own risk weight, own cost of equity — and the
 * best of those is what a household actually gets. The seed spread stands in only until the first
 * bank pass has run (§7.4).
 */
export function currentMortgageRateAnnual(reg: Region): number {
  const quoted = reg.housingMarket.bestMortgageRateAnnual;
  if (quoted !== undefined && quoted > 0) return quoted;
  return Math.max(0.005, (reg.zeroRates.tenor10Y) + MORTGAGE_SEED_SPREAD_OVER_10Y_BPS / 10000);
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
  v2: V2World,
  regionId: RegionId,
  reg: Region,
  banks: Company[]
): void {
  const hs = reg.householdState;
  if (banks.length === 0) return;
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
    annualLossRate: consumerTermAnnualLossRate(lossRate), riskWeight: CONSUMER_CREDIT_RISK_WEIGHT, operatingCostBps: CONSUMER_TERM_OPERATING_COST_BPS,
    requiredReturnAnnual: seedHurdle,
  });

  const totalDepositsLocal = banks.reduce((a, b) => a + seedHouseholdLineOf(b.bankBalanceSheet!), 0) || 1;
  banks.forEach((bank) => {
    const sheet = bank.bankBalanceSheet!;
    const share = seedHouseholdLineOf(sheet) / totalDepositsLocal;
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
        const bookLocal = Math.round((hs.mortgageDebtLocal) * share);
        const priceNowLocal = Math.max(1, reg.housingMarket.medianHomePriceLocal);
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
            principalLocal: Math.max(0, remainingShare),
            originationCollateralLocal: 1 / MORTGAGE_LTV_AT_ORIGINATION,
            originationHomePriceLocal: priceNowLocal,
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
        const rawTotal = raw.reduce((a, v) => a + v.principalLocal, 0) || 1;
        const scale = bookLocal / rawTotal;
        const vintages = raw.map((v) => ({
          ...v,
          principalLocal: v.principalLocal * scale,
          originationCollateralLocal: v.originationCollateralLocal * scale,
        }));
        return {
          kind: 'MORTGAGE' as const,
          principalLocal: bookLocal,
          vintages,
          wacAnnual: Number(mortgageRate.toFixed(4)),
          wamWeeks: MORTGAGE_SEED_WAM_WEEKS,
        };
      })(),
      {
        kind: 'CREDIT_CARD',
        principalLocal: Math.round((hs.creditCardDebtLocal) * share),
        marginBps: cardMarginBps,
      },
      {
        kind: 'CONSUMER_TERM',
        principalLocal: Math.round((hs.otherConsumerLoanDebtLocal) * share),
        marginBps: termMarginBps,
        wamWeeks: CONSUMER_TERM_SEED_WAM_WEEKS,
      },
    ] as HouseholdLoanPool[]).filter((pl) => pl.principalLocal > 0);

    // §5-WIRES D: the consumer scalar this replaces is the seed's STATED book (never stored on
    // the sheet); it stands in the prior RWA exactly as the stored copy used to.
    const replacedRwaLocal = seedConsumerRwaLocal(reg, bank);
    const facilityBookLocal = facilityBookOf(v2, bank.id);
    const priorRwaLocal = bankRwaLocal(sheet, facilityBookLocal) + replacedRwaLocal;
    const priorRatio = priorRwaLocal > 0 ? sheet.bankEquityLocal / priorRwaLocal : BANK_WORKING_CAPITAL_RATIO;
    const newHouseholdRwaLocal = householdBookRwaLocal(pools);
    sheet.householdLoans = pools;
    // Equity scales with the risk the books add, at the ratio this bank already ran — no new
    // constant, and the opening capital ratio is preserved by construction.
    sheet.bankEquityLocal = Math.round((sheet.bankEquityLocal + Math.max(0, newHouseholdRwaLocal - replacedRwaLocal) * priorRatio));
    sheet.bankCapitalRatio = Number((sheet.bankEquityLocal / Math.max(1, bankRwaLocal(sheet, facilityBookLocal))).toFixed(4));
  });

  // The household lines become the derived sums they will be every week from here on, and the
  // seed carries the flows the books imply so week 1 opens in the engine's shape, not at zero.
  const sumKind = (kind: HouseholdLoanKind) => banks.reduce(
    (a, b) => a + b.bankBalanceSheet!.householdLoans.filter((pl) => pl.kind === kind).reduce((x, pl) => x + pl.principalLocal, 0),
    0
  );
  hs.mortgageDebtLocal = sumKind('MORTGAGE');
  hs.creditCardDebtLocal = sumKind('CREDIT_CARD');
  hs.otherConsumerLoanDebtLocal = sumKind('CONSUMER_TERM');
  hs.priorMortgageDebtLocal = hs.mortgageDebtLocal;
  const policyRate = reg.policyRateAnnual;
  hs.weeklyDebtServiceLocal = Math.round((
    (hs.mortgageDebtLocal * mortgageRate
      + hs.creditCardDebtLocal * (policyRate + cardMarginBps / 10000)
      + hs.otherConsumerLoanDebtLocal * (policyRate + termMarginBps / 10000)) / 52
    + annuityWeeklyPrincipalLocal(hs.mortgageDebtLocal, mortgageRate, MORTGAGE_SEED_WAM_WEEKS)
    + annuityWeeklyPrincipalLocal(hs.otherConsumerLoanDebtLocal, policyRate + termMarginBps / 10000, CONSUMER_TERM_SEED_WAM_WEEKS)
    + hs.creditCardDebtLocal * CARD_MIN_PRINCIPAL_RATE_WEEKLY
  ));
  const housingStockLocal = housingStockValueLocal(reg.housingMarket); // §3.26b-i: the register's read
  // Seeded as the engine's own shape: NET mortgage credit — buyers' new loans at the
  // origination LTV minus sellers' remaining loans (at the book's average LTV) the sales retire.
  const seedAvgLtv = housingStockLocal > 0 ? Math.min(2, hs.mortgageDebtLocal / housingStockLocal) : 1;
  hs.weeklyMortgageOriginationLocal = Math.round((
    (housingStockLocal * HOUSING_TURNOVER_SEED_RATE_ANNUAL / 52) * Math.max(0, MORTGAGE_LTV_AT_ORIGINATION - seedAvgLtv)
  ));
  hs.weeklyNewConsumerCreditLocal = Math.round((
    hs.creditCardDebtLocal * CARD_POOL_PAYMENT_RATE_WEEKLY
    + annuityWeeklyPrincipalLocal(hs.otherConsumerLoanDebtLocal, policyRate + termMarginBps / 10000, CONSUMER_TERM_SEED_WAM_WEEKS)
  ));
}

interface HouseholdLendingResult {
  sheet: BankingSector;
  /** Interest accrued at the pools' own terms — REPORT ONLY (the caller passes the prior-book
   * accrual to evolveBankingSector, which posts it; posting here too would double-count). */
  interestWeeklyLocal: number;
  /** ALL principal retired from income this week (annuity arithmetic + revolving turnover). */
  principalWeeklyLocal: number;
  /** The REQUIRED slice of that principal — annuity schedules plus card minimums. Turnover a
   * transactor cycles through a card is spending already counted in consumption, not burden. */
  debtServicePrincipalWeeklyLocal: number;
  /** Sellers' remaining mortgages repaid out of sale proceeds — funded by the buyers' new
   * loans, so the household sector's net deposit gain is origination minus this. */
  mortgageDischargeLocal: number;
  /** Real write-offs this week (loan − and equity − applied here). */
  lossWeeklyLocal: number;
  mortgageOriginationLocal: number;
  consumerCreditOriginationLocal: number;
  declinedOriginationLocal: number;
  /** HSG — what THIS bank quoted a mortgage at this week. The region keeps the best of them. */
  mortgageRateQuotedAnnual: number;
  /** HSG — the turnover its own vintage cross-section implies. The region keeps the book-weighted mean. */
  turnoverRateAnnual: number;
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
  const policyRate = reg.policyRateAnnual;
  // G3c: this bank's own cost of equity prices the consumer credit it writes.
  const bankHurdle = bankRequiredReturnAnnual(bank, reg);
  const hs = reg.householdState;
  const pools: HouseholdLoanPool[] = sheet.householdLoans.map((pl) => ({ ...pl }));

  let interestWeeklyLocal = 0;
  let principalWeeklyLocal = 0;
  let debtServicePrincipalWeeklyLocal = 0;
  let lossWeeklyLocal = 0;
  let mortgageOriginationLocal = 0;
  let mortgageDischargeLocal = 0;
  let consumerCreditOriginationLocal = 0;
  let declinedOriginationLocal = 0;

  // Borrowing appetite: households whose real wages are rising lever up, a policy rate above
  // neutral cools it — the demand half of a priced, capital-gated origination decision. §3.18-i:
  // the confidence index this read is gone; its content was real wage growth (the index's
  // equilibrium was 150 × that on a 100 base, read at 0.5 per unit, so 0.75 per unit of real
  // wage growth), and the ×2 cap is gone with it (rule 6). An appetite cannot be negative.
  const neutralRate = reg.neutralRateAnnual;
  const appetite = Math.max(0, 1.0 + ((hs.wageGrowthAnnual) - reg.inflationAnnual) * 0.75 - (policyRate - neutralRate) * 4);

  const unsecuredLossRateAnnual = consumerAnnualLossRate(adjustedUnemploymentRate, hs.creditTierBooks);
  // Mortgage severity reads the sector's REAL home equity (HH2): foreclosure recovers the house
  // less the cost of selling it, against the loan — deep equity means small severity, and a
  // price crash walks severity up as LTV approaches 1.
  const housingStockLocal = housingStockValueLocal(reg.housingMarket); // §3.26b-i: the register's read, not the sheet's carried line
  // DIST/HSG — SEVERITY IS `E[f(LTV)]` NOW, NOT `f(E[LTV])`.
  //
  // It used to read one average LTV for the whole region — measured at 0.340 — into a curve that
  // is flat at its floor below 0.75. So `MORTGAGE_MIN_LOSS_SEVERITY` was 100% of mortgage loss
  // severity in every region in every week, the comment promising that "a price crash walks
  // severity up" described something that needed a 55% fall to begin, and the model could not
  // produce a mortgage credit event at all (§6.1). The book is vintages now, each marked against
  // the price it was written at, so the losses come from the part of the distribution that is
  // actually above the kink — which is where every dollar of real mortgage loss comes from.
  const medianHomePriceLocal = Math.max(0, reg.housingMarket.medianHomePriceLocal);
  // §3.26b-ii — what changed hands this week, at the price it struck: the base every mortgage
  // flow below is written on. The book clears in 02 before this pass runs, so it is this week's.
  const unitsChangedHandsThisWeek = reg.housingMarket.unitsClearedThisWeek
    ?? defect(`${reg.id}: the mortgage pass ran before the week's dwelling book cleared`);
  const clearedTurnoverLocal = unitsChangedHandsThisWeek * medianHomePriceLocal;
  const mortgagePool = pools.find((p) => p.kind === 'MORTGAGE');
  const mortgageSeverity = bookMortgageSeverity(mortgagePool?.vintages, medianHomePriceLocal);
  const mortgageLossRateAnnual = unsecuredLossRateAnnual * MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER * mortgageSeverity;

  // HSG — THIS BANK'S OWN MORTGAGE QUOTE, off its own book. `MORTGAGE_SPREAD_OVER_10Y_BPS = 170`
  // had every bank charging every borrower the same spread, in a file whose own `BankLoan.marginBps`
  // doc says a margin is "quoted by the bank's own credit arithmetic at origination, the same
  // expected-loss + capital-cost pricing the bond market uses". The household book uses it now:
  // the loss rate this bank's OWN vintages are running (frequency x the severity its own LTV
  // cross-section implies), the mortgage risk weight, its own cost of equity and its own
  // servicing cost. A bank whose book is underwater quotes wider, which is what a credit
  // tightening looks like from the lender's side.
  // HSG — THIS WEEK'S TURNOVER, measured off the bank's own vintage cross-section.
  //
  // Every owner sells once per tenure — the estate does it if the owner does not — and an owner
  // trades up when today's income at today's quote supports a bigger loan than the one it took.
  // The second is a real share of the book, because every vintage remembers the house it was
  // written against, so turnover rises as rates fall and falls back to the forced-move floor as
  // they rise. `HOUSING_TURNOVER_RATE_ANNUAL` decided all of that with one number.
  const bankMortgageRate = Math.max(0.005,
    (reg.zeroRates.tenor10Y)
    + quoteHouseholdMarginBps({
      annualLossRate: mortgageLossRateAnnual,
      riskWeight: MORTGAGE_RISK_WEIGHT,
      operatingCostBps: MORTGAGE_OPERATING_COST_BPS,
      requiredReturnAnnual: bankHurdle,
    }) / 10000);
  const marketMortgageRate = bankMortgageRate;

  // The lending standard, hoisted: what one household's income supports at THIS bank's quote.
  // Both the turnover rate below and the origination block further down read it, and computing it
  // twice is how two answers to one question appear (rule 4).
  const householdsCount = Math.max(1, (reg.totalPopulation) / AVERAGE_HOUSEHOLD_SIZE);
  const weeklyIncomePerHouseholdLocal = Math.max(0, reg.estimatedHouseholdIncomeLocal) / 52 / householdsCount;
  const rWeekly = Math.max(0.00001, marketMortgageRate / 52);
  const affordableLoanLocal = (weeklyIncomePerHouseholdLocal * MORTGAGE_DSTI_LIMIT)
    / levelPaymentFactor(rWeekly, MORTGAGE_TERM_WEEKS);

  // HSG — TURNOVER IS AN OUTCOME. The share of the book that can now afford more than it
  // borrowed is a real measurement, because every vintage remembers the house it was written
  // against; the forced-move floor is one sale per tenure, and a tenure is what the hazard says
  // an owner of the median adult age has left. See `housingTurnoverAnnual`.
  const mortgageBookNowLocal = (mortgagePool?.vintages ?? []).reduce((a, v) => a + v.principalLocal, 0);
  const tradeUpLocal = (mortgagePool?.vintages ?? []).reduce((a, v) => {
    const originalLoanLocal = Math.max(0, v.originationCollateralLocal) * MORTGAGE_LTV_AT_ORIGINATION;
    return a + (affordableLoanLocal > originalLoanLocal ? v.principalLocal : 0);
  }, 0);
  const turnoverRateAnnual = housingTurnoverAnnual({
    tenureYears: remainingLifeExpectancyYears(medianAdultAgeYears(reg.ageDistribution)),
    tradeUpShare: mortgageBookNowLocal > 0 ? tradeUpLocal / mortgageBookNowLocal : 0,
  });

  const equityLocal = sheet.bankEquityLocal;
  const otherRwaLocal = sheet.businessLoans.reduce((a, l) => a + l.principalLocal, 0);
  // §3.20c-i: a bank whose book loses money writes nothing new — it runs the book off.
  const headroomLocal = () => bankRunsOffItsBook(sheet) ? 0 : Math.max(0, equityLocal / 0.08 - (otherRwaLocal + householdBookRwaLocal(pools)));

  // This bank's share of the region's household demand ≈ its share of the existing books.
  const regionBookLocal = Math.max(1,
    (hs.mortgageDebtLocal) + (hs.creditCardDebtLocal) + (hs.otherConsumerLoanDebtLocal));
  const bankBookLocal = pools.reduce((a, pl) => a + pl.principalLocal, 0);
  const bankShare = Math.min(1, bankBookLocal / regionBookLocal) || 0.25;

  pools.forEach((pl) => {
    if (pl.kind === 'MORTGAGE') {
      // DIST/HSG — EVERY LOAN IS SERVICED ON ITS OWN TERMS. Each vintage pays interest at the
      // rate IT was written at and amortises on its OWN clock, so a book of old cheap loans and
      // new expensive ones behaves like one — which is what makes a mortgage book slow to
      // reprice, and what the single blended WAC could only approximate.
      const vintages = pl.vintages ?? [];
      let interestLocal = 0;
      let scheduledLocal = 0;
      let lossLocal = 0;
      vintages.forEach((v) => {
        if (!(v.principalLocal > 0)) return;
        const vInterestLocal = (v.principalLocal * v.rateAnnual) / 52;
        const vScheduledLocal = Math.min(
          v.principalLocal,
          annuityWeeklyPrincipalLocal(v.principalLocal, v.rateAnnual, v.wamWeeks));
        // Losses fall on a vintage at ITS OWN severity: the underwater cohorts carry them, which
        // is the entire reason the book is cut this way.
        const vSeverity = mortgageSeverityAtLtv(vintageCurrentLtv(v, medianHomePriceLocal));
        // HSG — AND AT ITS OWN FREQUENCY. What makes a borrower default is the payment against
        // the income, so a cohort paying above the market rate it could get today is under more
        // strain than one paying below it. That is how a reset turns into a delinquency instead
        // of only into a cash-flow line, and it is measured off the vintage's own coupon rather
        // than stated.
        const vBurden = Math.max(0.25, Math.min(4, v.rateAnnual / Math.max(0.005, marketMortgageRate)));
        const vLossLocal = (v.principalLocal
          * unsecuredLossRateAnnual * MORTGAGE_DEFAULT_FREQUENCY_MULTIPLIER * vBurden * vSeverity) / 52;
        interestLocal += vInterestLocal;
        scheduledLocal += vScheduledLocal;
        lossLocal += vLossLocal;
        v.principalLocal = Math.max(0, v.principalLocal - vScheduledLocal - vLossLocal);
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
        }
      });
      interestWeeklyLocal += interestLocal;
      principalWeeklyLocal += scheduledLocal;
      debtServicePrincipalWeeklyLocal += scheduledLocal;
      lossWeeklyLocal += lossLocal;

      // A sale discharges the seller's remaining loan out of the buyer's proceeds — the churn
      // that keeps gross origination from reading as pure net money creation. It retires whole
      // loans from across the book, so it comes off the vintages pro rata.
      const bookBeforeLocal = vintages.reduce((a, v) => a + v.principalLocal, 0);
      // §3.26b-ii — the sales are the BOOK's: the dwellings that changed hands this week at the
      // price they struck (`evolution.ts`), not the stock times a turnover rate.
      const salesVolumeLocal = clearedTurnoverLocal * bankShare;
      const bookLtv = housingStockLocal > 0 ? Math.min(2, bookBeforeLocal / (housingStockLocal * bankShare)) : 1;
      const dischargeLocal = Math.min(bookBeforeLocal, salesVolumeLocal * bookLtv);
      if (dischargeLocal > 0 && bookBeforeLocal > 0) {
        const keep = 1 - dischargeLocal / bookBeforeLocal;
        vintages.forEach((v) => { v.principalLocal *= keep; });
      }
      mortgageDischargeLocal += dischargeLocal;

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
      const affordableLtv = medianHomePriceLocal > 0 ? affordableLoanLocal / medianHomePriceLocal : MORTGAGE_LTV_AT_ORIGINATION;
      // A buyer borrows the lesser of what the lending standard allows on LTV and what its own
      // income supports. When affordability binds, the deal is smaller.
      const bindingLtv = Math.max(0, Math.min(MORTGAGE_LTV_AT_ORIGINATION, affordableLtv));
      // §3.26b-ii — and the transactions are the book's too: a buyer the book did not clear
      // borrows nothing, so the affordability gate that stood in for failed completions is gone.
      const demandLocal = clearedTurnoverLocal * bindingLtv * appetite * bankShare;
      const grantedLocal = Math.min(demandLocal, headroomLocal() / Math.max(0.01, MORTGAGE_RISK_WEIGHT));
      declinedOriginationLocal += demandLocal - grantedLocal;
      if (grantedLocal > 0) {
        // DIST/HSG — A NEW VINTAGE, WRITTEN AGAINST TODAY'S HOUSES AT TODAY'S RATE. It used to
        // blend into a single WAC and WAM, which is exactly how a book of distinguishable loans
        // became one average loan. Now it joins the cross-section and stays distinguishable: it
        // is this cohort that is underwater if prices fall next year, and the twenty-year-old
        // one that is not.
        vintages.push({
          principalLocal: grantedLocal,
          originationCollateralLocal: grantedLocal / MORTGAGE_LTV_AT_ORIGINATION,
          originationHomePriceLocal: Math.max(1, medianHomePriceLocal),
          rateAnnual: Number(newRate.toFixed(4)),
          wamWeeks: MORTGAGE_TERM_WEEKS,
          fixedForWeeks: MORTGAGE_FIXED_PERIOD_WEEKS,
          originatedWeek: currentWeek,
        });
        mortgageOriginationLocal += grantedLocal;
      }
      // Vintages that have amortised away leave the book rather than lingering at zero.
      pl.vintages = vintages.filter((v) => v.principalLocal > 1);
      // `principalLocal`, `wacAnnual` and `wamWeeks` are MEASUREMENTS of the vintages now — kept
      // so every existing reader still finds the one number it expects (rule 4).
      const bookLocal = pl.vintages.reduce((a, v) => a + v.principalLocal, 0);
      pl.principalLocal = bookLocal;
      pl.wacAnnual = bookLocal > 0
        ? Number((pl.vintages.reduce((a, v) => a + v.principalLocal * v.rateAnnual, 0) / bookLocal).toFixed(4))
        : Number(newRate.toFixed(4));
      pl.wamWeeks = bookLocal > 0
        ? Math.round(pl.vintages.reduce((a, v) => a + v.principalLocal * v.wamWeeks, 0) / bookLocal)
        : MORTGAGE_TERM_WEEKS;
    } else if (pl.kind === 'CREDIT_CARD') {
      const rate = policyRate + (pl.marginBps ?? 1000) / 10000;
      const interestLocal = (pl.principalLocal * rate) / 52;
      const paydownLocal = pl.principalLocal * CARD_POOL_PAYMENT_RATE_WEEKLY;
      const lossLocal = (pl.principalLocal * unsecuredLossRateAnnual) / 52;
      interestWeeklyLocal += interestLocal;
      principalWeeklyLocal += paydownLocal;
      debtServicePrincipalWeeklyLocal += pl.principalLocal * CARD_MIN_PRINCIPAL_RATE_WEEKLY;
      lossWeeklyLocal += lossLocal;
      pl.principalLocal -= paydownLocal + lossLocal;

      // The pool re-borrows what it paid down, scaled by appetite — the revolving turnover.
      const demandLocal = paydownLocal * appetite;
      const grantedLocal = Math.min(demandLocal, headroomLocal() / CONSUMER_CREDIT_RISK_WEIGHT);
      declinedOriginationLocal += demandLocal - grantedLocal;
      if (grantedLocal > 0) {
        pl.marginBps = quoteHouseholdMarginBps({
          annualLossRate: unsecuredLossRateAnnual, riskWeight: CONSUMER_CREDIT_RISK_WEIGHT,
          operatingCostBps: CARD_OPERATING_COST_BPS,
        });
        pl.principalLocal += grantedLocal;
        consumerCreditOriginationLocal += grantedLocal;
      }
    } else {
      const rate = policyRate + (pl.marginBps ?? 500) / 10000;
      const interestLocal = (pl.principalLocal * rate) / 52;
      const scheduledLocal = annuityWeeklyPrincipalLocal(pl.principalLocal, rate, pl.wamWeeks ?? CONSUMER_TERM_SEED_WAM_WEEKS);
      const lossLocal = (pl.principalLocal * consumerTermAnnualLossRate(unsecuredLossRateAnnual)) / 52;
      interestWeeklyLocal += interestLocal;
      principalWeeklyLocal += scheduledLocal;
      debtServicePrincipalWeeklyLocal += scheduledLocal;
      lossWeeklyLocal += lossLocal;
      pl.principalLocal -= scheduledLocal + lossLocal;

      const demandLocal = scheduledLocal * appetite;
      const grantedLocal = Math.min(demandLocal, headroomLocal() / CONSUMER_CREDIT_RISK_WEIGHT);
      declinedOriginationLocal += demandLocal - grantedLocal;
      if (grantedLocal > 0) {
        const total = pl.principalLocal + grantedLocal;
        pl.marginBps = quoteHouseholdMarginBps({
          annualLossRate: consumerTermAnnualLossRate(unsecuredLossRateAnnual), riskWeight: CONSUMER_CREDIT_RISK_WEIGHT,
          operatingCostBps: CONSUMER_TERM_OPERATING_COST_BPS, requiredReturnAnnual: bankHurdle,
        });
        pl.wamWeeks = Math.round((((pl.wamWeeks ?? CONSUMER_TERM_SEED_WAM_WEEKS) - 1) * pl.principalLocal + CONSUMER_TERM_WEEKS * grantedLocal) / Math.max(1, total));
        pl.principalLocal = total;
        consumerCreditOriginationLocal += grantedLocal;
      } else if (pl.wamWeeks) {
        pl.wamWeeks = Math.max(1, pl.wamWeeks - 1);
      }
    }
    pl.principalLocal = Math.max(0, Math.round(pl.principalLocal));
  });

  return {
    sheet: {
      ...bookPnL(sheet, -lossWeeklyLocal, 'household loan losses'),
      householdLoans: pools,
      // §5-CLOSE C4: NO RESERVE MOVES HERE. The household sector banks where it borrows, so
      // every one of these is a deposit event at this bank: a loan creates the borrower's
      // deposit (mortgage and card/term alike), the seller's retired loan destroys one, and
      // amortization is the borrower's deposit paying the book down. Interest is the same
      // debit, posted by evolveBankingSector on the prior book. A3.6c-iii: the four flows below
      // are what 02b posts to the household sector's row at this bank — no line is written here.
    },
    interestWeeklyLocal,
    principalWeeklyLocal,
    debtServicePrincipalWeeklyLocal,
    lossWeeklyLocal,
    mortgageOriginationLocal,
    mortgageDischargeLocal,
    consumerCreditOriginationLocal,
    declinedOriginationLocal,
    mortgageRateQuotedAnnual: bankMortgageRate,
    turnoverRateAnnual,
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
/**
 * §3.20-LLR-a — what a bank is SHORT of its operating buffer at the close, on settled cash plus
 * the legs already posted: the amount the funding close lends it as a central-bank loan ROW
 * (`central-bank-loans.ts`). The raise and the repayment that used to mutate a scalar here are
 * the book's now — struck at the close, serviced and rolled at the open.
 */
function operatingCashBufferLocal(householdDepositsLocal: number, bufferRatio: number = MIN_CASH_BUFFER_RATIO): number {
  return Math.max(0, householdDepositsLocal) * bufferRatio;
}
export function centralBankShortfallLocal(householdDepositsLocal: number, settledCashLocal: number, bufferRatio: number = MIN_CASH_BUFFER_RATIO): number {
  const shortfallLocal = operatingCashBufferLocal(householdDepositsLocal, bufferRatio) - settledCashLocal;
  return shortfallLocal < 1e6 ? 0 : shortfallLocal;
}

/**
 * §5-CLOSE P1 — THE FACILITY IS PRICED. A bank's revolver carried one stated margin for every
 * borrower (350bp), which put the SENIOR bank claim wider than the same firm's own bond on 990
 * of 2,443 issuers. The margin is the same quote the SME book gets: the borrower's own default
 * probability (the one the credit market prices its hazard against), the lending bank's own cost
 * of equity, and the region's realised recoveries — through `quoteLoanMarginBps`, the one loan
 * price. A borrower with no named bank is quoted at the median bank's hurdle.
 */
export function facilityMarginBpsFor(
  v2: V2World,
  borrower: Company,
  reg: Region,
  bank?: { beta?: number; management?: Preferences }
): number {
  return quoteLoanMarginBps({
    annualDefaultProbability: computeAnnualDefaultProbability(v2, borrower),
    riskWeight: 1.0,
    requiredReturnAnnual: bank ? bankRequiredReturnAnnual(bank, reg) : undefined,
    recoveryRate: creditRecoveryRate(reg),
  });
}
