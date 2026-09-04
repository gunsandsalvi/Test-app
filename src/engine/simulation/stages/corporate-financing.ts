/**
 * The other half of what bounds a credit spread: how much paper exists
 *
 * The demand side (asset-allocation.ts) decides how much of a given pile of bonds is worth
 * owning. It cannot decide how big the pile is — and a market where the quantity of paper never
 * responds to its own price only has one of the two forces that hold a spread in place. Measured
 * with demand alone, corporate spreads still drifted, because the float grew every week from
 * maintenance funding and refinancing regardless of what credit cost.
 *
 * In reality the issuer is the other side of that. A CFO watches the spread between what debt
 * costs the company and what the company can do with the money, and acts on it:
 *
 *   - **Debt is cheap** (the after-tax cost of borrowing sits below what capital earns inside the
 *     business, or below the company's own earnings yield): issue, and use the proceeds to fund
 *     growth, retire equity, or pay it out. This is exactly why credit booms end — tight spreads
 *     invite the supply that widens them.
 *   - **Debt is dear**: stop issuing and pay it down out of cash flow. Supply shrinks, and the
 *     scarcity tightens spreads again.
 *
 * That is the credit cycle, and it is a feature rather than a stabiliser bolted on: the same
 * mechanism that keeps spreads bounded also produces leveraging booms and deleveraging busts,
 * which this simulation previously had no way to generate.
 *
 * The one hard limit here is real and not a clamp: lenders do not fund unlimited leverage. A
 * covenant-style ceiling on debt to EBITDA is what actually stops a company issuing, in the same
 * way a bank's liquidity requirement stops it holding zero government bonds however good cash
 * looks. Distressed issuers are shut out of the market entirely, which is also real — the market
 * closes to them precisely when they most want it open.
 */

import { riskAversionOf } from '../../../domain/preferences';
import { Company, CreditRating } from '../../../types';
import { marketCapOf } from '../../../domain/company';

/**
 * The undrawn headroom on a firm's committed line: the extra debt its own earnings can service at
 * the revolver's rate while staying inside the coverage covenant. Zero when it cannot.
 */
export function committedLineHeadroomLocal(params: {
  ebitAnnualLocal: number;
  currentAnnualInterestLocal: number;
  revolverRateAnnual: number;
}): number {
  const affordableInterestLocal = Math.max(0, params.ebitAnnualLocal) / COVENANT_INTEREST_COVERAGE;
  const spareInterestLocal = affordableInterestLocal - Math.max(0, params.currentAnnualInterestLocal);
  if (!(spareInterestLocal > 0) || !(params.revolverRateAnnual > 0)) return 0;
  return spareInterestLocal / params.revolverRateAnnual;
}

/**
 * G5 — WHAT A COMMITTED REVOLVING LINE IS WORTH, and why a firm short of cash is not yet in
 * default.
 *
 * The public default rate ran at ~10%/yr against the private tier's zero, and §5-G5 isolated the
 * cause to the public path's cash accounting: the trigger was `cash < 0 AND coverage below the
 * floor`, and nothing stood between a bad week and a default. **A real firm draws its committed
 * line first.** It cuts the dividend, it delays payables, and it draws — and it defaults when the
 * line is exhausted, which is a different event and a much rarer one.
 *
 * The SIZE of that line needs no new number. A bank lends what the borrower can service, which is
 * the same test the covenant below already states from the other side: the additional debt whose
 * interest still leaves coverage at the covenant level. So the line is
 * `(EBIT / covenant − interest already paid) / the revolver's own rate`, and it goes to zero
 * exactly when the firm stops being able to carry more — which is when a lender really does stop.
 */
export const COVENANT_INTEREST_COVERAGE = 2.0;

/** Leverage (debt / EBITDA) beyond which lenders stop funding, by rating. */
export const COVENANT_LEVERAGE_CEILING: Record<CreditRating, number> = {
  AAA: 3.0, AA: 3.5, A: 4.0, BBB: 4.5, BB: 5.5, B: 6.5, CCC: 7.0, D: 0,
};

/** Ratings for which the primary market is effectively shut. */
const MARKET_ACCESS_DENIED: CreditRating[] = ['D'];

/**
 * Share of the gap between current and covenant-permitted leverage a company will actually take
 * down in one week when debt is cheap. Real issuance is lumpy and deliberate, not instantaneous.
 */
const WEEKLY_ISSUANCE_TAKEUP_RATE = 0.04;

/** Share of surplus cash a company applies to paying debt down when debt is expensive. */
const WEEKLY_DELEVERAGING_RATE = 0.06;

/** Working capital as a share of revenue — the non-PP&E half of invested capital. */
const WORKING_CAPITAL_SHARE_OF_REVENUE = 0.15;
/**
 * How much faster than its standing growth-capex run-rate a company can actually deploy new
 * money. Cheap debt does not create projects: a CFO can pull the pipeline forward and lever
 * buybacks, but cannot invest unlimited capital at the firm's return just because the coupon is
 * low. Without this cap the issuance decision reads covenant headroom as deployment capacity.
 */
const DEPLOYMENT_MULTIPLE = 3;

/** Spread of return over cost, in decimal, wide enough to be worth acting on either way. */
const ACTION_THRESHOLD = 0.005;

export interface FinancingDecision {
  /** Positive: raise this much new debt. Negative: pay down this much. Zero: do nothing. */
  netDebtChangeLocal: number;
  reason: 'ISSUE_CHEAP_DEBT' | 'DELEVER_EXPENSIVE_DEBT' | 'NONE';
  /**
   * WS8 — the all-in annual cost at which this issuer is indifferent to raising: the best use
   * of proceeds grossed back up for tax. Beyond it a launched offering is WITHDRAWN — the
   * walk-away is the CFO's own arithmetic, never a market bound.
   */
  walkAwayCostAnnual: number;
}

/**
 * The CFO's weekly call on the capital structure, priced off the company's OWN cleared cost of
 * debt — the real spread its bonds trade at this week, not an assumed financing rate.
 */
export function decideCorporateFinancing(params: {
  comp: Company;
  /** The company's real all-in cost of new debt: risk-free curve plus its own cleared spread. */
  costOfDebtAnnual: number;
  effectiveTaxRate: number;
  ebitdaAnnual: number;
  /** Annual EBIT — the operating profit invested capital actually produces after depreciation. */
  ebitAnnual?: number;
  totalDebtLocal: number;
  cashLocal: number;
  rating: CreditRating;
}): FinancingDecision {
  const { comp, costOfDebtAnnual, effectiveTaxRate, ebitdaAnnual, totalDebtLocal, cashLocal, rating } = params;
  // §5-BRAINS — the CFO's own risk weight: a risk-averse one needs a wider spread to act,
  // levers up more slowly and pays down faster. The median is the stated rule.
  const ra = riskAversionOf(comp.management);
  if (MARKET_ACCESS_DENIED.includes(rating) || !(ebitdaAnnual > 0)) {
    return { netDebtChangeLocal: 0, reason: 'NONE', walkAwayCostAnnual: 0 };
  }

  // Debt interest is deductible, so what the company actually pays is the after-tax cost. What
  // it can earn is whichever is higher of putting the money to work in the business or buying
  // back its own equity — the two real uses of opportunistic debt.
  //
  // "In the business" means return on INVESTED capital: after-tax operating profit over the
  // capital actually employed (net PP&E plus working capital). The first version divided EBITDA
  // by debt + MARKET cap — enterprise value — which made the CFO's internal hurdle a function
  // of the stock market's mood: a firm whose equity rallied concluded its own factories earned
  // less, read its 150bp debt as too dear, and joined a sector-wide deleveraging drain
  // (measured: 33 of 60 sampled IG firms perpetually delevering, the float halving in 60 weeks,
  // and the issuer count decaying 324 → 252 — recorded in the plan's RVr close-out).
  const afterTaxCostOfDebt = costOfDebtAnnual * (1 - effectiveTaxRate);
  const nopatAnnual = Math.max(0, (params.ebitAnnual ?? ebitdaAnnual * 0.75)) * (1 - effectiveTaxRate);
  const netPPELocal = Math.max(1, (comp.grossPPELocal ?? 0) - (comp.accumulatedDepreciationLocal ?? 0));
  const investedCapitalLocal = netPPELocal + comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
  const returnOnInvestedCapital = nopatAnnual / investedCapitalLocal;
  const earningsYield = comp.stockPrice > 0 ? comp.eps / comp.stockPrice : 0;
  const bestUseOfProceeds = Math.max(returnOnInvestedCapital, earningsYield);
  const spreadOverCost = bestUseOfProceeds - afterTaxCostOfDebt;
  const walkAwayCostAnnual = bestUseOfProceeds / Math.max(0.01, 1 - effectiveTaxRate);

  const currentLeverage = totalDebtLocal / ebitdaAnnual;
  const covenantCeiling = COVENANT_LEVERAGE_CEILING[rating] ?? 4.0;

  if (spreadOverCost > ACTION_THRESHOLD * ra && currentLeverage < covenantCeiling) {
    // Cheap debt, room under the covenant — and a real limit on how fast the money can be put
    // to work: the covenant bounds the STOCK, the deployment pipeline bounds the FLOW.
    const headroomLocal = (covenantCeiling - currentLeverage) * ebitdaAnnual;
    const weeklyDeploymentCapLocal =
      (Math.max(comp.growthCapex ?? 0, marketCapOf(comp) * 0.02) / 52) * DEPLOYMENT_MULTIPLE;
    return {
      netDebtChangeLocal: Math.min(headroomLocal * WEEKLY_ISSUANCE_TAKEUP_RATE / ra, weeklyDeploymentCapLocal),
      reason: 'ISSUE_CHEAP_DEBT',
      walkAwayCostAnnual,
    };
  }

  if (spreadOverCost < -ACTION_THRESHOLD * ra && cashLocal > 0 && totalDebtLocal > 0) {
    // Debt costs more than the money can earn: pay it down out of surplus cash.
    return {
      netDebtChangeLocal: -Math.min(cashLocal * WEEKLY_DELEVERAGING_RATE * ra, totalDebtLocal * WEEKLY_DELEVERAGING_RATE * ra),
      reason: 'DELEVER_EXPENSIVE_DEBT',
      walkAwayCostAnnual,
    };
  }

  return { netDebtChangeLocal: 0, reason: 'NONE', walkAwayCostAnnual };
}

/**
 * DER5 — WHAT A FIRM HAS TO HEDGE: the exposure whose own one-sigma move would take its earnings
 * through the coverage covenant. Everything inside that headroom it can wear; everything past it
 * is a covenant breach waiting on a price, and a breach is not a preference.
 *
 * It is the same test `committedLineHeadroomLocal` above applies to interest, read against a price
 * instead of a rate, and the same shape 07g uses to decide which corporates must pay fixed. One
 * owner for all of it, because it is one question: how much variance does this balance sheet have
 * room for?
 */
export function exposureToHedgeLocal(params: {
  exposureLocal: number;
  ebitAnnualLocal: number;
  interestAnnualLocal: number;
  /** The exposure's own standard deviation over the hedge horizon, as a fraction. */
  oneSigma: number;
  /** §5-BRAINS — how many sigmas THIS management insures against: its risk aversion. */
  riskAversion?: number;
}): number {
  if (!(params.exposureLocal > 0) || !(params.oneSigma > 0)) return 0;
  const spareEbitLocal = Math.max(0,
    params.ebitAnnualLocal - COVENANT_INTEREST_COVERAGE * Math.max(0, params.interestAnnualLocal));
  return Math.max(0, params.exposureLocal - spareEbitLocal / (params.oneSigma * (params.riskAversion ?? 1)));
}
