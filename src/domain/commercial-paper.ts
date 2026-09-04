/**
 * CP — the commercial paper market, which was the last book in this model that did not clear.
 *
 * **What this replaces, and why it was the way it was.** CP arrived with WS5, beside the bills,
 * and it got the issuer half of a market and none of the buyer half. Bills needed an auction
 * because the sovereign curve's front end was an extrapolation; CP was the corporate side of the
 * same stage and its buyers — the money funds — did not exist yet (they arrived with WS7). So the
 * paper was priced by a FORMULA:
 *
 *     cpRate = cleared 13-week bill + the issuer's short-horizon expected loss + 15bp
 *
 * and three things followed from that, each of them something rule 3 forbids everywhere else:
 *
 *  - **The size was the issuer's alone.** A treasurer computed its working-capital gap and the
 *    paper appeared at the formula rate. No buyer was ever asked whether it wanted that much of
 *    that name at that level, so the market could not ration by SIZE — only by price it did not
 *    set.
 *  - **The market's only voice was a binary gate.** A rating in the club and a PD under 8% meant
 *    the roll happened in full; outside them it failed completely to the revolver. Real funding
 *    stress does not arrive as a switch. It arrives as "it rolled, but forty basis points wider,
 *    and only sixty per cent of it" — and that intermediate state was inexpressible.
 *  - **The holder had no name.** The cash for every issue came from `UNMODELED` and went back to
 *    it at maturity, which is the boundary line §7.197 could not close from the settlement side
 *    because the instrument had no book to clear in.
 *
 * A fourth consequence was quieter and worse: CP is a FIXED tranche, and stage 08's coupon
 * accrual filtered on `rateType === 'FIXED' && !isBankFacility`. So the CP coupon was accruing to
 * the CORPORATE BOND holders of record — a register that explicitly excludes CP from its float.
 * The bondholders were being paid the CP interest.
 *
 * **The mechanism now.** CP clears in the same engine as everything else, as its own book:
 *
 *  - **The issuer brings a PRIMARY OFFERING**, sized by the same working-capital gap as before —
 *    that part was always real, a treasurer papering the receivables and inventory its balance
 *    sheet permanently carries. What it may no longer do is decide the price.
 *  - **Its walk-away is the REVOLVER.** A treasurer with a committed bank line does not pay more
 *    than that line costs, so the offering is pulled when the auction clears above policy +
 *    `REVOLVER_MARGIN_BPS` and the line is drawn instead. The funding squeeze that used to be a
 *    rating gate is now the market pricing past the alternative — and it can be partial, because
 *    what the book will not fund at that level simply does not place.
 *  - **The buyers are the money funds and the cash sleeves** that already run through the bill
 *    and repo books, plus the banks' own desks. A buyer's reservation is its own alternative —
 *    the region's cleared front end at the paper's own tenor, which is exactly what its money
 *    earns instead — plus the issuer's own expected loss. Below that it does not want the paper
 *    at any size; above it, it scales in. **The 15bp liquidity premium is gone**: the premium is
 *    now whatever the cleared level turns out to be over bills, which is what one IS.
 *  - **Credit policy is a SIZE, never a prohibition** — the same doctrine as the sub-investment-
 *    grade sleeve in the bond book. A fund does not post "no" to a weak name; it posts a smaller
 *    line, and the concentration limit below binds every name alike.
 *
 * **And what the book clears is a PRICE** (§9.13-CREDIT row 4). The reservation stays a yield —
 * that is genuinely what a cash buyer has — and is stated as the price it implies on each piece
 * of paper's own remaining life, so a roll with four weeks to run and a fresh thirteen-week issue
 * are two instruments with two prices instead of one borrower with one rate.
 */

import { CreditRating } from './company';

/**
 * The most of ONE issuer's paper a cash fund will hold, as a share of its book.
 *
 * A real primitive of the kind rule 2 allows — the diversification limit money funds run under
 * (Rule 2a-7 in the US, comparable elsewhere) — and it does the work the rating gate used to do,
 * as a size rather than as a veto.
 */
export const CP_SINGLE_ISSUER_LIMIT = 0.05;

/**
 * How much of its cash a fund will put into paper rather than leave overnight. The bill book
 * already splits the sleeve; this is the CP half's share of what is left, and it is the same
 * kind of number for the same reason: a cash book keeps a liquidity buffer it will not term out.
 */
export const CP_SHARE_OF_TERM_SLEEVE = 0.5;

/** How far past its reservation a buyer scales into full size — the front end's own range, the
 *  same one the bill book uses, because it is the same money choosing between the two. */
export const CP_FULL_SIZE_YIELD_RANGE_BPS = 15;

/**
 * A CREDIT POLICY, expressed as the share of its single-issuer limit a fund will actually use on
 * a name of this rating. Not a gate: a weak name gets a small line, and if it pays enough for it
 * somebody still lends. What used to be `CP_ACCESS_RATINGS` — a set membership test that made the
 * roll all-or-nothing — is this curve, and a name outside the old club now simply has to pay.
 */
export function cpCreditPolicyShare(rating: CreditRating): number {
  switch (rating) {
    case 'AAA': return 1.0;
    case 'AA': return 1.0;
    case 'A': return 0.8;
    case 'BBB': return 0.4;
    case 'BB': return 0.1;
    default: return 0.02;
  }
}

/**
 * What a buyer requires to hold THIS issuer's paper instead of the sovereign paper its money
 * would otherwise sit in: its own alternative at the SAME tenor, plus the loss it expects on
 * this borrower. Everything above that is the market's, and it is the number the auction solves.
 *
 * BOTH TERMS ARE ANNUAL (rule 9). This used to scale the expected loss by `tenorWeeks / 52` and
 * add the result to an ANNUAL alternative — a loss over thirteen weeks added to a rate per year,
 * which quartered the credit compensation on every piece of thirteen-week paper in the model and
 * disagreed with the bond book's own `computeReservationSpreadBps` about what an expected loss
 * is. The horizon belongs in the DISCOUNTING, where §9.13-CREDIT row 4 put it: the reservation is
 * a yield, and the price it implies is that yield over the paper's own remaining life.
 */
export function cpReservationYieldBps(args: {
  /** What this money earns instead, at the paper's own tenor — the region's cleared front end. */
  alternativeYieldBps: number;
  annualDefaultProbability: number;
  recoveryRate: number;
}): number {
  const { alternativeYieldBps, annualDefaultProbability, recoveryRate } = args;
  return alternativeYieldBps + annualDefaultProbability * (1 - recoveryRate) * 10000;
}
