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

import { InstitutionalEntityType } from '../../../types';

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
 * What each institution needs to earn on the capital it puts at risk, which is what its own
 * liabilities cost it: an insurer discounting claim reserves, a pension fund's actuarial
 * assumption, an asset manager's benchmark plus its fee. Higher hurdle, more spread demanded
 * before the asset is worth owning.
 */
export const REQUIRED_RETURN_ON_CAPITAL: Record<InstitutionalEntityType, number> = {
  INSURER: 0.09,
  PENSION_FUND: 0.07,
  ASSET_MANAGER: 0.11,
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
