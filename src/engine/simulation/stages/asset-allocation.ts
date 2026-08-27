/**
 * Cross-asset relative value: how much of an asset class is worth owning at today's price
 *
 * The problem this solves. Every market here clears inside a *closed pot*: a participant's total
 * is a fixed share of the outstanding stock, and per-instrument attractiveness only redistributes
 * that total — and because the clearing engine renormalizes tilted weights, a view every
 * participant shares cancels out exactly. So the model could say "issuer A is cheap versus issuer
 * B" but had no way at all to say "corporate credit as a whole is too tight". With no force
 * acting on the level, corporate spreads random-walked: measured before this, the median USA OAS
 * fell from 88bp to -350bp over 36 weeks, and a bond yielding less than the government curve is
 * not a thing that exists.
 *
 * What a real institution does instead. Nobody holds 30% corporate credit because a document says
 * 30%. They hold credit while it pays them enough for the capital it consumes, and when it stops
 * paying enough they hold something else. The three things that are actually fixed are a hurdle
 * (what the liabilities cost), a risk budget (what regulators charge for holding each asset), and
 * hard constraints (duration, mandate, liquidity). The percentage is the OUTPUT.
 *
 * So the policy percentage becomes the centre of a band — which is literally how a real investment
 * policy statement reads, "corporate credit 30%, range 20-40%" — and where the book sits inside
 * that band is decided by whether the asset currently clears its own cost of capital:
 *
 *     excess = (spread earned - expected credit loss) - (capital charge x required return)
 *
 * Every term is real and already computed elsewhere in this simulation: the spread is the cleared
 * OAS or discount margin, the expected loss comes from the issuer's own leverage and coverage
 * (computeExpectedLossSpreadBps), and the capital charge is what regulation actually costs an
 * institution to hold that asset. Note what this is NOT: an independently invented "fair spread"
 * level, which has no relationship to whatever bootstrapped the market and saturates into a
 * one-way tilt (that failure is recorded in the plan's lessons, from the sovereign curve).
 *
 * Why it can act on the level when a tilt cannot: this scales the SIZE of the real, already-bounded
 * pool rather than redistributing a fixed one. Money that leaves credit becomes real cash on the
 * entity's balance sheet, and buys back in when spreads have widened enough to pay for themselves.
 * That is the same mechanism S2 gave banks when it let them choose bonds versus reserves, which is
 * what finally anchored the front end of the sovereign curve — generalised here.
 */

import { CreditRating, InstitutionalEntityType } from '../../../types';

/**
 * What holding a dollar of each asset class costs an institution in regulatory capital. The
 * ordering and rough magnitudes are the real structure every capital regime shares — government
 * bonds are treated as riskless and cost almost nothing, investment-grade credit costs a little,
 * high yield a lot, and secured loans somewhat less than the unsecured paper of the same issuer
 * because the collateral is real. These are structural modelling choices, not a copied rulebook.
 */
export const CAPITAL_CHARGE_BY_ASSET_CLASS = {
  GOV_BOND: 0.01,
  CORP_BOND: 0.08,
  LEVERAGED_LOAN: 0.06,
} as const;

/**
 * What a sub-investment-grade exposure costs in capital instead. Every real regime steps the
 * charge up sharply below the investment-grade line rather than forbidding the asset, and that
 * step is the whole reason regulated books are structurally light in high yield: the position has
 * to clear a much higher bar to be worth its capital, so these holders only appear once the paper
 * is genuinely cheap.
 */
export const SUB_INVESTMENT_GRADE_CAPITAL_CHARGE = 0.20;

/**
 * What each institution needs to earn on the capital it puts at risk, which is what its own
 * liabilities cost it: an insurer discounting claim reserves, a pension fund's actuarial
 * assumption, an asset manager's benchmark plus its fee. Higher hurdle, more spread demanded
 * before the asset is worth owning.
 */
export const REQUIRED_RETURN_ON_CAPITAL: Record<InstitutionalEntityType, number> = {
  INSURER: 0.09,
  PENSION_FUND: 0.07,
  ASSET_MANAGER: 0.11,
  // A distressed fund needs a great deal more, which is exactly why it is absent when paper is
  // expensive and present when it is cheap. Its high hurdle is not a handicap — it is what makes
  // it the marginal buyer at the wides, the bid that arrests a widening after everyone with a
  // lower hurdle has already stopped.
  HEDGE_FUND: 0.22,
};

/**
 * How far the book may sit from its policy centre. The band is the real guideline — an investment
 * policy statement constrains the range, not the point — so this is a genuine structural limit
 * rather than a cap on a price: a mandate does not let a credit fund hold zero credit however
 * cheap cash looks, nor double its allocation however wide spreads go.
 */
export const MAX_ALLOCATION_BAND = 0.45;

/** Excess spread, in bps, that moves the book fully to one edge of its band. */
const EXCESS_SPREAD_FULL_TILT_BPS = 120;

/**
 * How far this asset class's real compensation sits above or below what it costs to hold, as a
 * fraction of the policy allocation. Positive means it pays more than its capital costs and the
 * book leans in; negative means it does not and the book leans out, releasing real cash.
 */
export function computeAllocationTilt(params: {
  entityType: InstitutionalEntityType;
  /** Spread actually earned over the risk-free curve: cleared OAS, or a loan's discount margin. */
  earnedSpreadBps: number;
  /** Expected credit loss on that same exposure, in bps — what the spread has to cover first. */
  expectedLossBps: number;
  /** Regulatory capital consumed per dollar held. */
  capitalChargeRate: number;
}): number {
  const requiredSpreadBps =
    params.capitalChargeRate * REQUIRED_RETURN_ON_CAPITAL[params.entityType] * 10000;
  const excessBps = params.earnedSpreadBps - params.expectedLossBps - requiredSpreadBps;
  const raw = excessBps / EXCESS_SPREAD_FULL_TILT_BPS;
  return Math.max(-MAX_ALLOCATION_BAND, Math.min(MAX_ALLOCATION_BAND, raw));
}

/**
 * The spread at which a holder is indifferent — its RESERVATION PRICE for the asset.
 *
 * This is the same arithmetic `computeAllocationTilt` performs, used the way it should always
 * have been used. A spread has to cover, in order: the credit loss actually expected on the
 * exposure, and the return the holder needs on the regulatory capital the position ties up.
 * Below that level the asset does not pay for itself and a rational holder wants none of it;
 * above it, the excess is real compensation and it scales in.
 *
 * Feeding this to the auction as a price is what stops a spread settling through zero — not
 * because anything clamps it, but because demand at a tighter level is genuinely zero. It also
 * means the floor moves with the issuer: a deteriorating credit's expected loss rises, its
 * reservation spread rises with it, and its bonds cheapen because holders now need more to keep
 * owning them. That is the mechanism that makes spreads track credit rather than ownership.
 *
 * Credit conditions shift every holder's required compensation together, which is what a credit
 * cycle does to the price of risk.
 */
export function computeReservationSpreadBps(params: {
  entityType: InstitutionalEntityType;
  expectedLossBps: number;
  capitalChargeRate: number;
  creditConditionsIndex: number;
}): number {
  const capitalCostBps =
    params.capitalChargeRate * REQUIRED_RETURN_ON_CAPITAL[params.entityType] * 10000;
  const creditConditionsBps = params.creditConditionsIndex * CREDIT_CONDITIONS_REQUIRED_SPREAD_BPS;
  return params.expectedLossBps + capitalCostBps + creditConditionsBps;
}

/** How much a one-point move in credit conditions changes what holders demand to be paid. */
const CREDIT_CONDITIONS_REQUIRED_SPREAD_BPS = 40;

/**
 * How far past its reservation level the spread must go before a holder takes its full size. A
 * real demand curve is not a step function: some holders come in early, others need to be paid
 * considerably more, and the range is what gives the curve its slope.
 */
export const FULL_SIZE_SPREAD_RANGE_BPS = 250;

/**
 * The most a holder will take of one name relative to its structural share of it, when the
 * spread is generous. Real money does run overweights; it does not run unlimited ones, because
 * concentration in a single issuer is its own risk regardless of how well it pays.
 */
export const MAX_OVERWEIGHT_MULTIPLE = 2.2;

const INVESTMENT_GRADE: CreditRating[] = ['AAA', 'AA', 'A', 'BBB'];

export function isInvestmentGrade(rating: CreditRating): boolean {
  return INVESTMENT_GRADE.includes(rating);
}

/**
 * How much of a sub-investment-grade name a holder will take relative to the same-sized
 * investment-grade one.
 *
 * This replaces a hard investment-grade-only prohibition, and the reason is worth recording
 * because the prohibition was measurably wrong. Modelled as size zero, insurers and pension funds
 * together held 60% of the sector's assets and bid nothing at any spread on anything sub-IG, so
 * the remaining buyers could not absorb the float of a downgraded name however cheap it got.
 * There was then no level at which demand met supply, the auction ran to its search bound, and B
 * and CCC paper printed at 50,000bp — an artifact of a buyer base that had been legislated out of
 * existence rather than a market outcome.
 *
 * Real regulated books are not IG-only. Insurers hold a small, deliberate sub-IG sleeve; so do
 * pension funds. What makes them structurally light there is the capital charge above, not a ban.
 * So the constraint is expressed the way it really works — a punitive charge that pushes their
 * reservation spread far wider, plus a modest sleeve limit reflecting the internal policy cap
 * that genuinely does exist — which keeps them out of high yield at normal spreads while leaving
 * a real bid at distressed ones. A market always has a clearing price; it is just sometimes a
 * very wide one.
 */
export function subInvestmentGradeSizeFactor(entityType: InstitutionalEntityType): number {
  switch (entityType) {
    case 'INSURER':
      return 0.08;
    case 'PENSION_FUND':
      return 0.10;
    default:
      // Asset managers run dedicated high-yield and loan funds; distressed funds are there for
      // precisely this paper. Neither is size-constrained by rating.
      return 1.0;
  }
}

/**
 * The widest spread a bond can trade at: the one implied by its price sitting on the floor that
 * recovery in default puts under it.
 *
 * Nobody sells a claim for less than what defaulting on it would hand them, so a bond's price
 * cannot fall below its recovery value, and a bounded price is a bounded spread. Discounting at
 * spread s over d years puts the price at exp(-s*d), so the price floor at the recovery rate
 * fixes the spread ceiling at -ln(recovery)/d. For a 40% recovery on five-year paper that is
 * about 1,830bp — a real distressed level, which is the point: this is where the arithmetic of
 * recovery says the market ends, not a chosen cap.
 */
export function recoveryImpliedMaxSpreadBps(recoveryRate: number, durationYears: number): number {
  const r = Math.min(0.95, Math.max(0.01, recoveryRate));
  const d = Math.max(0.25, durationYears);
  return (-Math.log(r) / d) * 10000;
}

/**
 * How much more of a name a distressed fund will take than its size alone implies. When paper is
 * cheap enough to clear a 22% hurdle these are concentrated, high-conviction positions — that
 * concentration is the strategy, and it is what lets a comparatively small pool of capital set
 * the price at the wides.
 */
export const DISTRESSED_CONVICTION_MULTIPLE = 4.0;
