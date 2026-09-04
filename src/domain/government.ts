/**
 * PUB1 — the government as a real counterparty.
 *
 * Before this, a sovereign tranche's `couponRate` was stored and paid by nobody: the government
 * booked no interest expense at all, while banks and money funds were credited carry on the same
 * paper. One side of a real flow.
 */

import { GovDebtTranche, GovDebtTrancheView } from './region-macro';

/**
 * §3.13-SOV row 2 — THE TENOR AT ISSUANCE, DERIVED, IN ONE PLACE.
 *
 * A rung's tenor at issue is `(maturity − origination) / 52` and nothing else. It used to be
 * WRITTEN beside the dates as well, and the two disagreed on 20 of 260 rungs because the seed
 * rounded the two ends separately (rule 4). `GovDebtTranche` is what an issuer states and
 * `GovDebtTrancheView` is what a reader gets, and this is the only thing between them — so an
 * issuer cannot state a tenor and a reader never meets one that was.
 */
export function govTrancheView<T extends GovDebtTranche>(t: T): T & { tenorAtIssuanceYears: number } {
  return { ...t, tenorAtIssuanceYears: (t.maturityWeek - t.originationWeek) / 52 };
}

/**
 * The coupon each sovereign bond pays, by bond id. A holder owns a BOND, not a group of them
 * (§3.13-SOV row 3), so this is a projection of the ladder and not an average of anything.
 */
export function sovereignCouponByBond(tranches: readonly GovDebtTrancheView[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  (tranches ?? []).forEach((t) => {
    // PUB3d: bills pay no coupon — their holders earn accretion instead (see accreteDiscountBills).
    if (isDiscountBill(t.tenorAtIssuanceYears)) return;
    out[t.id] = t.couponRate ?? 0;
  });
  return out;
}

/**
 * What the whole stack costs this week — the government's real interest expense.
 *
 * PUB3d: BILLS ARE EXCLUDED. A treasury bill is a DISCOUNT security: sold below par, no periodic
 * payment, and the whole return is the accretion to par paid at redemption. Its cost lands in the
 * redemption leg (face repaid against discounted proceeds received), not here.
 */
export function weeklyInterestExpenseLocal(tranches: readonly GovDebtTrancheView[] | undefined): number {
  return (tranches ?? [])
    .filter((t) => !isDiscountBill(t.tenorAtIssuanceYears))
    .reduce((a, t) => a + (t.principalLocal * (t.couponRate ?? 0)) / 52, 0);
}

/**
 * PUB3d — a tranche below this tenor is issued at a discount rather than with a coupon. Mirrors
 * `SOV_BILL_MAX_TENOR_YEARS` in the clearing helpers; kept here so the domain can answer "does
 * this pay a coupon" without importing an engine module.
 */
export const DISCOUNT_BILL_MAX_TENOR_YEARS = 1.5;

export function isDiscountBill(tenorAtIssuanceYears: number): boolean {
  return tenorAtIssuanceYears < DISCOUNT_BILL_MAX_TENOR_YEARS;
}

/**
 * What a treasury actually RECEIVES for a discount bill: face discounted at the issue yield over
 * its life. The difference between this and face is the entire cost of the bill, realized when it
 * redeems at par.
 *
 * Getting this wrong in either direction is a real trap. The model used to issue bills at PAR and
 * also pay them a coupon: net cost came out right (receive F, pay r·t·F, repay F), so nothing was
 * visibly broken, but the treasury held the discount as cash for the bill's whole life and holders
 * were paid a coupon that does not exist. Discounting the proceeds while KEEPING the coupon would
 * have been worse than either — it doubles the cost.
 */
export function discountBillProceedsLocal(faceLocal: number, annualYield: number, tenorYears: number): number {
  return faceLocal / (1 + Math.max(-0.99, annualYield) * tenorYears);
}

/**
 * §3.13-SOV row 4 — THE YIELD A BILL'S PRICE IMPLIES. The exact inverse of the line above.
 *
 * A bill is quoted on SIMPLE interest, not compounded: that is the money-market convention and it
 * is what `discountBillProceedsLocal` has always used. `pricing/yieldFromPrice` compounds, which is
 * right for a coupon bond and wrong here — the two differ by about 2bp of price on a 13-week bill
 * at 5%, and swapping one for the other would silently re-price every bill by changing its
 * day-count. That is a different change from making the price the primitive, so the bill keeps
 * its own convention and gets its own inverse (rule 8: the convention is part of the number).
 */
/**
 * §3.13-SOV row 3 — A BOND'S REMAINING TENOR, BY ID. The sovereign books are keyed by bond now,
 * and anything that needs to value a line needs to know how long that particular bond has left.
 * Built from the ladder the caller already holds, so nothing has to guess a tenor from a label.
 * A bond that is not on the ladder returns undefined, and the caller decides — never a default
 * tenor, which is how "value everything as a five-year" gets in.
 */
/**
 * §3.13-SOV row 3 — WHAT THE LADDER KNOWS ABOUT A BOND, BY ID.
 *
 * Everything that used to be answered by parsing a TENOR BUCKET out of an instrument id is
 * answered here from the ladder itself: is this id one of ours, is it a bill, how long has it
 * left. Parsing an id for meaning is what let one holding be a group to one reader and a bond to
 * another; the ladder is the single place that knows.
 */
export interface SovereignLadderIndex {
  /** Is this id a live bond or bill of this region? */
  has(instrumentId: string): boolean;
  /** Is it a BILL — short at issue, returning its discount (`bond.md` N5.c)? */
  isBill(instrumentId: string): boolean;
  /** Years of life LEFT, or undefined when the id is not on this ladder. Never a default. */
  tenorYears(instrumentId: string): number | undefined;
}

export function sovereignLadderIndex(
  tranches: readonly { id: string; maturityWeek: number; tenorAtIssuanceYears: number; principalLocal: number }[] | undefined,
  week: number
): SovereignLadderIndex {
  const live = new Map((tranches ?? []).filter((t) => t.principalLocal > 0).map((t) => [t.id, t] as const));
  return {
    has: (id) => live.has(id),
    isBill: (id) => { const t = live.get(id); return t !== undefined && isDiscountBill(t.tenorAtIssuanceYears); },
    tenorYears: (id) => { const t = live.get(id); return t === undefined ? undefined : Math.max(1 / 52, (t.maturityWeek - week) / 52); },
  };
}

export function sovereignTenorResolver(
  tranches: readonly { id: string; maturityWeek: number }[] | undefined,
  week: number
): (bondId: string) => number | undefined {
  const byId = new Map((tranches ?? []).map((t) => [t.id, t.maturityWeek]));
  return (bondId: string) => {
    const maturity = byId.get(bondId);
    return maturity === undefined ? undefined : Math.max(1 / 52, (maturity - week) / 52);
  };
}

export function billYieldFromPrice(priceFraction: number, tenorYears: number): number {
  if (!(priceFraction > 0) || !(tenorYears > 0)) return 0;
  return (1 / priceFraction - 1) / tenorYears;
}

/**
 * The discount accruing on the bill stack this week — a STATISTIC, never a debit.
 *
 * `weeklyInterestExpenseLocal` is now cash-basis: it is the coupon the government actually pays,
 * and bills pay none. Their cost is real but lands at redemption, so the reported interest line
 * understates the economic burden by exactly this much (measured: bills are ~21% of the stack, and
 * excluding them roughly halved the reported line). Government accounts on an ACCRUAL basis would
 * add this back.
 *
 * It is deliberately not added to the expense: the cost is already in the redemption leg, and
 * charging it here as well is the double count `discountBillProceedsLocal` warns about.
 */
export function weeklyBillDiscountAccrualLocal(tranches: readonly GovDebtTrancheView[] | undefined): number {
  return (tranches ?? [])
    .filter((t) => isDiscountBill(t.tenorAtIssuanceYears))
    .reduce((a, t) => a + (t.principalLocal * (t.couponRate ?? 0)) / 52, 0);
}

/**
 * PUB1's decomposition: `spending = interest + procurement + transfers`.
 *
 * Interest is a contractual claim and comes off the top; what remains is the discretionary
 * budget, splitting by the same procurement share the national accounts use. This is what makes
 * rising debt and rising rates crowd out procurement and transfers — and why interest must NOT
 * be added on top of the deficit, which already includes it.
 *
 * PUB1e: the FISCAL STANCE belongs here, applied to the procurement line only. A stimulus buys
 * more goods; it does not raise the transfer schedule, which is set by program rules. It used to
 * be applied in the demand stage alone, so the goods market bid for a stimulus the treasury's
 * account never paid for.
 *
 * `primaryShare` floors at zero: a government whose interest bill exceeds its whole budget
 * borrows the difference. That is a debt spiral, and it is allowed to happen.
 */
export function decomposeGovernmentSpending(
  spendingWeeklyLocal: number,
  interestWeeklyLocal: number,
  procurementShare: number,
  fiscalStanceScore: number = 0,
  /** PUB3: what the government owes its own staff this week — real headcount x real wages. */
  payrollWeeklyLocal: number = 0
): { interestLocal: number; payrollLocal: number; procurementBudgetLocal: number; transfersLocal: number } {
  const interestLocal = Math.max(0, interestWeeklyLocal);
  const payrollLocal = Math.max(0, payrollWeeklyLocal);
  // Payroll is contractual like interest: it comes off the top, and what is left is the
  // discretionary budget. A government facing a rising wage bill cuts programs, not salaries.
  const primaryLocal = Math.max(0, spendingWeeklyLocal - interestLocal - payrollLocal);
  return {
    interestLocal,
    payrollLocal,
    procurementBudgetLocal: primaryLocal * procurementShare * (1 + fiscalStanceScore * FISCAL_STANCE_PROCUREMENT_SENSITIVITY),
    transfersLocal: primaryLocal * (1 - procurementShare),
  };
}

/**
 * PUB3 — what the government owes its own employees, weekly.
 *
 * The defect this closes: government employees occupy real jobs in the labor market (they are in
 * the occupation pools, 14.3% of employment) and earn real wages inside the labor share — so
 * households receive the money — but NO EMPLOYER EVER PAID IT. The budget had no compensation
 * line at all. Measured at seed: 1.65M USA staff, 8.1% of GDP, entirely unpaid.
 *
 * Worse than a missing leg: because the wages were already in household income via the labor
 * share, and the transfer envelope was sized as the whole primary budget, households were
 * credited the same ~8% of output TWICE — once as wages and once inside transfers. Carving
 * payroll out of the primary budget removes that double count; it does not take income away
 * that anyone was really owed.
 *
 * Real national accounts split a ~36%-of-GDP state as compensation ~8% + purchases ~11% +
 * transfers ~13% + interest ~4%. This is the compensation line.
 */
export function governmentPayrollWeeklyLocal(args: {
  governmentEmployment: number;
  /** Structural base wage per occupation (annual), before the market's own wage index. */
  baseAnnualWageLocal: Record<string, number>;
  /** The pools' live wage indexes — so a tight labor market raises the government's bill too. */
  wageIndexByOccupation: Record<string, number>;
  /** What the government employs, from GOVERNMENT_OCCUPATION_MIX. */
  occupationMix: Partial<Record<string, number>>;
}): number {
  const annualPerHead = Object.entries(args.occupationMix).reduce(
    (a, [occ, share]) =>
      a + (args.baseAnnualWageLocal[occ] ?? 0) * (args.wageIndexByOccupation[occ] ?? 1) * (share ?? 0),
    0
  );
  return (Math.max(0, args.governmentEmployment) * annualPerHead) / 52;
}

/** How far a full stimulus (stance 1.0) lifts the procurement line above its structural share. */
export const FISCAL_STANCE_PROCUREMENT_SENSITIVITY = 0.25;

/**
 * What actually left the treasury's account this week. PUB1e: procurement is the amount the
 * government's bids REALLY filled in the goods market, not what it budgeted — a government that
 * cannot buy what it planned to buy has not spent the money. The difference is unspent budget,
 * and it is named rather than assumed away.
 */
export function governmentOutlaysLocal(parts: {
  interestLocal: number;
  /** PUB3: staff are paid in full — a government does not skip payroll. */
  payrollLocal: number;
  transfersLocal: number;
  procurementSpentLocal: number;
}): number {
  return parts.interestLocal + parts.payrollLocal + parts.transfersLocal + parts.procurementSpentLocal;
}


/**
 * PUB3b — the budget as a sum of real obligations, so the deficit is an OUTCOME.
 *
 * What this replaces: `spending = lastWeekNominalGdpLocal x (taxRate + deficitPct) / 52`. The whole
 * fiscal state was a share of a LAGGED nominal aggregate, which is why revenue (real bases at
 * real prices, since PUB1b/1c) and outlays drifted apart whenever the price level moved — the
 * measured 1.18x wedge that fills the treasury's account.
 *
 * Now every line is a real quantity at a real price: staff the government has, people it owes a
 * benefit to, goods its operations consume, coupons its stack costs. The deficit is what is left
 * when revenue is subtracted, not an input — which also makes the automatic stabilizer real: a
 * recession puts more people on benefits and takes the tax base down, and the deficit widens
 * because both of those really happened.
 */
export function governmentObligationsWeeklyLocal(args: {
  interestWeeklyLocal: number;
  payrollWeeklyLocal: number;
  /** Real unemployed x real wage x the replacement rate — the existing UI computation. */
  unemploymentBenefitsWeeklyLocal: number;
  /** Real retired headcount. */
  retiredPopulation: number;
  /** The pools' real average annual wage — benefits are indexed to earnings, as they are. */
  averageAnnualWageLocal: number;
  fiscalStanceScore: number;
}): { interestLocal: number; payrollLocal: number; transfersLocal: number; procurementBudgetLocal: number; totalLocal: number } {
  const socialBenefitsLocal =
    (Math.max(0, args.retiredPopulation) * Math.max(0, args.averageAnnualWageLocal) * SOCIAL_BENEFIT_REPLACEMENT_RATE) / 52;
  const transfersLocal = Math.max(0, args.unemploymentBenefitsWeeklyLocal) + socialBenefitsLocal;
  const payrollLocal = Math.max(0, args.payrollWeeklyLocal);
  const procurementBudgetLocal =
    payrollLocal * PROCUREMENT_PER_PAYROLL_DOLLAR * (1 + args.fiscalStanceScore * FISCAL_STANCE_PROCUREMENT_SENSITIVITY);
  const interestLocal = Math.max(0, args.interestWeeklyLocal);
  return {
    interestLocal, payrollLocal, transfersLocal, procurementBudgetLocal,
    totalLocal: interestLocal + payrollLocal + transfersLocal + procurementBudgetLocal,
  };
}

/**
 * Benefit paid to the non-working population, as a share of the average wage.
 *
 * Honest about what it aggregates: this ONE program stands for the whole non-unemployment
 * transfer state — public pensions, health, disability, family support — sized by the retired
 * population because that is where the bulk of real transfer spending goes. Splitting it needs
 * those programs modelled separately, and until they are, one named program beats four guesses.
 *
 * The value is not chosen: it is what the model's own real bases (retired headcount x average
 * wage) require to reproduce the transfer level the fiscal block already ran at, and it lands at
 * **51–53% across all four independently-sized regions** — inside the real OECD public
 * replacement-rate band of 40–60%. That agreement is the check that the bases are sane, the same
 * test the national-accounts header applies to the household tax rate.
 */
export const SOCIAL_BENEFIT_REPLACEMENT_RATE = 0.52;

/**
 * Goods and services the government's operations consume, per dollar of its own payroll. An
 * agency with more staff buys more of everything; anchoring to payroll rather than to GDP means
 * procurement moves with real headcount and real wages instead of a nominal aggregate.
 *
 * Measured at 1.06–1.08x across the four regions under the previous share-of-GDP budget. Real
 * national accounts run nearer 1.4x (purchases ~31% of spending against compensation ~22%); this
 * keeps the model's own composition rather than importing that, so the change is a re-basing and
 * not a re-sizing. Moving toward 1.4 is a deliberate composition change, not a fix.
 */
export const PROCUREMENT_PER_PAYROLL_DOLLAR = 1.07;

/** How hard a full stimulus (stance 1.0) leans on government hiring, per week. */
export const GOV_HIRING_RESPONSE_TO_STANCE = 0.0004;

/**
 * CAL — the share of a BOND's annual coupon that is actually due this week.
 *
 * Government paper pays semi-annually from its own issue date, so the rungs of a ladder do not
 * pay in the same week and a region's debt service is lumpy across the year the way a real
 * treasury's is. Zero in most weeks, half a year's coupon in two of them.
 *
 * NOT WIRED YET, DELIBERATELY, AND THIS IS THE CONDITION. Both sides have to move together:
 * `weeklyInterestExpenseLocal` is the government's own smooth accrual, and putting the HOLDERS on
 * coupon dates without putting the TREASURY on them leaves the two disagreeing by exactly the
 * lumpiness — measured the moment it was tried, as the `governmentInterestToUnmodeledHolders`
 * boundary line swinging on coupon weeks. One change to that function and both readers of it,
 * in the same pass, and this is ready for them.
 */
export function sovereignCouponDueShare(tranche: { originationWeek: number }, week: number): number {
  const PAYMENTS_PER_YEAR = 2;
  const periodWeeks = Math.round(52 / PAYMENTS_PER_YEAR);
  // A bond's coupon dates are counted from the day it was ISSUED — the real schedule, and the
  // reason the ladder's rungs pay on different weeks rather than all at once. This used to hash
  // the tenor-bucket label, which had no issue date to count from.
  return (week - tranche.originationWeek) % periodWeeks === 0 ? 1 / PAYMENTS_PER_YEAR : 0;
}

