import { BankingSector, householdBookRwaUSD, CONSUMER_CREDIT_RISK_WEIGHT, WHOLESALE_FUNDING_SPREAD_BPS } from '../../types';

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
 * RULE 13, OPEN: it is still a stated split. Where a household's saving goes is a portfolio
 * choice it should make on the yields it can see — the deposit rate, the money fund, the direct
 * register — and WS7 already models one leg of exactly that choice. Owner: MAC (6).
 */
export const HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE = 0.3;

/** Share of deposits a bank's own treasury keeps as ready cash — its operating-buffer policy.
 * Below it the bank funds itself (repo, then the SRF); this is a behavioural policy choice,
 * not a regulatory formula. */
export const MIN_CASH_BUFFER_RATIO = 0.02;
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
  return sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD + sovUSD
    + Math.max(0, sheet.cashReservesUSD) + (sheet.repoLentUSD ?? 0);
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
    + (sheet.smeDepositsUSD ?? 0) + (sheet.unmodeledDepositsUSD ?? 0) + (sheet.wholesaleFundingUSD ?? 0);
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
 * The CEILING on it: funding the bank has raised and has neither lent out nor kept as cash has
 * to sit in something that pays. This is a residual of the bank's own balance sheet, so the
 * sector's appetite sums to whatever the sector's unlent funding is — it cannot exceed the
 * market several times over the way `deposits x a ratio` did, and it cannot be a share of a
 * market the bank has never seen.
 */
export function investableSurplusUSD(sheet: BankingSector): number {
  const fundingUSD = Math.max(0, sheet.depositsUSD) + (sheet.corporateDepositsUSD ?? 0)
    + (sheet.institutionalDepositsUSD ?? 0) + (sheet.smeDepositsUSD ?? 0)
    + (sheet.unmodeledDepositsUSD ?? 0) + (sheet.wholesaleFundingUSD ?? 0)
    + Math.max(0, sheet.bankEquityUSD);
  const deployedUSD = sheet.businessLoanBookUSD + sheet.consumerLoanBookUSD
    + Math.max(0, sheet.cashReservesUSD) + (sheet.repoLentUSD ?? 0);
  return Math.max(0, fundingUSD - deployedUSD);
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
  businessLoanBookInputUSD: number,
  estimatedHouseholdIncomeUSD: number,
  savingsRate: number,
  policyRate: number,
  creditContagionBps: number,
  unemploymentRate: number,
  /** The book-weighted annual yield of THIS bank's real tenor book at the real cleared curve
   * (computeSovereignBookAnnualYield). Rule 9: annualised decimal. */
  sovereignBookAnnualYield: number,
  spilloverAdjustment: number = 0,
  /** WS6: last week's overnight repo book and the rate it was struck at (annualised decimal).
   * The positions mature here as explicit flows — principal and interest both. Zero until the
   * repo market exists or when the bank had no position. */
  priorRepoBorrowedUSD: number = 0,
  priorRepoLentUSD: number = 0,
  priorRepoRateAnnual: number = 0,
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
  competingMmfYieldAnnual: number = 0
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

  // ---- 1. Overnight maturations: last week's secured funding comes due. ----
  // SRF: repay principal plus one week's interest at the posted rate. (This week's draw, if
  // any, happens in 02b after this function, once the week's cash position is final.)
  const srfDueUSD = prevBanking.srfBorrowingUSD ?? 0;
  const srfInterestUSD = (srfDueUSD * (policyRate + SRF_SPREAD_BPS / 10000)) / 52;
  cashUSD -= srfDueUSD + srfInterestUSD;
  equityUSD -= srfInterestUSD;
  // Repo (WS6): borrowed principal returns to the lender with interest; lent principal returns
  // to this bank with interest. Interest is P&L; principal is not.
  const repoBorrowInterestUSD = (priorRepoBorrowedUSD * priorRepoRateAnnual) / 52;
  cashUSD -= priorRepoBorrowedUSD + repoBorrowInterestUSD;
  equityUSD -= repoBorrowInterestUSD;
  const repoLendInterestUSD = (priorRepoLentUSD * priorRepoRateAnnual) / 52;
  cashUSD += priorRepoLentUSD + repoLendInterestUSD;
  equityUSD += repoLendInterestUSD;

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
  // balance (rule 3). What remains here are the two flows settlement does not carry: the money
  // fund's diversion and last week's ETF purchases. `weeklySavingsInflowUSD` survives only as the
  // funding-pressure signal below, which is what it was always genuinely measuring.
  const householdDepositFlowUSD = -householdMmfDiversionUSD - priorHouseholdEtfPurchasesUSD;
  depositsUSD += householdDepositFlowUSD;
  cashUSD += householdDepositFlowUSD;

  // HH4d: wholesale funding pays its way — a real spread over policy on a stock split out at
  // seed (issuance/retirement awaits a bank-liability project).
  const wholesaleUSD = prevBanking.wholesaleFundingUSD ?? 0;
  const wholesaleInterestUSD = (wholesaleUSD * (policyRate + WHOLESALE_FUNDING_SPREAD_BPS / 10000)) / 52;
  cashUSD -= wholesaleInterestUSD;
  equityUSD -= wholesaleInterestUSD;

  // SETL2: corporate balances ARE funding now — company payments settle through bank books, so
  // the line has real reserves behind it (settlement.ts moves them, the seed opens with them).
  // And funding costs money: what a corporate treasurer is owed is not a chosen number, because
  // this model already simulates the alternative it would take — sweeping to the money fund the
  // moment the bank underpays — so the rate a corporate balance commands is the fund's own yield.
  const corporateDepositsUSD = prevBanking.corporateDepositsUSD ?? 0;
  const corporateDepositRateAnnual = Math.max(0, competingMmfYieldAnnual);
  const corporateDepositInterestUSD = (corporateDepositsUSD * corporateDepositRateAnnual) / 52;
  cashUSD -= corporateDepositInterestUSD;
  equityUSD -= corporateDepositInterestUSD;

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
  // RULE 1, OPEN: 0.45 is an observed deposit beta — a real-world pass-through — and it is the
  // same for every bank. It is described as a floor the competitive rate rises above, but it IS
  // the rate in any week the money fund is not taking funding, which is most of them. What a bank
  // pays for deposits should come from its own funding need against the alternatives its
  // depositors can see. Owner: G3 (8).
  const betaFloorRate = policyRate * 0.45;
  const fundingPressure = weeklySavingsInflowUSD > 0
    ? Math.max(0, Math.min(1, householdMmfDiversionUSD / (weeklySavingsInflowUSD * HOUSEHOLD_SAVINGS_TO_DEPOSITS_SHARE)))
    : 0;
  const depositRate = Math.max(betaFloorRate, betaFloorRate + (competingMmfYieldAnnual - betaFloorRate) * fundingPressure);
  // Reserves earn the policy rate — the floor-system IOR. The 0.85 "tiering" haircut and the
  // bank-side ON RRP parking it justified are gone: a bank whose reserves earn IOR never goes
  // to the RRP window, which is exactly the real system.
  // PUB1: the sovereign book earns its real COUPONS (passed in, paid by the government in
  // stage 11), not a carry-at-market-yield the issuer never funded. `sovereignBookAnnualYield`
  // is still the curve read used elsewhere; it no longer credits income here.
  const weeklyInterestIncomeUSD = (Math.max(0, cashUSD) * policyRate) / 52
    + itemizedLoanInterestWeeklyUSD + householdLoanInterestWeeklyUSD + sovereignCouponWeeklyUSD;
  cashUSD += weeklyInterestIncomeUSD;
  equityUSD += weeklyInterestIncomeUSD;
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
  const regularDividendUSD = Math.min(Math.max(0, weeklyNetIncomeUSD) * targetPayoutRatio, distributableCashUSD());
  cashUSD -= regularDividendUSD;
  equityUSD -= regularDividendUSD;
  const excessCapitalUSD = riskWeightedAssetsUSD > 0 ? equityUSD - riskWeightedAssetsUSD * 0.140 : 0;
  const specialDividendUSD = (riskWeightedAssetsUSD > 0 && equityUSD / riskWeightedAssetsUSD > 0.145)
    ? Math.min(excessCapitalUSD, distributableCashUSD())
    : 0;
  cashUSD -= specialDividendUSD;
  equityUSD -= specialDividendUSD;

  // ---- 7. Statistics — readings of the ledger, never drivers of it. The NIM damping factor
  // that clamped loan yields whenever the margin exceeded 5% is deleted (a clamp on a price,
  // rule 2): if the margin is wrong, its inputs are wrong, and those are G2's to make real. ----
  const totalAssetsUSD = businessLoanUSD + consumerLoanUSD + sovereignUSD + cashUSD + priorRepoLentUSD;
  const netInterestMarginPct = totalAssetsUSD > 0
    ? ((weeklyInterestIncomeUSD - weeklyDepositInterestUSD - wholesaleInterestUSD - corporateDepositInterestUSD) * 52) / totalAssetsUSD
    : 0.025;
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
    householdDepositInterestWeeklyUSD: Number(weeklyDepositInterestUSD.toFixed(0)),
    businessLoanBookUSD: Number(businessLoanUSD.toFixed(0)),
    consumerLoanBookUSD: Number(consumerLoanUSD.toFixed(0)),
    depositsUSD: Number(depositsUSD.toFixed(0)),
    sovereignBondHoldingsUSD: Number(sovereignUSD.toFixed(0)),
    cashReservesUSD: Number(cashUSD.toFixed(0)),
    bankEquityUSD: Number(equityUSD.toFixed(0)),
    bankCapitalRatio: Number(newBankCapitalRatio.toFixed(4)),
    netInterestMarginPct: Number(netInterestMarginPct.toFixed(4)),
    // G2: reported from the REAL book by bank-lending.ts after its write-offs; carried here.
    loanLossProvisionRateAnnualPct: prevBanking.loanLossProvisionRateAnnualPct,
    creditConditionsIndex: Number(newCreditConditionsIndex.toFixed(3)),
    centralBankReservesUSD: Number(newCentralBankReservesUSD.toFixed(0)),
    moneySupplyM2USD: Number(newMoneySupplyM2USD.toFixed(0)),
    itemizedHoldings: prevBanking.itemizedHoldings || [],
    // This week's facility and repo positions are struck AFTER this function, once the week's
    // cash position is final (02b for the SRF; the WS6 repo stage for the market legs). Last
    // week's came due in step 1 above.
    srfBorrowingUSD: 0,
    onRrpLendingUSD: 0,
    repoLentUSD: 0,
    repoBorrowedUSD: 0,
    repoEncumberedCollateralUSD: 0,
    // G2: the itemized book and the corporate-deposit view are owned by the G2 stages
    // (bank-lending.ts / 02b); carried through evolution untouched.
    businessLoans: prevBanking.businessLoans || [],
    // HH3: the household pools are owned by the household lending pass; carried untouched.
    householdLoans: prevBanking.householdLoans || [],
    // Wholesale money is the RESIDUAL, re-derived every week from the identity — the one
    // funding line a treasurer actually chooses, so it is what moves when the others do. It used
    // to be frozen at its seed value forever while deposits grew and the asset book shrank, so
    // the bank went on paying policy-plus-spread on funding it no longer needed (measured: ~200B
    // of phantom wholesale by week 55, on an 826B balance sheet — a large part of §6's negative
    // margin). Same identity as the seed's, applied weekly (bank-lending.ts owns it).
    // Every REAL balance funds the bank; wholesale money is only what is still uncovered. The
    // institutional and boundary lines were missing here, so a bank paid policy-plus-spread on
    // funding its own customers had already provided (measured: NIM breaches 33 → 45 the moment
    // institutional balances arrived — the deposits were on the sheet and the funding line had
    // not noticed).
    wholesaleFundingUSD: Number((
      businessLoanUSD + consumerLoanUSD + sovereignUSD + cashUSD
      - depositsUSD - corporateDepositsUSD
      - (prevBanking.institutionalDepositsUSD ?? 0) - (prevBanking.unmodeledDepositsUSD ?? 0)
      - (prevBanking.smeDepositsUSD ?? 0)
      - equityUSD
    ).toFixed(0)),
    corporateDepositsUSD,
    // This return rebuilds the sheet from a FIXED FIELD LIST, so anything not named here is
    // silently dropped — these two vanished every week until the identity caught it (804
    // violations). Same trap stage 08 documents; carried explicitly.
    institutionalDepositsUSD: prevBanking.institutionalDepositsUSD ?? 0,
    unmodeledDepositsUSD: prevBanking.unmodeledDepositsUSD ?? 0,
    smeDepositsUSD: prevBanking.smeDepositsUSD ?? 0,
    // Dealer inventories and the tenor book persist across weeks — only real fills change
    // them, in the stages that own them.
    corpBondDealerInventory: prevBanking.corpBondDealerInventory || [],
    sovereignBondHoldingsByTenor: prevBanking.sovereignBondHoldingsByTenor || {},
    sovBondDealerInventory: prevBanking.sovBondDealerInventory || [],
    loanDealerInventory: prevBanking.loanDealerInventory || [],
  };
}
