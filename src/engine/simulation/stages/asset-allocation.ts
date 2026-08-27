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
  CORP_BOND: 0.08, // legacy flat charge — superseded for credit by the rating x duration schedule below
  LEVERAGED_LOAN: 0.06,
} as const;

/**
 * Spread-risk capital per notch, PER YEAR OF DURATION — the real structure every capital regime
 * shares (Solvency-style spread SCR, NAIC C1, ratings-based RWA all step the charge by rating
 * and scale it with duration). This is what gives the investment-grade ladder its slope: the
 * honest expected loss on an A versus a AA is a handful of basis points, yet the market prices
 * them tens apart, because what actually differs is the CAPITAL a regulated holder must carry
 * against spread volatility — and that volatility steps with rating. A flat within-IG charge
 * (the first version of this file) made every IG reservation identical and flattened the whole
 * ladder; the fix is the real regulatory structure, not a fitted curve. Magnitudes are
 * structural modelling choices in the range real regimes occupy (rule 4), roughly geometric
 * through investment grade and steepening below it.
 */
const SPREAD_RISK_CAPITAL_PER_DURATION_YEAR: Record<CreditRating, number> = {
  AAA: 0.009, AA: 0.011, A: 0.014, BBB: 0.025, BB: 0.045, B: 0.075, CCC: 0.075, D: 0.075,
};
/** Real regimes taper the marginal duration factor on long paper; cap the linear scaling. */
const MAX_CHARGEABLE_DURATION_YEARS = 7;

export function spreadRiskCapitalChargeRate(rating: CreditRating, durationYears: number): number {
  const d = Math.min(MAX_CHARGEABLE_DURATION_YEARS, Math.max(0.5, durationYears));
  return SPREAD_RISK_CAPITAL_PER_DURATION_YEAR[rating] * d;
}

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
  // A sponsor underwrites deals to a real LBO hurdle — higher than every liquid-market holder,
  // which is why it owns companies rather than paper.
  PRIVATE_EQUITY: 0.20,
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
    case 'ASSET_MANAGER':
      // Above 1 on purpose: asset managers run DEDICATED high-yield and loan funds, and in real
      // markets they are the majority holders of high yield (~55-70% via funds and ETFs) even
      // though their share of the investment-grade market is far smaller. Per dollar of an asset
      // manager's structural corporate share, its high-yield appetite is a multiple of its
      // investment-grade appetite — that multiple IS the dedicated-fund complex. Without it,
      // deleting the per-name renormalisation (§7.19 item 2) left the high-yield buyer base
      // below the float and every HY name cleared at demand saturation instead of on two-sided
      // schedules.
      return 2.0;
    default:
      // Distressed funds are there for precisely this paper; not size-constrained by rating.
      return 1.0;
  }
}

/**
 * The distressed buyer's reservation — a SECOND PRICING REGIME, not a wider version of the
 * spread one.
 *
 * Performing credit prices off spread versus expected loss plus capital cost (the regime above).
 * A distressed buyer does not think in spread at all: it thinks in CASH PRICE versus what the
 * claim will actually pay. Recovery arrives only after a workout measured in years, and the
 * buyer discounts it at its own hurdle — which is why a bond can and does trade BELOW its
 * recovery value: 40 cents recovered two years from now at a 22% required return is worth about
 * 27 cents today, and the earlier version of this file that treated recovery as a price floor
 * had that exactly backwards (recorded in the plan, §7.16's amendment). The gap between price
 * and recovery IS the distressed return.
 *
 * The arithmetic: over the expected workout horizon the claim either defaults (probability
 * compounded from the issuer's real annual hazard) and pays recovery, or survives and pays
 * roughly par. The most the buyer pays is that expected terminal value discounted at its
 * hurdle; the auction quotes in spread, so the price converts via the same exp(-s·d)
 * approximation used everywhere else.
 *
 * Two properties matter, and both are consequences rather than rules:
 *   - For a healthy issuer this reservation sits FAR wider than any regulated holder's (there
 *     is no distressed return in a performing bond), so the fund is naturally absent from
 *     expensive paper.
 *   - There is NO spread at which the fund has no bid — as the level widens, the implied cash
 *     price falls until the IRR clears. That standing bid at some price is what actually
 *     arrests a widening, and it is why the engine needs no economic ceiling at all.
 */
export const EXPECTED_WORKOUT_YEARS = 2;

export function computeDistressedReservationSpreadBps(params: {
  annualDefaultProbability: number;
  recoveryRate: number;
  durationYears: number;
}): number {
  const h = REQUIRED_RETURN_ON_CAPITAL.HEDGE_FUND;
  const T = EXPECTED_WORKOUT_YEARS;
  const pd = Math.min(0.99, Math.max(0, params.annualDefaultProbability));
  const defaultProbOverWorkout = 1 - Math.pow(1 - pd, T);
  const expectedTerminalValuePerPar =
    defaultProbOverWorkout * params.recoveryRate + (1 - defaultProbOverWorkout) * 1.0;
  const maxPricePerPar = expectedTerminalValuePerPar / Math.pow(1 + h, T);
  const d = Math.max(0.5, params.durationYears);
  return (-Math.log(Math.max(1e-6, maxPricePerPar)) / d) * 10000;
}

/**
 * How much more of a name a distressed fund will take than its size alone implies. When paper is
 * cheap enough to clear a 22% hurdle these are concentrated, high-conviction positions — that
 * concentration is the strategy, and it is what lets a comparatively small pool of capital set
 * the price at the wides.
 */
export const DISTRESSED_CONVICTION_MULTIPLE = 4.0;
