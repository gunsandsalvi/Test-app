/**
 * §3.17b-i — THE OPTION CLASS. A right, not an obligation, on the one book: the holder (A) pays
 * a PREMIUM once — a periodic leg that fires in the strike week and never again — and at expiry
 * the contract EXERCISES at intrinsic value, an event termination the lifecycle pays like any
 * other. Between the two it is marked at its value (Black–Scholes at the name's own realised
 * volatility, the input stage 12 already used — an options book to imply a volatility from is
 * 17b-iii's), so variation margin moves the value week by week and the exercise is the true-up
 * to intrinsic, exactly as a cleared option is margined.
 *
 * reference: the issuer whose SHARES it is on, or the region's composite INDEX (§3.17b-iii, the
 * market's book). termKey: 'CALL' | 'PUT'. strike: the
 * strike per share. units: the shares. notional: units × the share price at strike — the
 * exposure the writer carries, which is what margin is sized on (§3.17-ii) and capacity
 * charged on (the CEM equity add-on). The player's options (stage 12) and a market for anyone
 * else's are 17b-ii and 17b-iii; this is the contract.
 */

import { DerivativeClassProfile, DerivativeMarketView } from '../profile';
import { DerivativeContract, sharesReferenceOf, indexReferenceOf, optionTypeOf } from '../contract';
// The one Black–Scholes pricer the model has (stage 12 reads it); the domain imports it rather
// than carry a second copy.
import { calculateBlackScholesGreeks } from '../../../engine/blackScholes';

/** §3.17b-iii — WHAT THE OPTION IS ON: an issuer's shares, or a region's composite index. */
function underlyingOf(c: DerivativeContract, m: DerivativeMarketView): { spot: number; vol: number | undefined; move: number | undefined } {
  if (c.reference.kind === 'INDEX') {
    const r = indexReferenceOf(c);
    return { spot: m.indexLevel(r), vol: m.indexAnnualVol(r), move: m.indexWeeklyMove(r) };
  }
  const issuerId = sharesReferenceOf(c);
  return { spot: m.equityPrice(issuerId), vol: m.equityAnnualVol(issuerId), move: m.equityWeeklyMove(issuerId) };
}

/** The option's value to the holder at this week's print, per the units it is on. Null with no
 *  print or no volatility to price at. */
function valueToHolder(c: DerivativeContract, m: DerivativeMarketView): number | null {
  const { spot, vol } = underlyingOf(c, m);
  if (!(spot > 0) || !(c.units !== undefined && c.units > 0)) return null;
  const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
  if (remainingWeeks === 0) return intrinsicToHolder(c, spot);
  if (vol === undefined || !(vol > 0)) return null;
  return calculateBlackScholesGreeks(spot, c.strike, remainingWeeks / 52, m.overnightRateAnnual(c.regionId), vol, optionTypeOf(c)).price * c.units;
}

/** The listed tenor an index option is written at: one quarter. */
export const OPTION_TENOR_WEEKS = 13;

/**
 * At the money, an option's price is close to `0.4 × S × σ × √T` (the Brenner–Subrahmanyam
 * approximation), which is what lets a writer state its reservation as a VOLATILITY: the
 * volatility whose premium pays the return it needs on the capital the position consumes,
 * on top of the volatility it expects to realise.
 */
export const ATM_PRICE_PER_VOL_SQRT_T = 0.4;
export function writerReservationVol(args: {
  realisedVol: number;
  /** The capital the writer's position consumes, per unit of notional. */
  capitalChargeRate: number;
  requiredReturnAnnual: number;
  tenorYears: number;
}): number {
  const premiumNeeded = Math.max(0, args.capitalChargeRate) * Math.max(0, args.requiredReturnAnnual) * args.tenorYears;
  return Math.max(0, args.realisedVol) + premiumNeeded / (ATM_PRICE_PER_VOL_SQRT_T * Math.sqrt(Math.max(1e-9, args.tenorYears)));
}

/** What exercise pays the holder: the shares' distance through the strike, on the shares. */
function intrinsicToHolder(c: DerivativeContract, spot: number): number {
  const perShare = optionTypeOf(c) === 'CALL' ? Math.max(0, spot - c.strike) : Math.max(0, c.strike - spot);
  return perShare * (c.units ?? 0);
}

export const OPTION_PROFILE: DerivativeClassProfile = {
  id: 'OPTION',
  roleA: 'HOLDER',
  roleB: 'WRITER',
  // Basel CEM equity add-on beyond one year, 10%: the writer's potential future exposure.
  pfeAddOnRate: 0.10,
  /** §3.17-ii: the shares' own weekly move on the exposure. */
  closeOutMoveOf: (c, m) => underlyingOf(c, m).move,
  /** THE PREMIUM, ONCE: the option's value at the strike week's print, paid by the holder to the
   *  writer the week the contract is struck — a periodic leg that fires once. (An option's
   *  market settles AFTER it strikes, so the strike week's settle is the first the contract sees.) */
  periodicLegUSDToB: (c, m) => {
    if (m.week !== c.struckWeek) return null;
    const premium = valueToHolder(c, m);
    return premium !== null && premium > 0 ? { usdToB: premium, reason: 'option premium' } : null;
  },
  markToMarketUSDToA: (c, m) => valueToHolder(c, m),
  markReasonLive: 'option variation margin',
  markReasonFinal: 'option expired',
  /** EXERCISE: at expiry the contract terminates at intrinsic value — what the holder is owed
   *  beyond what variation margin already paid. Worthless expiry is the same event at zero. */
  eventTermination: (c, m) => {
    if (c.maturityWeek > m.week) return null;
    const { spot } = underlyingOf(c, m);
    const intrinsic = spot > 0 ? intrinsicToHolder(c, spot) : 0;
    return { usdToB: -(intrinsic - (c.settledMarkLocal ?? 0)), reason: intrinsic > 0 ? 'option exercised' : 'option expired' };
  },
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};
