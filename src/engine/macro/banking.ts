import { riskAversionOf } from '../../domain/preferences';
import { BankingSector, householdBookRwaUSD, CONSUMER_CREDIT_RISK_WEIGHT, WHOLESALE_FUNDING_SPREAD_BPS } from '../../types';
import { dealerDeskGrossUSD } from '../../domain/dealer-desk';

/**
 * The banking sector's weekly evolution — a FLOW LEDGER, not a formula sheet.
 *
 * What this replaced, because it must never come back: reserves used to be computed as
 * `Math.max(newDeposits * 0.08, deposits + equity − loans − securities)`. Both branches
 * DISCARDED the bank's prior cash entirely, so every real cash leg the clearing stages had
 * applied the week before (07c/07f purchases, stage 11 redemptions and placements, SRF draws)
 * was erased at the start of the next week and cash was rebuilt from a formula. And the
 * balance-sheet identity the second branch computed was broken from the cold start — measured
 * at −138.9B for the USA banks at week 0 (deposits 67B against a 147B securities book seeded
 * from the market side at S2) — so the 8%-of-deposits floor branch bound in every region in
 * every week, manufacturing the entire funding of the securities book out of nothing. Both
 * administered facilities printed 0.00B usage in all four regions for 60 weeks because every
 * bank sat pinned at exactly the floor.
 *
 * The rule now, the same one S5 established for companies: **cash moves only by named flows.**
 * The balance sheet balances because every flow posts to both of its sides, never because any
 * line is computed as the residual of the others. The identity is asserted by the invariants
 * harness every week; if it drifts, a flow is missing a leg — find it, do not plug it.
 *
 * What is still formula-SIZED here (each flow is honestly posted, but its size comes from a
 * macro formula rather than named counterparties — the owner that replaces each is recorded
 * in the plan): the household deposit drift and the consumer loan target (G2 slices 1/4 + MS),
 * the loan yields and deposit beta (G2 slice 2 makes both real per-loan / per-depositor), the
 * loss rates (G2's real borrower defaults / MS unemployment), M2 (G2 slice 5), and the
 * central-bank reserve scalar with its QE/QT drift (G9). Sovereign book income is read from
 * the REAL tenor book at the REAL cleared curve, but the government does not yet debit it
 * (BP5 pays real coupons to all holders and deletes that boundary).
 */

/** Posted spread of the Standing Repo Facility over the policy rate (rule-1 exception: a real
 * administered rate with real quantity response). Interest is paid at maturation, one week
 * after the draw. */
export const SRF_SPREAD_BPS = 25;
/** Posted spread of the overnight reverse-repo facility UNDER the policy rate. Banks never use
 * it — their reserves already earn the policy rate (the floor-system IOR, which is why a real
 * bank has no business at the RRP window) — it is the NON-bank cash floor: the WS6 lenders'
 * outside option, and WS7's money funds are its real users. */
export const ON_RRP_SPREAD_BPS = 20;
/**
 * Share of a household's weekly saving that reaches a BANK DEPOSIT rather than any other
 * destination. One owner: it was a bare `0.3` in two files (here, sizing the funding-pressure
 * denominator, and in 02b, sizing the inflow the money fund competes for), so changing one and
 * not the other would have made the diverted amount and the amount it is measured against
 * disagree — §7.5's duplicated-constant shape, the same defect as the 0.35 procurement literal.
 *
 * COH4 — CLOSED, and this is now the SEED ONLY (§7.4). Where a household's saving goes is a
 * portfolio choice it makes, and COH2 already makes it: the split by MOTIVE. The buffer half
 * stays where it can be spent, which is a deposit; the life-cycle half leaves as a pension
 * contribution. `householdState.liquidSavingShare` is that same split, measured every week, and
 * every weekly reader takes it — this value is what the first pass opens on and nothing else.
 */
export const HOUSEHOLD_SAVINGS_TO_DEPOSITS_SEED_SHARE = 0.3;

/** The share of saving that reaches the banks: measured where it is decided, seeded before. */
export function savingsToDepositsShare(hs?: { liquidSavingShare?: number }): number {
  const measured = hs?.liquidSavingShare;
  return measured !== undefined && measured >= 0 ? measured : HOUSEHOLD_SAVINGS_TO_DEPOSITS_SEED_SHARE;
}

/** Share of deposits a bank's own treasury keeps as ready cash — its operating-buffer policy.
 * Below it the bank funds itself (repo, then the SRF); this is a behavioural policy choice,
 * not a regulatory formula. */
export const MIN_CASH_BUFFER_RATIO = 0.02;
/** §5-BRAINS — the buffer THIS bank keeps: the policy share above, weighted by its own
 *  management's risk aversion. The median bank keeps the stated share. */
export function bankCashBufferRatioOf(bank: { management?: import('../../domain/preferences').Preferences }): number {
  return MIN_CASH_BUFFER_RATIO * riskAversionOf(bank.management);
}
/**
 * The Basel leverage-ratio floor: equity against UNWEIGHTED total assets. A posted regulatory
 * minimum (rule 1's administered-number standing), and the one constraint that sees a
 * sovereign book at all — risk weights are zero on sovereigns, which is exactly why the real
 * framework added a leverage floor after risk-weighted capital let bond carry grow without
 * limit. Measured before it existed here: over 260 weeks banks levered the repo carry into
 * the growing government float until EUR banks had pledged 913B of collateral and USA bank
 * capital printed NEGATIVE (−13.3%) — the flow ledger conserving a runaway that the deleted
 * equity-rescale/recapitalization clamps used to hide. This bounds the SIZE of the bid
 * (quantity, never price), the same doctrine as every other real capital constraint (§7.16's
 * sub-IG charge). G2 refines it with per-bank supervisory buffers.
 */
export const BASEL_MIN_LEVERAGE_RATIO = 0.03;

/** Unweighted total assets — the leverage ratio's denominator. */
export function bankTotalAssetsUSD(sheet: BankingSector): number {
  const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  // G3a: the desks' inventory is an asset the bank OWNS and finances, and a cash security
  // consumes the leverage ratio one-for-one. Before the desks had owners it consumed nothing,
  // which is precisely what let a book with no capital behind it absorb any imbalance.
  return sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD
    + Math.max(0, sheet.cashReservesUSD) + (sheet.repoLentUSD ?? 0)
    // CAL: a coupon earned and not yet paid is an asset the bank holds against the treasury.
    + (sheet.sovereignAccruedCouponUSD ?? 0)
    + dealerDeskGrossUSD(sheet.dealerDeskInventory)
    // HF1: a margin loan to a fund consumes the leverage ratio like any other loan.
    + (sheet.primeBrokerageLoansUSD ?? 0);
}

/** How much balance sheet the bank's equity still supports under the leverage floor. */
export function leverageHeadroomUSD(sheet: BankingSector): number {
  return Math.max(0, sheet.bankEquityUSD / BASEL_MIN_LEVERAGE_RATIO - bankTotalAssetsUSD(sheet));
}

/**
 * OWN3 — the two REAL bounds on a bank's securities book, both read off its own sheet.
 *
 * What they replace: 07c set every bank's sovereign target to
 * `sovBondOwnership.bankShare x the whole market`, distributed across banks by deposits, and
 * 07f capped each bill bucket at the same share times the bank's slice. A bank's book was
 * therefore decided by a number describing the banking SECTOR, not by anything the bank owned.
 * The comment there recorded the reason the aggregate was imposed — letting each bank take
 * `deposits x a ratio` implied the sector wanting several times the entire market — and that
 * reason was right about the formula and wrong about the fix: a liquidity requirement is not a
 * share of deposits, it is a share of the deposits that could RUN, met by reserves first.
 *
 * Runoff rates and a coverage ratio of 1 are posted regulatory primitives (rule 4 permits a
 * primitive; it is the 22% equilibrium that it forbids).
 */
export const RETAIL_DEPOSIT_RUNOFF_RATE = 0.10;
/** Corporate, institutional and wholesale money leaves far faster than insured retail money. */
export const WHOLESALE_FUNDING_RUNOFF_RATE = 0.40;
export const LIQUIDITY_COVERAGE_RATIO = 1.0;

/** Funding that runs in a stress month, weighted by how fast each kind of it runs. */
export function stressedOutflowUSD(sheet: BankingSector): number {
  const wholesaleUSD = (sheet.corporateDepositsUSD ?? 0) + (sheet.institutionalDepositsUSD ?? 0)
    + (sheet.smeDepositsUSD ?? 0) + (sheet.clientMarginUSD ?? 0);
  return Math.max(0, sheet.depositsUSD) * RETAIL_DEPOSIT_RUNOFF_RATE
    + Math.max(0, wholesaleUSD) * WHOLESALE_FUNDING_RUNOFF_RATE;
}

/**
 * The FLOOR under a bank's sovereign book: the liquidity it must carry that its reserves do not
 * already cover. Reserves are HQLA too, so a bank flush with cash needs no bonds to be liquid —
 * which is the reserves-versus-bonds substitution S2 found to be load-bearing (§7.10), now
 * acting on the size of the book rather than on a scaling factor.
 */
export function liquidityDrivenSovereignFloorUSD(sheet: BankingSector): number {
  const requiredHqlaUSD = stressedOutflowUSD(sheet) * LIQUIDITY_COVERAGE_RATIO;
  return Math.max(0, requiredHqlaUSD - Math.max(0, sheet.cashReservesUSD));
}

/**
 * The CEILING on it: the sovereign book this bank's own EQUITY supports under the leverage
 * floor — what it already holds, plus the balance sheet its capital still has room for.
 *
 * OWN8 — WHAT THIS REPLACES, AND WHY IT WAS WRONG. OWN3 used an `investableSurplusUSD`:
 * `funding + equity - loans - cash - repoLent`. The balance sheet already says
 * `funding + equity = loans + cash + repoLent + sovereign`, so **that expression IS the
 * sovereign book, rearranged** — an accounting identity wearing a constraint's name. It equalled
 * `sovBook` to the cent for every bank every week, so `maxHoldingUSD` came out strictly BELOW
 * current holdings and no bank could ever buy another bond. Measured against pre-OWN: the USA
 * sovereign book went 147B->285B before and 78B->53B after, cash/deposits 2.2% -> 47-68%, and
 * because no bank was ever short its operating buffer the whole repo market printed ZERO volume.
 *
 * A ceiling must be able to exceed the position it bounds. Capital can: `leverageHeadroomUSD` is
 * equity against unweighted assets, the one constraint that sees a zero-risk-weight sovereign
 * book at all, and it is already what bounds the weekly FLOW in 07c/07f. What actually binds
 * week to week is that flow — cash above the operating buffer plus unencumbered borrowing
 * capacity — so a bank deploys idle cash into bonds at a price it will accept, which is the
 * mechanism the residual was suppressing. REPO (§5) replaces even this: a real treasury's
 * securities book is bounded by what it can FINANCE, and a funding market is what makes that
 * bound real rather than notional.
 */
export function sovereignBookCapacityUSD(sheet: BankingSector): number {
  const sovUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {})
    .reduce((a, v) => a + (Number(v) || 0), 0);
  return Math.max(0, sovUSD) + leverageHeadroomUSD(sheet);
}

const TENOR_BUCKET_YEARS: Record<string, number> = {
  b13: 0.25, b26: 0.5, b52: 1, t2: 2, t5: 5, t10: 10, t30: 30,
};

/**
 * The annualised yield the bank's OWN sovereign book earns at the REAL cleared curve — each
 * tenor bucket at the market yield for its own maturity, linearly interpolated between the
 * cleared points for the buckets between them. This replaces `whole book × the 10Y yield`,
 * which read neither the real book composition nor the real front end. Carry-at-market-yield
 * is an approximation of coupon income on a near-par book; BP5 replaces it with the real
 * coupons the government actually pays.
 */
export function computeSovereignBookAnnualYield(
  byTenor: Record<string, number> | undefined,
  zeroRates: { tenor3M: number; tenor2Y: number; tenor5Y: number; tenor10Y: number; tenor30Y: number }
): number {
  const points: [number, number][] = [
    [0.25, zeroRates.tenor3M], [2, zeroRates.tenor2Y], [5, zeroRates.tenor5Y],
    [10, zeroRates.tenor10Y], [30, zeroRates.tenor30Y],
  ];
  const yieldAt = (years: number): number => {
    if (years <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (years <= points[i][0]) {
        const [y0, r0] = points[i - 1]; const [y1, r1] = points[i];
        return r0 + (r1 - r0) * ((years - y0) / (y1 - y0));
      }
    }
    return points[points.length - 1][1];
  };
  let bookUSD = 0; let incomeUSD = 0;
  Object.entries(byTenor || {}).forEach(([key, usd]) => {
    const v = Number(usd) || 0;
    if (v <= 0) return;
    bookUSD += v;
    incomeUSD += v * yieldAt(TENOR_BUCKET_YEARS[key] ?? 5);
  });
  return bookUSD > 0 ? incomeUSD / bookUSD : 0;
}

export function evolveBankingSector(
  prevBanking: BankingSector,
  estimatedHouseholdIncomeUSD: number,
  savingsRate: number,
  policyRate: number,
  unemploymentRate: number,
  /** The book-weighted annual yield of THIS bank's real tenor book at the real cleared curve
   * (computeSovereignBookAnnualYield). Rule 9: annualised decimal. */
  sovereignBookAnnualYield: number,
  spilloverAdjustment: number = 0,
  /** REPO1: the repo CONTRACTS that come due this week — principal and the interest each one
   * actually promised, at the rate IT was struck at and over the term IT ran. This replaces
   * `last week's scalar x this week's rate`, which could only ever describe an overnight book:
   * a term contract's interest is not one week's accrual, and its principal is not due. The
   * standing facility is folded in, because a window draw is a repo contract like any other. */
  maturingRepoBorrowPrincipalUSD: number = 0,
  maturingRepoBorrowInterestUSD: number = 0,
  maturingRepoLendPrincipalUSD: number = 0,
  maturingRepoLendInterestUSD: number = 0,
  /** G2: real interest earned this week on the bank's ITEMIZED loan book (each loan at its own
   * terms, computed by bank-lending.ts from the prior week's book) — replaces the
   * business-loan yield formula. The business book itself is carried untouched here: it is a
   * sum of real loans owned by the G2 stage. */
  itemizedLoanInterestWeeklyUSD: number = 0,
  /** HH3: real interest accrued this week on the bank's ITEMIZED household books (each pool at
   * its own terms, computed by the caller from the prior week's pools) — replaces the
   * `consumerLoanUSD x (policy + 3.5%)` yield formula. The payer is household income, which
   * enters as cash the way the savings inflow does, until HH4 names it cohort by cohort. The
   * consumer book itself passes through untouched: it is a sum of real pools owned by the
   * household lending pass. */
  householdLoanInterestWeeklyUSD: number = 0,
  /** PUB1: real coupons on this bank's own sovereign book, paid by the government. */
  sovereignCouponWeeklyUSD: number = 0,
  /** WS7: the slice of THIS bank's household savings inflow that went to the money market fund
   * instead — the deposit-competition channel. The fund's credit happens in 02b; here the
   * deposits simply never arrive. */
  householdMmfDiversionUSD: number = 0,
  /** HH4d: last week's household ETF purchases, settling out of deposits this week (T+1). */
  priorHouseholdEtfPurchasesUSD: number = 0,
  /** G2 slice 5: the money fund's net yield this region — what this bank's deposits COMPETE
   * with. A bank losing funding to the fund raises its own rate toward it; funding cost stops
   * being a fixed beta on policy. */
  competingMmfYieldAnnual: number = 0,
  /**
   * G3c — what the market charges THIS bank over policy for wholesale money: its own cleared
   * credit spread, the same OAS 07b prints for every other issuer. A bank is a borrower in the
   * bond market like any other, and its funding spread is exactly where the market's view of it
   * shows up; the 40bps constant this replaces was identical for a sound bank and a breaching
   * one. Defaults to the posted constant only for a bank with no cleared spread yet (week 1).
   */
  ownWholesaleSpreadBps: number = WHOLESALE_FUNDING_SPREAD_BPS,
  /** COH4: the share of the region's household saving that arrives as a DEPOSIT rather than
   * leaving as a pension contribution — measured by the cohorts' own motive split, not stated.
   * Defaults to the seed share, which is all the first pass has (§7.4). */
  savingsToDepositsShareValue: number = HOUSEHOLD_SAVINGS_TO_DEPOSITS_SEED_SHARE,
  /** SETL4/SEG2d — interest the borrowers PAY AS REAL PAYMENTS (facility and SME-pool interest,
   * through settlement), excluded from `itemizedLoanInterestWeeklyUSD` above so this evolution
   * does not credit the cash twice. It is still this week's interest INCOME, and leaving it out
   * of the income measure made the NIM statistic and the payout's net-income line read a bank
   * poorer than its own ledger: measured (§7.254), the USA cohort's NIM printed −1.3% while
   * settlement delivered the missing income into equity every week, dividends under-distributed
   * against the mis-measured income, and the cash sat on the sheet funded by priced wholesale. */
  settlementPaidInterestWeeklyUSD: number = 0,
  /** NIM_TRACE=1 instrument only: a `${region}:${ticker}` label; when set and the env flag is
   * on, the NIM's income and funding legs print for this evolution. Never read by the ledger. */
  traceLabel?: string
): BankingSector {
  // ---- The ledger. Every mutation below is a named flow posting to both of its sides. ----
  let cashUSD = prevBanking.cashReservesUSD;
  let equityUSD = prevBanking.bankEquityUSD;
  let depositsUSD = prevBanking.depositsUSD;
  // G2: the business book is ITEMIZED — a sum of real loans that only bank-lending.ts moves.
  const businessLoanUSD = prevBanking.businessLoanBookUSD;
  // HH3: the consumer book is ITEMIZED — a sum of real household pools that only the
  // household lending pass moves.
  const consumerLoanUSD = prevBanking.consumerLoanBookUSD;
  // The securities book is owned by the clearing stages (07c/07f/11) and passes through here
  // untouched — a stage may only rewrite the instruments it cleared.
  const sovereignUSD = prevBanking.sovereignBondHoldingsUSD;

  // ---- 1. Secured funding that comes due this week (REPO1). Borrowed principal returns to the
  // lender with the interest its own contract promised; lent principal returns to this bank the
  // same way. Interest is P&L; principal is not. The standing facility is in here too — a window
  // draw is a repo contract with the central bank as the named lender, so it matures like one
  // instead of being repaid off a separate scalar at a posted rate. ----
  // What is STILL outstanding once this week's maturities have settled. A term book means these
  // are not zero, and everything downstream — the funding residual, the leverage ratio, the
  // identity — has to see them. The repo session overwrites all three from the region's book.
  const survivingSecuredUSD = Math.max(0,
    (prevBanking.repoBorrowedUSD ?? 0) + (prevBanking.srfBorrowingUSD ?? 0) - maturingRepoBorrowPrincipalUSD);
  const survivingSrfUSD = Math.min(survivingSecuredUSD, Math.max(0, prevBanking.srfBorrowingUSD ?? 0));
  const survivingRepoBorrowedUSD = survivingSecuredUSD - survivingSrfUSD;
  const survivingRepoLentUSD = Math.max(0, (prevBanking.repoLentUSD ?? 0) - maturingRepoLendPrincipalUSD);
  // CASH: the P&L is this bank's own and is booked here; the MONEY moves through the settlement
  // layer, posted by the repo session as instructions between the two named counterparties. The
  // cash legs used to be taken here and credited to the lender in another stage — two direct
  // mutations that happened to cancel, which is exactly what the ledger exists to replace.
  equityUSD -= maturingRepoBorrowInterestUSD;
  equityUSD += maturingRepoLendInterestUSD;

  // ---- 2. Household deposit flow — HH4d: REAL flows only, no target. The full savings
  // inflow arrives (less what the money fund's yield gate diverted) and last week's household ETF
  // purchases settle out (T+1 — the balance-sheet stage recorded them). PUB2b removed the
  // "monetized amount" that also landed here: a central bank buying bonds pays the SELLER, it
  // does not print deposits into household accounts. The 0.999-decay target that used to size this is gone, and with it the drift between
  // the bank's deposit line and the household stock it claims to be: they are ONE number now,
  // reconciled by the bank-diversification stage every week.
  const weeklySavingsInflowUSD = (savingsRate * estimatedHouseholdIncomeUSD) / 52;
  // SETL-B: the savings inflow is NO LONGER credited here. Households are paid real wages by
  // real employers and pay for real goods, and both move their deposits through settlement — so
  // adding a rate-times-estimate on top was the second of two independent quantities for one
  // balance (rule 3). §7.248: the money fund's diversion is a payment instruction now too
  // (HOUSEHOLD → the fund), so its bank leg arrives through the pending-settlement parameter
  // next week like every other post-bank-pass household flow — subtracting it here as well
  // would move it twice. `householdMmfDiversionUSD` survives only as the funding-pressure
  // signal below, which is what it was always genuinely measuring.
  const householdDepositFlowUSD = -priorHouseholdEtfPurchasesUSD;
  depositsUSD += householdDepositFlowUSD;
  cashUSD += householdDepositFlowUSD;

  // §5-CLOSE: the central bank's loan (the lender of last resort at the funding close) pays its
  // interest as a PAYMENT to the central bank, posted by 02b; it is counted here only as the
  // cost it is in the margin statistic. Nothing below moves cash for it.
  const wholesaleUSD = prevBanking.centralBankLoanUSD ?? 0;
  const wholesaleInterestUSD = (wholesaleUSD * (policyRate + Math.max(0, ownWholesaleSpreadBps) / 10000)) / 52;

  // SETL2: corporate balances ARE funding now — company payments settle through bank books, so
  // the line has real reserves behind it (settlement.ts moves them, the seed opens with them).
  // And funding costs money: what a corporate treasurer is owed is not a chosen number, because
  // this model already simulates the alternative it would take — sweeping to the money fund the
  // moment the bank underpays — so the rate a corporate balance commands is the fund's own yield.
  const corporateDepositsUSD = prevBanking.corporateDepositsUSD ?? 0;
  const corporateDepositRateAnnual = Math.max(0, competingMmfYieldAnnual);
  // §5-CLOSE C4: PAID, not written — 02b posts it as BANK → COMPANY to each positive-balance
  // depositor pro rata, so the treasurer who earns it is credited and this bank's reserves and
  // equity leave through settlement. Here it is only the cost it is in the margin statistic.
  const corporateDepositInterestUSD = (corporateDepositsUSD * corporateDepositRateAnnual) / 52;

  // ---- 3. Lending: loans create deposits, repayment destroys them — the actual mechanism
  // (both sides of the sheet move together; reserves do not move at origination). Sizes are
  // formula targets until G2 itemizes the borrowers. ----
  // HH3: the consumer-loan target formula is gone. The household books are real pools on this
  // bank's own sheet (householdLoans); origination, amortization and losses are the lending
  // pass's priced, capital-gated decisions, and the deposits an origination creates post there.

  // G2: business lending flows are the itemized stage's (priced origination under the real
  // capital constraint, in bank-lending.ts); the formula target that used to grow the book
  // toward `regionFloatingPrincipal` — the §6 double-count with 07d's loan market — is gone.

  // ---- 4. Interest flows. Income arrives as cash from the payers (loan interest and sovereign
  // carry cross the model boundary until G2/BP5 name the payers' debits — recorded in the
  // plan); deposit interest is credited to the depositors' accounts, so deposits grow and cash
  // does not move. ----
  // G2 slice 5: the deposit rate is COMPETITIVE, not a fixed beta. Its floor is the bank's own
  // policy-linked beta; it rises toward the money fund's net yield in proportion to how much
  // funding the fund is actually taking (the WS7 diversion, as a share of this bank's own
  // savings inflow). A bank that ignores a better-paying fund loses its deposits — the real
  // discipline WS7's liability side exists to impose.
  // G3c: the deposit rate is the bank's OWN decision, made out of its own numbers. What it pays
  // is bounded above by the cheaper of two alternatives — what the deposit is worth to it (the
  // wholesale funding it displaces, at its own cleared spread) and what the depositor could get
  // instead (the money fund's net yield) — and it pays that much only on the share of its base
  // that is actually in play. Two measured things put deposits in play: money walking to the
  // fund, and the bank's own liquidity being short of what a stressed month would take. A bank
  // that is liquid and losing nobody genuinely has no reason to pay, and one that is short pays
  // its full alternative cost. This retires `policyRate x 0.45`, an observed real-world
  // pass-through that was the same for every bank and, since the fund rarely took funding, WAS
  // the rate almost every week.
  const alternativeCostAnnual = Math.min(
    policyRate + Math.max(0, ownWholesaleSpreadBps) / 10000,
    Math.max(0, competingMmfYieldAnnual)
  );
  // What share of the saving that was HEADED FOR A DEPOSIT walked to the money fund instead. The
  // guard has to be on the denominator, not on the inflow: §7.204 made the liquid-saving share a
  // MEASURED number, and a week in which none of the saving was headed for a deposit makes it
  // zero — at which point this asked `0/0` and got NaN. Nothing downstream stopped it: NaN passes
  // straight through `Math.max`/`Math.min`, into the deposit RATE, into the deposit STOCK, and the
  // household deposit line IS that stock (HH4d), so one such week turned the whole household
  // balance sheet into NaN and the goods market's final-demand vector with it. A zero denominator
  // is not infinite pressure — if no saving was on offer as a deposit, none of it can have walked.
  const contestableInflowUSD = weeklySavingsInflowUSD * savingsToDepositsShareValue;
  const fundingPressure = contestableInflowUSD > 0
    ? Math.max(0, Math.min(1, householdMmfDiversionUSD / contestableInflowUSD))
    : 0;
  const stressedUSD = stressedOutflowUSD(prevBanking) * LIQUIDITY_COVERAGE_RATIO;
  const liquidityShortfallShare = stressedUSD > 0
    ? Math.max(0, Math.min(1, (stressedUSD - Math.max(0, prevBanking.cashReservesUSD)) / stressedUSD))
    : 0;
  const contestedShare = Math.max(0, Math.min(1, Math.max(fundingPressure, liquidityShortfallShare)));
  const depositRate = alternativeCostAnnual * contestedShare;
  // Reserves earn the policy rate — the floor-system IOR. The 0.85 "tiering" haircut and the
  // bank-side ON RRP parking it justified are gone: a bank whose reserves earn IOR never goes
  // to the RRP window, which is exactly the real system.
  // PUB1: the sovereign book earns its real COUPONS (passed in, paid by the government in
  // stage 11), not a carry-at-market-yield the issuer never funded. `sovereignBookAnnualYield`
  // is still the curve read used elsewhere; it no longer credits income here.
  // §5-CLOSE C4: interest on reserves is PAID by the central bank — 02b posts it as
  // CENTRAL_BANK → BANK, the reserves it creates are the central bank's expense, and the
  // remittance to the treasury is already net of it (central-bank.ts). Nothing here writes it.
  const reservesInterestUSD = (Math.max(0, cashUSD) * policyRate) / 52;
  const weeklyInterestIncomeUSD = reservesInterestUSD
    + itemizedLoanInterestWeeklyUSD + householdLoanInterestWeeklyUSD + sovereignCouponWeeklyUSD
    + settlementPaidInterestWeeklyUSD;
  // CAL: the income statement is smooth and the CASH is lumpy — a coupon is earned every week and
  // paid on the bucket's date, and rule 9 says those are different numbers with different periods.
  // So the coupon stays in the income line above (it is genuinely this week's earnings, and the
  // NIM below is an income measure) while the money it will become arrives on the date.
  // `sovereign-calendar.ts` posts BOTH of its legs — the receivable and the equity it earns — off
  // the ledger the treasury pays from, which is the only way the holder's claim and the issuer's
  // payable stay the same number. Everything else here is money that genuinely arrived this week.
  // ...and the settlement-paid slice, whose cash the settlement pass itself delivers.
  // §5-CLOSE C4: the household books' interest is a DEBIT OF THE BORROWERS' DEPOSITS at this
  // bank — the household sector banks and borrows here, so the payment is the deposit leaving
  // and the equity arriving; no reserve moves and nothing arrives from outside. (Before this the
  // interest was credited to reserves from nobody while the households' deposit line never
  // paid it — the second money engine the audit's M1 row measured.) The itemized business
  // slice is zero by construction: every business loan is a facility or an SME pool and both
  // pay through settlement; the parameter survives as the measure it always was.
  depositsUSD -= householdLoanInterestWeeklyUSD;
  equityUSD += householdLoanInterestWeeklyUSD;
  const weeklyDepositInterestUSD = (depositsUSD * depositRate) / 52;
  depositsUSD += weeklyDepositInterestUSD;
  equityUSD -= weeklyDepositInterestUSD;

  // ---- 5. Loan losses: a write-down, not a cash event — the asset shrinks and equity absorbs
  // it. (The re-lending the targets do next week is the re-origination of written-off credit
  // demand.) Loss rates stay formula until G2's real borrower defaults / MS. ----
  // G2: business losses are REAL write-offs in bank-lending.ts (the pools' measured default
  // experience); the contagion formula now prices nothing on the itemized book.
  // HH3: consumer losses are REAL write-offs in the household lending pass (the tier mix and
  // the mortgage book's home-equity severity price them there); the formula that wrote the
  // whole book down here is gone.

  // ---- 6. Distributions: dividends actually LEAVE — cash and equity together, bounded by the
  // cash the treasury genuinely holds above its own operating buffer. This replaces two
  // unaccounted writes: a "recapitalization" that raised equity with no investor and no cash
  // behind it (deleted outright — an undercapitalized bank now stays undercapitalized until a
  // real equity raise exists, WS8/G2), and a hard rescale `equity = RWA × 0.140` that deleted
  // equity with nothing on the other side (a rule-2 rescale; now a real special dividend paid
  // at the pace real cash allows). ----
  const weeklyNetIncomeUSD = weeklyInterestIncomeUSD - weeklyDepositInterestUSD - wholesaleInterestUSD - corporateDepositInterestUSD;
  const consumerRwaUSD = (prevBanking.householdLoans && prevBanking.householdLoans.length > 0)
    ? householdBookRwaUSD(prevBanking.householdLoans)
    : consumerLoanUSD * CONSUMER_CREDIT_RISK_WEIGHT;
  const riskWeightedAssetsUSD = businessLoanUSD * 1.0 + consumerRwaUSD + sovereignUSD * 0.0;
  const priorCapitalRatio = prevBanking.bankCapitalRatio;
  const targetPayoutRatio = priorCapitalRatio > 0.14 ? 0.90 : priorCapitalRatio < 0.11 ? 0.05 : 0.40;
  const distributableCashUSD = () => Math.max(0, cashUSD - depositsUSD * MIN_CASH_BUFFER_RATIO);
  // §5-CLOSE C4: DECIDED here, PAID by the register. The amount is reported on the sheet and
  // 02b hands it to the paying agent (`payHoldersCash`), which settles it pro rata to the
  // holders of record as a payment from this bank — reserves and equity leave at settlement,
  // and every dollar arrives on a named holder's book. Nothing here moves cash.
  const regularDividendUSD = Math.min(Math.max(0, weeklyNetIncomeUSD) * targetPayoutRatio, distributableCashUSD());
  const equityAfterRegularUSD = equityUSD - regularDividendUSD;
  const excessCapitalUSD = riskWeightedAssetsUSD > 0 ? equityAfterRegularUSD - riskWeightedAssetsUSD * 0.140 : 0;
  const specialDividendUSD = (riskWeightedAssetsUSD > 0 && equityAfterRegularUSD / riskWeightedAssetsUSD > 0.145)
    ? Math.min(excessCapitalUSD, Math.max(0, distributableCashUSD() - regularDividendUSD))
    : 0;
  const dividendWeeklyUSD = regularDividendUSD + specialDividendUSD;

  // ---- 7. Statistics — readings of the ledger, never drivers of it. The NIM damping factor
  // that clamped loan yields whenever the margin exceeded 5% is deleted (a clamp on a price,
  // rule 2): if the margin is wrong, its inputs are wrong, and those are G2's to make real. ----
  const totalAssetsUSD = businessLoanUSD + consumerLoanUSD + sovereignUSD + cashUSD + survivingRepoLentUSD;
  const netInterestMarginPct = totalAssetsUSD > 0
    ? ((weeklyInterestIncomeUSD - weeklyDepositInterestUSD - wholesaleInterestUSD - corporateDepositInterestUSD) * 52) / totalAssetsUSD
    : 0.025;
  if (traceLabel && process.env.NIM_TRACE === '1') {
    console.log(`  [nim] ${traceLabel} NIM ${(netInterestMarginPct * 100).toFixed(2)}%`
      + ` | income/wk: reserves ${((Math.max(0, prevBanking.cashReservesUSD) * policyRate) / 52 / 1e6).toFixed(1)}M`
      + ` loans ${(itemizedLoanInterestWeeklyUSD / 1e6).toFixed(1)}M hh ${(householdLoanInterestWeeklyUSD / 1e6).toFixed(1)}M`
      + ` coupons ${(sovereignCouponWeeklyUSD / 1e6).toFixed(1)}M settled ${(settlementPaidInterestWeeklyUSD / 1e6).toFixed(1)}M`
      + ` | cost/wk: deposits ${(weeklyDepositInterestUSD / 1e6).toFixed(1)}M@${(depositRate * 100).toFixed(2)}%`
      + ` wholesale ${(wholesaleInterestUSD / 1e6).toFixed(1)}M corpDep ${(corporateDepositInterestUSD / 1e6).toFixed(1)}M`
      + ` | stocks: cash ${(prevBanking.cashReservesUSD / 1e9).toFixed(2)}B bizLoans ${(businessLoanUSD / 1e9).toFixed(2)}B`
      + ` hhLoans ${(consumerLoanUSD / 1e9).toFixed(2)}B hhDep ${(depositsUSD / 1e9).toFixed(2)}B`
      + ` corpDep ${(corporateDepositsUSD / 1e9).toFixed(2)}B wholesale ${(wholesaleUSD / 1e9).toFixed(2)}B`
      + ` | policy ${(policyRate * 100).toFixed(2)}%`);
  }
  const newBankCapitalRatio = riskWeightedAssetsUSD > 0 ? equityUSD / riskWeightedAssetsUSD : 0.13;
  const capitalGap = 0.12 - newBankCapitalRatio;
  const newCreditConditionsIndex = (capitalGap * 8 + (0.025 - netInterestMarginPct) * 10 + spilloverAdjustment);

  // PUB2: the phantom 1e12 reserves scalar and its stance drift are gone. Reserves are this
  // bank's own cash, which is what the central bank's balance sheet counts as its liability.
  const newCentralBankReservesUSD = Math.max(0, cashUSD);
  // G2 slice 5: M2 is a DERIVED SUM of the real money that exists — this bank's household and
  // corporate deposits, plus the money-fund shares its region's holders own (02b adds those
  // once per region). The `deposits + centralBankReserves x 0.1` formula is deleted: it added
  // a tenth of a phantom 1e12 scalar to a real number and called the total a money stock, so
  // M2 moved when nothing in the economy did. Money-stock changes now decompose exactly into
  // real deposit flows and net origination, which is the check G2 asked for.
  const newMoneySupplyM2USD = depositsUSD + (prevBanking.corporateDepositsUSD ?? 0);

  return {
    // HH: a reported FLOW, not a balance-sheet line — what this bank actually paid its household
    // depositors this week, at its own deposit rate. Read by 02b and summed per region so
    // household income can MEASURE it instead of re-deriving it as `policyRate x 0.6`.
    householdDepositInterestWeeklyUSD: Math.round(weeklyDepositInterestUSD),
    // §5-CLOSE C4: the three flows this evolution DECIDES and 02b PAYS — as payments between
    // named parties, through settlement. Reported here so the payer is the sheet's own reading.
    reservesInterestWeeklyUSD: Math.round(reservesInterestUSD),
    corporateDepositInterestWeeklyUSD: Math.round(corporateDepositInterestUSD),
    dividendWeeklyUSD: Math.round(dividendWeeklyUSD),
    businessLoanBookUSD: Math.round(businessLoanUSD),
    consumerLoanBookUSD: Math.round(consumerLoanUSD),
    depositsUSD: Math.round(depositsUSD),
    sovereignBondHoldingsUSD: Math.round(sovereignUSD),
    cashReservesUSD: Math.round(cashUSD),
    bankEquityUSD: Math.round(equityUSD),
    bankCapitalRatio: Number(newBankCapitalRatio.toFixed(4)),
    netInterestMarginPct: Number(netInterestMarginPct.toFixed(4)),
    // G2: reported from the REAL book by bank-lending.ts after its write-offs; carried here.
    loanLossProvisionRateAnnualPct: prevBanking.loanLossProvisionRateAnnualPct,
    creditConditionsIndex: Number(newCreditConditionsIndex.toFixed(3)),
    centralBankReservesUSD: Math.round(newCentralBankReservesUSD),
    moneySupplyM2USD: Math.round(newMoneySupplyM2USD),
    itemizedHoldings: prevBanking.itemizedHoldings || [],
    // REPO1: this week's secured positions are struck AFTER this function, once the week's cash
    // position is final — all of them in the repo session, the standing facility included, since
    // a window draw is a contract with the central bank as the named lender. These four are then
    // DERIVED from the region's book. What came due settled in step 1 above.
    srfBorrowingUSD: survivingSrfUSD,
    onRrpLendingUSD: 0,
    repoLentUSD: survivingRepoLentUSD,
    repoBorrowedUSD: survivingRepoBorrowedUSD,
    repoEncumberedCollateralUSD: prevBanking.repoEncumberedCollateralUSD ?? 0,
    // G3a: the desks' inventory persists across weeks; only real fills move it, in the stages
    // that own it. This return rebuilds the sheet from a fixed field list, so leaving it out
    // deleted every desk's book every week with no cash leg.
    dealerDeskInventory: prevBanking.dealerDeskInventory,
    // HF1: the margin book is owned by the prime-brokerage stage; carried through untouched.
    primeBrokerageLoansUSD: prevBanking.primeBrokerageLoansUSD ?? 0,
    // G2: the itemized book and the corporate-deposit view are owned by the G2 stages
    // (bank-lending.ts / 02b); carried through evolution untouched.
    businessLoans: prevBanking.businessLoans || [],
    // HH3: the household pools are owned by the household lending pass; carried untouched.
    householdLoans: prevBanking.householdLoans || [],
    // §5-CLOSE: no funding residual is written here. The banks are funded by depositors, the
    // repo book and the central bank's loan — every one a named creditor.
    corporateDepositsUSD,
    // This return rebuilds the sheet from a FIXED FIELD LIST, so anything not named here is
    // silently dropped — these two vanished every week until the identity caught it (804
    // violations). Same trap stage 08 documents; carried explicitly.
    institutionalDepositsUSD: prevBanking.institutionalDepositsUSD ?? 0,
    centralBankLoanUSD: prevBanking.centralBankLoanUSD ?? 0,
    clientMarginUSD: prevBanking.clientMarginUSD ?? 0,
    smeDepositsUSD: prevBanking.smeDepositsUSD ?? 0,
    // Dealer inventories and the tenor book persist across weeks — only real fills change
    // them, in the stages that own them.
    // G3c: the rate this bank actually decided to pay, published so nothing else has to
    // guess at it (the money fund read `policyRate x 0.45` — a second copy of a retired number).
    depositRateAnnual: Number(depositRate.toFixed(6)),
    corpBondDealerInventory: prevBanking.corpBondDealerInventory || [],
    sovereignBondHoldingsByTenor: prevBanking.sovereignBondHoldingsByTenor || {},
    // CAL: carried, never written here — the calendar owns this balance on both books.
    sovereignAccruedCouponUSD: prevBanking.sovereignAccruedCouponUSD ?? 0,
    sovBondDealerInventory: prevBanking.sovBondDealerInventory || [],
    loanDealerInventory: prevBanking.loanDealerInventory || [],
  };
}
