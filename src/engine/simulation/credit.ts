import { CreditRating } from '../../types';
import { DEFAULT_COVERAGE_FLOOR } from './stages/shared-helpers';

/**
 * Credit rating cutoffs are a geometric progression anchored on two structural constants
 * already used elsewhere in the simulation's own default logic: LEVERAGE_CEILING (the
 * debt/EBITDA multiple beyond which a firm cannot service its debt) and COVERAGE_FLOOR
 * (the interest-coverage level below which default is triggered — see the newCoverage < 0.8
 * default check in simulation/core.ts). Each notch up the rating scale requires a constant
 * proportional step of extra leverage headroom / coverage cushion (DECAY_RATIO), rather than
 * thresholds copied from any real rating agency's published scale.
 */
const LEVERAGE_CEILING = 9.0; // leverage at the CCC/default boundary
const COVERAGE_FLOOR = DEFAULT_COVERAGE_FLOOR; // coverage at the CCC/default boundary — the one shared trigger definition
const DECAY_RATIO = 0.7; // proportional safety-margin step between adjacent rating notches

function leverageCutoff(notch: number): number {
  return LEVERAGE_CEILING * Math.pow(DECAY_RATIO, notch);
}
function coverageCutoff(notch: number): number {
  return COVERAGE_FLOOR / Math.pow(DECAY_RATIO, notch);
}

const RATING_SCALE: CreditRating[] = ['CCC', 'B', 'BB', 'BBB', 'A', 'AA', 'AAA'];

/**
 * CRD-R1 — WHAT AN ANALYST LOOKS AT BESIDES TWO RATIOS, and the model measures all of it already.
 *
 * Every field here is a MEASUREMENT the simulation takes anyway; nothing is a new stated weight.
 * Absent = the caller has not got it, and the notch it would have moved is simply not applied —
 * which is what "no opinion" means, not a default assumption.
 */
export interface CreditContext {
  /** Scale: a $50B issuer and a $500M one at identical leverage are not the same credit. */
  annualRevenueUSD?: number;
  /** The median issuer's revenue in the same market, so scale is RELATIVE and not a stated size. */
  peerMedianRevenueUSD?: number;
  /** 09-concentration-risk measures these every week and nothing has ever priced off them. */
  customerConcentration?: number;
  supplierConcentration?: number;
  /** Refinancing: the share of the debt ladder falling due inside a year. */
  maturityWallShare?: number;
  /** Liquidity against that wall: cash plus the committed revolver, over debt. */
  liquidityToDebt?: number;
  /** Earnings volatility — `revenueHistory`'s own coefficient of variation. */
  revenueVolatility?: number;
}

/**
 * CRD-R1 — a rating is the two ratios, NOTCHED by what else is measurable about the issuer.
 *
 * The spine stays: leverage and coverage put the firm on the ladder. Then each measurement above
 * moves it by at most one notch, in the direction an analyst would move it, at a threshold that
 * is the measurement's OWN natural break (a concentration above a half, a wall over a third of
 * the ladder, volatility above a quarter) rather than a fitted weight. **Two firms with identical
 * leverage and coverage now rate differently, and the gap is attributable to a named measurement.**
 */
export function determineCreditRating(
  leverage: number,
  interestCoverage: number,
  ctx?: CreditContext
): CreditRating {
  let notch: number;
  if (interestCoverage < COVERAGE_FLOOR || leverage > LEVERAGE_CEILING) notch = 0;
  else if (interestCoverage < coverageCutoff(1) || leverage > leverageCutoff(1)) notch = 1;
  else if (interestCoverage < coverageCutoff(2) || leverage > leverageCutoff(2)) notch = 2;
  else if (interestCoverage < coverageCutoff(3) || leverage > leverageCutoff(3)) notch = 3;
  else if (interestCoverage < coverageCutoff(4) || leverage > leverageCutoff(4)) notch = 4;
  else if (interestCoverage < coverageCutoff(5) || leverage > leverageCutoff(5)) notch = 5;
  else notch = 6;

  if (ctx) {
    // SCALE, relative to the issuers it is rated against — an order of magnitude either way.
    if (ctx.annualRevenueUSD !== undefined && (ctx.peerMedianRevenueUSD ?? 0) > 0) {
      const rel = ctx.annualRevenueUSD / ctx.peerMedianRevenueUSD!;
      if (rel > 10) notch += 1;
      else if (rel < 0.1) notch -= 1;
    }
    // CONCENTRATION: a firm whose fortunes hang on one counterparty is a worse credit at the same
    // leverage, on either side of its book. This is 09-concentration-risk's first consumer.
    if ((ctx.customerConcentration ?? 0) > 0.5) notch -= 1;
    if ((ctx.supplierConcentration ?? 0) > 0.5) notch -= 1;
    // REFINANCING: a ladder due inside a year is a different credit from one spread over ten —
    // unless the cash and the revolver already cover it, which is exactly what a liquidity test is.
    if ((ctx.maturityWallShare ?? 0) > 0.33 && (ctx.liquidityToDebt ?? 1) < 0.33) notch -= 1;
    // EARNINGS VOLATILITY: the same leverage is heavier on a cash flow that moves.
    if ((ctx.revenueVolatility ?? 0) > 0.25) notch -= 1;
  }

  return RATING_SCALE[Math.max(0, Math.min(RATING_SCALE.length - 1, notch))];
}
