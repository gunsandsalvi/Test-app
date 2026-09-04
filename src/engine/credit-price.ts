/**
 * THE ENGINE'S READ OF WHAT A PIECE OF CREDIT IS WORTH — the one adapter between the world's
 * stores and `domain/pricing`, so the stage that MARKS the register, the check that TESTS the
 * mark and the decisions that price off a borrower's cost of money cannot disagree.
 *
 * §3.13 — THE PRICE IS THE PRIMITIVE AND THE SPREAD IS READ OFF IT (user, 2026-09-04: *"there
 * shouldn't be any spread per issuer. The spread is per asset, assets with different maturities
 * should have different risk levels and so different spreads. There is no spread quantity
 * associated with an issuer aside from the CDS."*). So:
 *
 *   - a TRANCHE has a cleared price, deposited by the book that cleared it (`engine2/prices.ts`);
 *   - a TRANCHE's spread is that price read against the curve at ITS OWN remaining life —
 *     computed where it is wanted, never stored, so it cannot drift from the price it came from;
 *   - an ISSUER has no spread. It has a CREDIT CURVE: the points its own paper cleared at. A
 *     caller that wants "what does this borrower pay for five-year money" reads that curve at
 *     five years and is told whether a bond actually traded there.
 *
 * Everything world-shaped happens here: find the tranche's row, find its issuer, find that
 * issuer's region's cleared curve. The arithmetic is the domain's and reads nothing.
 */
import { V2World } from '../engine2/world';
import { clearedPriceOf } from '../engine2/prices';
import {
  trancheRowOf, issuerIdOf, ladderRowsOf, trancheScheduleOf,
  TR_FLOATING, TR_CP, TR_FACILITY,
} from '../engine2/tranches';
import { pricePerFace, priceFromSpreadBps, spreadBpsFromPrice } from '../domain/pricing';
import type { ZeroCurve, PaperTerms } from '../domain/pricing';
import { spreadAtTenor, CreditCurvePoint, CreditCurveRead } from '../domain/credit-curve';

export interface CreditPriceWorld {
  /** The issuer's region — everything else about its paper is on the ladder. */
  issuerById: (id: string) => { region: string } | undefined;
  /** The region's cleared curve and its reference rate. */
  regionById: (region: string) => { zeroRates?: ZeroCurve; policyRate?: number } | undefined;
}

/**
 * WHAT A REGION'S PAPER IS DISCOUNTED AGAINST THIS WEEK: the curve its sovereign auctions struck,
 * and the reference a floating coupon resets on. A `Region` satisfies it, so a caller that already
 * holds one passes it straight through — the point is that a price and the spread read off it are
 * always taken against the SAME two numbers.
 */
export interface RegionRates {
  zeroRates: ZeroCurve;
  policyRate: number;
}

/** Which ladder rows a market clears and deposits a price for. A bank FACILITY is its lender's
 *  own loan and trades nowhere; commercial paper is 07f's book and still clears a yield. */
export const IS_BOND_ROW = (flags: number): boolean => !(flags & (TR_FLOATING | TR_CP | TR_FACILITY));
export const IS_LOAN_ROW = (flags: number): boolean => (flags & TR_FLOATING) !== 0 && !(flags & (TR_CP | TR_FACILITY));
const isPricedRow = (flags: number): boolean => IS_BOND_ROW(flags) || IS_LOAN_ROW(flags);

/**
 * What a tranche pays and when, off its own row — the schedule its price discounts. A FLOATER's
 * coupon is the reference plus the margin it was struck at, which is what makes its spread a
 * DISCOUNT MARGIN rather than an OAS: the same arithmetic, over a coupon that moves.
 */
export function trancheTerms(v2: V2World, row: number, week: number, policyRate: number): PaperTerms {
  const S = v2.tranches;
  const floating = (S.flags[row] & TR_FLOATING) !== 0;
  const marginBps = Number.isNaN(S.floatingMarginBps[row]) ? 0 : S.floatingMarginBps[row];
  return {
    annualCouponRate: floating
      ? policyRate + marginBps / 10000
      : (Number.isNaN(S.couponRate[row]) ? 0 : S.couponRate[row]),
    periodWeeks: trancheScheduleOf(S, row).periodWeeks,
    weeksToMaturity: S.maturityWeek[row] - week,
  };
}

/**
 * WHAT ONE UNIT OF FACE FETCHES.
 *
 * A tranche the market printed is worth what it printed — that is the whole of rule 3, and it is
 * why this reads the price store first. Paper no book clears yet (a floater, commercial paper)
 * still has to be valued, and for those the price is derived from the spread its own book cleared,
 * which is the causation §3.13's remaining rows remove one book at a time.
 * Returns undefined for paper it cannot price rather than guessing — a caller leaves such a row
 * alone, and the audit counts it.
 */
export function trancheClearedPricePerFace(
  world: CreditPriceWorld, v2: V2World, instrumentId: string, week: number
): number | undefined {
  const row = trancheRowOf(v2, instrumentId);
  if (row === undefined) return undefined;
  const S = v2.tranches;
  // The market's own print, for the books that clear one — bonds (§9.13-CREDIT row 1) and loans
  // (row 3). No derivation at all: this is what somebody paid.
  if (isPricedRow(S.flags[row])) return clearedPriceOf(v2, instrumentId);
  const issuerId = issuerIdOf(v2, instrumentId);
  const comp = world.issuerById(issuerId);
  if (!comp) return undefined;
  const reg = world.regionById(comp.region);
  if (!reg?.zeroRates) return undefined;
  const rates: RegionRates = { zeroRates: reg.zeroRates, policyRate: reg.policyRate ?? 0 };
  // COMMERCIAL PAPER has no cleared price of its own until §3.13's row 4 (07f still clears a
  // yield per issuer), so it is valued on the issuer's OWN credit curve read at its own very short
  // tenor — the borrower's shortest printed paper, which is the nearest thing anyone has quoted
  // for it. A borrower with nothing printed cannot be priced, and the caller is told so.
  const weeksToMaturity = S.maturityWeek[row] - week;
  const spreadBps = issuerSpreadAtOnCurve(v2, rates, issuerId, week, Math.max(0, weeksToMaturity) / 52)?.spreadBps;
  if (spreadBps === undefined) return undefined;
  return pricePerFace({
    isFloating: false,
    couponRate: Number.isNaN(S.couponRate[row]) ? 0 : S.couponRate[row],
    floatingMarginBps: 0,
    paysOnlyAtMaturity: (S.flags[row] & TR_CP) !== 0,
    weeksToMaturity,
    policyRate: rates.policyRate,
    clearedSpreadBps: spreadBps,
  }, rates.zeroRates);
}

/**
 * THE SPREAD THIS PIECE OF PAPER TRADES AT: its own cleared price, read against the curve over
 * its own remaining life. Two tranches of one borrower give two answers, and the difference
 * between them is that borrower's credit term structure — which is a thing the market says, not
 * a number anyone stores.
 */
export function trancheClearedSpreadBps(
  world: CreditPriceWorld, v2: V2World, instrumentId: string, week: number
): number | undefined {
  const row = trancheRowOf(v2, instrumentId);
  if (row === undefined) return undefined;
  const comp = world.issuerById(issuerIdOf(v2, instrumentId));
  const reg = comp ? world.regionById(comp.region) : undefined;
  if (!reg?.zeroRates) return undefined;
  return rowSpreadBps(v2, { zeroRates: reg.zeroRates, policyRate: reg.policyRate ?? 0 }, row, week);
}

/** The same read for a caller that already holds the row and its region's rates — the stage-08
 *  kernels, which walk ladders by row and must not build a world adapter per firm. A bond gives an
 *  OAS and a floater a discount margin; both are the same question asked of the same price. */
export function rowSpreadBps(
  v2: V2World, rates: RegionRates, row: number, week: number
): number | undefined {
  const S = v2.tranches;
  if (!isPricedRow(S.flags[row])) return undefined;
  const price = clearedPriceOf(v2, v2.internedStrings[S.idRef[row]]);
  if (price === undefined || !(price > 0)) return undefined;
  const terms = trancheTerms(v2, row, week, rates.policyRate);
  if (!(terms.weeksToMaturity > 0)) return undefined;
  return spreadBpsFromPrice(terms, rates.zeroRates, price);
}

/**
 * THE ISSUER'S OWN CREDIT CURVE — one point per piece of its paper the market has printed, at
 * that paper's own remaining tenor. This is what replaces `Company.oasSpreadBps`: the borrower
 * does not have A spread, it has a term structure, and every caller that used to read one number
 * is really asking this curve a question at some maturity.
 */
export function issuerCreditPoints(
  world: CreditPriceWorld, v2: V2World, issuerId: string, week: number
): CreditCurvePoint[] {
  const comp = world.issuerById(issuerId);
  const reg = comp ? world.regionById(comp.region) : undefined;
  return reg?.zeroRates
    ? issuerCreditPointsOnCurve(v2, { zeroRates: reg.zeroRates, policyRate: reg.policyRate ?? 0 }, issuerId, week)
    : [];
}

/**
 * The same, for a caller that already holds the region's rates.
 *
 * `rowFilter` decides WHICH MARKET's curve this is, and it is not optional in spirit: an unsecured
 * bond's OAS and a senior-secured loan's discount margin are two prices for two different risks on
 * one borrower, and averaging them would be the flat-issuer-spread defect back in another costume.
 * The default is the BOND curve because that is what "what does this borrower pay" has always
 * meant here; a caller asking about the loan market passes `IS_LOAN_ROW` and says so.
 */
export function issuerCreditPointsOnCurve(
  v2: V2World, rates: RegionRates, issuerId: string, week: number,
  rowFilter: (flags: number) => boolean = IS_BOND_ROW
): CreditCurvePoint[] {
  const S = v2.tranches;
  const points: CreditCurvePoint[] = [];
  for (const r of ladderRowsOf(v2, issuerId)) {
    if (!(S.principalLocal[r] > 0.01)) continue;
    if (!rowFilter(S.flags[r])) continue;
    const spreadBps = rowSpreadBps(v2, rates, r, week);
    if (spreadBps === undefined) continue;
    points.push({
      tenorYears: (S.maturityWeek[r] - week) / 52,
      spreadBps,
      faceLocal: S.principalLocal[r],
    });
  }
  return points;
}

/** What this borrower pays at a maturity, for a caller that already holds the region's rates. */
export function issuerSpreadAtOnCurve(
  v2: V2World, rates: RegionRates, issuerId: string, week: number, tenorYears: number,
  rowFilter: (flags: number) => boolean = IS_BOND_ROW
): CreditCurveRead | undefined {
  return spreadAtTenor(issuerCreditPointsOnCurve(v2, rates, issuerId, week, rowFilter), tenorYears);
}

/**
 * What this borrower pays at a given maturity, read off its own paper, and whether a bond of
 * that maturity actually traded or the point was interpolated between two that did (§3.25's rule,
 * one level down). Undefined when the issuer has no printed paper at all — a debut has no credit
 * curve, and inventing one for it is exactly what this replaces.
 */
export function issuerSpreadAt(
  world: CreditPriceWorld, v2: V2World, issuerId: string, week: number, tenorYears: number
): CreditCurveRead | undefined {
  return spreadAtTenor(issuerCreditPoints(world, v2, issuerId, week), tenorYears);
}

/** The same question, as a bare number for a caller that has its own answer when the issuer has
 *  no paper (a debut's price talk, a bank's wholesale spread). */
export function issuerSpreadBpsAt(
  world: CreditPriceWorld, v2: V2World, issuerId: string, week: number, tenorYears: number,
  whenUnpriced: number
): number {
  return issuerSpreadAt(world, v2, issuerId, week, tenorYears)?.spreadBps ?? whenUnpriced;
}

/** The price a spread implies on one tranche — the inverse of `trancheClearedSpreadBps`, for the
 *  book that has to state a reservation SPREAD as the PRICE the auction clears. */
export function priceAtSpreadOnTranche(
  terms: PaperTerms, curve: ZeroCurve, spreadBps: number
): number {
  return priceFromSpreadBps(terms, curve, spreadBps);
}
