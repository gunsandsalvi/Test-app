/**
 * CALL PROTECTION — what it costs an issuer to retire a bond or loan before it matures.
 *
 * Before this existed, an issuer called any bond at PAR the moment its coupon sat 1% above the
 * current fair rate, and paid nothing for the privilege. That is not a bond anyone would buy: a
 * lender who can be repaid for free whenever rates fall has written the borrower a free option
 * and financed it at a fixed rate. Call protection is what real lenders demand in exchange, and
 * it is why an issuer's refinancing decision is an economic one rather than automatic.
 *
 * Three regimes, each the real market convention for its instrument:
 *
 *   - **SOFT_CALL** — leveraged loans. Prepayable at any time, but a refinancing inside the
 *     first six months pays 101. Loans are floating-rate, so the lender is not exposed to rate
 *     moves; what the soft call protects is the SPREAD the lender underwrote, against an issuer
 *     that reprices the moment the loan market rallies.
 *   - **HARD_NC** — high yield. Non-call for one year from issue. After that the issuer calls on
 *     a declining schedule that opens at par plus half the coupon and falls to par at maturity —
 *     the standard structure, and derived from the issue's own coupon rather than chosen. Inside
 *     the non-call period the issuer can still get out, because there is always a price: it pays
 *     a make-whole to the first call date, which is deliberately punitive.
 *   - **MAKE_WHOLE** — investment grade. No non-call period at all; the issuer may call whenever
 *     it likes, at the greater of par and the present value of everything the holder was going to
 *     receive. That is the point of the structure: it makes a purely rate-driven call
 *     economically neutral, so an IG issuer calls for a real reason (a maturity it wants to
 *     term out, a covenant, an acquisition) and not because the curve moved.
 *
 * The discount rate for a make-whole is the risk-free curve at the remaining tenor plus a small
 * spread — and that spread is not an invented number: it is what the holder must be compensated
 * for beyond the cash flows themselves, which is the cost of going back to the market and
 * replacing the bond. That is the corporate bond dealer's bid-offer, so the two are the same
 * number (`BOND_DEALER_SPREAD_BPS`), and it lands where real make-whole spreads sit.
 */

import { DebtTranche } from './company';

/**
 * The corporate bond dealer's round-trip spread, in bps. Owned here because two things read it:
 * 07b's clearing (what a holder pays to trade) and the make-whole above (what a called holder
 * must be paid to replace its bond). They are the same real cost and must not drift apart.
 */
export const BOND_DEALER_SPREAD_BPS = 15;

/** Weeks of soft-call protection on a new leveraged loan — the market's six months. */
export const LOAN_SOFT_CALL_WEEKS = 26;
/** What a loan repaid inside its soft-call period costs, per dollar: the market's 101. */
export const LOAN_SOFT_CALL_PRICE = 1.01;
/** High yield's non-call period from issue — the market's NC1. */
export const HY_NON_CALL_WEEKS = 52;

export type CallProtectionKind = 'SOFT_CALL' | 'HARD_NC' | 'MAKE_WHOLE';

/**
 * What protection a new issue carries, from what the issue actually is. Bank facilities and
 * commercial paper carry none — a revolver is repayable at par by construction, and CP matures
 * before a call could matter.
 */
export function callProtectionForIssue(args: {
  rateType: 'FIXED' | 'FLOATING';
  isInvestmentGrade: boolean;
  isBankFacility?: boolean;
  isCommercialPaper?: boolean;
}): CallProtectionKind | undefined {
  if (args.isBankFacility || args.isCommercialPaper) return undefined;
  if (args.rateType === 'FLOATING') return 'SOFT_CALL';
  return args.isInvestmentGrade ? 'MAKE_WHOLE' : 'HARD_NC';
}

/** The first date a HARD_NC issue may be called on its schedule. */
export function firstCallWeek(tranche: DebtTranche): number {
  return tranche.originationWeek + HY_NON_CALL_WEEKS;
}

/** Present value per dollar of par of a fixed-coupon stream, annual compounding. */
function presentValuePerDollar(couponRate: number, years: number, discountRate: number, redemptionPerDollar: number): number {
  const d = Math.max(1e-6, discountRate);
  const t = Math.max(0, years);
  const discountFactor = Math.pow(1 + d, -t);
  const annuity = (1 - discountFactor) / d;
  return couponRate * annuity + redemptionPerDollar * discountFactor;
}

/**
 * What it costs to retire one dollar of this tranche THIS WEEK, as a multiple of par.
 *
 * `riskFreeRateAtRemainingTenor` is the cleared zero for the tranche's remaining life (07c owns
 * the curve); it is only consulted where a make-whole applies. Never returns less than par: every
 * real call provision is written as "the greater of par and ...", which is what stops an issuer
 * profiting by calling its own debt after rates rise.
 */
export function callPricePerDollar(
  tranche: DebtTranche,
  currentWeek: number,
  riskFreeRateAtRemainingTenor: number
): number {
  const kind = resolveProtection(tranche);
  if (!kind) return 1;

  if (kind === 'SOFT_CALL') {
    return currentWeek < tranche.originationWeek + LOAN_SOFT_CALL_WEEKS ? LOAN_SOFT_CALL_PRICE : 1;
  }

  const couponRate = tranche.couponRate ?? 0;
  const discountRate = riskFreeRateAtRemainingTenor + BOND_DEALER_SPREAD_BPS / 10000;
  const yearsToMaturity = (tranche.maturityWeek - currentWeek) / 52;

  if (kind === 'MAKE_WHOLE') {
    return Math.max(1, presentValuePerDollar(couponRate, yearsToMaturity, discountRate, 1));
  }

  // HARD_NC. After the non-call date the issuer pays the published schedule: par plus half the
  // coupon at first call, declining to par at maturity in proportion to the life left.
  const callable = firstCallWeek(tranche);
  const firstCallPricePerDollar = 1 + couponRate / 2;
  if (currentWeek >= callable) {
    const scheduleYears = Math.max(1e-6, (tranche.maturityWeek - callable) / 52);
    const remainingShare = Math.max(0, Math.min(1, yearsToMaturity / scheduleYears));
    return 1 + (firstCallPricePerDollar - 1) * remainingShare;
  }
  // Inside the non-call period there is still a price — a make-whole to the FIRST CALL DATE,
  // redeeming at that date's call price. Punitive by design, which is what "non-call" means in
  // practice: not forbidden, just expensive enough that almost nobody does it.
  const yearsToFirstCall = (callable - currentWeek) / 52;
  return Math.max(1, presentValuePerDollar(couponRate, yearsToFirstCall, discountRate, firstCallPricePerDollar));
}

/**
 * Tranches created before call protection existed carry no kind. A floating tranche is a loan and
 * a fixed one is treated as the most permissive regime, so old paper never becomes retrospectively
 * uncallable — the honest default for data that predates the rule.
 */
function resolveProtection(tranche: DebtTranche): CallProtectionKind | undefined {
  if (tranche.isBankFacility || tranche.isCommercialPaper) return undefined;
  if (tranche.callProtection) return tranche.callProtection;
  return tranche.rateType === 'FLOATING' ? 'SOFT_CALL' : 'MAKE_WHOLE';
}
