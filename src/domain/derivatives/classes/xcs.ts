/**
 * §3.17b-iv — THE CROSS-CURRENCY SWAP: how a bank funds a foreign-currency book for a term
 * (`fx-forwards-and-xcs.md` C). Two notionals in two monies, exchanged at the start and
 * exchanged back at the end AT THE ORIGINAL RATE, periodic interest on both in between: the
 * borrower (A, of the FOREIGN money) pays the foreign overnight rate plus the BASIS on the
 * foreign notional; the lender (B) pays the home overnight rate on the home notional. The final
 * exchange at the original rate is what removes the borrower's currency risk on the book it
 * funded and what creates the counterparty risk — the value of that exchange moves with the
 * rate, and here it is the contract's MARK: variation margin settles the move weekly as
 * collateral and the final exchange returns it, so the value is realised once, in the exchange.
 *
 * reference: the FOREIGN region (the money borrowed). regionId: the borrower's home region.
 * currency: the foreign money. notional: the foreign notional. units: the HOME notional at
 * strike — the store's one free number, and it is what the end exchange returns. strike: the
 * basis, in bps per year. termKey: ''. Every leg says its money (`profile.ts:DerivativeLeg`).
 */

import { DerivativeClassProfile, DerivativeLeg, DerivativeMarketView } from '../profile';
import { DerivativeContract, regionReferenceOf } from '../contract';
import { currencyOf } from '../../geography';
import { balanceSheetChargeBps } from '../registry';

/** The listed funding term: one year. */
export const XCS_TENOR_WEEKS = 52;

/** The home notional a contract exchanged at strike. */
const homeNotionalOf = (c: DerivativeContract): number => c.units ?? 0;

/** Foreign money per unit of home money at today's prints — undefined without both. */
function homePerForeignRate(c: DerivativeContract, m: DerivativeMarketView): number | undefined {
  const home = m.fxToUsd(c.regionId), foreign = m.fxToUsd(regionReferenceOf(c));
  return home > 0 && foreign > 0 ? home / foreign : undefined;
}

/**
 * A lender's reservation basis: the return it needs on the capital the swap consumes, as bps
 * per year of the notional — the capital charge (the class's add-on against the leverage floor)
 * times its required return. Liquidity is the lender's SIZE (what it can spare), not its price.
 */
export function lenderReservationBps(args: { capitalChargeRate: number; requiredReturnAnnual: number }): number {
  return balanceSheetChargeBps(args);
}

export const XCS_PROFILE: DerivativeClassProfile = {
  id: 'XCS',
  roleA: 'BORROWER',
  roleB: 'LENDER',
  // Basel CEM FX add-on beyond one year, 5%.
  pfeAddOnRate: 0.05,
  /** §3.17-ii: the pair's own weekly move on the notional. */
  closeOutMoveOf: (c, m) => m.fxWeeklyMove(regionReferenceOf(c)),
  /**
   * THE STRIKE WEEK exchanges the notionals — the lender delivers the foreign money, the borrower
   * pays the home money; every week after, the interest: the borrower pays overnight plus the
   * basis on the foreign notional, the lender overnight on the home notional. Two legs, two
   * monies, each through the house of its money.
   */
  periodicLegUSDToB: (c, m) => {
    const foreignRegion = regionReferenceOf(c);
    const home = currencyOf(c.regionId);
    if (m.week === c.struckWeek) {
      return [
        { usdToB: -c.notional, reason: 'xcs notional exchanged' },
        { usdToB: homeNotionalOf(c), reason: 'xcs notional exchanged', currency: home },
      ];
    }
    if (m.week < c.struckWeek) return null;
    const legs: DerivativeLeg[] = [];
    const foreignInterest = c.notional * (m.overnightRateAnnual(foreignRegion) + c.strike / 10000) / 52;
    const homeInterest = homeNotionalOf(c) * m.overnightRateAnnual(c.regionId) / 52;
    if (foreignInterest > 0) legs.push({ usdToB: foreignInterest, reason: 'xcs interest' });
    if (homeInterest > 0) legs.push({ usdToB: -homeInterest, reason: 'xcs interest', currency: home });
    return legs.length ? legs : null;
  },
  /** The value to the borrower of the final exchange at today's rate, in the foreign money:
   *  the home notional it will get back, at today's rate, less the foreign notional it returns. */
  markToMarketUSDToA: (c, m) => {
    const rate = homePerForeignRate(c, m);
    return rate === undefined ? null : homeNotionalOf(c) * rate - c.notional;
  },
  markReasonLive: 'xcs variation margin',
  markReasonFinal: 'xcs settled',
  /** MATURITY: the notionals exchanged back at the original rate — the borrower returns the
   *  foreign money, the lender the home money — and the variation margin that collateralised
   *  the move on the way is returned, so the value is realised once, in the exchange. */
  eventTermination: (c, m) => {
    if (c.maturityWeek > m.week) return null;
    const home = currencyOf(c.regionId);
    const legs: DerivativeLeg[] = [
      { usdToB: c.notional, reason: 'xcs notional exchanged back' },
      { usdToB: -homeNotionalOf(c), reason: 'xcs notional exchanged back', currency: home },
    ];
    const collateral = c.settledMarkLocal ?? 0;
    if (collateral !== 0) legs.push({ usdToB: collateral, reason: 'xcs collateral returned' });
    return legs;
  },
  closeOutUSDToB: () => 0, // a mark class: the lifecycle closes out at the mark
};
