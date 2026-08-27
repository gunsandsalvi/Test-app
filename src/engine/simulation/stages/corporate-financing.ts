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

import { Company, CreditRating } from '../../../types';

/** Leverage (debt / EBITDA) beyond which lenders stop funding, by rating. */
const COVENANT_LEVERAGE_CEILING: Record<CreditRating, number> = {
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
  netDebtChangeUSD: number;
  reason: 'ISSUE_CHEAP_DEBT' | 'DELEVER_EXPENSIVE_DEBT' | 'NONE';
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
  totalDebtUSD: number;
  cashUSD: number;
  rating: CreditRating;
}): FinancingDecision {
  const { comp, costOfDebtAnnual, effectiveTaxRate, ebitdaAnnual, totalDebtUSD, cashUSD, rating } = params;
  if (MARKET_ACCESS_DENIED.includes(rating) || !(ebitdaAnnual > 0)) {
    return { netDebtChangeUSD: 0, reason: 'NONE' };
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
  const netPPEUSD = Math.max(1, (comp.grossPPEUSD ?? 0) - (comp.accumulatedDepreciationUSD ?? 0));
  const investedCapitalUSD = netPPEUSD + comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
  const returnOnInvestedCapital = nopatAnnual / investedCapitalUSD;
  const earningsYield = comp.stockPrice > 0 ? comp.eps / comp.stockPrice : 0;
  const bestUseOfProceeds = Math.max(returnOnInvestedCapital, earningsYield);
  const spreadOverCost = bestUseOfProceeds - afterTaxCostOfDebt;

  const currentLeverage = totalDebtUSD / ebitdaAnnual;
  const covenantCeiling = COVENANT_LEVERAGE_CEILING[rating] ?? 4.0;

  if (spreadOverCost > ACTION_THRESHOLD && currentLeverage < covenantCeiling) {
    // Cheap debt, room under the covenant — and a real limit on how fast the money can be put
    // to work: the covenant bounds the STOCK, the deployment pipeline bounds the FLOW.
    const headroomUSD = (covenantCeiling - currentLeverage) * ebitdaAnnual;
    const weeklyDeploymentCapUSD =
      (Math.max(comp.growthCapex ?? 0, comp.marketCap * 0.02) / 52) * DEPLOYMENT_MULTIPLE;
    return {
      netDebtChangeUSD: Math.min(headroomUSD * WEEKLY_ISSUANCE_TAKEUP_RATE, weeklyDeploymentCapUSD),
      reason: 'ISSUE_CHEAP_DEBT',
    };
  }

  if (spreadOverCost < -ACTION_THRESHOLD && cashUSD > 0 && totalDebtUSD > 0) {
    // Debt costs more than the money can earn: pay it down out of surplus cash.
    return {
      netDebtChangeUSD: -Math.min(cashUSD * WEEKLY_DELEVERAGING_RATE, totalDebtUSD * WEEKLY_DELEVERAGING_RATE),
      reason: 'DELEVER_EXPENSIVE_DEBT',
    };
  }

  return { netDebtChangeUSD: 0, reason: 'NONE' };
}
