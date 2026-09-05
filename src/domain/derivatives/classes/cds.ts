/**
 * CRD/DER2/DRV — the single-name CDS CLASS. The market's framing (the float is the protection
 * somebody NEEDS; sellers price with the bond book's own arithmetic; cleared spread minus cash
 * OAS is the BASIS) stays documented at the market stage (07h); this module is the CONTRACT:
 * premium weekly, par-less-recovery on a credit event, terminated.
 *
 * strike: the spread struck, in bps of notional per year (rule 8). reference: the reference
 * COMPANY id — the same key the bond book prices. termKey: the tenor (§3.17d-iii: 'c1' | 'c3' |
 * 'c5' | 'c10'), because credit has a term structure and one number is not a curve.
 */

import { DerivativeClassProfile, DerivativeMarketView } from '../profile';
import type { DerivativeContract } from '../contract';
import { issuerReferenceOf } from '../contract';
import { annuityFactor } from '../../pricing';
import { defect } from '../../defect';

/**
 * §3.17d-iii — THE CURVE. Protection is quoted at four tenors, which is a term structure of credit
 * and not one number: a name whose near-term liquidity is fine and whose ten-year is doubtful
 * prints it, and an inversion — the most informative thing a credit market says before a
 * default — can happen. Five years is the BENCHMARK, where single-name liquidity sits and what a
 * name's one quoted spread (`Company.cdsSpreadBps`) and the basis test read. Market-convention
 * primitives of the same kind as the swap book's three tenors.
 */
export type CdsTenorKey = 'c1' | 'c3' | 'c5' | 'c10';
export const CDS_TENOR_YEARS: Record<CdsTenorKey, number> = { c1: 1, c3: 3, c5: 5, c10: 10 };
export const CDS_TENORS: CdsTenorKey[] = ['c1', 'c3', 'c5', 'c10'];
export const CDS_BENCHMARK_TENOR: CdsTenorKey = 'c5';
const cdsTenorYearsOf = (termKey: string): number =>
  Object.hasOwn(CDS_TENOR_YEARS, termKey) ? CDS_TENOR_YEARS[termKey as CdsTenorKey] : defect(`'${termKey}' is no CDS tenor`);
export const cdsTenorWeeksOf = (termKey: string): number => cdsTenorYearsOf(termKey) * 52;
/** The tenor a hedger matches its exposure's remaining life to: the nearest, the shorter on a tie. */
export function nearestCdsTenor(weeksRemaining: number): CdsTenorKey {
  const years = Math.max(0, weeksRemaining) / 52;
  return CDS_TENORS.reduce((best, k) => (Math.abs(CDS_TENOR_YEARS[k] - years) < Math.abs(CDS_TENOR_YEARS[best] - years) ? k : best), CDS_TENORS[0]);
}

/**
 * The large-exposure limit: how much of its own capital a bank will carry against ONE name
 * before it has to lay the rest off. A real regulatory primitive (rule 2 allows those; the
 * leverage floor and risk weights sit beside it). It turns 09-concentration's measurement into
 * a decision: exposure above this is not a preference to hedge, it is a position the bank is
 * not allowed to keep.
 */
export const LARGE_EXPOSURE_LIMIT_OF_CAPITAL = 0.25;

/**
 * What a holder must lay off: the exposure to one name beyond what its capital lets it carry,
 * net of protection it has already bought. A measurement of the holder's own book, not a view —
 * §3.17c: a bank's against its loans, its desk's paper and the protection it wrote; a firm's
 * against the receivables and the contracts it carries on one buyer, at the same rule, because a
 * name that fails takes the same share of whoever's equity it was.
 */
export function protectionNeedLocal(args: {
  exposureLocal: number;
  equityLocal: number;
  alreadyHedgedLocal: number;
}): number {
  const carryableLocal = Math.max(0, args.equityLocal) * LARGE_EXPOSURE_LIMIT_OF_CAPITAL;
  return Math.max(0, args.exposureLocal - carryableLocal - Math.max(0, args.alreadyHedgedLocal));
}

/**
 * §3.17c — A TWO-WAY QUOTE. One reservation, both sides of it: above the spread that covers what
 * the credit costs this participant to carry, it WRITES protection; below it, it BUYS — the print
 * is too tight for the risk at its own cost of capital, which is a view, and two participants with
 * different costs of capital disagree. Stated for the clearing engine as a HOLDER: it opens the
 * auction holding its short capacity of the credit, so selling that down is buying protection and
 * adding to it is writing, and at the reservation exactly it does neither. One ramp of twice the
 * range covers both sides, so the book is as elastic on the bid as on the offer.
 */
export function twoWayProtectionQuote(args: { reservationBps: number; rangeBps: number; sizeLocal: number }): {
  reservationStat: number; fullSizeStatRange: number; maxHoldingLocal: number; currentHoldingLocal: number;
} {
  const size = Math.max(0, args.sizeLocal);
  const range = Math.max(1e-9, args.rangeBps);
  return { reservationStat: args.reservationBps - range, fullSizeStatRange: 2 * range, maxHoldingLocal: 2 * size, currentHoldingLocal: size };
}

export const CDS_PROFILE: DerivativeClassProfile = {
  id: 'CDS',
  roleA: 'PROTECTION_BUYER',
  roleB: 'PROTECTION_SELLER',
  // Basel CEM credit-derivative add-on: 5% on an investment-grade reference, 10% below it. The
  // flat rate is the capacity denominator (a desk sizes what it can write before it knows the
  // name); the contract-level rule charges the book it actually carries.
  pfeAddOnRate: 0.10,
  pfeAddOnRateFor: (_c, isInvestmentGrade) => (isInvestmentGrade ? 0.05 : 0.10),
  /** §3.17-ii: the name's own weekly spread move on the protection's remaining life — the
   *  replacement value one session can move by (the same arithmetic as `closeOutUSDToB`). */
  closeOutMoveOf: (c, m) => {
    const bps = m.cdsSpreadWeeklyMoveBps(issuerReferenceOf(c), c.termKey);
    if (bps === undefined) return undefined;
    return (bps / 10000) * Math.max(0, c.maturityWeek - m.week) / 52;
  },
  /** The buyer pays the struck spread on the notional, weekly, for the life of the trade —
   *  §3.17-vi: until the credit event; a triggered contract awaiting its workout pays no premium. */
  periodicLegUSDToB: (c, m) => (m.isIssuerDefaulted(issuerReferenceOf(c)) ? null : {
    usdToB: (c.notional * (c.strike / 10000)) / 52,
    reason: 'CDS premium',
  }),
  /**
   * §3.17-iii — PROTECTION HAS A MARK. Its value to the buyer is the spread it is paying against
   * the spread the name clears at today, on the notional, over the weeks left — a RISKY annuity:
   * discounted at the overnight rate and survival-weighted at the hazard the cleared spread
   * implies (`spread / (1 − recovery)`), because a premium leg the name does not survive to pay
   * is worth nothing — at the contract's OWN tenor on the curve (§3.17d-iii). The lifecycle
   * settles the change weekly; a name with no print at that tenor does not mark.
   */
  markToMarketUSDToA: (c, m) => {
    const issuerId = issuerReferenceOf(c);
    // §3.17-vi: a triggered contract is worth its expected payoff — at the workout's realised
    // recovery once it has closed, the region's average while it is open — so variation margin
    // moves the bulk of the payoff at the event and the settlement is the true-up.
    if (m.isIssuerDefaulted(issuerId)) return c.notional * Math.max(0, 1 - recoveryForEvent(c, m));
    const current = m.cdsSpreadBps(issuerId, c.termKey);
    if (!Number.isFinite(current)) return null;
    const remainingWeeks = Math.max(0, c.maturityWeek - m.week);
    if (remainingWeeks === 0) return 0;
    const recovery = Math.max(0, Math.min(1, m.recoveryRate(c.regionId)));
    const hazardWeekly = (Math.max(0, current) / 10000) / Math.max(1e-9, 1 - recovery) / 52;
    const rateWeekly = m.overnightRateAnnual(c.regionId) / 52;
    return (c.notional * (current - c.strike) / 10000 / 52) * annuityFactor(rateWeekly + hazardWeekly, remainingWeeks);
  },
  markReasonLive: 'CDS variation margin',
  markReasonFinal: 'CDS settled',
  /** A defaulted reference entity terminates the contract: the seller pays par less what the
   *  workout actually recovers (G5, §7.192), which is what makes buying protection worth it —
   *  §3.17-iii: less what variation margin has already paid the buyer on the way. §3.17-vi: what
   *  the workout ACTUALLY recovers — the settlement waits for the issuer's own estate to close
   *  and pays at what its unsecured class got back; only an issuer that left no estate settles at
   *  the region's average. */
  eventTermination: (c, m) => {
    const issuerId = issuerReferenceOf(c);
    if (!m.isIssuerDefaulted(issuerId)) return null;
    if (m.issuerWorkout(issuerId)?.state === 'OPEN') return null;
    const payoutLocal = c.notional * Math.max(0, 1 - recoveryForEvent(c, m)) - (c.settledMarkLocal ?? 0);
    return { usdToB: -payoutLocal, reason: 'CDS credit event settled' };
  },
  /** §3.17-vi: a triggered contract outlives its maturity until the workout closes. */
  holdsPastMaturity: (c, m) => {
    const issuerId = issuerReferenceOf(c);
    return m.isIssuerDefaulted(issuerId) && m.issuerWorkout(issuerId)?.state === 'OPEN';
  },
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};

/** The recovery a credit event settles at: the workout's own once closed, the region's average
 *  where there is none to wait for (or while it is open, for the mark's expectation). */
function recoveryForEvent(c: DerivativeContract, m: DerivativeMarketView): number {
  const w = m.issuerWorkout(issuerReferenceOf(c));
  const r = w?.state === 'CLOSED' ? w.recovery : m.recoveryRate(c.regionId);
  return Math.max(0, Math.min(1, r));
}
